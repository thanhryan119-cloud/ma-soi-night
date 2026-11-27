import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, hostAction, playerAction } from "../shared/engine";
import { DECOR_DISCOUNT_PCT, DECOR_PRICE_VND, DEFAULT_STYLE, ITEM_PRICE_VND, itemPrice, SHOP_ITEMS, limitStyle, sanitizeOwned } from "../shared/cosmetics";
import { buildView } from "../shared/views";
import { createPayOS, signData, signPaymentRequest, verifyWebhook } from "../server/payos";
import { createShop } from "../server/shop";
import { cleanCodeInput, codeProblem, discountedPrice } from "../shared/codes";

const KEY = "test-checksum-key";
const hmac = (s: string) => createHmac("sha256", KEY).update(s).digest("hex");

describe("shop catalog", () => {
  it("sells every font, effect and frame except the defaults, 49k each", () => {
    expect(ITEM_PRICE_VND).toBe(49_000);
    expect(DECOR_PRICE_VND).toBe(29_000);
    expect(DECOR_DISCOUNT_PCT).toBe(41);
    expect(itemPrice("frame:moon")).toBe(DECOR_PRICE_VND);
    expect(itemPrice("role:tanner")).toBe(ITEM_PRICE_VND);
    expect(SHOP_ITEMS).toContain("effect:glow");
    expect(SHOP_ITEMS).toContain("frame:moon");
    expect(SHOP_ITEMS).toContain("frame:crown");
    expect(SHOP_ITEMS).toContain("font:script");
    expect(SHOP_ITEMS).not.toContain("effect:none");
    expect(SHOP_ITEMS).not.toContain("frame:none");
    expect(SHOP_ITEMS).not.toContain("font:default");
    expect(SHOP_ITEMS.some((id) => id.startsWith("role:"))).toBe(false);
    expect(SHOP_ITEMS).toContain("chat:stars");
    expect(SHOP_ITEMS).not.toContain("chat:plain");
    expect(SHOP_ITEMS).toContain("card:bloodmoon");
    expect(SHOP_ITEMS).not.toContain("card:plain");
    expect(SHOP_ITEMS).toHaveLength(36);
  });

  it("strips paid parts of a style the player does not own", () => {
    const style = { font: "script", effect: "glow", frame: "moon", chat: "ember", card: "tarot" } as const;
    expect(limitStyle(style, [])).toEqual(DEFAULT_STYLE);
    expect(limitStyle(style, ["effect:glow"])).toEqual({ ...DEFAULT_STYLE, effect: "glow" });
    expect(limitStyle(style, ["chat:ember"])).toEqual({ ...DEFAULT_STYLE, chat: "ember" });
    expect(limitStyle(style, ["card:tarot"])).toEqual({ ...DEFAULT_STYLE, card: "tarot" });
    expect(limitStyle(style, "all")).toEqual(style);
    expect(sanitizeOwned(["effect:glow", "effect:glow", "effect:none", "x:y", 3])).toEqual(["effect:glow"]);
  });

  it("guests cannot wear paid items in a room, bots show them off", () => {
    const room = createRoom("SHOP1", "vi");
    const guest = addPlayer(room, { name: "Khách", style: { effect: "blood", frame: "moon" } }).player!;
    expect(buildView(room, "screen").players[0].style).toEqual(DEFAULT_STYLE);
    expect(playerAction(room, guest.id, { type: "updateProfile", style: { effect: "glitch" } }).ok).toBe(true);
    expect(buildView(room, "host").players[0].style.effect).toBe("none");

    const buyer = addPlayer(room, { name: "Lan", style: { effect: "blood" }, owned: ["effect:blood"] }).player!;
    expect(buyer.style?.effect).toBe("blood");
    // Buying later: the server refreshes `owned` before the profile update.
    buyer.owned = ["effect:blood", "frame:moon"];
    playerAction(room, buyer.id, { type: "updateProfile", style: { frame: "moon" } });
    expect(buyer.style).toEqual({ ...DEFAULT_STYLE, effect: "blood", frame: "moon" });

    hostAction(room, { type: "addBots", count: 30 });
    const bots = room.players.filter((p) => p.isBot);
    expect(bots.some((b) => b.style?.effect !== "none" || b.style?.frame !== "none")).toBe(true);
  });

  it("never sends what a player owns to other clients", () => {
    const room = createRoom("SHOP2", "vi");
    addPlayer(room, { name: "Lan", owned: ["effect:glow"] });
    expect(JSON.stringify(buildView(room, "screen"))).not.toContain("owned");
  });
});

