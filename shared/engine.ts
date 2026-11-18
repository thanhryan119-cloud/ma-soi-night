// Game engine: mutates a Room in response to validated host/player actions.
// Every action is checked here (phase, role, alive, valid target, double vote).

import { AVATAR_FRAMES, NAME_EFFECTS, NAME_FONTS, sanitizeAvatarUrl, sanitizeStyle } from "./cosmetics";
import {
  NIGHT_STEP_ROLE,
  ROLES,
  ROLE_IDS,
  defaultSettings,
  emptyRoleCounts,
  isWolf,
  suggestRoles,
  totalRoles,
} from "./roles";
import {
  SKIP,
  cascadeDeaths,
  checkWin,
  resolveNight,
  tallyNomination,
  tallyVerdict,
  wolfConsensus,
} from "./rules";
import type {
  ActionResult,
  Death,
  Game,
  HostAction,
  Locale,
  NightState,
  NightStepId,
  OverrideAction,
  Player,
  PlayerAction,
  RoleId,
  Room,
  Settings,
  Winner,
} from "./types";

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 20;
export const ROOM_TTL_MS = 12 * 60 * 60 * 1000;
export const AVATARS = [
  "🦊", "🐻", "🐼", "🐸", "🦉", "🐱", "🐶", "🐰", "🦁", "🐯", "🐨", "🐷",
  "🐵", "🦄", "🐙", "🦇", "🐲", "🌙", "⭐", "🍀", "🔥", "🎩", "👻", "🎃",
];
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const ok: ActionResult = { ok: true };
const fail = (error: string, params?: Record<string, string | number>): ActionResult => ({
  ok: false,
  error,
  params,
});

