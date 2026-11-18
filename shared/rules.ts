// Pure rule functions (no I/O) — covered by unit tests.

import { ROLES, isWolf } from "./roles";
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
}

export interface NightOutcome extends CascadeResult {
  /** Who the wolves attacked and why they survived, if they did. */
  attackBlockedBy: "bodyguard" | "witch" | null;
}

/**
 * Night resolution priority:
 *  1. Bodyguard protection blocks the wolf attack.
 *  2. The Witch's healing potion cancels the wolf attack.
 *  3. The Witch's poison kills (protection does NOT block poison).
 *  4. Lovers die together (heartbreak).
 *  5. Hunters who died get a revenge shot (resolved in a later phase).
 */
export function resolveNight(input: NightInput): NightOutcome {
  const initial: Death[] = [];
  let attackBlockedBy: NightOutcome["attackBlockedBy"] = null;
  if (input.wolfTarget && input.alive.includes(input.wolfTarget)) {
    if (input.protectId === input.wolfTarget) attackBlockedBy = "bodyguard";
    else if (input.witchSave) attackBlockedBy = "witch";
    else initial.push({ playerId: input.wolfTarget, cause: "wolves" });
  }
  if (input.witchPoisonId && input.alive.includes(input.witchPoisonId)) {
    if (!initial.some((d) => d.playerId === input.witchPoisonId))
      initial.push({ playerId: input.witchPoisonId, cause: "poison" });
  }
  return { ...cascadeDeaths(initial, input), attackBlockedBy };
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

export function tallyNomination(
  ballots: Record<string, string>,
  rules: NominationSettings,
): NominationTally {
  const counts: Record<string, number> = {};
  let skips = 0;
  for (const choice of Object.values(ballots)) {
    if (choice === SKIP) skips++;
    else counts[choice] = (counts[choice] || 0) + 1;
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

export function tallyVerdict(
  ballots: Record<string, string>,
  eligible: number,
  rules: Pick<VerdictSettings, "majority">,
): VerdictTally {
  let execute = 0;
  let spare = 0;
  for (const v of Object.values(ballots)) {
    if (v === "execute") execute++;
    else if (v === "spare") spare++;
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
    isWolf(roles[lovers[0]]) !== isWolf(roles[lovers[1]])
  )
    return "lovers";
  const wolves = alive.filter((id) => isWolf(roles[id])).length;
  const others = alive.length - wolves;
  if (wolves === 0) return "village";
  if (wolves >= others) return "wolves";
  return null;
}
