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
  /** Only called once somebody has died (the Medium talks to the dead). */
  needsDead?: boolean;
  /** Only called on the nights this returns true for (the White Wolf: every other night). */
  nights?: (night: number) => boolean;
  /** UI kind used by the phone: pick N targets, the witch's potion panel, the curse yes/no, or douse/ignite. */
  kind: "pick" | "witch" | "curse" | "arson";
  /** The actor may pass (pick nobody). */
  optional?: boolean;
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
  /**
   * Member of the pack: wakes and bites with the wolves, knows them, can't be
   * bitten and counts as a wolf. Defaults to team === "wolves" (the Minion is
   * on the wolves' team without being in the pack; the White Wolf the other way round).
   */
  pack?: boolean;
  /** A solo killer: while one lives, neither the village nor the pack has won. */
  soloKiller?: boolean;
  /** How many votes the player's ballot counts for (the Mayor: 2). */
  voteWeight?: number;
  /** The wolves' bite doesn't kill (the Serial Killer). */
  biteImmune?: boolean;
}

const aliveIds = (ctx: NightContext) => ctx.alive.map((p) => p.id);
const others = (ctx: NightContext) => aliveIds(ctx).filter((id) => id !== ctx.actor.id);
/** A member of the pack has died (the Big Bad Wolf loses his extra bite). */
export const packHasLost = (ctx: Pick<NightContext, "room" | "game">) =>
  ctx.room.players.some((p) => !p.alive && isWolf(ctx.game.roles[p.id]));
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

  // --- Premium village roles (second set) ------------------------------------

  /** A villager with wolf blood: the Seer sees a wolf, but they win with the village. */
  lycan: {
    id: "lycan",
    team: "village",
    premium: true,
    emoji: "🐕",
    color: "#78716c",
    seenAsWolf: true,
    max: 1,
  },
  /** Two sisters who know each other from the start. Deal both or none. */
  sister: {
    id: "sister",
    team: "village",
    premium: true,
    emoji: "👭",
    color: "#f472b6",
    seenAsWolf: false,
    max: 2,
  },
  /**
   * Picks a model on the first night. While the model lives the child is a
   * villager; the moment the model dies the child turns werewolf.
   */
  wildChild: {
    id: "wildChild",
    team: "village",
    premium: true,
    emoji: "🧒",
    color: "#65a30d",
    seenAsWolf: false,
    max: 1,
    night: {
      step: "wildChild",
      order: 12,
      firstNightOnly: true,
      kind: "pick",
      picks: 1,
      validTargets: (ctx) => aliveIds(ctx).filter((id) => id !== ctx.actor.id),
    },
  },
  /** Each night learns the exact role of one dead player. */
  medium: {
    id: "medium",
    team: "village",
    premium: true,
    emoji: "🕯️",
    color: "#0ea5e9",
    seenAsWolf: false,
    max: 1,
    night: {
      step: "medium",
      order: 55,
      needsDead: true,
      kind: "pick",
      picks: 1,
      validTargets: (ctx) => ctx.room.players.filter((p) => !p.alive).map((p) => p.id),
    },
  },

  // --- Premium roles, third set ------------------------------------------------

  /** A villager whose ballot counts twice, in the nomination and in the verdict. */
  mayor: {
    id: "mayor",
    team: "village",
    premium: true,
    emoji: "🎖️",
    color: "#eab308",
    seenAsWolf: false,
    max: 1,
    voteWeight: 2,
  },
  /** Bites with the pack, and bites a second victim each night until a wolf dies. */
  bigBadWolf: {
    id: "bigBadWolf",
    team: "wolves",
    premium: true,
    emoji: "🐗",
    color: "#991b1b",
    seenAsWolf: true,
    max: 1,
    alsoWakesIn: ["werewolf"],
    night: {
      step: "bigBadWolf",
      order: 36,
      kind: "pick",
      picks: 1,
      optional: true,
      validTargets: (ctx) =>
        packHasLost(ctx) ? [] : nonWolves(ctx).filter((id) => id !== ctx.game.nightState.wolfTarget),
    },
  },
  /** On the wolves' side but not in the pack: knows the wolves, they don't know him, the Seer sees a villager. */
  minion: {
    id: "minion",
    team: "wolves",
    premium: true,
    pack: false,
    emoji: "🦹",
    color: "#7f1d1d",
    seenAsWolf: false,
    max: 1,
  },
  /** When the wolves bite him to death, one of them dies of his rusty sword the next night. */
  knight: {
    id: "knight",
    team: "village",
    premium: true,
    emoji: "⚔️",
    color: "#64748b",
    seenAsWolf: false,
    max: 1,
  },
  /** Bites with the pack, and each night silences someone for the next day (no talking, no vote). */
  silencer: {
    id: "silencer",
    team: "wolves",
    premium: true,
    emoji: "🤐",
    color: "#9f1239",
    seenAsWolf: true,
    max: 1,
    alsoWakesIn: ["werewolf"],
    night: {
      step: "silencer",
      order: 34,
      kind: "pick",
      picks: 1,
      optional: true,
      validTargets: others,
    },
  },

  // --- Premium roles, solo -----------------------------------------------------

  /** Wins alone if the village hangs him. */
  tanner: {
    id: "tanner",
    team: "solo",
    premium: true,
    emoji: "🪢",
    color: "#a16207",
    seenAsWolf: false,
    max: 1,
  },
  /** Bites with the pack, and every other night may kill one of the wolves. Wins as the last one standing. */
  whiteWolf: {
    id: "whiteWolf",
    team: "solo",
    premium: true,
    pack: true,
    soloKiller: true,
    emoji: "🤍",
    color: "#e5e7eb",
    seenAsWolf: true,
    max: 1,
    alsoWakesIn: ["werewolf"],
    night: {
      step: "whiteWolf",
      order: 37,
      nights: (n) => n % 2 === 0,
      kind: "pick",
      picks: 1,
      optional: true,
      validTargets: (ctx) => others(ctx).filter((id) => isWolf(ctx.game.roles[id])),
    },
  },
  /** Kills one player each night and shrugs off the wolves' bite. Wins as the last one standing. */
  serialKiller: {
    id: "serialKiller",
    team: "solo",
    premium: true,
    soloKiller: true,
    biteImmune: true,
    emoji: "🔪",
    color: "#475569",
    seenAsWolf: false,
    max: 1,
    night: {
      step: "serialKiller",
      order: 60,
      kind: "pick",
      picks: 1,
      optional: true,
      validTargets: others,
    },
  },
  /** Each night douses one house in oil, or sets every doused house alight. Wins as the last one standing. */
  arsonist: {
    id: "arsonist",
    team: "solo",
    premium: true,
    soloKiller: true,
    emoji: "🔥",
    color: "#ea580c",
    seenAsWolf: false,
    max: 1,
    night: {
      step: "arsonist",
      order: 65,
      kind: "arson",
      picks: 1,
      optional: true,
      validTargets: (ctx) => others(ctx).filter((id) => !(ctx.game.doused ?? []).includes(id)),
    },
  },
};

