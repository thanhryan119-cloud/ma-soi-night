// Discount codes for the shop. Pure rules shared by the server and its tests;
// the codes themselves live in codes.json on the server.

export type DiscountKind = "percent" | "amount";

export interface DiscountCode {
  /** Upper-case, A-Z 0-9 - _ (3–24 chars). */
  code: string;
  kind: DiscountKind;
  /** percent: 1–100 · amount: VND off the price. */
  value: number;
  /** Total uses allowed across all accounts (null = unlimited). */
  maxUses: number | null;
  uses: number;
  /** Accounts that already used it: one use per account. */
  usedBy: string[];
  /** Unix ms (null = never expires). */
  expiresAt: number | null;
  active: boolean;
  note: string;
  createdAt: number;
}

/** What the management page may send when creating or editing a code. */
export interface CodeInput {
  code?: unknown;
  kind?: unknown;
  value?: unknown;
  maxUses?: unknown;
  expiresAt?: unknown;
  active?: unknown;
  note?: unknown;
}

export const CODE_PATTERN = /^[A-Z0-9_-]{3,24}$/;

export function normalizeCode(input: unknown): string {
  return typeof input === "string" ? input.trim().toUpperCase() : "";
}

/** The price after the code (never below 0). */
export function discountedPrice(price: number, code: Pick<DiscountCode, "kind" | "value">): number {
  const off = code.kind === "percent" ? Math.round((price * code.value) / 100) : code.value;
  return Math.max(0, price - off);
}

/** Why a code cannot be used right now by this account, or null when it can. */
export function codeProblem(code: DiscountCode | undefined, userId: string, now = Date.now()): string | null {
  if (!code || !code.active) return "err.codeInvalid";
  if (code.expiresAt !== null && now > code.expiresAt) return "err.codeExpired";
  if (code.maxUses !== null && code.uses >= code.maxUses) return "err.codeUsedUp";
  if (code.usedBy.includes(userId)) return "err.codeAlreadyUsed";
  return null;
}

const optionalPositiveInt = (v: unknown): number | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

/**
 * Validates a create (all fields) or an edit (only the fields given) from the
 * management page. Returns the clean fields, or an error key.
 */
export function cleanCodeInput(
  input: CodeInput,
  creating: boolean,
): { ok: true; fields: Partial<DiscountCode> } | { ok: false; error: string } {
  const fields: Partial<DiscountCode> = {};
  if (creating) {
    const code = normalizeCode(input.code);
    if (!CODE_PATTERN.test(code)) return { ok: false, error: "err.codeFormat" };
    fields.code = code;
  }
  if (creating || input.kind !== undefined || input.value !== undefined) {
    const kind = input.kind === "amount" ? "amount" : input.kind === "percent" ? "percent" : null;
    const value = Math.floor(Number(input.value));
    if (!kind) return { ok: false, error: "err.codeValue" };
    if (!Number.isFinite(value) || value < 1 || (kind === "percent" && value > 100) || (kind === "amount" && value > 10_000_000))
      return { ok: false, error: "err.codeValue" };
    fields.kind = kind;
    fields.value = value;
  }
  const maxUses = optionalPositiveInt(input.maxUses);
  if (input.maxUses !== undefined && maxUses === undefined) return { ok: false, error: "err.codeValue" };
  if (maxUses !== undefined) fields.maxUses = maxUses;
  else if (creating) fields.maxUses = null;

  if (input.expiresAt !== undefined) {
    if (input.expiresAt === null || input.expiresAt === "") fields.expiresAt = null;
    else {
      const t = Number(input.expiresAt);
      if (!Number.isFinite(t) || t <= 0) return { ok: false, error: "err.codeValue" };
      fields.expiresAt = t;
    }
  } else if (creating) fields.expiresAt = null;

  if (input.active !== undefined) fields.active = !!input.active;
  else if (creating) fields.active = true;
  if (input.note !== undefined) fields.note = String(input.note).replace(/[\u0000-\u001f<>]/g, "").slice(0, 80);
  else if (creating) fields.note = "";
  return { ok: true, fields };
}
