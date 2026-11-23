import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, hostAction, playerAction } from "../shared/engine";
import { DEFAULT_STYLE, ITEM_PRICE_VND, SHOP_ITEMS, limitStyle, sanitizeOwned } from "../shared/cosmetics";
import { buildView } from "../shared/views";
import { createPayOS, signData, signPaymentRequest, verifyWebhook } from "../server/payos";
import { createShop } from "../server/shop";

const KEY = "test-checksum-key";
const hmac = (s: string) => createHmac("sha256", KEY).update(s).digest("hex");

describe("shop catalog", () => {
  it("sells every font, effect and frame except the defaults, 50k each", () => {
    expect(ITEM_PRICE_VND).toBe(50_000);
    expect(SHOP_ITEMS).toContain("effect:glow");
    expect(SHOP_ITEMS).toContain("frame:moon");
    expect(SHOP_ITEMS).toContain("font:script");
    expect(SHOP_ITEMS).not.toContain("effect:none");
    expect(SHOP_ITEMS).not.toContain("frame:none");
    expect(SHOP_ITEMS).not.toContain("font:default");
    expect(SHOP_ITEMS).toContain("role:cursedWolf");
    expect(SHOP_ITEMS).toHaveLength(20);
  });

  it("strips paid parts of a style the player does not own", () => {
    const style = { font: "script", effect: "glow", frame: "moon" } as const;
    expect(limitStyle(style, [])).toEqual(DEFAULT_STYLE);
    expect(limitStyle(style, ["effect:glow"])).toEqual({ font: "default", effect: "glow", frame: "none" });
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
    expect(buyer.style).toEqual({ font: "default", effect: "blood", frame: "moon" });

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
    const r = { amount: 50000, cancelUrl: "https://a/c", description: "MASOI1234", orderCode: 123, returnUrl: "https://a/r" };
    expect(signPaymentRequest(KEY, r)).toBe(
      hmac("amount=50000&cancelUrl=https://a/c&description=MASOI1234&orderCode=123&returnUrl=https://a/r"),
    );
  });

  it("verifies webhooks (sorted keys, null as empty) and rejects tampering", () => {
    const data = { orderCode: 123, amount: 50000, description: "MASOI1234", code: "00", reference: "FT1", counterAccountName: null };
    expect(signData(KEY, data)).toBe(hmac("amount=50000&code=00&counterAccountName=&description=MASOI1234&orderCode=123&reference=FT1"));
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
  };
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
    return new Response(JSON.stringify({ code: "00", desc: "success", data: { orderCode, amount: 50000, amountPaid: payStatus === "PAID" ? 50000 : 0, status: payStatus } }));
  }) as typeof fetch;
  const payos = createPayOS({ clientId: "c", apiKey: "a", checksumKey: KEY, fetch: fakeFetch });
  const shop = createShop({
    dataDir: mkdtempSync(join(tmpdir(), "shop-")),
    corsOrigin: "*",
    payos,
    accounts: {
      userForToken: (t) => (t === "tok1" ? users.u1 : null),
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
    expect(r.body).toMatchObject({ ok: true, enabled: true, price: 50000 });
  });

  it("needs a signed-in account and a real item", async () => {
    const { shop } = setup();
    expect((await call(shop.handle, "POST", "/shop/checkout", { itemId: "effect:glow" })).status).toBe(401);
    expect((await call(shop.handle, "POST", "/shop/checkout", { itemId: "effect:none" }, "tok1")).body.error).toBe("err.itemUnknown");
  });

  it("creates a signed 50k payOS link and reuses it on a second click", async () => {
    const { shop, created } = setup();
    const r = await call(shop.handle, "POST", "/shop/checkout", { itemId: "frame:moon", returnUrl: "http://localhost:3000" }, "tok1");
    expect(r.body.ok).toBe(true);
    expect(String(r.body.checkoutUrl)).toMatch(/^https:\/\/pay\.payos\.vn\//);
    const req = created[0] as Record<string, string | number>;
    expect(req.amount).toBe(50000);
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
    const data = { orderCode, amount: 50000, description: "MASOI", code: "00", reference: "FT1" };

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