export function randomId(len = 8): string {
  let s = "";
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function randomToken(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${randomId(16)}${randomId(16)}`;
}

export function makeRoomCode(taken: (code: string) => boolean, length = 5): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = "";
    for (let i = 0; i < length; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!taken(code)) return code;
  }
  throw new Error("Could not allocate room code");
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Room / players
// ---------------------------------------------------------------------------

export function createRoom(code: string, locale: Locale, now = Date.now()): Room {
  return {
    code,
    hostToken: randomToken(),
    locale,
    createdAt: now,
    lastActivity: now,
    players: [],
    settings: defaultSettings(8),
    assignment: {},
    phase: { kind: "lobby", night: 0, day: 0, steps: [], stepIndex: 0, verdictIndex: 0 },
    game: null,
    timer: { endsAt: null, remainingMs: 0, durationMs: 0, running: false },
    log: [],
  };
}

export function getPlayer(room: Room, id: string | null | undefined): Player | undefined {
  return id ? room.players.find((p) => p.id === id) : undefined;
}

export const alivePlayers = (room: Room) => room.players.filter((p) => p.alive);
export const aliveIds = (room: Room) => alivePlayers(room).map((p) => p.id);
export const roleOf = (room: Room, id: string): RoleId | undefined => room.game?.roles[id];

export function sanitizeName(name: unknown): string {
  return String(name ?? "")
    .replace(/[\u0000-\u001f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 24);
}

export function addPlayer(
  room: Room,
  input: {
    name: string;
    avatar?: string;
    locale?: Locale;
    isBot?: boolean;
    avatarUrl?: string | null;
    style?: unknown;
    userId?: string | null;
  },
  now = Date.now(),
): ActionResult & { player?: Player } {
  if (room.phase.kind !== "lobby") return fail("err.gameInProgress");
  if (room.players.length >= MAX_PLAYERS) return fail("err.roomFull", { max: MAX_PLAYERS });
  const name = sanitizeName(input.name);
  if (!name) return fail("err.nameRequired");
  if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase()))
    return fail("err.nameTaken");
  const player: Player = {
    id: randomId(8),
    token: randomToken(),
    name,
    avatar: AVATARS.includes(input.avatar ?? "") ? input.avatar! : AVATARS[room.players.length % AVATARS.length],
    avatarUrl: sanitizeAvatarUrl(input.avatarUrl),
    style: sanitizeStyle(input.style),
    userId: input.userId ?? null,
    locale: input.locale === "en" ? "en" : "vi",
    isBot: !!input.isBot,
    connected: !!input.isBot,
    alive: true,
    joinedAt: now,
  };
  room.players.push(player);
  log(room, "log.join", { name: player.name });
  return { ok: true, player };
}

export function log(
  room: Room,
  key: string,
  params: Record<string, string | number> = {},
  isPublic = false,
) {
  room.log.push({ t: Date.now(), night: room.phase.night, day: room.phase.day, key, params, public: isPublic });
  if (room.log.length > 2000) room.log.splice(0, room.log.length - 2000);
}

const nameOf = (room: Room, id: string | null | undefined) => getPlayer(room, id)?.name ?? "?";

// ---------------------------------------------------------------------------
// Role assignment
// ---------------------------------------------------------------------------

export function validateRoleCounts(counts: Record<RoleId, number>): string | null {
  for (const r of ROLE_IDS) {
    const c = counts[r] ?? 0;
    if (!Number.isInteger(c) || c < 0 || c > MAX_PLAYERS) return "err.invalidCounts";
    const max = ROLES[r].max;
    if (max !== undefined && c > max) return "err.roleMax";
  }
  return null;
}

export function assignRandom(room: Room): ActionResult {
  const counts = room.settings.roleCounts;
  const total = totalRoles(counts);
  if (total !== room.players.length)
    return fail("err.roleCountMismatch", { roles: total, players: room.players.length });
  const deck: RoleId[] = [];
  for (const r of ROLE_IDS) for (let i = 0; i < counts[r]; i++) deck.push(r);
  const shuffled = shuffle(deck);
  room.assignment = {};
  room.players.forEach((p, i) => (room.assignment[p.id] = shuffled[i]));
  log(room, "log.assignedRandom");
  return ok;
}

function newNightState(): NightState {
  return {
    cupidPair: null,
    protectId: null,
    wolfVotes: {},
    wolfTarget: null,
    wolfFinalized: false,
    witchSave: false,
    witchPoisonId: null,
    witchDone: false,
    seerTarget: null,
    done: {},
  };
}

export function startGame(room: Room): ActionResult {
  if (room.phase.kind !== "lobby") return fail("err.wrongPhase");
  if (room.players.length < MIN_PLAYERS) return fail("err.notEnoughPlayers", { min: MIN_PLAYERS });
  const missing = room.players.filter((p) => !room.assignment[p.id]);
  if (missing.length) return fail("err.unassigned", { count: missing.length });
  if (!room.players.some((p) => isWolf(room.assignment[p.id]))) return fail("err.noWolves");
  const roles: Record<string, RoleId> = {};
  for (const p of room.players) {
    roles[p.id] = room.assignment[p.id];
    p.alive = true;
  }
  const game: Game = {
    roles,
    originalRoles: { ...roles },
    lovers: null,
    bodyguardLast: null,
    potions: { heal: true, poison: true },
    nightState: newNightState(),
    seerResults: {},
    lastDeaths: [],
    nominees: [],
    nomination: null,
    nominationOutcome: null,
    vote: null,
    verdicts: [],
    pendingHunters: [],
    hunterReturn: "discussion",
    hunterShots: {},
    pendingWin: null,
    dismissedWinSig: null,
    winner: null,
  };
  room.game = game;
  room.log = room.log.filter((e) => e.key === "log.join");
  room.phase = { kind: "roleReveal", night: 0, day: 0, steps: [], stepIndex: 0, verdictIndex: 0 };
  log(room, "log.gameStart", { count: room.players.length }, true);
  for (const p of room.players) log(room, "log.roleOf", { name: p.name, role: roles[p.id] });
  resetTimer(room);
  return ok;
}

// ---------------------------------------------------------------------------
// Night
// ---------------------------------------------------------------------------

export function buildNightSteps(room: Room, night: number): NightStepId[] {
  const game = room.game!;
  const present = new Set(Object.values(game.roles));
  return room.settings.nightOrder.filter((step) => {
    const role = ROLES[NIGHT_STEP_ROLE[step]];
    if (!present.has(role.id)) return false;
    if (role.night?.firstNightOnly && night !== 1) return false;
    return true;
  });
}

export function currentStep(room: Room): NightStepId | null {
  if (room.phase.kind !== "night") return null;
  return room.phase.steps[room.phase.stepIndex] ?? null;
}

export function stepActors(room: Room, step: NightStepId): Player[] {
  const roleId = NIGHT_STEP_ROLE[step];
  return alivePlayers(room).filter((p) => room.game!.roles[p.id] === roleId);
}

export function isStepDone(room: Room, step: NightStepId): boolean {
  const game = room.game!;
  const actors = stepActors(room, step);
  if (!actors.length) return true;
  if (step === "werewolf") {
    const votes = actors.map((a) => game.nightState.wolfVotes[a.id]);
    return votes.every((v) => !!v) && new Set(votes).size === 1;
  }
  return !!game.nightState.done[step];
}

export function validTargets(room: Room, actor: Player, step: NightStepId): string[] {
  const def = ROLES[NIGHT_STEP_ROLE[step]].night!;
  return def.validTargets({ room, game: room.game!, actor, alive: alivePlayers(room) });
}

function startNight(room: Room) {
  const game = room.game!;
  const night = room.phase.night + 1;
  game.nightState = newNightState();
  game.vote = null;
  game.nominees = [];
  game.nomination = null;
  game.nominationOutcome = null;
  game.verdicts = [];
  room.phase = {
    ...room.phase,
    kind: "night",
    night,
    steps: buildNightSteps(room, night),
    stepIndex: 0,
    verdictIndex: 0,
  };
  resetTimer(room);
  log(room, "log.nightStart", { n: night }, true);
}

function leaveStep(room: Room, step: NightStepId | null) {
  const game = room.game!;
  const ns = game.nightState;
  if (step === "werewolf" && !ns.wolfFinalized) {
    const c = wolfConsensus(ns.wolfVotes);
    ns.wolfTarget = c.target;
    ns.wolfFinalized = true;
    if (c.target) log(room, c.tie ? "log.wolfTargetTie" : "log.wolfTarget", { target: nameOf(room, c.target) });
    else log(room, "log.wolfNoTarget");
  }
}

function resolveDawn(room: Room) {
  const game = room.game!;
  const ns = game.nightState;
  if (!ns.wolfFinalized) leaveStep(room, "werewolf");
  const outcome = resolveNight({
    alive: aliveIds(room),
    roles: game.roles,
    lovers: game.lovers,
    hunterShootsWhenPoisoned: room.settings.hunterShootsWhenPoisoned,
    protectId: ns.protectId,
    wolfTarget: ns.wolfTarget,
    witchSave: ns.witchSave,
    witchPoisonId: ns.witchPoisonId,
  });
  if (outcome.attackBlockedBy)
    log(room, outcome.attackBlockedBy === "bodyguard" ? "log.savedByGuard" : "log.savedByWitch", {
      target: nameOf(room, ns.wolfTarget),
    });
  game.bodyguardLast = ns.protectId;
  applyDeaths(room, outcome.deaths);
  game.lastDeaths = outcome.deaths;
  if (!outcome.deaths.length) log(room, "log.noDeath", {}, true);
  game.pendingHunters = [...outcome.hunters];
  game.hunterReturn = "discussion";
  room.phase = { ...room.phase, kind: "dawn", day: room.phase.night };
  resetTimer(room);
  log(room, "log.dayStart", { n: room.phase.day }, true);
  evaluateWin(room);
}

function applyDeaths(room: Room, deaths: Death[]) {
  for (const d of deaths) {
    const p = getPlayer(room, d.playerId);
    if (!p) continue;
    p.alive = false;
    log(room, `log.death.${d.cause}`, { name: p.name, role: room.game!.roles[p.id] }, true);
  }
}

function deathCtx(room: Room) {
  return {
    alive: aliveIds(room),
    roles: room.game!.roles,
    lovers: room.game!.lovers,
    hunterShootsWhenPoisoned: room.settings.hunterShootsWhenPoisoned,
  };
}

export function aliveSignature(room: Room): string {
  return aliveIds(room).sort().join(",");
}

export function evaluateWin(room: Room) {
  const game = room.game;
  if (!game || game.winner) return;
  const w = checkWin(aliveIds(room), game.roles, game.lovers);
  game.pendingWin = w && aliveSignature(room) !== game.dismissedWinSig ? w : null;
}

// ---------------------------------------------------------------------------
// Day
// ---------------------------------------------------------------------------

function openNomination(room: Room, candidates: string[] | null = null) {
  room.game!.vote = { kind: "nominate", ballots: {}, closed: false, candidates, nomineeId: null };
}

function openVerdict(room: Room, index: number) {
  const game = room.game!;
  room.phase = { ...room.phase, kind: "verdict", verdictIndex: index };
  game.vote = { kind: "verdict", ballots: {}, closed: false, candidates: null, nomineeId: game.nominees[index] };
  resetTimer(room);
}

export function verdictEligible(room: Room): string[] {
  const nominees = new Set(room.game?.nominees ?? []);
  return aliveIds(room).filter((id) => !nominees.has(id));
}

export function voteEligible(room: Room): string[] {
  const vote = room.game?.vote;
  if (!vote) return [];
  return vote.kind === "verdict" ? verdictEligible(room) : aliveIds(room);
}

function closeNomination(room: Room): "defense" | "revote" | "none" {
  const game = room.game!;
  const vote = game.vote!;
  vote.closed = true;
  const rules = room.settings.nomination;
  const isRevote = !!vote.candidates;
  const tally = tallyNomination(vote.ballots, {
    ...rules,
    // A second tie in a revote sends nobody up.
    tie: isRevote && rules.tie === "revote" ? "none" : rules.tie,
  });
  game.nomination = tally;
  if (tally.tie && rules.tie === "revote" && rules.mode === "top1" && !isRevote) {
    log(room, "log.nominateTieRevote", { names: tally.tiedIds.map((id) => nameOf(room, id)).join(", ") }, true);
    game.nominees = [];
    return (game.nominationOutcome = "revote");
  }
  game.nominees = tally.nominees;
  if (!tally.nominees.length) {
    log(room, "log.nominateNone", {}, true);
    return (game.nominationOutcome = "none");
  }
  log(room, "log.nominated", { names: tally.nominees.map((id) => nameOf(room, id)).join(", ") }, true);
  return (game.nominationOutcome = "defense");
}

function closeVerdict(room: Room) {
  const game = room.game!;
  const vote = game.vote!;
  vote.closed = true;
  const eligible = verdictEligible(room).length;
  const tally = tallyVerdict(vote.ballots, eligible, room.settings.verdict);
  const nomineeId = vote.nomineeId!;
  let deaths: Death[] = [];
  if (tally.executed && getPlayer(room, nomineeId)?.alive) {
    const res = cascadeDeaths([{ playerId: nomineeId, cause: "execution" }], deathCtx(room));
    deaths = res.deaths;
    applyDeaths(room, deaths);
    game.pendingHunters.push(...res.hunters);
    game.hunterReturn = "afterVerdict";
  }
  game.verdicts.push({ ...tally, nomineeId, ballots: { ...vote.ballots }, deaths });
  log(
    room,
    tally.executed ? "log.executed" : "log.spared",
    { name: nameOf(room, nomineeId), execute: tally.execute, spare: tally.spare },
    true,
  );
  room.phase = { ...room.phase, kind: "verdictResult" };
  evaluateWin(room);
}

function afterVerdict(room: Room) {
  const game = room.game!;
  for (let i = room.phase.verdictIndex + 1; i < game.nominees.length; i++) {
    if (getPlayer(room, game.nominees[i])?.alive) return openVerdict(room, i);
  }
  startNight(room);
}

function enterTimed(room: Room, kind: "discussion" | "defense") {
  room.phase = { ...room.phase, kind };
  const secs = kind === "discussion" ? room.settings.discussionSeconds : room.settings.defenseSeconds;
  timerOp(room, "start", secs);
}

// ---------------------------------------------------------------------------
// Phase machine — host presses "Next"
// ---------------------------------------------------------------------------

export function advance(room: Room): ActionResult {
  const game = room.game;
  const kind = room.phase.kind;
  if (kind === "lobby") return startGame(room);
  if (!game) return fail("err.wrongPhase");
  if (game.pendingWin && kind !== "night") return fail("err.winPending");

  switch (kind) {
    case "roleReveal":
      startNight(room);
      return ok;
    case "night": {
      leaveStep(room, currentStep(room));
      if (room.phase.stepIndex < room.phase.steps.length - 1) {
        room.phase = { ...room.phase, stepIndex: room.phase.stepIndex + 1 };
        log(room, "log.step", { step: room.phase.steps[room.phase.stepIndex] });
      } else resolveDawn(room);
      return ok;
    }
    case "dawn":
      if (game.pendingHunters.length) room.phase = { ...room.phase, kind: "hunter" };
      else enterTimed(room, "discussion");
      return ok;
    case "hunter": {
      // The current hunter stays at the head of the queue until the host moves on.
      const hunter = game.pendingHunters.shift();
      if (hunter && !(hunter in game.hunterShots)) {
        game.hunterShots[hunter] = "";
        log(room, "log.hunterNoShot", { actor: nameOf(room, hunter) }, true);
      }
      if (game.pendingHunters.length) return ok;
      if (game.hunterReturn === "discussion") enterTimed(room, "discussion");
      else afterVerdict(room);
      return ok;
    }
    case "discussion":
      room.phase = { ...room.phase, kind: "nominate" };
      resetTimer(room);
      openNomination(room);
      return ok;
    case "nominate":
      // Close the (secret) vote and reveal who voted for whom.
      closeNomination(room);
      room.phase = { ...room.phase, kind: "nominateResult" };
      return ok;
    case "nominateResult": {
      const outcome = game.nominationOutcome;
      game.nominationOutcome = null;
      if (outcome === "revote") {
        room.phase = { ...room.phase, kind: "nominate" };
        openNomination(room, game.nomination?.tiedIds ?? null);
      } else if (outcome === "defense") enterTimed(room, "defense");
      else startNight(room);
      return ok;
    }
    case "defense":
      openVerdict(room, 0);
      return ok;
    case "verdict":
      closeVerdict(room);
      return ok;
    case "verdictResult":
      if (game.pendingHunters.length) room.phase = { ...room.phase, kind: "hunter" };
      else afterVerdict(room);
      return ok;
    case "gameOver":
      return fail("err.wrongPhase");
  }
}

// ---------------------------------------------------------------------------
// Player actions
// ---------------------------------------------------------------------------

export function playerAction(room: Room, playerId: string, action: PlayerAction): ActionResult {
  const player = getPlayer(room, playerId);
  if (!player) return fail("err.notInRoom");
  switch (action?.type) {
    case "setLocale":
      player.locale = action.locale === "en" ? "en" : "vi";
      return ok;
    case "updateProfile": {
      if (room.phase.kind !== "lobby") return fail("err.wrongPhase");
      if (action.avatar && AVATARS.includes(action.avatar)) player.avatar = action.avatar;
      if (action.style) player.style = sanitizeStyle({ ...player.style, ...action.style });
      if (action.name !== undefined) {
        const name = sanitizeName(action.name);
        if (!name) return fail("err.nameRequired");
        if (room.players.some((p) => p.id !== player.id && p.name.toLowerCase() === name.toLowerCase()))
          return fail("err.nameTaken");
        player.name = name;
      }
      return ok;
    }
    case "night":
      return nightAction(room, player, action);
    case "vote":
      return castVote(room, player, String(action.choice ?? ""));
    case "hunterShot":
      return hunterShot(room, player, action.targetId ?? null);
    default:
      return fail("err.unknownAction");
  }
}

function nightAction(
  room: Room,
  actor: Player,
  action: Extract<PlayerAction, { type: "night" }>,
): ActionResult {
  const game = room.game;
  const step = currentStep(room);
  if (!game || !step) return fail("err.wrongPhase");
  if (!actor.alive) return fail("err.dead");
  if (game.roles[actor.id] !== NIGHT_STEP_ROLE[step]) return fail("err.notYourTurn");
  const ns = game.nightState;
  const valid = new Set(validTargets(room, actor, step));
  const targets = Array.isArray(action.targets) ? action.targets.map(String) : [];

  switch (step) {
    case "cupid": {
      if (ns.done.cupid) return fail("err.alreadyActed");
      if (targets.length !== 2 || targets[0] === targets[1]) return fail("err.pickTwo");
      if (!targets.every((t) => valid.has(t))) return fail("err.invalidTarget");
      ns.cupidPair = [targets[0], targets[1]];
      game.lovers = [targets[0], targets[1]];
      ns.done.cupid = true;
      log(room, "log.cupid", { actor: actor.name, a: nameOf(room, targets[0]), b: nameOf(room, targets[1]) });
      return ok;
    }
    case "bodyguard": {
      if (ns.done.bodyguard) return fail("err.alreadyActed");
      if (targets.length !== 1 || !valid.has(targets[0])) return fail("err.invalidTarget");
      ns.protectId = targets[0];
      ns.done.bodyguard = true;
      log(room, "log.protect", { actor: actor.name, target: nameOf(room, targets[0]) });
      return ok;
    }
    case "werewolf": {
      if (ns.wolfFinalized) return fail("err.alreadyActed");
      if (targets.length !== 1 || !valid.has(targets[0])) return fail("err.invalidTarget");
      if (ns.wolfVotes[actor.id] === targets[0]) return ok;
      ns.wolfVotes[actor.id] = targets[0];
      log(room, "log.wolfVote", { actor: actor.name, target: nameOf(room, targets[0]) });
      return ok;
    }
    case "witch": {
      if (ns.witchDone) return fail("err.alreadyActed");
      const save = !!action.save;
      const poisonId = action.poisonId ? String(action.poisonId) : null;
      if (save) {
        if (!game.potions.heal) return fail("err.noHealPotion");
        if (!ns.wolfTarget) return fail("err.nobodyToSave");
        if (ns.wolfTarget === actor.id && !room.settings.witchSelfSave) return fail("err.noSelfSave");
      }
      if (poisonId) {
        if (!game.potions.poison) return fail("err.noPoisonPotion");
        if (!valid.has(poisonId)) return fail("err.invalidTarget");
      }
      if (save && poisonId && !room.settings.witchBothSameNight) return fail("err.onePotionPerNight");
      ns.witchSave = save;
      ns.witchPoisonId = poisonId;
      if (save) game.potions.heal = false;
      if (poisonId) game.potions.poison = false;
      ns.witchDone = true;
      ns.done.witch = true;
      if (save) log(room, "log.witchSave", { actor: actor.name, target: nameOf(room, ns.wolfTarget) });
      if (poisonId) log(room, "log.witchPoison", { actor: actor.name, target: nameOf(room, poisonId) });
      if (!save && !poisonId) log(room, "log.witchPass", { actor: actor.name });
      return ok;
    }
    case "seer": {
      if (ns.done.seer) return fail("err.alreadyActed");
      if (targets.length !== 1 || !valid.has(targets[0])) return fail("err.invalidTarget");
      const isWolfResult = ROLES[game.roles[targets[0]]].seenAsWolf;
      ns.seerTarget = targets[0];
      ns.done.seer = true;
      (game.seerResults[actor.id] ??= []).push({ night: room.phase.night, targetId: targets[0], isWolf: isWolfResult });
      log(room, isWolfResult ? "log.seerWolf" : "log.seerNotWolf", { actor: actor.name, target: nameOf(room, targets[0]) });
      return ok;
    }
  }
}

function castVote(room: Room, voter: Player, choice: string): ActionResult {
  const game = room.game;
  const vote = game?.vote;
  const kind = room.phase.kind;
  if (!game || !vote || vote.closed || (kind !== "nominate" && kind !== "verdict")) return fail("err.wrongPhase");
  if (!voter.alive) return fail("err.dead");
  if (voter.id in vote.ballots) return fail("err.alreadyVoted");
  if (vote.kind === "nominate") {
    if (choice !== SKIP) {
      const target = getPlayer(room, choice);
      if (!target || !target.alive || target.id === voter.id) return fail("err.invalidTarget");
      if (vote.candidates && !vote.candidates.includes(choice)) return fail("err.invalidTarget");
    }
  } else {
    if (game.nominees.includes(voter.id)) return fail("err.onStand");
    if (choice !== "execute" && choice !== "spare") return fail("err.invalidTarget");
  }
  vote.ballots[voter.id] = choice;
  const voteKey =
    vote.kind === "verdict" ? `log.voteVerdict.${choice}` : choice === SKIP ? "log.voteSkip" : "log.voteNominate";
  log(room, voteKey, {
    actor: voter.name,
    target: choice === SKIP ? "—" : nameOf(room, choice),
  });
  return ok;
}

function hunterShot(room: Room, hunter: Player, targetId: string | null): ActionResult {
  const game = room.game;
  if (!game || room.phase.kind !== "hunter") return fail("err.wrongPhase");
  if (game.pendingHunters[0] !== hunter.id) return fail("err.notYourTurn");
  if (hunter.id in game.hunterShots) return fail("err.alreadyActed");
  if (targetId) {
    const target = getPlayer(room, targetId);
    if (!target || !target.alive || target.id === hunter.id) return fail("err.invalidTarget");
  }
  game.hunterShots[hunter.id] = targetId ?? "";
  if (!targetId) {
    log(room, "log.hunterNoShot", { actor: hunter.name }, true);
  } else {
    log(room, "log.hunterShot", { actor: hunter.name, target: nameOf(room, targetId) }, true);
    const res = cascadeDeaths([{ playerId: targetId, cause: "hunter" }], deathCtx(room));
    applyDeaths(room, res.deaths);
    game.lastDeaths = [...game.lastDeaths, ...res.deaths];
    game.pendingHunters.push(...res.hunters.filter((h) => h !== hunter.id));
  }
  evaluateWin(room);
  return ok;
}

// ---------------------------------------------------------------------------
// Timer
// ---------------------------------------------------------------------------

export function resetTimer(room: Room) {
  room.timer = { endsAt: null, remainingMs: 0, durationMs: 0, running: false };
}

export function timerOp(room: Room, op: string, seconds = 0, now = Date.now()): ActionResult {
  const t = room.timer;
  const secs = Math.max(0, Math.min(3600, Number(seconds) || 0));
  switch (op) {
    case "start":
      room.timer = { durationMs: secs * 1000, remainingMs: secs * 1000, endsAt: now + secs * 1000, running: secs > 0 };
      return ok;
    case "pause":
      if (t.running && t.endsAt) room.timer = { ...t, running: false, remainingMs: Math.max(0, t.endsAt - now), endsAt: null };
      return ok;
    case "resume":
      if (!t.running && t.remainingMs > 0) room.timer = { ...t, running: true, endsAt: now + t.remainingMs };
      return ok;
    case "reset":
      room.timer = { ...t, running: false, endsAt: null, remainingMs: t.durationMs };
      return ok;
    case "add":
      if (t.running && t.endsAt) room.timer = { ...t, endsAt: t.endsAt + secs * 1000, durationMs: t.durationMs + secs * 1000 };
      else room.timer = { ...t, remainingMs: t.remainingMs + secs * 1000, durationMs: t.durationMs + secs * 1000 };
      return ok;
    default:
      return fail("err.unknownAction");
  }
}

// ---------------------------------------------------------------------------
// Host actions
// ---------------------------------------------------------------------------

function mergeSettings(room: Room, patch: Partial<Settings>): ActionResult {
  const s = { ...room.settings };
  const bool = (k: keyof Settings) => {
    if (k in patch) (s as Record<string, unknown>)[k] = !!patch[k];
  };
  (
    [
      "bodyguardSelf",
      "witchSelfSave",
      "witchBothSameNight",
      "hunterShootsWhenPoisoned",
      "revealRoleOnDeath",
      "deadSeeRoles",
      "decoyActions",
      "bilingualScreen",
    ] as const
  ).forEach(bool);
  const secs = (v: unknown, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 10 && n <= 3600 ? n : fallback;
  };
  if ("discussionSeconds" in patch) s.discussionSeconds = secs(patch.discussionSeconds, s.discussionSeconds);
  if ("defenseSeconds" in patch) s.defenseSeconds = secs(patch.defenseSeconds, s.defenseSeconds);
  if (patch.nomination) {
    const n = { ...s.nomination, ...patch.nomination };
    if (!["top1", "topN", "threshold"].includes(n.mode)) return fail("err.invalidSettings");
    if (!["allTied", "none", "revote"].includes(n.tie)) return fail("err.invalidSettings");
    n.n = Math.max(1, Math.min(10, Math.round(Number(n.n)) || 1));
    n.threshold = Math.max(1, Math.min(MAX_PLAYERS, Math.round(Number(n.threshold)) || 1));
    s.nomination = n;
  }
  if (patch.verdict) {
    const v = { ...s.verdict, ...patch.verdict };
    if (!["absolute", "simple"].includes(v.majority)) return fail("err.invalidSettings");
    v.anonymous = !!v.anonymous;
    s.verdict = v;
  }
  if (patch.nightOrder) {
    const order = patch.nightOrder.filter((st, i, arr) => st in NIGHT_STEP_ROLE && arr.indexOf(st) === i);
    if (order.length !== Object.keys(NIGHT_STEP_ROLE).length) return fail("err.invalidSettings");
    s.nightOrder = order;
  }
  room.settings = s;
  return ok;
}

function override(room: Room, o: OverrideAction): ActionResult {
  const game = room.game;
  if (!game || room.phase.kind === "gameOver") return fail("err.wrongPhase");
  switch (o?.kind) {
    case "kill": {
      const p = getPlayer(room, o.playerId);
      if (!p || !p.alive) return fail("err.invalidTarget");
      const res = cascadeDeaths([{ playerId: p.id, cause: "host" }], deathCtx(room));
      applyDeaths(room, res.deaths);
      log(room, "log.host.kill", { name: p.name });
      evaluateWin(room);
      return ok;
    }
    case "revive": {
      const p = getPlayer(room, o.playerId);
      if (!p || p.alive) return fail("err.invalidTarget");
      p.alive = true;
      game.pendingHunters = game.pendingHunters.filter((h) => h !== p.id);
      delete game.hunterShots[p.id];
      log(room, "log.host.revive", { name: p.name }, true);
      evaluateWin(room);
      return ok;
    }
    case "changeRole": {
      const p = getPlayer(room, o.playerId);
      if (!p || !ROLES[o.roleId]) return fail("err.invalidTarget");
      const from = game.roles[p.id];
      game.roles[p.id] = o.roleId;
      log(room, "log.host.changeRole", { name: p.name, from, role: o.roleId });
      evaluateWin(room);
      return ok;
    }
    case "cancelVote": {
      if (!game.vote || game.vote.closed) return fail("err.wrongPhase");
      game.vote.ballots = {};
      log(room, "log.host.cancelVote");
      return ok;
    }
    case "revote": {
      const kind = room.phase.kind;
      if (kind === "nominate") {
        openNomination(room, game.vote?.candidates ?? null);
      } else if (kind === "defense" || kind === "nominateResult") {
        room.phase = { ...room.phase, kind: "nominate" };
        resetTimer(room);
        game.nominees = [];
        game.nomination = null;
        game.nominationOutcome = null;
        openNomination(room);
      } else if (kind === "verdict") {
        game.vote!.ballots = {};
      } else if (kind === "verdictResult") {
        const last = game.verdicts.pop();
        if (last) {
          for (const d of last.deaths) {
            const p = getPlayer(room, d.playerId);
            if (p) p.alive = true;
            delete game.hunterShots[d.playerId];
          }
          const revived = new Set(last.deaths.map((d) => d.playerId));
          game.pendingHunters = game.pendingHunters.filter((h) => !revived.has(h));
          game.pendingWin = null;
        }
        openVerdict(room, room.phase.verdictIndex);
      } else return fail("err.wrongPhase");
      log(room, "log.host.revote", {}, true);
      return ok;
    }
    default:
      return fail("err.unknownAction");
  }
}

export function hostAction(room: Room, action: HostAction): ActionResult {
  const inLobby = room.phase.kind === "lobby";
  switch (action?.type) {
    case "setLocale":
      room.locale = action.locale === "en" ? "en" : "vi";
      return ok;
    case "kick": {
      if (!inLobby && room.phase.kind !== "gameOver") return fail("err.kickInGame");
      const p = getPlayer(room, action.playerId);
      if (!p) return fail("err.invalidTarget");
      room.players = room.players.filter((x) => x.id !== p.id);
      delete room.assignment[p.id];
      log(room, "log.kick", { name: p.name });
      return ok;
    }
    case "rename": {
      const p = getPlayer(room, action.playerId);
      const name = sanitizeName(action.name);
      if (!p || !name) return fail("err.nameRequired");
      if (room.players.some((x) => x.id !== p.id && x.name.toLowerCase() === name.toLowerCase()))
        return fail("err.nameTaken");
      log(room, "log.rename", { old: p.name, name });
      p.name = name;
      return ok;
    }
    case "updateSettings":
      return mergeSettings(room, action.settings ?? {});
    case "setRoleCounts": {
      if (!inLobby) return fail("err.wrongPhase");
      const counts = { ...emptyRoleCounts(), ...action.roleCounts };
      const err = validateRoleCounts(counts);
      if (err) return fail(err);
      room.settings = { ...room.settings, roleCounts: counts };
      return ok;
    }
    case "useSuggested":
      if (!inLobby) return fail("err.wrongPhase");
      room.settings = { ...room.settings, roleCounts: suggestRoles(room.players.length) };
      return ok;
    case "assignRandom":
      if (!inLobby) return fail("err.wrongPhase");
      return assignRandom(room);
    case "assignManual": {
      if (!inLobby) return fail("err.wrongPhase");
      if (!getPlayer(room, action.playerId)) return fail("err.invalidTarget");
      if (action.roleId === null) delete room.assignment[action.playerId];
      else if (ROLES[action.roleId]) room.assignment[action.playerId] = action.roleId;
      else return fail("err.invalidTarget");
      return ok;
    }
    case "addBots": {
      if (!inLobby) return fail("err.wrongPhase");
      const count = Math.max(1, Math.min(MAX_PLAYERS - room.players.length, Math.round(Number(action.count)) || 1));
      let n = 1;
      for (let i = 0; i < count; i++) {
        while (room.players.some((p) => p.name === `Bot ${n}`)) n++;
        const rnd = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
        addPlayer(room, {
          name: `Bot ${n}`,
          avatar: AVATARS[(room.players.length * 7) % AVATARS.length],
          locale: room.locale,
          isBot: true,
          style: { font: rnd(NAME_FONTS), effect: rnd(NAME_EFFECTS), frame: rnd(AVATAR_FRAMES) },
        });
      }
      return ok;
    }
    case "removeBots":
      if (!inLobby) return fail("err.wrongPhase");
      for (const p of room.players.filter((x) => x.isBot)) delete room.assignment[p.id];
      room.players = room.players.filter((p) => !p.isBot);
      return ok;
    case "start":
      return startGame(room);
    case "next":
      return advance(room);
    case "timer":
      return timerOp(room, action.op, action.seconds);
    case "override":
      return override(room, action.action);
    case "actAs": {
      const res = playerAction(room, action.playerId, action.action);
      if (res.ok) log(room, "log.host.actAs", { name: nameOf(room, action.playerId) });
      return res;
    }
    case "confirmWin": {
      const game = room.game;
      if (!game?.pendingWin) return fail("err.wrongPhase");
      return endGame(room, game.pendingWin);
    }
    case "dismissWin": {
      const game = room.game;
      if (!game?.pendingWin) return fail("err.wrongPhase");
      game.pendingWin = null;
      game.dismissedWinSig = aliveSignature(room);
      log(room, "log.host.dismissWin");
      return ok;
    }
    case "endGame":
      if (!room.game || room.phase.kind === "gameOver") return fail("err.wrongPhase");
      if (!["wolves", "village", "lovers", "draw"].includes(action.winner)) return fail("err.invalidTarget");
      return endGame(room, action.winner);
    case "newGame":
      if (room.phase.kind === "lobby") return fail("err.wrongPhase");
      for (const p of room.players) p.alive = true;
      room.game = null;
      room.assignment = {};
      room.phase = { kind: "lobby", night: 0, day: 0, steps: [], stepIndex: 0, verdictIndex: 0 };
      room.settings = { ...room.settings, roleCounts: suggestRoles(room.players.length) };
      room.log = [];
      resetTimer(room);
      log(room, "log.newGame");
      return ok;
    default:
      return fail("err.unknownAction");
  }
}

function endGame(room: Room, winner: Winner): ActionResult {
  const game = room.game!;
  game.winner = winner;
  game.pendingWin = null;
  game.vote = null;
  room.phase = { ...room.phase, kind: "gameOver" };
  resetTimer(room);
  log(room, `log.win.${winner}`, {}, true);
  return ok;
}
