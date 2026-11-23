// Cosmetics shop paid through payOS, with discount codes.
//
//   GET    /shop                        public: is the shop on, price, item ids
//   GET    /shop/codes/:code            signed in: what this code does for me (price after it)
//   POST   /shop/checkout               signed in: { itemId, returnUrl, code? } -> payOS link (or free unlock)
//   GET    /shop/orders/:code           signed in: status of one of my orders (asks payOS if still pending)
//   GET    /shop/admin/codes            admin: every code
//   POST   /shop/admin/codes            admin: create a code
//   PATCH  /shop/admin/codes/:code      admin: edit (active, value, limits, note)
//   DELETE /shop/admin/codes/:code      admin: delete
//   POST   /payos/webhook               payOS -> us when a transfer lands (signature checked)
//
// An item is granted exactly once per order, from whichever of the webhook or
// the status check sees the payment first; a code's use is counted at that
// moment. Orders live in orders.json, codes in codes.json.

import { randomInt } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { ITEM_PRICE_VND, SHOP_ITEMS, isShopItem, type ItemId } from "../shared/cosmetics";
import { cleanCodeInput, codeProblem, discountedPrice, normalizeCode, type CodeInput, type DiscountCode } from "../shared/codes";
import { bearer, cors, json, readJson } from "./http";
import type { PayOS } from "./payos";

export type OrderStatus = "pending" | "paid" | "cancelled" | "expired";

export interface Order {
  orderCode: number;
  userId: string;
  itemId: ItemId;
  /** What the buyer pays (after any code). */
  amount: number;
  /** Discount code used, if any. */
  code?: string;
  status: OrderStatus;
  createdAt: number;
  paidAt?: number;
  checkoutUrl?: string;
  paymentLinkId?: string;
}

interface ShopUser {
  id: string;
}

export interface ShopDeps<U extends ShopUser> {
  dataDir: string;
  corsOrigin: string[] | "*";
  payos: PayOS | null;
  accounts: {
    userForToken: (token: unknown) => U | null;
    ownedFor: (userId: string) => string[];
    grantItem: (userId: string, item: ItemId) => unknown;
    publicUser: (u: U) => unknown;
    /** May this account manage discount codes? */
    isAdmin: (u: U) => boolean;
  };
  /** Public web address, e.g. https://ma-soi.vercel.app (else the request's allowed origin). */
  webUrl?: string;
  now?: () => number;
}

/** A payment link stays open this long (payOS expiredAt). */
export const CHECKOUT_TTL_MS = 15 * 60 * 1000;

function loadJson<T>(file: string, fallback: T, label: string): T {
  try {
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch (err) {
    console.error(`[shop] ${label} load failed`, err);
  }
  return fallback;
}

function saveJson(file: string, value: unknown) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value));
  renameSync(tmp, file);
}

