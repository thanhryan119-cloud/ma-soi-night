import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, hostAction, playerAction } from "../shared/engine";
import { cleanDonorName, isDonationAmount } from "../shared/donate";
import { ROLE_IDS } from "../shared/roles";
import type { RoleId } from "../shared/types";
import { buildView } from "../shared/views";
import { createPayOS, signData, signPaymentRequest, verifyWebhook } from "../server/payos";
import { DONATE_RATE_LIMIT, createDonations } from "../server/donate";

const KEY = "test-checksum-key";
const hmac = (s: string) => createHmac("sha256", KEY).update(s).digest("hex");

describe("everything is free", () => {
  it("a guest wears any style, in the room and after changing it", () => {
    const room = createRoom("FREE1", "vi");
    const guest = addPlayer(room, { name: "Khách", style: { effect: "blood", frame: "moon", card: "tarot" } }).player!;
    expect(buildView(room, "screen").players[0].style).toMatchObject({ effect: "blood", frame: "moon", card: "tarot" });
    expect(playerAction(room, guest.id, { type: "updateProfile", style: { effect: "glitch" } }).ok).toBe(true);
    expect(buildView(room, "host").players[0].style.effect).toBe("glitch");
  });

  it("any room may use every role, special ones included", () => {
    const room = createRoom("FREE2", "vi");
    const p = addPlayer(room, { name: "Lan" }).player!;
    // A room saved before the change may still carry an old lock list: it is ignored.
    (room as { lockedRoles?: string[] }).lockedRoles = ["tanner"];
    expect(hostAction(room, { type: "assignManual", playerId: p.id, roleId: "tanner" }).ok).toBe(true);
    expect(JSON.stringify(buildView(room, "host"))).not.toContain("lockedRoles");
    const counts = Object.fromEntries(ROLE_IDS.map((r) => [r, 0])) as Record<RoleId, number>;
    expect(hostAction(room, { type: "setRoleCounts", roleCounts: { ...counts, tanner: 1 } }).ok).toBe(true);
  });
});

describe("donation rules", () => {
  it("takes whole VND between 10k and 10M", () => {
    expect(isDonationAmount(20_000)).toBe(true);
    expect(isDonationAmount(9_999)).toBe(false);
    expect(isDonationAmount(10_000_001)).toBe(false);
    expect(isDonationAmount(15_000.5)).toBe(false);
    expect(isDonationAmount("20000")).toBe(false);
  });

  it("cleans donor names", () => {
    expect(cleanDonorName("  <b>Lan</b>\n  ")).toBe("bLan/b");
    expect(cleanDonorName(42)).toBe("");
    expect(cleanDonorName("x".repeat(80))).toHaveLength(32);
  });
});

