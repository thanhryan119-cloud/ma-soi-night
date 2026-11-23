// Cosmetics shop paid through payOS.
//
//   GET  /shop                  public: is the shop on, price, item ids
//   POST /shop/checkout         signed in: { itemId, returnUrl } -> payOS checkout link
//   GET  /shop/orders/:code     signed in: status of one of my orders (asks payOS if still pending)
//   POST /payos/webhook         payOS -> us when a transfer lands (signature checked)
//
// An item is granted exactly once per order, from whichever of the webhook or
// the status check sees the payment first. Orders live in orders.json.

import { randomInt } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { ITEM_PRICE_VND, SHOP_ITEMS, isShopItem, type ItemId } from "../shared/cosmetics";
import { bearer, cors, json, readJson } from "./http";
import type { PayOS } from "./payos";

export type OrderStatus = "pending" | "paid" | "cancelled" | "expired";

export interface Order {
  orderCode: number;
  userId: string;
  itemId: ItemId;
  amount: number;
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
  };
  /** Public web address, e.g. https://ma-soi.vercel.app (else the request's allowed origin). */
  webUrl?: string;
  now?: () => number;
}

/** A payment link stays open this long (payOS expiredAt). */
export const CHECKOUT_TTL_MS = 15 * 60 * 1000;

export function createShop<U extends ShopUser>(deps: ShopDeps<U>) {
  const now = deps.now ?? Date.now;
  const file = join(deps.dataDir, "orders.json");
  let orders: Record<string, Order> = {};
  try {
    if (existsSync(file)) orders = JSON.parse(readFileSync(file, "utf8")) as Record<string, Order>;
  } catch (err) {
    console.error("[shop] load failed", err);
  }
  const save = () => {
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify(orders));
    renameSync(tmp, file);
  };

  /** payOS wants a unique positive integer per merchant (≤ 2^53). */
  function newOrderCode(): number {
    for (;;) {
      const code = Number(`${now() % 1e10}${randomInt(100, 1000)}`);
      if (code > 0 && !orders[code]) return code;
    }
  }

  /** Marks an order paid and hands over the item (once). */
  function fulfil(order: Order) {
    if (order.status === "paid") return;
    order.status = "paid";
    order.paidAt = now();
    save();
    deps.accounts.grantItem(order.userId, order.itemId);
    console.log(`[shop] order ${order.orderCode} paid: ${order.itemId} -> ${order.userId}`);
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

  const view = (o: Order) => ({ orderCode: o.orderCode, itemId: o.itemId, amount: o.amount, status: o.status });

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
      if (path === "/shop/checkout" && req.method === "POST") {
        if (!deps.payos) return json(res, 503, { ok: false, error: "err.shopDisabled" }), true;
        const body = await readJson<{ itemId?: unknown; returnUrl?: unknown }>(req, 4 * 1024);
        const itemId = body?.itemId;
        if (!isShopItem(itemId)) return json(res, 400, { ok: false, error: "err.itemUnknown" }), true;
        if (deps.accounts.ownedFor(user.id).includes(itemId)) return json(res, 409, { ok: false, error: "err.itemOwned" }), true;
        const base = returnBase(req, body?.returnUrl);
        if (!base) return json(res, 400, { ok: false, error: "err.server" }), true;

        // Clicking "buy" twice reuses the open link instead of making a second order.
        const open = Object.values(orders).find(
          (o) => o.userId === user.id && o.itemId === itemId && o.status === "pending" && now() - o.createdAt < CHECKOUT_TTL_MS - 60_000,
        );
        if (open?.checkoutUrl) return json(res, 200, { ok: true, orderCode: open.orderCode, checkoutUrl: open.checkoutUrl }), true;

        const orderCode = newOrderCode();
        const back = `${base}/profile?order=${orderCode}`;
        const link = await deps.payos.createPaymentLink({
          orderCode,
          amount: ITEM_PRICE_VND,
          description: `MASOI${String(orderCode).slice(-4)}`,
          returnUrl: back,
          cancelUrl: back,
          items: [{ name: itemId, quantity: 1, price: ITEM_PRICE_VND }],
          expiredAt: Math.floor((now() + CHECKOUT_TTL_MS) / 1000),
        });
        orders[orderCode] = {
          orderCode,
          userId: user.id,
          itemId,
          amount: ITEM_PRICE_VND,
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

  return { handle, enabled: !!deps.payos, orders: () => Object.values(orders) };
}