export const ROLE_IDS = Object.keys(ROLES) as RoleId[];

/** Roles sold in the shop. */
export const PREMIUM_ROLES: RoleId[] = ROLE_IDS.filter((r) => ROLES[r].premium);

export const NIGHT_STEP_ROLE: Record<NightStepId, RoleId> = {
  cupid: "cupid",
  wildChild: "wildChild",
  bodyguard: "bodyguard",
  werewolf: "werewolf",
  wolfSeer: "wolfSeer",
  cursedWolf: "cursedWolf",
  witch: "witch",
  seer: "seer",
  medium: "medium",
  bigBadWolf: "bigBadWolf",
  silencer: "silencer",
  whiteWolf: "whiteWolf",
  serialKiller: "serialKiller",
  arsonist: "arsonist",
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

/** In the pack: wakes and bites with the wolves (the White Wolf too, not the Minion). */
export function isWolf(roleId: RoleId | undefined): boolean {
  const def = roleId ? ROLES[roleId] : undefined;
  return !!def && (def.pack ?? def.team === "wolves");
}

/** The side this role wins with (the Minion wins with the wolves, solo roles alone). */
export function teamOf(roleId: RoleId | undefined): Team {
  return (roleId && ROLES[roleId]?.team) || "village";
}

export const isSoloKiller = (roleId: RoleId | undefined) => !!roleId && !!ROLES[roleId]?.soloKiller;

/** The roles that win alone (their id is the winner). */
export const SOLO_ROLES = ["tanner", "whiteWolf", "serialKiller", "arsonist"] as const;

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

/** Bot speed choices (multiplier). Bots act three times as fast by default. */
export const BOT_SPEEDS = [1, 1.5, 2, 3] as const;
export const DEFAULT_BOT_SPEED = 3;

export function defaultSettings(playerCount = 8): Settings {
  return {
    nightOrder: [...DEFAULT_NIGHT_ORDER],
    roleCounts: suggestRoles(playerCount),
    nomination: { mode: "top1", n: 2, threshold: 3, tie: "allTied" },
    verdict: { majority: "simple", anonymous: false },
    bodyguardSelf: true,
    witchSelfSave: true,
    witchBothSameNight: true,
    hunterShootsWhenPoisoned: true,
    revealRoleOnDeath: false,
    deadSeeRoles: true,
    decoyActions: true,
    wolvesMustBite: true,
    mandatoryVote: true,
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
