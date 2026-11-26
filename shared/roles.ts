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
  /** Shown folded under "advanced roles" in the setup and left out of the classic suggestion. */
  advanced?: boolean;
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

  // --- Advanced roles ------------------------------------------------------

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
    advanced: true,
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
    advanced: true,
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
    advanced: true,
  },
  /** If the village votes to hang him, he is revealed and lives on, but can never vote again. */
  idiot: {
    id: "idiot",
    team: "village",
    emoji: "🤪",
    color: "#14b8a6",
    seenAsWolf: false,
    max: 1,
    advanced: true,
  },

  // --- Advanced village roles (second set) -----------------------------------

  /** A villager with wolf blood: the Seer sees a wolf, but they win with the village. */
  lycan: {
    id: "lycan",
    team: "village",
    advanced: true,
    emoji: "🐕",
    color: "#78716c",
    seenAsWolf: true,
    max: 1,
  },
  /** Two sisters who know each other from the start. Deal both or none. */
  sister: {
    id: "sister",
    team: "village",
    advanced: true,
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
    advanced: true,
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
    advanced: true,
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

  // --- Advanced roles, third set -----------------------------------------------

  /** A villager whose ballot counts twice, in the nomination and in the verdict. */
  mayor: {
    id: "mayor",
    team: "village",
    advanced: true,
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
    advanced: true,
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
    advanced: true,
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
    advanced: true,
    emoji: "⚔️",
    color: "#64748b",
    seenAsWolf: false,
    max: 1,
  },
  /** Bites with the pack, and each night silences someone for the next day (no talking, no vote). */
  silencer: {
    id: "silencer",
    team: "wolves",
    advanced: true,
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

  // --- Advanced roles, solo ----------------------------------------------------

  /** Wins alone if the village hangs him. */
  tanner: {
    id: "tanner",
    team: "solo",
    advanced: true,
    emoji: "🪢",
    color: "#a16207",
    seenAsWolf: false,
    max: 1,
  },
  /** Bites with the pack, and every other night may kill one of the wolves. Wins as the last one standing. */
  whiteWolf: {
    id: "whiteWolf",
    team: "solo",
    advanced: true,
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
    advanced: true,
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
    advanced: true,
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

/** Roles a room may use now (the server locks special roles that are not free today, see freeRoles.ts). */
export const openRoles = (room: Pick<Room, "lockedRoles">): RoleId[] =>
  room.lockedRoles?.length ? ROLE_IDS.filter((r) => !room.lockedRoles!.includes(r)) : [...ROLE_IDS];

export const isAdvancedRole = (roleId: RoleId) => !!ROLES[roleId]?.advanced;

export function emptyRoleCounts(): Record<RoleId, number> {
  return Object.fromEntries(ROLE_IDS.map((r) => [r, 0])) as Record<RoleId, number>;
}

/**
 * When each role joins the suggested setup: [role, from this many players].
 * Roles the room hasn't unlocked are skipped, so with only the free roles the
 * setup stays the classic one (8 players → 2 Werewolves, Seer, Bodyguard,
 * Witch, 3 Villagers).
 */
const VILLAGE_PLAN: [RoleId, number][] = [
  ["seer", 4], ["bodyguard", 6], ["witch", 7], ["mayor", 8], ["hunter", 9], ["medium", 10], ["cupid", 11],
  ["elder", 12], ["knight", 13], ["lycan", 14], ["sister", 15], ["idiot", 17], ["wildChild", 18],
];
/** Special wolves take the place of plain Werewolves in the pack. */
const PACK_PLAN: [RoleId, number][] = [["wolfSeer", 9], ["cursedWolf", 12], ["bigBadWolf", 14], ["silencer", 16]];
const MINION_FROM = 10;
/** Solo roles. A solo killer (Serial Killer, Arsonist) costs the pack one wolf; the White Wolf takes a pack seat. */
const SOLO_PLAN: [RoleId, number][] = [["tanner", 11], ["serialKiller", 15], ["whiteWolf", 19], ["arsonist", 20]];

/** The classic roles (everything but the advanced ones). */
export const CORE_ROLES = ROLE_IDS.filter((r) => !ROLES[r].advanced);

/**
 * Suggested setup by player count, using every role in `available` (the classic
 * roles by default). With `rand` it deals a different setup of the same shape
 * (as many special wolves, solo roles and village roles), picked at random
 * from all available roles, so every role turns up.
 */
export function suggestRoles(n: number, available: readonly RoleId[] = CORE_ROLES, rand?: () => number): Record<RoleId, number> {
  const c = emptyRoleCounts();
  if (n <= 0) return c;
  const open = new Set(available);
  const due = (plan: [RoleId, number][]) => plan.filter(([r, from]) => open.has(r) && n >= from).map(([r]) => r);
  const all = (plan: [RoleId, number][]) => plan.filter(([r]) => open.has(r)).map(([r]) => r);
  const shuffled = <T,>(xs: T[]) => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand!() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  /** The roles due at this size, or (random) as many picked from the whole plan. */
  const choose = (plan: [RoleId, number][], keepFirst = false) => {
    const fixed = due(plan);
    if (!rand) return fixed;
    const pool = all(plan);
    const head = keepFirst && pool[0] === plan[0][0] && fixed.length ? [pool[0]] : [];
    return [...head, ...shuffled(pool.filter((r) => !head.includes(r)))];
  };
  const take = (plan: [RoleId, number][], keepFirst = false) => choose(plan, keepFirst).slice(0, due(plan).length);

  // Solo roles first: they decide how big the pack is.
  const solos = take(SOLO_PLAN);
  for (const r of solos) c[r] = 1;
  let pack = Math.max(1, Math.floor((n + 1) / 4));
  for (const r of solos) if (r === "serialKiller" || r === "arsonist") pack = Math.max(1, pack - 1);
  const whiteWolf = c.whiteWolf;
  // The pack keeps at least one plain Werewolf besides the White Wolf.
  pack = Math.max(pack, whiteWolf + 1);
  const specials = take(PACK_PLAN).slice(0, Math.max(0, pack - whiteWolf - 1));
  for (const r of specials) c[r] = 1;
  c.werewolf = Math.max(0, pack - whiteWolf - specials.length);
  if (open.has("minion") && n >= MINION_FROM) c.minion = 1;

  // The village: power roles in order while there is room, the rest plain villagers.
  let seats = n - ROLE_IDS.reduce((s, r) => s + c[r], 0);
  const wanted = due(VILLAGE_PLAN).reduce((s, r) => s + (r === "sister" ? 2 : 1), 0);
  let units = 0;
  for (const r of choose(VILLAGE_PLAN, true)) {
    const size = r === "sister" ? 2 : 1;
    if (units + size > wanted || size > seats) continue;
    c[r] = size;
    units += size;
    seats -= size;
  }
  c.villager = Math.max(0, seats);
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
    nomination: { mode: "top1", n: 2, threshold: 3, tie: "revote" },
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
