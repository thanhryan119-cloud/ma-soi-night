// Pure rule functions (no I/O) — covered by unit tests.

import { ROLES, isSoloKiller, isWolf, teamOf } from "./roles";
import type {
  Death,
  NominationSettings,
  NominationTally,
  RoleId,
  VerdictSettings,
  VerdictTally,
  Winner,
} from "./types";

// ---------------------------------------------------------------------------
// Deaths & night resolution
// ---------------------------------------------------------------------------

export interface DeathContext {
  alive: string[];
  roles: Record<string, RoleId>;
  lovers: [string, string] | null;
  hunterShootsWhenPoisoned: boolean;
}

export interface CascadeResult {
  deaths: Death[];
  /** Hunters (in death order) who get a revenge shot. */
  hunters: string[];
}

/**
 * Applies the knock-on effects of a set of deaths:
 *  - a lover dies → the partner dies of heartbreak
 *  - a hunter dies → gets a shot (unless poisoned and the setting forbids it)
 * Players already dead or listed twice are ignored.
 */
export function cascadeDeaths(initial: Death[], ctx: DeathContext): CascadeResult {
  const alive = new Set(ctx.alive);
  const deaths: Death[] = [];
  const queue = [...initial];
  while (queue.length) {
    const d = queue.shift()!;
    if (!alive.has(d.playerId)) continue;
    alive.delete(d.playerId);
    deaths.push(d);
    if (ctx.lovers && ctx.lovers.includes(d.playerId)) {
      const partner = ctx.lovers[0] === d.playerId ? ctx.lovers[1] : ctx.lovers[0];
      if (alive.has(partner)) queue.push({ playerId: partner, cause: "heartbreak" });
    }
  }
  const hunters = deaths
    .filter((d) => ROLES[ctx.roles[d.playerId]]?.shootsOnDeath)
    .filter((d) => d.cause !== "poison" || ctx.hunterShootsWhenPoisoned)
    .map((d) => d.playerId);
  return { deaths, hunters };
}

export interface NightInput extends DeathContext {
  protectId: string | null;
  wolfTarget: string | null;
  witchSave: boolean;
  witchPoisonId: string | null;
  /** The Cursed Wolf chose to curse the victim tonight. */
  curse?: boolean;
  /** Elders who can still take a bite. */
  sturdy?: string[];
  /** The Big Bad Wolf's second bite (the Witch can't heal it). */
  extraBite?: string | null;
  /** Players the wolves' bite can't kill (the Serial Killer). */
  immune?: string[];
  /** The Serial Killer's victim (only the Bodyguard stops it). */
  killerTarget?: string | null;
  /** The White Wolf's victim, one of the pack (only the Bodyguard stops it). */
  whiteWolfTarget?: string | null;
  /** Burnt by the Arsonist (nothing stops the fire). */
  fire?: string[];
  /** Other deaths decided before the night resolves (the Knight's rusty sword). */
  extra?: Death[];
}

export type BlockReason = "bodyguard" | "witch" | "elder" | "immune";

export interface NightOutcome extends CascadeResult {
  /** Who the wolves attacked and why they survived, if they did. */
  attackBlockedBy: BlockReason | null;
  /** Every other attack that was stopped (the second bite, the knife, the White Wolf). */
  blocked: { targetId: string; by: BlockReason }[];
  /** The victim the curse turned into a werewolf (alive). */
  cursedId: string | null;
}

/**
 * Night resolution priority:
 *  1. Bodyguard protection blocks the wolf attack.
 *  2. The Witch's healing potion cancels the wolf attack.
 *  3. A curse turns the victim into a werewolf instead of killing them.
 *  4. An Elder survives their first bite.
 *  5. The Witch's poison kills (protection does NOT block poison, even a cursed victim dies).
 *  6. Lovers die together (heartbreak).
 *  7. Hunters who died get a revenge shot (resolved in a later phase).
 */
export function resolveNight(input: NightInput): NightOutcome {
  const initial: Death[] = [];
  const blocked: NightOutcome["blocked"] = [];
  let attackBlockedBy: NightOutcome["attackBlockedBy"] = null;
  let cursedId: string | null = null;
  const isAlive = (id: string | null | undefined): id is string => !!id && input.alive.includes(id);
  const kill = (playerId: string, cause: Death["cause"]) => {
    if (!initial.some((d) => d.playerId === playerId)) initial.push({ playerId, cause });
  };
  // An Elder takes one bite only, whichever wolf bites first.
  const sturdy = new Set(input.sturdy ?? []);
  if (isAlive(input.wolfTarget)) {
    const t = input.wolfTarget;
    if (input.protectId === t) attackBlockedBy = "bodyguard";
    else if (input.witchSave) attackBlockedBy = "witch";
    else if (input.immune?.includes(t)) attackBlockedBy = "immune";
    else if (input.curse) cursedId = t;
    else if (sturdy.has(t)) {
      attackBlockedBy = "elder";
      sturdy.delete(t);
    } else kill(t, "wolves");
  }
  if (isAlive(input.extraBite) && input.extraBite !== input.wolfTarget) {
    const t = input.extraBite;
    if (input.protectId === t) blocked.push({ targetId: t, by: "bodyguard" });
    else if (input.immune?.includes(t)) blocked.push({ targetId: t, by: "immune" });
    else if (sturdy.has(t)) blocked.push({ targetId: t, by: "elder" });
    else kill(t, "wolves");
  }
  for (const [t, cause] of [
    [input.whiteWolfTarget, "wolves"],
    [input.killerTarget, "killer"],
  ] as const) {
    if (!isAlive(t)) continue;
    if (input.protectId === t) blocked.push({ targetId: t, by: "bodyguard" });
    else kill(t, cause);
  }
  for (const d of input.extra ?? []) if (isAlive(d.playerId)) kill(d.playerId, d.cause);
  for (const t of input.fire ?? []) if (isAlive(t)) kill(t, "fire");
  if (isAlive(input.witchPoisonId)) kill(input.witchPoisonId, "poison");
  const res = cascadeDeaths(initial, input);
  // Killed the same night: the curse never takes hold.
  if (cursedId && res.deaths.some((d) => d.playerId === cursedId)) cursedId = null;
  return { ...res, attackBlockedBy, blocked, cursedId };
}

