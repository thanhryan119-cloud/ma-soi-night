// Donations through payOS. Nothing is sold: a donation unlocks nothing, every
// cosmetic and role is free for everyone.
//
//   GET   /donate                  public: are donations on, suggested amounts, recent supporters
//   POST  /donate                  public: { amount, name?, message?, returnUrl? } -> payOS link + VietQR data
//   GET   /donate/:orderCode       public: status of one donation (asks payOS while still pending)
//   POST  /payos/webhook           payOS -> us when a transfer lands (signature checked)
//
// Donations live in donations.json.

import { randomInt } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join } from "node:path";
import { DONATE_MAX_VND, DONATE_MIN_VND, DONATE_PRESETS_VND, cleanDonorName, cleanDonorMessage, isDonationAmount } from "../shared/donate";
import { cors, json, readJson } from "./http";
import type { PayOS } from "./payos";

export type DonationStatus = "pending" | "paid" | "cancelled" | "expired";

export interface Donation {
  orderCode: number;
  amount: number;
  /** Shown on the thank-you list; empty means anonymous. */
  name: string;
  /** Private note to the team, never shown to other players. */
  message: string;
  status: DonationStatus;
  createdAt: number;
  paidAt?: number;
  checkoutUrl?: string;
  qrCode?: string;
  bin?: string;
  accountNumber?: string;
  accountName?: string;
  description?: string;
}

export interface DonateDeps {
  dataDir: string;
  corsOrigin: string[] | "*";
  payos: PayOS | null;
  /** Public web address, e.g. https://ma-soi.vercel.app (else the request's allowed origin). */
  webUrl?: string;
  now?: () => number;
}

/** A payment link stays open this long (payOS expiredAt). */
export const DONATE_TTL_MS = 15 * 60 * 1000;
/** At most this many new donation links per address in DONATE_TTL_MS (stops someone flooding payOS). */
export const DONATE_RATE_LIMIT = 8;
/** How many recent supporters the page lists. */
const RECENT = 12;

function loadJson<T>(file: string, fallback: T): T {
  try {
    if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch (err) {
    console.error("[donate] load failed", err);
  }
  return fallback;
}

function saveJson(file: string, value: unknown) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(value));
  renameSync(tmp, file);
}

const clientIp = (req: IncomingMessage) =>
  String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket.remoteAddress || "?";

