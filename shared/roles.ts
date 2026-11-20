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
  /** UI kind used by the phone: pick N targets, or the witch's potion panel. */
  kind: "pick" | "witch";
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
  /** Triggers a revenge shot when this role dies. */
  shootsOnDeath?: boolean;
}

const aliveIds = (ctx: NightContext) => ctx.alive.map((p) => p.id);

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
      validTargets: (ctx) =>
        ctx.alive.filter((p) => !isWolf(ctx.game.roles[p.id])).map((p) => p.id),
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
};

export const ROLE_IDS = Object.keys(ROLES) as RoleId[];

export const NIGHT_STEP_ROLE: Record<NightStepId, RoleId> = {
  cupid: "cupid",
  bodyguard: "bodyguard",
  werewolf: "werewolf",
  witch: "witch",
  seer: "seer",
};

export const DEFAULT_NIGHT_ORDER: NightStepId[] = ROLE_IDS.filter((r) => ROLES[r].night)
  .sort((a, b) => ROLES[a].night!.order - ROLES[b].night!.order)
  .map((r) => ROLES[r].night!.step);

export function isWolf(roleId: RoleId | undefined): boolean {
  return !!roleId && ROLES[roleId].team === "wolves";
}

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
