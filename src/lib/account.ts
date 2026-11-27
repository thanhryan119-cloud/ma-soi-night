"use client";

// Client side of the optional Google account + the local (guest) profile.

import { useEffect, useState } from "react";
import { AVATARS } from "@shared/engine";
import { DEFAULT_STYLE, sanitizeStyle, type PlayerStyle } from "@shared/cosmetics";
import type { QuestsView } from "@shared/quests";
import { socketUrl, storage } from "./socket";

export interface AccountUser {
  id: string;
  name: string;
  avatarUrl: string | null;
  style: PlayerStyle;
  /** Listed in ADMIN_EMAILS on the server. */
  isAdmin?: boolean;
  /** Google is linked to this account. */
  hasGoogle?: boolean;
  /** Login name of a quick (name and password) account. */
  username?: string | null;
}

/** Same rules as the server: 3 to 20 lowercase letters, digits, "_" or ".". */
export const USERNAME_RE = /^[a-z0-9_.]{3,20}$/;
export const PASSWORD_MIN = 6;

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
}

// Signing in, out or buying in a window over a room (an iframe) shows in the room too.
if (typeof window !== "undefined")
  window.addEventListener("storage", (e) => {
    if (e.key !== AUTH_KEY) return;
    loaded = false;
    load();
    if (!storage.get(AUTH_KEY)) auth = null;
    listeners.forEach((l) => l());
  });

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
    style: sanitizeStyle(p.style ?? DEFAULT_STYLE),
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

/** Signs in with Google, or links Google to the quick account already signed in (`linked`). */
export async function signInWithGoogle(credential: string): Promise<ApiResult & { linked?: boolean }> {
  const r = (await api("/auth/google", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ credential }),
  })) as ApiResult & { linked?: boolean };
  if (r.ok && r.token && r.user) setAuth({ token: r.token, user: r.user });
  return r;
}

/** Makes a quick account (`register`) or signs into one with its login name and password. */
export async function passwordAuth(kind: "register" | "login", username: string, password: string): Promise<ApiResult> {
  const r = await api(`/auth/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: username.trim().toLowerCase(), password }),
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
// Donations (payOS)
// ---------------------------------------------------------------------------

export interface DonateInfo {
  enabled: boolean;
  presets: number[];
  min: number;
  max: number;
  recent: { name: string; amount: number; paidAt: number }[];
}

export type DonationStatus = "pending" | "paid" | "cancelled" | "expired";

export interface DonationView {
  orderCode: number;
  amount: number;
  status: DonationStatus;
  expiresAt: number;
  checkoutUrl: string | null;
  qrCode: string | null;
  bin: string | null;
  accountNumber: string | null;
  accountName: string | null;
  description: string | null;
}

/** Are donations on, suggested amounts and the latest supporters. */
export async function fetchDonateInfo(): Promise<DonateInfo | null> {
  const r = (await api("/donate")) as ApiResult & Partial<DonateInfo>;
  if (!r.ok) return null;
  return { enabled: !!r.enabled, presets: r.presets ?? [], min: r.min ?? 10_000, max: r.max ?? 10_000_000, recent: r.recent ?? [] };
}

/** Opens a donation: payOS makes a payment link and a VietQR code to show on the page. */
export async function startDonation(amount: number, name: string, message: string): Promise<ApiResult & { donation?: DonationView }> {
  return (await api("/donate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, name, message, returnUrl: window.location.origin }),
  })) as ApiResult & { donation?: DonationView };
}

/** Did the transfer land? (the server asks payOS while it is pending) */
export async function checkDonation(orderCode: number): Promise<ApiResult & { donation?: DonationView }> {
  return (await api(`/donate/${orderCode}`)) as ApiResult & { donation?: DonationView };
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
