// How fair a setup is: every role carries a weight (plus helps the village,
// minus helps the wolves), and the sum tells which side the table leans to.
// The host sees a warning with the reasons and a one-click fix when a setup
// chosen by hand leans too far.

import { ROLES, ROLE_IDS, isWolf } from "./roles";
import type { RoleId } from "./types";

/** Strength of one copy of each role, for the village (+) or against it (−). */
export const ROLE_WEIGHT: Record<RoleId, number> = {
  werewolf: -6,
  villager: 1,
  seer: 7,
  bodyguard: 3,
  witch: 4,
  hunter: 3,
  cupid: -2,
  cursedWolf: -7,
  wolfSeer: -7,
  elder: 3,
  idiot: 2,
  lycan: -1,
  sister: 2,
  wildChild: -1,
  medium: 3,
  mayor: 2,
  bigBadWolf: -9,
  minion: -4,
  knight: 3,
  silencer: -7,
  tanner: -2,
  whiteWolf: -5,
  serialKiller: -4,
  arsonist: -4,
};

export type Side = "wolves" | "village";

export type BalanceReason =
  | { key: "noWolves" }
  | { key: "packHalf"; wolves: number; players: number }
  | { key: "packSize"; wolves: number; players: number; ideal: number }
  | { key: "strongRoles"; side: Side; roles: RoleId[] }
  | { key: "noSeer" }
  | { key: "solos"; count: number };

export interface Balance {
  /** Sum of the weights: above zero leans to the village, below to the wolves. */
  score: number;
  /** How far the score may stray before the setup counts as lopsided. */
  limit: number;
  /** The side the setup favours, or null when it is fair. */
  leans: Side | null;
  /** 1 = a little off, 2 = clearly off, 3 = one side can hardly lose. */
  level: 0 | 1 | 2 | 3;
  reasons: BalanceReason[];
}

const sum = (c: Record<RoleId, number>, f: (r: RoleId) => boolean) => ROLE_IDS.filter(f).reduce((s, r) => s + (c[r] || 0), 0);
export const packSize = (c: Record<RoleId, number>) => sum(c, isWolf);
/** The usual pack for a table of n (one wolf per four players or so). */
export const idealPack = (n: number) => Math.max(1, Math.floor((n + 1) / 4));

export function scoreOf(c: Record<RoleId, number>): number {
  return ROLE_IDS.reduce((s, r) => s + (c[r] || 0) * ROLE_WEIGHT[r], 0);
}

const limitFor = (n: number) => Math.max(11, Math.round(n * 0.9));

export function balanceOf(c: Record<RoleId, number>): Balance {
  const n = sum(c, () => true);
  const score = scoreOf(c);
  const limit = limitFor(n);
  const wolves = packSize(c);
  const reasons: BalanceReason[] = [];
  if (n === 0) return { score, limit, leans: null, level: 0, reasons };

  const ideal = idealPack(n);
  let leans: Side | null = score > limit ? "village" : score < -limit ? "wolves" : null;
  // A pack bigger (or smaller) than usual tips the table sooner.
  if (!leans && wolves > ideal && score < -limit * 0.65) leans = "wolves";
  if (!leans && wolves < ideal && score > limit * 0.75) leans = "village";
  // Half the table in the pack wins at once; no pack at all, the village wins at once.
  if (wolves === 0) leans = "village";
  if (wolves * 2 >= n) leans = "wolves";
  if (!leans) return { score, limit, leans, level: 0, reasons };

  const off = Math.abs(score) / limit;
  let level: Balance["level"] = off > 2.2 ? 3 : off > 1.5 ? 2 : 1;
  if (wolves === 0 || wolves * 2 >= n) level = 3;

  if (wolves === 0) reasons.push({ key: "noWolves" });
  else if (wolves * 2 >= n) reasons.push({ key: "packHalf", wolves, players: n });
  else if (((leans === "wolves" && wolves > ideal) || (leans === "village" && wolves < ideal)))
    reasons.push({ key: "packSize", wolves, players: n, ideal });
  // The strongest roles on the side that is ahead.
  const strong = ROLE_IDS.filter((r) => c[r] > 0 && (leans === "village" ? ROLE_WEIGHT[r] >= 3 : ROLE_WEIGHT[r] <= -5 && r !== "werewolf"))
    .sort((a, b) => Math.abs(ROLE_WEIGHT[b]) - Math.abs(ROLE_WEIGHT[a]));
  if (strong.length) reasons.push({ key: "strongRoles", side: leans, roles: strong });
  if (leans === "wolves" && !c.seer && n >= 5) reasons.push({ key: "noSeer" });
  const solos = sum(c, (r) => ROLES[r].team === "solo" && r !== "tanner");
  if (leans === "wolves" && solos > 0) reasons.push({ key: "solos", count: solos });
  return { score, limit, leans, level, reasons };
}

export interface BalanceFix {
  counts: Record<RoleId, number>;
  /** Roles taken out and put in, one copy each. */
  swaps: { from: RoleId; to: RoleId }[];
  /** True when the fixed setup is fair (otherwise it is only fairer). */
  fair: boolean;
}

/** Plain swaps are tried first: they change the feel of the table the least. */
const plain = (r: RoleId) => r === "villager" || r === "werewolf";

/**
 * Up to three one-for-one role swaps that bring the setup back in line, using
 * only roles in `open`. Null when the setup is fair or nothing helps.
 */
export function fixBalance(c: Record<RoleId, number>, open: readonly RoleId[] = ROLE_IDS): BalanceFix | null {
  const start = balanceOf(c);
  if (!start.leans) return null;
  const n = sum(c, () => true);
  const counts = { ...c };
  const swaps: BalanceFix["swaps"] = [];
  const badness = (x: Record<RoleId, number>) => {
    const w = packSize(x);
    // A setup with no pack or half the table in it is always the worst.
    // A pack with no plain Werewolf in it comes next (every suggested setup keeps one).
    const broken = w === 0 || w * 2 >= n ? 1000 : !x.werewolf ? 100 : 0;
    return broken + Math.max(0, Math.abs(scoreOf(x)) - limitFor(n) * 0.5);
  };
  for (let step = 0; step < 3 && balanceOf(counts).leans; step++) {
    let best: { from: RoleId; to: RoleId; bad: number } | null = null;
    for (const from of ROLE_IDS) {
      if (!counts[from] || from === "sister") continue;
      for (const to of open) {
        if (to === from || to === "sister") continue;
        const max = ROLES[to].max;
        if (max !== undefined && counts[to] >= max) continue;
        const next = { ...counts, [from]: counts[from] - 1, [to]: counts[to] + 1 };
        // Keep at least one plain Werewolf, as every suggested setup does.
        if (from === "werewolf" && counts.werewolf === 1) continue;
        const bad = badness(next) + (plain(from) ? 0 : 0.3) + (plain(to) ? 0 : 0.3);
        if (!best || bad < best.bad) best = { from, to, bad };
      }
    }
    if (!best || best.bad >= badness(counts)) break;
    counts[best.from]--;
    counts[best.to]++;
    swaps.push({ from: best.from, to: best.to });
  }
  if (!swaps.length) return null;
  return { counts, swaps, fair: !balanceOf(counts).leans };
}
