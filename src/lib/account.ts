"use client";

// Client side of the optional Google account + the local (guest) profile.

import { useEffect, useState } from "react";
import { AVATARS } from "@shared/engine";
import { DEFAULT_STYLE, limitStyle, sanitizeOwned, sanitizeStyle, type ItemId, type PlayerStyle } from "@shared/cosmetics";
import type { QuestsView } from "@shared/quests";
import { socketUrl, storage } from "./socket";

export interface AccountUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  style: PlayerStyle;
  /** Shop items this account bought. */
  owned: ItemId[];
  /** May manage discount codes (/admin/codes). */
  isAdmin?: boolean;
}

export interface LocalProfile {
  name: string;
  avatar: string;
  style: PlayerStyle;
}

const AUTH_KEY = "msn:auth";
const PROFILE_KEY = "msn:profile";

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

/** Uploaded photos are served by the socket server under /avatars/. */
export function resolveAvatarUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.startsWith("/") ? `${socketUrl()}${url}` : url;
}

// ---------------------------------------------------------------------------
// Tiny shared store so every component sees sign-in changes immediately.
// ---------------------------------------------------------------------------

type AuthState = { token: string; user: AccountUser } | null;
let auth: AuthState = null;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  auth = storage.get<AuthState>(AUTH_KEY);
  if (auth) auth = { ...auth, user: { ...auth.user, owned: sanitizeOwned(auth.user.owned) } };
}

function setAuth(next: AuthState) {
  auth = next;
  if (next) storage.set(AUTH_KEY, next);
  else storage.remove(AUTH_KEY);
  listeners.forEach((l) => l());
}

export function getAuth(): AuthState {
  load();
  return auth;
}