describe("payOS signatures", () => {
  it("signs a payment request over the five fields in alphabetical order", () => {
    const r = { amount: 50000, cancelUrl: "https://a/c", description: "UNGHO1234", orderCode: 123, returnUrl: "https://a/r" };
    expect(signPaymentRequest(KEY, r)).toBe(hmac("amount=50000&cancelUrl=https://a/c&description=UNGHO1234&orderCode=123&returnUrl=https://a/r"));
  });

  it("verifies webhooks (sorted keys, null as empty) and rejects tampering", () => {
    const data = { orderCode: 123, amount: 50000, description: "UNGHO1234", code: "00", reference: "FT1", counterAccountName: null };
    expect(signData(KEY, data)).toBe(hmac("amount=50000&code=00&counterAccountName=&description=UNGHO1234&orderCode=123&reference=FT1"));
    const body = { code: "00", desc: "success", success: true, data, signature: signData(KEY, data) };
    expect(verifyWebhook(KEY, body)).toEqual(data);
    expect(verifyWebhook(KEY, { ...body, data: { ...data, amount: 1 } })).toBeNull();
    expect(verifyWebhook("other-key", body)).toBeNull();
    expect(verifyWebhook(KEY, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The donate routes against a fake payOS.
// ---------------------------------------------------------------------------

type Res = { status: number; body: Record<string, unknown> };

function call(handle: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>, method: string, url: string, body?: unknown, ip = "1.2.3.4") {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as unknown as IncomingMessage;
  Object.assign(req, { method, url, headers: { origin: "http://localhost:3000", "x-forwarded-for": ip }, socket: {} });
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

function setup(withPayos = true) {
  let payStatus = "PENDING";
  const created: Record<string, unknown>[] = [];
  const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      const b = JSON.parse(String(init.body));
      created.push(b);
      return new Response(
        JSON.stringify({
          code: "00",
          desc: "success",
          data: {
            checkoutUrl: `https://pay.payos.vn/web/${b.orderCode}`,
            paymentLinkId: "pl1",
            orderCode: b.orderCode,
            qrCode: "00020101021238570010A000000727",
            bin: "970422",
            accountNumber: "0123456789",
            accountName: "MA SOI",
            description: b.description,
          },
        }),
      );
    }
    const orderCode = Number(String(url).split("/").pop());
    return new Response(JSON.stringify({ code: "00", desc: "success", data: { orderCode, amount: 50000, amountPaid: payStatus === "PAID" ? 50000 : 0, status: payStatus } }));
  }) as typeof fetch;
  const dataDir = mkdtempSync(join(tmpdir(), "donate-"));
  const make = () =>
    createDonations({ dataDir, corsOrigin: "*", payos: withPayos ? createPayOS({ clientId: "c", apiKey: "a", checksumKey: KEY, fetch: fakeFetch }) : null });
  return { donate: make(), make, created, setPaid: () => (payStatus = "PAID") };
}

describe("donate routes", () => {
  it("says whether donations are on", async () => {
    expect((await call(setup().donate.handle, "GET", "/donate")).body).toMatchObject({ ok: true, enabled: true, recent: [] });
    expect((await call(setup(false).donate.handle, "GET", "/donate")).body).toMatchObject({ ok: true, enabled: false });
    expect((await call(setup(false).donate.handle, "POST", "/donate", { amount: 50000 })).body.error).toBe("err.donateOff");
  });

  it("refuses odd amounts", async () => {
    const { donate } = setup();
    for (const amount of [0, 5000, "50000", 50000.5, 99_000_000])
      expect((await call(donate.handle, "POST", "/donate", { amount, returnUrl: "http://localhost:3000" })).body.error).toBe("err.donateAmount");
  });

  it("makes a signed payOS link and hands back the QR and the account", async () => {
    const { donate, created } = setup();
    const r = await call(donate.handle, "POST", "/donate", { amount: 50000, name: "Lan", message: "Hay lắm", returnUrl: "http://localhost:3000" });
    expect(r.body.ok).toBe(true);
    const d = r.body.donation as Record<string, unknown>;
    expect(d).toMatchObject({ amount: 50000, status: "pending", qrCode: "00020101021238570010A000000727", bin: "970422", accountNumber: "0123456789", accountName: "MA SOI" });
    const req = created[0] as Record<string, string | number>;
    expect(req.amount).toBe(50000);
    expect(String(req.description).length).toBeLessThanOrEqual(9);
    expect(req.returnUrl).toBe(`http://localhost:3000/donate?order=${req.orderCode}`);
    expect(req.signature).toBe(signPaymentRequest(KEY, req as never));
    // The private note never leaves the server.
    expect(JSON.stringify(r.body)).not.toContain("Hay lắm");
  });

  it("marks it paid from a valid webhook only, and lists the supporter", async () => {
    const { donate, make } = setup();
    const r = await call(donate.handle, "POST", "/donate", { amount: 50000, name: "Lan", message: "bí mật", returnUrl: "http://localhost:3000" });
    const orderCode = (r.body.donation as { orderCode: number }).orderCode;
    const data = { orderCode, amount: 50000, description: "UNGHO", code: "00", reference: "FT1" };

    expect((await call(donate.handle, "POST", "/payos/webhook", { code: "00", data, signature: "ab".repeat(32) })).status).toBe(400);
    const hook = { code: "00", desc: "success", success: true, data, signature: signData(KEY, data) };
    expect((await call(donate.handle, "POST", "/payos/webhook", hook)).status).toBe(200);

    const info = await call(donate.handle, "GET", "/donate");
    expect(info.body.recent).toEqual([{ name: "Lan", amount: 50000, paidAt: expect.any(Number) }]);
    expect(JSON.stringify(info.body)).not.toContain("bí mật");
    // Kept on disk.
    expect((await call(make().handle, "GET", `/donate/${orderCode}`)).body.donation).toMatchObject({ status: "paid" });
  });

  it("asks payOS for the status while it is pending", async () => {
    const { donate, setPaid } = setup();
    const r = await call(donate.handle, "POST", "/donate", { amount: 50000, returnUrl: "http://localhost:3000" });
    const orderCode = (r.body.donation as { orderCode: number }).orderCode;
    expect((await call(donate.handle, "GET", `/donate/${orderCode}`)).body.donation).toMatchObject({ status: "pending" });
    setPaid();
    expect((await call(donate.handle, "GET", `/donate/${orderCode}`)).body.donation).toMatchObject({ status: "paid" });
    expect((await call(donate.handle, "GET", "/donate/999")).status).toBe(404);
  });

  it("limits how many links one address can open", async () => {
    const { donate } = setup();
    for (let i = 0; i < DONATE_RATE_LIMIT; i++)
      expect((await call(donate.handle, "POST", "/donate", { amount: 20000, returnUrl: "http://localhost:3000" })).status).toBe(200);
    expect((await call(donate.handle, "POST", "/donate", { amount: 20000, returnUrl: "http://localhost:3000" })).body.error).toBe("err.tooFast");
    expect((await call(donate.handle, "POST", "/donate", { amount: 20000, returnUrl: "http://localhost:3000" }, "5.6.7.8")).status).toBe(200);
  });
});