/** Plurality of the pack's picks. Ties are broken by `pick` (random by default). */
export function wolfConsensus(
  wolfVotes: Record<string, string>,
  pick: (ids: string[]) => string = (ids) => ids[Math.floor(Math.random() * ids.length)],
): { target: string | null; unanimous: boolean; tie: boolean } {
  const counts: Record<string, number> = {};
  for (const t of Object.values(wolfVotes)) counts[t] = (counts[t] || 0) + 1;
  const entries = Object.entries(counts);
  if (!entries.length) return { target: null, unanimous: false, tie: false };
  const max = Math.max(...entries.map(([, c]) => c));
  const top = entries.filter(([, c]) => c === max).map(([id]) => id);
  return {
    target: top.length === 1 ? top[0] : pick(top),
    unanimous: entries.length === 1,
    tie: top.length > 1,
  };
}

// ---------------------------------------------------------------------------
// Voting
// ---------------------------------------------------------------------------

export const SKIP = "skip";

/** `weights`: voterId -> how many votes the ballot counts for (default 1; the Mayor 2). */
export function tallyNomination(
  ballots: Record<string, string>,
  rules: NominationSettings,
  weights: Record<string, number> = {},
): NominationTally {
  const counts: Record<string, number> = {};
  let skips = 0;
  for (const [voter, choice] of Object.entries(ballots)) {
    const w = weights[voter] ?? 1;
    if (choice === SKIP) skips += w;
    else counts[choice] = (counts[choice] || 0) + w;
  }
  const ranked = Object.entries(counts)
    .filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1]);
  const result: NominationTally = { counts, skips, nominees: [], tie: false, tiedIds: [] };
  if (!ranked.length) return result;

  if (rules.mode === "threshold") {
    result.nominees = ranked.filter(([, c]) => c >= rules.threshold).map(([id]) => id);
    return result;
  }

  const n = rules.mode === "top1" ? 1 : Math.max(1, rules.n);
  if (ranked.length <= n) {
    result.nominees = ranked.map(([id]) => id);
    return result;
  }
  const cutoff = ranked[n - 1][1];
  const above = ranked.filter(([, c]) => c > cutoff).map(([id]) => id);
  const atCutoff = ranked.filter(([, c]) => c === cutoff).map(([id]) => id);
  const slots = n - above.length;
  if (atCutoff.length <= slots) {
    result.nominees = [...above, ...atCutoff];
    return result;
  }
  // Tie at the cut-off line.
  result.tie = true;
  result.tiedIds = atCutoff;
  if (rules.tie === "allTied") result.nominees = [...above, ...atCutoff];
  else result.nominees = above; // "none" and "revote" (engine re-opens the vote)
  return result;
}

/** `eligible` is the weighted number of votes that could be cast. */
export function tallyVerdict(
  ballots: Record<string, string>,
  eligible: number,
  rules: Pick<VerdictSettings, "majority">,
  weights: Record<string, number> = {},
): VerdictTally {
  let execute = 0;
  let spare = 0;
  for (const [voter, v] of Object.entries(ballots)) {
    const w = weights[voter] ?? 1;
    if (v === "execute") execute += w;
    else if (v === "spare") spare += w;
  }
  const abstain = Math.max(0, eligible - execute - spare);
  const executed =
    rules.majority === "absolute" ? execute > eligible / 2 : execute > spare;
  return { execute, spare, abstain, eligible, executed };
}

// ---------------------------------------------------------------------------
// Win conditions
// ---------------------------------------------------------------------------

export function checkWin(
  alive: string[],
  roles: Record<string, RoleId>,
  lovers: [string, string] | null,
): Winner | null {
  if (alive.length === 0) return "draw";
  if (
    lovers &&
    alive.length === 2 &&
    alive.includes(lovers[0]) &&
    alive.includes(lovers[1]) &&
    (isWolf(roles[lovers[0]]) !== isWolf(roles[lovers[1]]) || teamOf(roles[lovers[0]]) !== teamOf(roles[lovers[1]]))
  )
    return "lovers";
  // A solo killer wins as the last one standing, or one on one with someone who can't kill.
  const killers = alive.filter((id) => isSoloKiller(roles[id]));
  for (const k of killers) {
    const rest = alive.filter((id) => id !== k);
    if (rest.length === 0 || (rest.length === 1 && !isWolf(roles[rest[0]]) && !isSoloKiller(roles[rest[0]])))
      return roles[k] as Winner;
  }
  // While a solo killer lives, nobody else has won yet.
  if (killers.length) return null;
  const wolves = alive.filter((id) => isWolf(roles[id])).length;
  const others = alive.length - wolves;
  if (wolves === 0) return "village";
  if (wolves >= others) return "wolves";
  return null;
}
