"use client";

// Fetching profile cards and the leaderboard.

import type { LeaderboardRow, PublicProfile, UserStats } from "@shared/stats";
import type { GameRecord } from "@shared/replay";
import { getAuth } from "./account";
import { useEffect, useState } from "react";
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

let mine: { userId: string; stats: UserStats | null } | null = null;

/**
 * The signed-in user's stats, fetched once per account and kept for the
 * session (the role card tint reads it on every reveal). undefined while
 * loading, null for guests or on error.
 */
export function useMyStats(userId: string | undefined, refresh = false): UserStats | null | undefined {
  const cached = userId && mine?.userId === userId ? mine.stats : undefined;
  const [stats, setStats] = useState<UserStats | null | undefined>(userId ? cached : null);
  useEffect(() => {
    if (!userId) return setStats(null);
    if (!refresh && mine?.userId === userId) return setStats(mine.stats);
    let alive = true;
    fetchMyStats().then((r) => {
      const s = r.ok ? r.data : null;
      if (r.ok) mine = { userId, stats: s };
      if (alive) setStats(s);
    });
    return () => {
      alive = false;
    };
  }, [userId, refresh]);
  return stats;
}

/** A saved game, to watch it again from a match history. */
export const fetchGame = (id: string) => get(`/games/${encodeURIComponent(id)}`, (b) => b.game as GameRecord);