export function createShop<U extends ShopUser>(deps: ShopDeps<U>) {
  const now = deps.now ?? Date.now;
  const ordersFile = join(deps.dataDir, "orders.json");
  const codesFile = join(deps.dataDir, "codes.json");
  const orders = loadJson<Record<string, Order>>(ordersFile, {}, "orders");
  const codes = loadJson<Record<string, DiscountCode>>(codesFile, {}, "codes");
  const save = () => saveJson(ordersFile, orders);
  const saveCodes = () => saveJson(codesFile, codes);

  /** payOS wants a unique positive integer per merchant (≤ 2^53). */
  function newOrderCode(): number {
    for (;;) {
      const code = Number(`${now() % 1e10}${randomInt(100, 1000)}`);
      if (code > 0 && !orders[code]) return code;
    }
  }

  /** Marks an order paid, counts its code and hands over the item (once). */
  function fulfil(order: Order) {
    if (order.status === "paid") return;
    order.status = "paid";
    order.paidAt = now();
    save();
    const c = order.code ? codes[order.code] : undefined;
    if (c && !c.usedBy.includes(order.userId)) {
      c.uses += 1;
      c.usedBy.push(order.userId);
      saveCodes();
    }
    deps.accounts.grantItem(order.userId, order.itemId);
    console.log(`[shop] order ${order.orderCode} paid: ${order.itemId} -> ${order.userId}${order.code ? ` (code ${order.code})` : ""}`);
  }

  /** Where payOS sends the buyer back: our /profile page on an allowed web origin. */
  function returnBase(req: IncomingMessage, asked: unknown): string | null {
    if (deps.webUrl) return deps.webUrl.replace(/\/+$/, "");
    const candidate = typeof asked === "string" ? asked : (req.headers.origin ?? "");
    let origin: string;
    try {
      const u = new URL(candidate);
      if (u.protocol !== "https:" && u.protocol !== "http:") return null;
      origin = u.origin;
    } catch {
      return null;
    }
    if (deps.corsOrigin !== "*" && !deps.corsOrigin.includes(origin)) return null;
    return origin;
  }

  async function refresh(order: Order) {
    if (order.status !== "pending" || !deps.payos) return;
    try {
      const info = await deps.payos.getPayment(order.orderCode);
      if (info.status === "PAID" && info.amountPaid >= order.amount) fulfil(order);
      else if (info.status === "CANCELLED" || info.status === "EXPIRED") {
        order.status = info.status === "CANCELLED" ? "cancelled" : "expired";
        save();
      }
    } catch (err) {
      console.error(`[shop] status check for ${order.orderCode} failed`, err);
    }
  }

  const view = (o: Order) => ({ orderCode: o.orderCode, itemId: o.itemId, amount: o.amount, status: o.status, code: o.code ?? null });

  /** A code as the management page sees it, with what it brought in. */
  const adminView = (c: DiscountCode) => {
    const paid = Object.values(orders).filter((o) => o.code === c.code && o.status === "paid");
    return {
      code: c.code,
      kind: c.kind,
      value: c.value,
      maxUses: c.maxUses,
      uses: c.uses,
      expiresAt: c.expiresAt,
      active: c.active,
      note: c.note,
      createdAt: c.createdAt,
      revenue: paid.reduce((s, o) => s + o.amount, 0),
    };
  };
  const listCodes = () => Object.values(codes).sort((a, b) => b.createdAt - a.createdAt).map(adminView);

  /** Returns true when the request was handled. */
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const path = new URL(req.url ?? "/", "http://x").pathname;

    // payOS calls this server-to-server: no CORS, no session, only the signature.
    if (path === "/payos/webhook") {
      if (req.method !== "POST") return json(res, 405, { ok: false }), true;
      if (!deps.payos) return json(res, 503, { ok: false }), true;
      const body = await readJson<unknown>(req, 64 * 1024);
      const data = deps.payos.verifyWebhook(body);
      if (!data) {
        // Shape only (field names and types), never values: enough to tell a wrong
        // checksum key from a payload we do not understand.
        const b = body as { data?: Record<string, unknown>; signature?: unknown } | null;
        const shape = b?.data && typeof b.data === "object" ? Object.entries(b.data).map(([k, v]) => `${k}:${v === null ? "null" : typeof v}`) : null;
        console.warn("[shop] webhook rejected: bad signature", JSON.stringify({ topKeys: b && typeof b === "object" ? Object.keys(b) : null, data: shape, signatureLength: typeof b?.signature === "string" ? b.signature.length : null }));
        return json(res, 400, { ok: false, error: "bad signature" }), true;
      }
      const order = orders[String(data.orderCode)];
      // Unknown orders (e.g. payOS's own test when the webhook URL is saved) are acknowledged.
      if (order && (data.code ?? "00") === "00" && Number(data.amount) >= order.amount) fulfil(order);
      return json(res, 200, { ok: true }), true;
    }

    if (path !== "/shop" && !path.startsWith("/shop/")) return false;
    cors(req, res, deps.corsOrigin);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return true;
    }

    if (path === "/shop" && req.method === "GET")
      return json(res, 200, { ok: true, enabled: !!deps.payos, price: ITEM_PRICE_VND, items: SHOP_ITEMS }), true;

    const user = deps.accounts.userForToken(bearer(req));
    if (!user) return json(res, 401, { ok: false, error: "err.sessionExpired" }), true;

    try {
      // ------------------------------------------------------------ admin --
      if (path === "/shop/admin/codes" || path.startsWith("/shop/admin/codes/")) {
        if (!deps.accounts.isAdmin(user)) return json(res, 403, { ok: false, error: "err.notAdmin" }), true;
        const target = normalizeCode(decodeURIComponent(path.slice("/shop/admin/codes/".length)));

        if (path === "/shop/admin/codes" && req.method === "GET") return json(res, 200, { ok: true, codes: listCodes() }), true;

        if (path === "/shop/admin/codes" && req.method === "POST") {
          const input = (await readJson<CodeInput>(req, 4 * 1024)) ?? {};
          const r = cleanCodeInput(input, true);
          if (!r.ok) return json(res, 400, { ok: false, error: r.error }), true;
          const code = r.fields.code!;
          if (codes[code]) return json(res, 409, { ok: false, error: "err.codeExists" }), true;
          codes[code] = { ...(r.fields as DiscountCode), uses: 0, usedBy: [], createdAt: now() };
          saveCodes();
          return json(res, 200, { ok: true, codes: listCodes() }), true;
        }

        const existing = codes[target];
        if (!existing) return json(res, 404, { ok: false, error: "err.codeInvalid" }), true;

        if (req.method === "PATCH") {
          const r = cleanCodeInput((await readJson<CodeInput>(req, 4 * 1024)) ?? {}, false);
          if (!r.ok) return json(res, 400, { ok: false, error: r.error }), true;
          Object.assign(existing, r.fields);
          saveCodes();
          return json(res, 200, { ok: true, codes: listCodes() }), true;
        }
        if (req.method === "DELETE") {
          delete codes[target];
          saveCodes();
          return json(res, 200, { ok: true, codes: listCodes() }), true;
        }
        return json(res, 405, { ok: false }), true;
      }

      // ------------------------------------------------------------ buyer --
      const check = /^\/shop\/codes\/([^/]{1,64})$/.exec(path);
      if (check && req.method === "GET") {
        const code = normalizeCode(decodeURIComponent(check[1]));
        const c = codes[code];
        const problem = codeProblem(c, user.id, now());
        if (problem || !c) return json(res, 400, { ok: false, error: problem ?? "err.codeInvalid" }), true;
        return json(res, 200, { ok: true, code: c.code, kind: c.kind, value: c.value, amount: discountedPrice(ITEM_PRICE_VND, c) }), true;
      }

      if (path === "/shop/checkout" && req.method === "POST") {
        const body = await readJson<{ itemId?: unknown; returnUrl?: unknown; code?: unknown }>(req, 4 * 1024);
        const itemId = body?.itemId;
        if (!isShopItem(itemId)) return json(res, 400, { ok: false, error: "err.itemUnknown" }), true;
        if (deps.accounts.ownedFor(user.id).includes(itemId)) return json(res, 409, { ok: false, error: "err.itemOwned" }), true;

        const codeId = normalizeCode(body?.code);
        let amount = ITEM_PRICE_VND;
        if (codeId) {
          const problem = codeProblem(codes[codeId], user.id, now());
          if (problem) return json(res, 400, { ok: false, error: problem }), true;
          amount = discountedPrice(ITEM_PRICE_VND, codes[codeId]);
        }

        // A code that covers the whole price: unlock now, no payment.
        if (amount === 0) {
          const order: Order = { orderCode: newOrderCode(), userId: user.id, itemId, amount: 0, code: codeId, status: "pending", createdAt: now() };
          orders[order.orderCode] = order;
          fulfil(order);
          return json(res, 200, { ok: true, free: true, order: view(order), user: deps.accounts.publicUser(user) }), true;
        }

        if (!deps.payos) return json(res, 503, { ok: false, error: "err.shopDisabled" }), true;
        const base = returnBase(req, body?.returnUrl);
        if (!base) return json(res, 400, { ok: false, error: "err.server" }), true;

        // Clicking "buy" twice reuses the open link instead of making a second order.
        const open = Object.values(orders).find(
          (o) =>
            o.userId === user.id &&
            o.itemId === itemId &&
            (o.code ?? "") === codeId &&
            o.status === "pending" &&
            now() - o.createdAt < CHECKOUT_TTL_MS - 60_000,
        );
        if (open?.checkoutUrl) return json(res, 200, { ok: true, orderCode: open.orderCode, checkoutUrl: open.checkoutUrl }), true;

        const orderCode = newOrderCode();
        const back = `${base}/profile?order=${orderCode}`;
        const link = await deps.payos.createPaymentLink({
          orderCode,
          amount,
          description: `MASOI${String(orderCode).slice(-4)}`,
          returnUrl: back,
          cancelUrl: back,
          items: [{ name: itemId, quantity: 1, price: amount }],
          expiredAt: Math.floor((now() + CHECKOUT_TTL_MS) / 1000),
        });
        orders[orderCode] = {
          orderCode,
          userId: user.id,
          itemId,
          amount,
          ...(codeId ? { code: codeId } : {}),
          status: "pending",
          createdAt: now(),
          checkoutUrl: link.checkoutUrl,
          paymentLinkId: link.paymentLinkId,
        };
        save();
        return json(res, 200, { ok: true, orderCode, checkoutUrl: link.checkoutUrl }), true;
      }

      const m = /^\/shop\/orders\/(\d{1,16})$/.exec(path);
      if (m && req.method === "GET") {
        const order = orders[m[1]];
        if (!order || order.userId !== user.id) return json(res, 404, { ok: false, error: "err.orderNotFound" }), true;
        await refresh(order);
        return json(res, 200, { ok: true, order: view(order), user: deps.accounts.publicUser(user) }), true;
      }

      return json(res, 404, { ok: false }), true;
    } catch (err) {
      console.error("[shop]", err);
      return json(res, 502, { ok: false, error: "err.paymentFailed" }), true;
    }
  }

  return { handle, enabled: !!deps.payos, orders: () => Object.values(orders), codes: () => Object.values(codes) };
}