export function createDonations(deps: DonateDeps) {
  const now = deps.now ?? Date.now;
  const file = join(deps.dataDir, "donations.json");
  const donations = loadJson<Record<string, Donation>>(file, {});
  const save = () => saveJson(file, donations);
  /** Recent link creations per address, for the rate limit (memory only). */
  const created = new Map<string, number[]>();

  /** payOS wants a unique positive integer per merchant (≤ 2^53). */
  function newOrderCode(): number {
    for (;;) {
      const code = Number(`${now() % 1e10}${randomInt(100, 1000)}`);
      if (code > 0 && !donations[code]) return code;
    }
  }

  function markPaid(d: Donation) {
    if (d.status === "paid") return;
    d.status = "paid";
    d.paidAt = now();
    save();
    console.log(`[donate] ${d.orderCode} paid: ${d.amount} VND${d.name ? ` from ${d.name}` : ""}`);
  }

  /** Where payOS sends the donor back: our /donate page on an allowed web origin. */
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

  async function refresh(d: Donation) {
    if (d.status !== "pending" || !deps.payos) return;
    try {
      const info = await deps.payos.getPayment(d.orderCode);
      if (info.status === "PAID" && info.amountPaid >= d.amount) markPaid(d);
      else if (info.status === "CANCELLED" || info.status === "EXPIRED") {
        d.status = info.status === "CANCELLED" ? "cancelled" : "expired";
        save();
      }
    } catch (err) {
      console.error(`[donate] status check for ${d.orderCode} failed`, err);
    }
  }

  const recent = () =>
    Object.values(donations)
      .filter((d) => d.status === "paid")
      .sort((a, b) => (b.paidAt ?? 0) - (a.paidAt ?? 0))
      .slice(0, RECENT)
      .map((d) => ({ name: d.name, amount: d.amount, paidAt: d.paidAt ?? d.createdAt }));

  /** What the donor's page needs to show the transfer, like payOS's own checkout. */
  const view = (d: Donation) => ({
    orderCode: d.orderCode,
    amount: d.amount,
    status: d.status,
    expiresAt: d.createdAt + DONATE_TTL_MS,
    checkoutUrl: d.checkoutUrl ?? null,
    qrCode: d.qrCode ?? null,
    bin: d.bin ?? null,
    accountNumber: d.accountNumber ?? null,
    accountName: d.accountName ?? null,
    description: d.description ?? null,
  });

  function allowed(ip: string): boolean {
    const t = now();
    const list = (created.get(ip) ?? []).filter((x) => t - x < DONATE_TTL_MS);
    if (list.length >= DONATE_RATE_LIMIT) return created.set(ip, list), false;
    list.push(t);
    created.set(ip, list);
    return true;
  }

  /** Returns true when the request was handled. */
  async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const path = new URL(req.url ?? "/", "http://x").pathname;

    // payOS calls this server-to-server: no CORS, only the signature.
    if (path === "/payos/webhook") {
      if (req.method !== "POST") return json(res, 405, { ok: false }), true;
      if (!deps.payos) return json(res, 503, { ok: false }), true;
      const data = deps.payos.verifyWebhook(await readJson<unknown>(req, 64 * 1024));
      if (!data) {
        console.warn("[donate] webhook rejected: bad signature");
        return json(res, 400, { ok: false, error: "bad signature" }), true;
      }
      const d = donations[String(data.orderCode)];
      // Unknown codes (payOS's own test when the webhook URL is saved, old shop orders) are acknowledged.
      if (d && (data.code ?? "00") === "00" && Number(data.amount) >= d.amount) markPaid(d);
      return json(res, 200, { ok: true }), true;
    }

    if (path !== "/donate" && !path.startsWith("/donate/")) return false;
    cors(req, res, deps.corsOrigin);
    if (req.method === "OPTIONS") {
      res.statusCode = 204;
      res.end();
      return true;
    }

    try {
      if (path === "/donate" && req.method === "GET")
        return json(res, 200, { ok: true, enabled: !!deps.payos, presets: DONATE_PRESETS_VND, min: DONATE_MIN_VND, max: DONATE_MAX_VND, recent: recent() }), true;

      if (path === "/donate" && req.method === "POST") {
        if (!deps.payos) return json(res, 503, { ok: false, error: "err.donateOff" }), true;
        const body = await readJson<{ amount?: unknown; name?: unknown; message?: unknown; returnUrl?: unknown }>(req, 4 * 1024);
        const amount = body?.amount;
        if (!isDonationAmount(amount)) return json(res, 400, { ok: false, error: "err.donateAmount" }), true;
        const base = returnBase(req, body?.returnUrl);
        if (!base) return json(res, 400, { ok: false, error: "err.server" }), true;
        if (!allowed(clientIp(req))) return json(res, 429, { ok: false, error: "err.tooFast" }), true;

        const orderCode = newOrderCode();
        const back = `${base}/donate?order=${orderCode}`;
        const description = `UNGHO${String(orderCode).slice(-4)}`;
        const link = await deps.payos.createPaymentLink({
          orderCode,
          amount,
          description,
          returnUrl: back,
          cancelUrl: back,
          items: [{ name: "Ung ho Ma Soi", quantity: 1, price: amount }],
          expiredAt: Math.floor((now() + DONATE_TTL_MS) / 1000),
        });
        const d: Donation = {
          orderCode,
          amount,
          name: cleanDonorName(body?.name),
          message: cleanDonorMessage(body?.message),
          status: "pending",
          createdAt: now(),
          checkoutUrl: link.checkoutUrl,
          qrCode: link.qrCode,
          bin: link.bin,
          accountNumber: link.accountNumber,
          accountName: link.accountName,
          description: link.description ?? description,
        };
        donations[orderCode] = d;
        save();
        return json(res, 200, { ok: true, donation: view(d) }), true;
      }

      const m = /^\/donate\/(\d{1,16})$/.exec(path);
      if (m && req.method === "GET") {
        const d = donations[m[1]];
        if (!d) return json(res, 404, { ok: false, error: "err.donationNotFound" }), true;
        await refresh(d);
        return json(res, 200, { ok: true, donation: view(d) }), true;
      }

      return json(res, 404, { ok: false }), true;
    } catch (err) {
      console.error("[donate]", err);
      return json(res, 502, { ok: false, error: "err.paymentFailed" }), true;
    }
  }

  return { handle, enabled: !!deps.payos, donations: () => Object.values(donations) };
}
