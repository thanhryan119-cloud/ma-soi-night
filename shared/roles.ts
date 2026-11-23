// Role registry ("plugin" config). To add a role:
//   1. add its id to RoleId in types.ts (and NightStepId if it wakes at night)
//   2. add a RoleDef below (team, emoji, night behaviour, validation)
//   3. add `roles.<id>.*` and `script.step.<id>` keys to messages/vi.json + en.json
// Name/description/script strings live in the message files, keyed by role id.

import type { Game, NightStepId, Player, Room, RoleId, Settings, Team } from "./types";

export interface NightContext {
  room: Room;
  game: Game;
  actor: Player;
  alive: Player[];
}

export interface NightBehaviour {
  step: NightStepId;
  /** Default position in the night order (lower = earlier). */
  order: number;
  firstNightOnly?: boolean;
  /** UI kind used by the phone: pick N targets, the witch's potion panel, or the curse yes/no. */
  kind: "pick" | "witch" | "curse";
  /** Number of targets to pick (for kind=pick). */
  picks?: number;
  /** All holders act together (wolves). */
  group?: boolean;
  /** Ids the actor may target. */
  validTargets: (ctx: NightContext) => string[];
}

export interface RoleDef {
  id: RoleId;
  team: Team;
  emoji: string;
  /** Tailwind-friendly accent colour */
  color: string;
  /** What the Seer sees. */
  seenAsWolf: boolean;
  /** Max copies allowed in one game (undefined = unlimited). */
  max?: number;
  night?: NightBehaviour;
  /** Other night steps this role wakes up for (the Cursed Wolf and Wolf Seer bite with the pack). */
  alsoWakesIn?: NightStepId[];
  /** Triggers a revenge shot when this role dies. */
  shootsOnDeath?: boolean;
  /** Sold in the shop (`role:<id>`): the host or room owner must own it to put it in a game. */
  premium?: boolean;
}

const aliveIds = (ctx: NightContext) => ctx.alive.map((p) => p.id);
const nonWolves = (ctx: NightContext) => ctx.alive.filter((p) => !isWolf(ctx.game.roles[p.id])).map((p) => p.id);

export const ROLES: Record<RoleId, RoleDef> = {
  werewolf: {
    id: "werewolf",
    team: "wolves",
    emoji: "🐺",
    color: "#ef4444",
    seenAsWolf: true,
    night: {
      step: "werewolf",
      order: 30,
      kind: "pick",
      picks: 1,
      group: true,
      validTargets: nonWolves,
    },
  },
  villager: {
    id: "villager",
    team: "village",
    emoji: "🧑‍🌾",
    color: "#a3a3a3",
    seenAsWolf: false,
  },
  seer: {
    id: "seer",
    team: "village",
    emoji: "🔮",
    color: "#a855f7",
    seenAsWolf: false,
    max: 1,
    night: {
      step: "seer",
      order: 50,
      kind: "pick",
      picks: 1,
      validTargets: (ctx) => aliveIds(ctx).filter((id) => id !== ctx.actor.id),
    },
  },
  bodyguard: {
    id: "bodyguard",
    team: "village",
    emoji: "🛡️",
    color: "#3b82f6",
    seenAsWolf: false,
    max: 1,
    night: {
      step: "bodyguard",
      order: 20,
      kind: "pick",
      picks: 1,
      validTargets: (ctx) =>
        aliveIds(ctx).filter(
          (id) =>
            id !== ctx.game.bodyguardLast &&
            (ctx.room.settings.bodyguardSelf || id !== ctx.actor.id),
        ),
    },
  },
  witch: {
    id: "witch",
    team: "village",
    emoji: "🧪",
    color: "#22c55e",
    seenAsWolf: false,
    max: 1,
    night: {
      step: "witch",
      order: 40,
      kind: "witch",
      validTargets: (ctx) => aliveIds(ctx).filter((id) => id !== ctx.actor.id),
    },
  },
  hunter: {
    id: "hunter",
    team: "village",
    emoji: "🏹",
    color: "#f59e0b",
    seenAsWolf: false,
    max: 1,
    shootsOnDeath: true,
  },
  cupid: {
    id: "cupid",
    team: "village",
    emoji: "💘",
    color: "#ec4899",
    seenAsWolf: false,
    max: 1,
    night: {
      step: "cupid",
      order: 10,
      firstNightOnly: true,
      kind: "pick",
      picks: 2,
      validTargets: (ctx) => aliveIds(ctx),
    },
  },

  // --- Premium roles -------------------------------------------------------

  /**
   * Bites with the pack. Once per game, after the pack has chosen, may curse the
   * victim instead: if the bite lands (not guarded, not healed) the victim lives
   * and wakes up a werewolf, losing their old power.
   */
  cursedWolf: {
    id: "cursedWolf",
    team: "wolves",
    emoji: "🩸",
    color: "#b91c1c",
    seenAsWolf: true,
    max: 1,
    premium: true,
    alsoWakesIn: ["werewolf"],
    night: {
      step: "cursedWolf",
      order: 35,
      kind: "curse",
      validTargets: () => [],
    },
  },
  /** Bites with the pack, and each night learns the exact role of one player. */
  wolfSeer: {
    id: "wolfSeer",
    team: "wolves",
    emoji: "👁️",
    color: "#7c3aed",
    seenAsWolf: true,
    max: 1,
    premium: true,
    alsoWakesIn: ["werewolf"],
    night: {
      step: "wolfSeer",
      order: 33,
      kind: "pick",
      picks: 1,
      validTargets: (ctx) => nonWolves(ctx).filter((id) => id !== ctx.actor.id),
    },
  },
  /** Survives the first wolf bite (poison and the gallows still kill). */
  elder: {
    id: "elder",
    team: "village",
    emoji: "👴",
    color: "#ca8a04",
    seenAsWolf: false,
    max: 1,
    premium: true,
  },
  /** If the village votes to hang him, he is revealed and lives on, but can never vote again. */
  idiot: {
    id: "idiot",
    team: "village",
    emoji: "🤪",
    color: "#14b8a6",
    seenAsWolf: false,
    max: 1,
    premium: true,
  },
};