describe("payOS signatures", () => {
  it("signs a payment request over the five fields in alphabetical order", () => {
    const r = { amount: 49000, cancelUrl: "https://a/c", description: "MASOI1234", orderCode: 123, returnUrl: "https://a/r" };
    expect(signPaymentRequest(KEY, r)).toBe(
      hmac("amount=49000&cancelUrl=https://a/c&description=MASOI1234&orderCode=123&returnUrl=https://a/r"),
    );
  });

  it("verifies webhooks (sorted keys, null as empty) and rejects tampering", () => {
    const data = { orderCode: 123, amount: 49000, description: "MASOI1234", code: "00", reference: "FT1", counterAccountName: null };
    expect(signData(KEY, data)).toBe(hmac("amount=49000&code=00&counterAccountName=&description=MASOI1234&orderCode=123&reference=FT1"));
    const body = { code: "00", desc: "success", success: true, data, signature: signData(KEY, data) };
    expect(verifyWebhook(KEY, body)).toEqual(data);
    expect(verifyWebhook(KEY, { ...body, data: { ...data, amount: 1 } })).toBeNull();
    expect(verifyWebhook("other-key", body)).toBeNull();
    expect(verifyWebhook(KEY, { ...body, signature: "zz" })).toBeNull();
    expect(verifyWebhook(KEY, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The shop's HTTP routes against a fake payOS.
// ---------------------------------------------------------------------------

type Res = { status: number; body: Record<string, unknown> };

function call(handle: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>, method: string, url: string, body?: unknown, token?: string) {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
  Object.assign(req, { method, url, headers: { origin: "http://localhost:3000", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  return new Promise<Res>((resolve) => {
    const res = {
      statusCode: 200,
      setHeader() {},
      end(text?: string) {
        resolve({ status: res.statusCode, body: text ? JSON.parse(text) : {} });
      },
    } as unknown as ServerResponse;
    void handle(req, res);
  });
}

function setup() {
  const users: Record<string, { id: string; owned: string[]; style: typeof DEFAULT_STYLE }> = {
    u1: { id: "u1", owned: [], style: DEFAULT_STYLE },
    u2: { id: "u2", owned: [], style: DEFAULT_STYLE },
    boss: { id: "boss", owned: [], style: DEFAULT_STYLE },
  };
  const tokens: Record<string, string> = { tok1: "u1", tok2: "u2", tokBoss: "boss" };
  const grants: string[] = [];
  let payStatus = "PENDING";
  const created: Record<string, unknown>[] = [];
  const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === "POST") {
      const b = JSON.parse(String(init.body));
      created.push(b);
      return new Response(JSON.stringify({ code: "00", desc: "success", data: { checkoutUrl: `https://pay.payos.vn/web/${b.orderCode}`, paymentLinkId: "pl1", orderCode: b.orderCode } }));
    }
    const orderCode = Number(u.split("/").pop());
    return new Response(JSON.stringify({ code: "00", desc: "success", data: { orderCode, amount: 49000, amountPaid: payStatus === "PAID" ? 49000 : 0, status: payStatus } }));
  }) as typeof fetch;
  const payos = createPayOS({ clientId: "c", apiKey: "a", checksumKey: KEY, fetch: fakeFetch });
  const shop = createShop({
    dataDir: mkdtempSync(join(tmpdir(), "shop-")),
    corsOrigin: "*",
    payos,
    accounts: {
      userForToken: (t) => users[tokens[String(t)]] ?? null,
      isAdmin: (u) => u.id === "boss",
      ownedFor: (id) => users[id]?.owned ?? [],
      grantItem: (id, item) => {
        grants.push(item);
        users[id].owned = [...new Set([...users[id].owned, item])];
        return users[id];
      },
      publicUser: (u) => u,
    },
  });
  return { shop, users, grants, created, setPaid: () => (payStatus = "PAID") };
}

describe("shop routes", () => {
  it("is public about being open and the price", async () => {
    const { shop } = setup();
    const r = await call(shop.handle, "GET", "/shop");
    expect(r.body).toMatchObject({ ok: true, enabled: true, price: 49000 });
  });

  it("needs a signed-in account and a real item", async () => {
    const { shop } = setup();
    expect((await call(shop.handle, "POST", "/shop/checkout", { itemId: "effect:glow" })).status).toBe(401);
    expect((await call(shop.handle, "POST", "/shop/checkout", { itemId: "effect:none" }, "tok1")).body.error).toBe("err.itemUnknown");
  });

  it("creates a signed 29k payOS link and reuses it on a second click", async () => {
    const { shop, created } = setup();
    const r = await call(shop.handle, "POST", "/shop/checkout", { itemId: "frame:moon", returnUrl: "http://localhost:3000" }, "tok1");
    expect(r.body.ok).toBe(true);
    expect(String(r.body.checkoutUrl)).toMatch(/^https:\/\/pay\.payos\.vn\//);
    const req = created[0] as Record<string, string | number>;
    expect(req.amount).toBe(29000);
    expect(String(req.description).length).toBeLessThanOrEqual(9);
    expect(req.returnUrl).toBe(`http://localhost:3000/profile?order=${req.orderCode}`);
    expect(req.signature).toBe(signPaymentRequest(KEY, req as never));
    const again = await call(shop.handle, "POST", "/shop/checkout", { itemId: "frame:moon", returnUrl: "http://localhost:3000" }, "tok1");
    expect(again.body.orderCode).toBe(r.body.orderCode);
    expect(created).toHaveLength(1);
  });

  it("grants the item once, from a valid webhook", async () => {
    const { shop, grants, users } = setup();
    const r = await call(shop.handle, "POST", "/shop/checkout", { itemId: "effect:glow", returnUrl: "http://localhost:3000" }, "tok1");
    const orderCode = r.body.orderCode as number;
    const data = { orderCode, amount: 29000, description: "MASOI", code: "00", reference: "FT1" };

    const forged = await call(shop.handle, "POST", "/payos/webhook", { code: "00", data, signature: "ab".repeat(32) });
    expect(forged.status).toBe(400);
    expect(grants).toEqual([]);

    const hook = { code: "00", desc: "success", success: true, data, signature: signData(KEY, data) };
    expect((await call(shop.handle, "POST", "/payos/webhook", hook)).status).toBe(200);
    expect((await call(shop.handle, "POST", "/payos/webhook", hook)).status).toBe(200);
    expect(grants).toEqual(["effect:glow"]);
    expect(users.u1.owned).toEqual(["effect:glow"]);

    const status = await call(shop.handle, "GET", `/shop/orders/${orderCode}`, undefined, "tok1");
    expect(status.body.order).toMatchObject({ status: "paid", itemId: "effect:glow" });
    // Already owned: no second order.
    expect((await call(shop.handle, "POST", "/shop/checkout", { itemId: "effect:glow" }, "tok1")).body.error).toBe("err.itemOwned");
  });

  it("acknowledges payOS's test webhook for an unknown order", async () => {
    const { shop, grants } = setup();
    const data = { orderCode: 123, amount: 3000, description: "VQRIO123", code: "00" };
    const r = await call(shop.handle, "POST", "/payos/webhook", { code: "00", data, signature: signData(KEY, data) });
    expect(r.status).toBe(200);
    expect(grants).toEqual([]);
  });

  it("falls back to asking payOS when the buyer comes back before the webhook", async () => {
    const { shop, grants, setPaid } = setup();
    const r = await call(shop.handle, "POST", "/shop/checkout", { itemId: "font:script", returnUrl: "http://localhost:3000" }, "tok1");
    const orderCode = r.body.orderCode as number;
    expect((await call(shop.handle, "GET", `/shop/orders/${orderCode}`, undefined, "tok1")).body.order).toMatchObject({ status: "pending" });
    setPaid();
    expect((await call(shop.handle, "GET", `/shop/orders/${orderCode}`, undefined, "tok1")).body.order).toMatchObject({ status: "paid" });
    expect(grants).toEqual(["font:script"]);
    // Someone else's order is not visible.
    expect((await call(shop.handle, "GET", `/shop/orders/${orderCode}`, undefined, "nope")).status).toBe(401);
  });
});

describe("discount code rules", () => {
  const base = { maxUses: null, uses: 0, usedBy: [], expiresAt: null, active: true, note: "", createdAt: 0 };
  it("takes a percentage or an amount off, never below zero", () => {
    expect(discountedPrice(50000, { kind: "percent", value: 20 })).toBe(40000);
    expect(discountedPrice(50000, { kind: "percent", value: 100 })).toBe(0);
    expect(discountedPrice(50000, { kind: "amount", value: 15000 })).toBe(35000);
    expect(discountedPrice(50000, { kind: "amount", value: 90000 })).toBe(0);
  });

  it("says why a code cannot be used", () => {
    const c = { ...base, code: "X", kind: "percent" as const, value: 10 };
    expect(codeProblem(undefined, "u1")).toBe("err.codeInvalid");
    expect(codeProblem({ ...c, active: false }, "u1")).toBe("err.codeInvalid");
    expect(codeProblem({ ...c, expiresAt: 1000 }, "u1", 2000)).toBe("err.codeExpired");
    expect(codeProblem({ ...c, maxUses: 2, uses: 2 }, "u1")).toBe("err.codeUsedUp");
    expect(codeProblem({ ...c, usedBy: ["u1"] }, "u1")).toBe("err.codeAlreadyUsed");
    expect(codeProblem(c, "u1")).toBeNull();
  });

  it("validates what the management page sends", () => {
    expect(cleanCodeInput({ code: " tet-2027 ", kind: "percent", value: 30 }, true)).toEqual({
      ok: true,
      fields: { code: "TET-2027", kind: "percent", value: 30, maxUses: null, expiresAt: null, active: true, note: "" },
    });
    expect(cleanCodeInput({ code: "a b", kind: "percent", value: 30 }, true)).toEqual({ ok: false, error: "err.codeFormat" });
    expect(cleanCodeInput({ code: "OK1", kind: "percent", value: 120 }, true)).toEqual({ ok: false, error: "err.codeValue" });
    expect(cleanCodeInput({ code: "OK1", kind: "amount", value: 0 }, true)).toEqual({ ok: false, error: "err.codeValue" });
    expect(cleanCodeInput({ active: false, maxUses: null }, false)).toEqual({ ok: true, fields: { active: false, maxUses: null } });
  });
});

describe("discount codes in the shop", () => {
  const create = (shop: ReturnType<typeof setup>["shop"], body: Record<string, unknown>, token = "tokBoss") =>
    call(shop.handle, "POST", "/shop/admin/codes", body, token);

  it("only admins can list and manage codes", async () => {
    const { shop } = setup();
    expect((await call(shop.handle, "GET", "/shop/admin/codes", undefined, "tok1")).status).toBe(403);
    expect((await create(shop, { code: "X1Y", kind: "percent", value: 10 }, "tok1")).status).toBe(403);
    const r = await create(shop, { code: "tet", kind: "percent", value: 10 });
    expect(r.body.ok).toBe(true);
    expect((r.body.codes as { code: string }[])[0].code).toBe("TET");
    expect((await create(shop, { code: "TET", kind: "amount", value: 5000 })).body.error).toBe("err.codeExists");
  });

  it("charges the discounted price and counts the use once paid", async () => {
    const { shop, created } = setup();
    await create(shop, { code: "SALE20", kind: "percent", value: 20 });
    const check = await call(shop.handle, "GET", "/shop/codes/sale20", undefined, "tok1");
    expect(check.body).toMatchObject({ ok: true, code: "SALE20", amount: 39200 });

    const r = await call(shop.handle, "POST", "/shop/checkout", { itemId: "effect:glow", returnUrl: "http://localhost:3000", code: "sale20" }, "tok1");
    expect(r.body.ok).toBe(true);
    const req = created[0] as Record<string, number>;
    expect(req.amount).toBe(23200);
    expect(req.signature).toBe(signPaymentRequest(KEY, req as never));

    // Not counted while unpaid.
    let list = (await call(shop.handle, "GET", "/shop/admin/codes", undefined, "tokBoss")).body.codes as { uses: number; revenue: number }[];
    expect(list[0].uses).toBe(0);

    const data = { orderCode: r.body.orderCode, amount: 23200, description: "MASOI", code: "00" };
    await call(shop.handle, "POST", "/payos/webhook", { code: "00", data, signature: signData(KEY, data) });
    list = (await call(shop.handle, "GET", "/shop/admin/codes", undefined, "tokBoss")).body.codes as { uses: number; revenue: number }[];
    expect(list[0]).toMatchObject({ uses: 1, revenue: 23200 });

    // One use per account.
    const again = await call(shop.handle, "POST", "/shop/checkout", { itemId: "frame:moon", code: "SALE20" }, "tok1");
    expect(again.body.error).toBe("err.codeAlreadyUsed");
  });

  it("a 100% code unlocks right away without payOS, within its use limit", async () => {
    const { shop, created, grants } = setup();
    await create(shop, { code: "FREE1", kind: "percent", value: 100, maxUses: 1 });
    const r = await call(shop.handle, "POST", "/shop/checkout", { itemId: "frame:moon", code: "FREE1" }, "tok1");
    expect(r.body).toMatchObject({ ok: true, free: true });
    expect(grants).toEqual(["frame:moon"]);
    expect(created).toHaveLength(0);
    const second = await call(shop.handle, "POST", "/shop/checkout", { itemId: "frame:moon", code: "FREE1" }, "tok2");
    expect(second.body.error).toBe("err.codeUsedUp");
  });

  it("paused, expired and deleted codes stop working", async () => {
    const { shop } = setup();
    await create(shop, { code: "PAUSE", kind: "amount", value: 10000 });
    await call(shop.handle, "PATCH", "/shop/admin/codes/PAUSE", { active: false }, "tokBoss");
    expect((await call(shop.handle, "GET", "/shop/codes/PAUSE", undefined, "tok1")).body.error).toBe("err.codeInvalid");

    await create(shop, { code: "OLD", kind: "amount", value: 10000, expiresAt: 1000 });
    expect((await call(shop.handle, "GET", "/shop/codes/OLD", undefined, "tok1")).body.error).toBe("err.codeExpired");

    const del = await call(shop.handle, "DELETE", "/shop/admin/codes/OLD", undefined, "tokBoss");
    expect((del.body.codes as { code: string }[]).map((c) => c.code)).toEqual(["PAUSE"]);
    expect((await call(shop.handle, "GET", "/shop/codes/OLD", undefined, "tok1")).body.error).toBe("err.codeInvalid");
  });
});
