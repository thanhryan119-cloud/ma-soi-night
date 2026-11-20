"use client";

// Fetching profile cards and the leaderboard.

import type { LeaderboardRow, PublicProfile, UserStats } from "@shared/stats";
import { getAuth } from "./account";
import { emitAck, socketUrl } from "./socket";

type Res<T> = { ok: true; data: T } | { ok: false; error: string };

async function get<T>(path: string, pick: (body: Record<string, unknown>) => T, auth = false): Promise<Res<T>> {
  try {
    const token = auth ? getAuth()?.token : null;
    const res = await fetch(`${socketUrl()}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const body = (await res.json()) as Record<string, unknown>;
    return body.ok ? { ok: true, data: pick(body) } : { ok: false, error: String(body.error ?? "err.server") };
  } catch {
    return { ok: false, error: "err.disconnected" };
  }
}

/** A player in the current room (works for guests and bots too). */
export async function fetchPlayerProfile(playerId: string): Promise<Res<PublicProfile>> {
  const r = await emitAck<{ profile: PublicProfile }>("profile:get", { playerId });
  return r.ok && r.profile ? { ok: true, data: r.profile } : { ok: false, error: r.error ?? "err.server" };
}

/** An account, e.g. from the leaderboard. */
export const fetchUserProfile = (userId: string) =>
  get(`/profiles/${encodeURIComponent(userId)}`, (b) => b.profile as PublicProfile);

export const fetchLeaderboard = () => get("/leaderboard", (b) => (b.rows ?? []) as LeaderboardRow[]);

/** The signed-in user's own stats. */
export const fetchMyStats = () => get("/me", (b) => (b.stats ?? null) as UserStats | null, true);
