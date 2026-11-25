// Role collection: every win with a role raises that role's card one tier,
// bronze → silver → gold → rainbow. Every win counts, standard and casual.

import { ROLE_IDS } from "./roles";
import { casualOf, type UserStats } from "./stats";
import type { RoleId } from "./types";

export type CardTier = "bronze" | "silver" | "gold" | "rainbow";

/** Wins with a role needed for each tier, lowest first. */
export const TIER_WINS: Record<CardTier, number> = {
  bronze: 1,
  silver: 5,
  gold: 15,
  rainbow: 30,
};

export const TIERS = Object.keys(TIER_WINS) as CardTier[];

/** The highest tier reached with this many wins, or null below bronze. */
export function tierFor(wins: number): CardTier | null {
  let out: CardTier | null = null;
  for (const t of TIERS) if (wins >= TIER_WINS[t]) out = t;
  return out;
}

/** The next tier to reach (null once rainbow), and the wins it needs. */
export function nextTier(wins: number): { tier: CardTier; wins: number } | null {
  const t = TIERS.find((x) => wins < TIER_WINS[x]);
  return t ? { tier: t, wins: TIER_WINS[t] } : null;
}

export const roleWins = (stats: UserStats | null | undefined, role: RoleId) =>
  stats ? (stats.byRole[role]?.wins ?? 0) + (casualOf(stats).byRole[role]?.wins ?? 0) : 0;

export const roleTier = (stats: UserStats | null | undefined, role: RoleId) => tierFor(roleWins(stats, role));

/** How many roles sit at each tier or higher, out of every role. */
export function collectionSummary(stats: UserStats | null | undefined) {
  const atLeast: Record<CardTier, number> = { bronze: 0, silver: 0, gold: 0, rainbow: 0 };
  for (const r of ROLE_IDS) {
    const w = roleWins(stats, r);
    for (const t of TIERS) if (w >= TIER_WINS[t]) atLeast[t]++;
  }
  return { total: ROLE_IDS.length, atLeast };
}
