// Minimal payOS client (https://payos.vn/docs): create a payment link, look up
// an order, and verify the webhook signature. Plain fetch + HMAC-SHA256, no SDK.

import { createHmac, timingSafeEqual } from "node:crypto";

export const PAYOS_API = "https://api-merchant.payos.vn";

export interface PayOSConfig {
  clientId: string;
  apiKey: string;
  checksumKey: string;
  /** Defaults to the real payOS API; tests pass a fake. */
  fetch?: typeof fetch;
  baseUrl?: string;
}

export interface CreateLinkInput {
  orderCode: number;
  amount: number;
  /** Shows in the bank transfer note: keep it short (payOS allows 25 chars, some banks only 9). */
  description: string;
  returnUrl: string;
  cancelUrl: string;
  items?: { name: string; quantity: number; price: number }[];
  /** Unix seconds. */
  expiredAt?: number;
}

export interface PaymentLink {
  checkoutUrl: string;
  paymentLinkId: string;
  orderCode: number;
  qrCode?: string;
}

export type PaymentStatus = "PENDING" | "PROCESSING" | "PAID" | "CANCELLED" | "EXPIRED" | "UNDERPAID" | "FAILED";

export interface PaymentInfo {
  orderCode: number;
  amount: number;
  amountPaid: number;
  status: PaymentStatus;
}

export interface WebhookData {
  orderCode: number;
  amount: number;
  description?: string;
  reference?: string;
  paymentLinkId?: string;
  code?: string;
  [key: string]: unknown;
}

const hmac = (key: string, text: string) => createHmac("sha256", key).update(text).digest("hex");

/** Signature of a create-payment request: these five fields, alphabetical. */
export function signPaymentRequest(checksumKey: string, r: Pick<CreateLinkInput, "amount" | "cancelUrl" | "description" | "orderCode" | "returnUrl">): string {
  return hmac(
    checksumKey,
    `amount=${r.amount}&cancelUrl=${r.cancelUrl}&description=${r.description}&orderCode=${r.orderCode}&returnUrl=${r.returnUrl}`,
  );
}

/** payOS's generic data signature (webhooks, responses): every key sorted, "k=v" joined by "&". */
export function signData(checksumKey: string, data: Record<string, unknown>): string {
  const value = (v: unknown): string => {
    if (v === null || v === undefined || v === "null" || v === "undefined") return "";
    if (Array.isArray(v)) return JSON.stringify(v.map((x) => (x && typeof x === "object" ? sortKeys(x as Record<string, unknown>) : x)));
    if (typeof v === "object") return JSON.stringify(sortKeys(v as Record<string, unknown>));
    return String(v);
  };
  const text = Object.keys(data)
    .sort()
    .map((k) => `${k}=${value(data[k])}`)
    .join("&");
  return hmac(checksumKey, text);
}

function sortKeys(o: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
}

/** Returns the webhook's data when its signature is valid, otherwise null. */
export function verifyWebhook(checksumKey: string, body: unknown): WebhookData | null {
  const b = body as { data?: Record<string, unknown>; signature?: unknown } | null;
  if (!b || typeof b !== "object" || !b.data || typeof b.data !== "object" || typeof b.signature !== "string") return null;
  if (!/^[0-9a-f]+$/i.test(b.signature)) return null;
  return sameHex(signData(checksumKey, b.data), b.signature.toLowerCase()) ? (b.data as WebhookData) : null;
}

export class PayOSError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function createPayOS(cfg: PayOSConfig) {
  const doFetch = cfg.fetch ?? fetch;
  const base = cfg.baseUrl ?? PAYOS_API;
  const headers = { "x-client-id": cfg.clientId, "x-api-key": cfg.apiKey, "Content-Type": "application/json" };

  async function call<T>(path: string, init: RequestInit): Promise<T> {
    const res = await doFetch(`${base}${path}`, { ...init, headers, signal: AbortSignal.timeout(15_000) });
    const body = (await res.json().catch(() => null)) as { code?: string; desc?: string; data?: T } | null;
    if (!body || body.code !== "00" || !body.data) throw new PayOSError(body?.desc ?? `HTTP ${res.status}`, body?.code);
    return body.data;
  }

  return {
    async createPaymentLink(input: CreateLinkInput): Promise<PaymentLink> {
      const signature = signPaymentRequest(cfg.checksumKey, input);
      return call<PaymentLink>("/v2/payment-requests", { method: "POST", body: JSON.stringify({ ...input, signature }) });
    },
    async getPayment(orderCode: number): Promise<PaymentInfo> {
      return call<PaymentInfo>(`/v2/payment-requests/${orderCode}`, { method: "GET" });
    },
    verifyWebhook: (body: unknown) => verifyWebhook(cfg.checksumKey, body),
  };
}

export type PayOS = ReturnType<typeof createPayOS>;

/** Reads PAYOS_CLIENT_ID / PAYOS_API_KEY / PAYOS_CHECKSUM_KEY; null when any is missing. */
export function payOSFromEnv(env: NodeJS.ProcessEnv = process.env): PayOS | null {
  // Trim: keys pasted into a hosting dashboard often pick up a stray space or newline.
  const clientId = (env.PAYOS_CLIENT_ID ?? "").trim();
  const apiKey = (env.PAYOS_API_KEY ?? "").trim();
  const checksumKey = (env.PAYOS_CHECKSUM_KEY ?? "").trim();
  return clientId && apiKey && checksumKey ? createPayOS({ clientId, apiKey, checksumKey }) : null;
}