export const ROLE_IDS = Object.keys(ROLES) as RoleId[];

/** Roles sold in the shop. */
export const PREMIUM_ROLES: RoleId[] = ROLE_IDS.filter((r) => ROLES[r].premium);

export const NIGHT_STEP_ROLE: Record<NightStepId, RoleId> = {
  cupid: "cupid",
  bodyguard: "bodyguard",
  werewolf: "werewolf",
  wolfSeer: "wolfSeer",
  cursedWolf: "cursedWolf",
  witch: "witch",
  seer: "seer",
};

export const NIGHT_STEPS = Object.keys(NIGHT_STEP_ROLE) as NightStepId[];

/** Every role that wakes up in a step (the step's own role, plus e.g. the special wolves for the pack). */
export function stepRoles(step: NightStepId): RoleId[] {
  return ROLE_IDS.filter((r) => ROLES[r].night?.step === step || ROLES[r].alsoWakesIn?.includes(step));
}

export function wakesIn(roleId: RoleId | undefined, step: NightStepId): boolean {
  return !!roleId && stepRoles(step).includes(roleId);
}

export const DEFAULT_NIGHT_ORDER: NightStepId[] = ROLE_IDS.filter((r) => ROLES[r].night)
  .sort((a, b) => ROLES[a].night!.order - ROLES[b].night!.order)
  .map((r) => ROLES[r].night!.step);

/**
 * Keeps a saved night order valid: unknown or repeated steps are dropped and
 * steps it doesn't know about yet (roles added later) are slotted in after the
 * step they follow by default.
 */
export function completeNightOrder(order: readonly unknown[] | undefined): NightStepId[] {
  const out = (order ?? []).filter(
    (s, i, arr): s is NightStepId => typeof s === "string" && s in NIGHT_STEP_ROLE && arr.indexOf(s) === i,
  );
  DEFAULT_NIGHT_ORDER.forEach((step, i) => {
    if (out.includes(step)) return;
    const before = DEFAULT_NIGHT_ORDER.slice(0, i).reverse().find((s) => out.includes(s));
    out.splice(before ? out.indexOf(before) + 1 : 0, 0, step);
  });
  return out;
}

export function isWolf(roleId: RoleId | undefined): boolean {
  return !!roleId && ROLES[roleId]?.team === "wolves";
}

export const isPremiumRole = (roleId: RoleId) => !!ROLES[roleId]?.premium;
export const roleItem = (roleId: RoleId) => `role:${roleId}` as const;

export function emptyRoleCounts(): Record<RoleId, number> {
  return Object.fromEntries(ROLE_IDS.map((r) => [r, 0])) as Record<RoleId, number>;
}

/**
 * Suggested standard setup by player count.
 * 8 players → 2 Werewolves, Seer, Bodyguard, Witch, 3 Villagers.
 */
export function suggestRoles(n: number): Record<RoleId, number> {
  const c = emptyRoleCounts();
  if (n <= 0) return c;
  c.werewolf = Math.max(1, Math.floor((n + 1) / 4));
  if (n >= 4) c.seer = 1;
  if (n >= 6) c.bodyguard = 1;
  if (n >= 7) c.witch = 1;
  if (n >= 9) c.hunter = 1;
  if (n >= 11) c.cupid = 1;
  const used = ROLE_IDS.reduce((s, r) => s + c[r], 0);
  c.villager = Math.max(0, n - used);
  return c;
}

export function totalRoles(counts: Record<RoleId, number>): number {
  return ROLE_IDS.reduce((s, r) => s + (counts[r] || 0), 0);
}

/** Bot speed choices (multiplier). Bots act twice as fast by default. */
export const BOT_SPEEDS = [1, 1.5, 2, 3] as const;
export const DEFAULT_BOT_SPEED = 2;

export function defaultSettings(playerCount = 8): Settings {
  return {
    nightOrder: [...DEFAULT_NIGHT_ORDER],
    roleCounts: suggestRoles(playerCount),
    nomination: { mode: "top1", n: 2, threshold: 3, tie: "allTied" },
    verdict: { majority: "simple", anonymous: false },
    bodyguardSelf: true,
    witchSelfSave: true,
    witchBothSameNight: true,
    hunterShootsWhenPoisoned: false,
    revealRoleOnDeath: false,
    deadSeeRoles: true,
    decoyActions: true,
    wolvesMustBite: true,
    mandatoryVote: false,
    voiceChat: true,
    autoAdvance: false,
    aiBots: true,
    noScreen: false,
    autoKickAway: false,
    botSpeed: DEFAULT_BOT_SPEED,
    discussionSeconds: 120,
    defenseSeconds: 30,
    bilingualScreen: false,
  };
}