export function useAccount() {
  const [state, setState] = useState<AuthState>(null);
  useEffect(() => {
    load();
    setState(auth);
    const l = () => setState(auth);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return state;
}

export function loadLocalProfile(): LocalProfile {
  const p = storage.get<Partial<LocalProfile>>(PROFILE_KEY) ?? {};
  return {
    name: typeof p.name === "string" ? p.name : "",
    avatar: AVATARS.includes(p.avatar ?? "") ? p.avatar! : AVATARS[Math.floor(Math.random() * AVATARS.length)],
    // Paid items only stay on while the signed-in account owns them.
    style: limitStyle(sanitizeStyle(p.style ?? DEFAULT_STYLE), getAuth()?.user.owned ?? []),
  };
}

export function saveLocalProfile(p: LocalProfile) {
  storage.set(PROFILE_KEY, p);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

type ApiResult = { ok: boolean; error?: string; user?: AccountUser; token?: string };

async function api(path: string, init: RequestInit = {}): Promise<ApiResult> {
  try {
    const token = getAuth()?.token;
    const res = await fetch(`${socketUrl()}${path}`, {
      ...init,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
    });
    const body = (await res.json().catch(() => ({ ok: false, error: "err.server" }))) as ApiResult;
    if (res.status === 401) setAuth(null);
    return body;
  } catch {
    return { ok: false, error: "err.disconnected" };
  }
}

export async function signInWithGoogle(credential: string): Promise<ApiResult> {
  const r = await api("/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  });
  if (r.ok && r.token && r.user) setAuth({ token: r.token, user: r.user });
  return r;
}

export async function refreshAccount() {
  if (!getAuth()) return;
  const r = await api("/me");
  if (r.ok && r.user && auth) setAuth({ ...auth, user: r.user });
}

export async function updateAccount(patch: { name?: string; style?: PlayerStyle; removePhoto?: boolean }) {
  const r = await api("/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (r.ok && r.user && auth) setAuth({ ...auth, user: r.user });
  return r;
}

export async function uploadAvatar(file: File): Promise<ApiResult> {
  const blob = await squareResize(file, 256);
  if (!blob) return { ok: false, error: "err.imageInvalid" };
  const r = await api("/me/avatar", { method: "POST", headers: { "Content-Type": blob.type }, body: blob });
  if (r.ok && r.user && auth) setAuth({ ...auth, user: r.user });
  return r;
}

// ---------------------------------------------------------------------------
// Shop (payOS)
// ---------------------------------------------------------------------------

export interface ShopInfo {
  enabled: boolean;
  price: number;
}

export const SHOP_RETURN_KEY = "msn:shopReturn";

let shopInfo: Promise<ShopInfo> | null = null;
/** Is the shop on, and what does an item cost? (asked once per page load) */
export function fetchShop(): Promise<ShopInfo> {
  shopInfo ??= api("/shop").then((r) => {
    const b = r as unknown as Partial<ShopInfo>;
    if (!r.ok) shopInfo = null; // try again next time
    return { enabled: !!(r.ok && b.enabled), price: Number(b.price) || 50_000 };
  });
  return shopInfo;
}

export interface CodeCheck {
  code: string;
  kind: "percent" | "amount";
  value: number;
  /** Price of one item after the code. */
  amount: number;
}

/** What a discount code does for me right now (price after it), or why it can't be used. */
export async function checkCode(code: string): Promise<ApiResult & Partial<CodeCheck>> {
  return (await api(`/shop/codes/${encodeURIComponent(code.trim())}`)) as ApiResult & Partial<CodeCheck>;
}

/**
 * Buys one item, with an optional discount code. Usually the browser leaves for
 * payOS; a code that covers the whole price unlocks it right away (`free`).
 */
export async function buyItem(itemId: ItemId, code?: string): Promise<ApiResult & { free?: boolean }> {
  const r = (await api("/shop/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId, returnUrl: window.location.origin, ...(code ? { code } : {}) }),
  })) as ApiResult & { checkoutUrl?: string; free?: boolean };
  if (r.ok && r.free && r.user && auth) setAuth({ ...auth, user: { ...r.user, owned: sanitizeOwned(r.user.owned) } });
  if (r.ok && r.checkoutUrl) {
    // payOS brings the buyer back to /profile; remember where they bought from.
    storage.set(SHOP_RETURN_KEY, window.location.pathname + window.location.search);
    window.location.assign(r.checkoutUrl);
  }
  return r;
}

export type OrderStatus = "pending" | "paid" | "cancelled" | "expired";

/** After payOS sends the buyer back: did the payment land? Updates the account when it did. */
export async function checkOrder(orderCode: number): Promise<ApiResult & { order?: { itemId: ItemId; status: OrderStatus } }> {
  const r = (await api(`/shop/orders/${orderCode}`)) as ApiResult & { order?: { itemId: ItemId; status: OrderStatus } };
  if (r.ok && r.user && auth) setAuth({ ...auth, user: { ...r.user, owned: sanitizeOwned(r.user.owned) } });
  return r;
}

// ---------------------------------------------------------------------------
// Discount code management (admins only)
// ---------------------------------------------------------------------------

export interface AdminCode {
  code: string;
  kind: "percent" | "amount";
  value: number;
  maxUses: number | null;
  uses: number;
  expiresAt: number | null;
  active: boolean;
  note: string;
  createdAt: number;
  /** VND brought in by paid orders that used it. */
  revenue: number;
}

type CodesResult = ApiResult & { codes?: AdminCode[] };

export async function listCodes(): Promise<CodesResult> {
  return (await api("/shop/admin/codes")) as CodesResult;
}

export async function createCode(input: {
  code: string;
  kind: "percent" | "amount";
  value: number;
  maxUses: number | null;
  expiresAt: number | null;
  note: string;
}): Promise<CodesResult> {
  return (await api("/shop/admin/codes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })) as CodesResult;
}

export async function updateCode(code: string, patch: Partial<Pick<AdminCode, "active" | "maxUses" | "expiresAt" | "note">>): Promise<CodesResult> {
  return (await api(`/shop/admin/codes/${encodeURIComponent(code)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  })) as CodesResult;
}

export async function deleteCode(code: string): Promise<CodesResult> {
  return (await api(`/shop/admin/codes/${encodeURIComponent(code)}`, { method: "DELETE" })) as CodesResult;
}

// ---------------------------------------------------------------------------
// Quests and gold
// ---------------------------------------------------------------------------

let quests: QuestsView | null = null;
const questListeners = new Set<() => void>();
function setQuests(q: QuestsView | null) {
  quests = q;
  questListeners.forEach((l) => l());
}

/** My gold and quests (null for guests, or until loaded). Loads them on first use. */
export function useQuests() {
  const account = useAccount();
  const [state, setState] = useState<QuestsView | null>(quests);
  useEffect(() => {
    const l = () => setState(quests);
    questListeners.add(l);
    l();
    return () => {
      questListeners.delete(l);
    };
  }, []);
  useEffect(() => {
    if (account) refreshQuests();
    else setQuests(null);
  }, [account?.user.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return account ? state : null;
}

export async function refreshQuests() {
  if (!getAuth()) return;
  const r = (await api("/quests")) as ApiResult & { quests?: QuestsView };
  if (r.ok && r.quests) setQuests(r.quests);
}

/** Collects a finished quest's gold ("checkin", "bonus" or a quest id). */
export async function claimQuestReward(id: string): Promise<ApiResult & { gold?: number }> {
  const r = (await api("/quests/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  })) as ApiResult & { gold?: number; quests?: QuestsView };
  if (r.quests) setQuests(r.quests);
  return r;
}

/** Buys a shop item with gold (only items with a gold price). */
export async function buyWithGold(itemId: ItemId): Promise<ApiResult> {
  const r = (await api("/quests/buy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId }),
  })) as ApiResult & { quests?: QuestsView };
  if (r.quests) setQuests(r.quests);
  if (r.ok && r.user && auth) setAuth({ ...auth, user: { ...r.user, owned: sanitizeOwned(r.user.owned) } });
  return r;
}

export async function signOut() {
  await api("/auth/logout", { method: "POST" });
  setAuth(null);
}

/** Center-crops and resizes an image to a small JPEG before upload. */
async function squareResize(file: File, size: number): Promise<Blob | null> {
  if (!file.type.startsWith("image/")) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, size, size);
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85));
  } catch {
    return null;
  }
}
