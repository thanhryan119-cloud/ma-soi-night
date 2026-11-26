// Game engine: mutates a Room in response to validated host/player actions.
// Every action is checked here (phase, role, alive, valid target, double vote).

import { AVATAR_FRAMES, CHAT_DECOS, NAME_EFFECTS, NAME_FONTS, freeChatColor, limitStyle, sanitizeAvatarUrl, sanitizeOwned, sanitizeStyle } from "./cosmetics";
import {
  BOT_SPEEDS,
  NIGHT_STEP_ROLE,
  ROLES,
  ROLE_IDS,
  completeNightOrder,
  defaultSettings,
  emptyRoleCounts,
  SOLO_ROLES,
  isWolf,
  stepRoles,
  suggestRoles,
  openRoles,
  totalRoles,
  wakesIn,
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

/**
 * Bot names: two words each, every first word different, so bots are easy to
 * tell apart in the chat and the vote lists (shuffled, never reused in a room).
 */
const BOT_NAMES = {
  vi: [
    "Mít Ướt", "Bơ Sáp", "Xoài Cát", "Cốm Xanh", "Tôm Càng", "Sóc Nâu", "Gấu Trúc", "Kem Dâu",
    "Bin Lém", "Tép Riu", "Mận Hậu", "Khoai Lang", "Ổi Đào", "Nấm Rơm", "Cún Con", "Lúa Mới",
    "Bắp Rang", "Dừa Xiêm", "Đậu Phộng", "Sen Hồng", "Mèo Mun", "Chuối Tiêu",
  ],
  en: [
    "Ash Fox", "Bella Moon", "Cody Bear", "Daisy Bell", "Eli Stone", "Fern Hill", "Gus Barley", "Hazel Nut",
    "Iris Rain", "Jack Frost", "Kit Kettle", "Luna Grey", "Milo Pond", "Nora Finch", "Otis Oak", "Pip Sparrow",
    "Rex Thorn", "Sky Willow", "Theo Brook", "Zoe Ember", "Wren Hollow", "Ivy Lantern",
  ],
};

function botName(room: Room): string {
  const taken = new Set(room.players.map((p) => p.name.toLowerCase()));
  const free = BOT_NAMES[room.locale === "en" ? "en" : "vi"].filter((n) => !taken.has(n.toLowerCase()));
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  let n = 1;
  while (taken.has(`bot ${n}`)) n++;
  return `Bot ${n}`;
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
    /** Shop items the player's account owns; paid styles outside it are dropped. */
    owned?: readonly string[];
    userId?: string | null;
    deviceId?: unknown;
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
    style: limitStyle(sanitizeStyle(input.style), input.isBot ? "all" : sanitizeOwned(input.owned)),
    owned: sanitizeOwned(input.owned),
    chatColor: freeChatColor(room.players.map((p) => p.chatColor)),
    userId: input.userId ?? null,
    deviceId: typeof input.deviceId === "string" && /^[\w-]{8,64}$/.test(input.deviceId) ? input.deviceId : null,
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

const isLocked = (room: Room, r: RoleId) => !!room.lockedRoles?.includes(r);

export function validateRoleCounts(counts: Record<RoleId, number>): string | null {
  for (const r of ROLE_IDS) {
    const c = counts[r] ?? 0;
    if (!Number.isInteger(c) || c < 0 || c > MAX_PLAYERS) return "err.invalidCounts";
    const max = ROLES[r].max;
    if (max !== undefined && c > max) return "err.roleMax";
  }
  // The Sisters come as a pair.
  if ((counts.sister ?? 0) === 1) return "err.sistersPair";
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
    wolfSeerTarget: null,
    curse: false,
    mediumTarget: null,
    bigBadTarget: null,
    silenceId: null,
    whiteWolfTarget: null,
    killerTarget: null,
    douseId: null,
    ignite: false,
    done: {},
  };
}

export function startGame(room: Room): ActionResult {
  if (room.phase.kind !== "lobby") return fail("err.wrongPhase");
  if (room.players.length < MIN_PLAYERS) return fail("err.notEnoughPlayers", { min: MIN_PLAYERS });
  const missing = room.players.filter((p) => !room.assignment[p.id]);
  if (missing.length) return fail("err.unassigned", { count: missing.length });
  if (room.players.some((p) => isLocked(room, room.assignment[p.id]))) return fail("err.roleLocked");
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
  // Dealt roles too, so a curse never reveals itself by removing the victim's old step.
  const present = new Set([...Object.values(game.originalRoles ?? {}), ...Object.values(game.roles)]);
  return completeNightOrder(room.settings.nightOrder).filter((step) => {
    const role = ROLES[NIGHT_STEP_ROLE[step]];
    if (!stepRoles(step).some((r) => present.has(r))) return false;
    if (role.night?.firstNightOnly && night !== 1) return false;
    if (role.night?.needsDead && room.players.every((p) => p.alive)) return false;
    if (role.night?.nights && !role.night.nights(night)) return false;
    return true;
  });
}

export function currentStep(room: Room): NightStepId | null {
  if (room.phase.kind !== "night") return null;
  return room.phase.steps[room.phase.stepIndex] ?? null;
}

export function stepActors(room: Room, step: NightStepId): Player[] {
  return alivePlayers(room).filter((p) => wakesIn(room.game!.roles[p.id], step));
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
  // The first role called tonight (later ones are logged when the host moves on).
  if (room.phase.steps.length) log(room, "log.step", { step: room.phase.steps[0] });
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
  // The Knight's rusty sword: a wolf dies at the end of the night after the bite.
  const extra: Death[] = [];
  if (game.rustNight === room.phase.night) {
    game.rustNight = null;
    const pack = aliveIds(room).filter((id) => isWolf(game.roles[id]));
    if (pack.length) extra.push({ playerId: pack[Math.floor(Math.random() * pack.length)], cause: "rust" });
  }
  const doused = (game.doused ?? []).filter((id) => getPlayer(room, id)?.alive);
  const outcome = resolveNight({
    alive: aliveIds(room),
    roles: game.roles,
    lovers: game.lovers,
    hunterShootsWhenPoisoned: room.settings.hunterShootsWhenPoisoned,
    protectId: ns.protectId,
    wolfTarget: ns.wolfTarget,
    witchSave: ns.witchSave,
    witchPoisonId: ns.witchPoisonId,
    curse: !!ns.curse,
    sturdy: aliveIds(room).filter((id) => game.roles[id] === "elder" && !(game.elderHits ?? []).includes(id)),
    extraBite: ns.bigBadTarget,
    immune: aliveIds(room).filter((id) => ROLES[game.roles[id]]?.biteImmune),
    killerTarget: ns.killerTarget,
    whiteWolfTarget: ns.whiteWolfTarget,
    fire: ns.ignite ? doused : [],
    extra,
  });
  const blockedKey = {
    bodyguard: "log.savedByGuard",
    witch: "log.savedByWitch",
    elder: "log.savedByElder",
    immune: "log.biteImmune",
  } as const;
  if (outcome.attackBlockedBy) log(room, blockedKey[outcome.attackBlockedBy], { target: nameOf(room, ns.wolfTarget) });
  if (outcome.attackBlockedBy === "elder" && ns.wolfTarget) (game.elderHits ??= []).push(ns.wolfTarget);
  for (const b of outcome.blocked) {
    log(room, blockedKey[b.by], { target: nameOf(room, b.targetId) });
    if (b.by === "elder") (game.elderHits ??= []).push(b.targetId);
  }
  if (ns.ignite) {
    game.doused = [];
    log(room, "log.fire", { names: doused.map((id) => nameOf(room, id)).join(", ") || "—" });
  } else if (ns.douseId) (game.doused ??= []).push(ns.douseId);
  // Bitten to death, the Knight leaves his rusty sword in a wolf: it dies the next night.
  if (outcome.deaths.some((d) => d.cause === "wolves" && game.roles[d.playerId] === "knight")) game.rustNight = room.phase.night + 1;
  if (ns.curse && !outcome.cursedId) log(room, "log.curseFailed", { target: nameOf(room, ns.wolfTarget) });
  if (outcome.cursedId) {
    const id = outcome.cursedId;
    log(room, "log.cursed", { target: nameOf(room, id), role: game.roles[id] });
    game.roles[id] = "werewolf";
    game.curseUsed = true;
    (game.cursed ??= []).push({ playerId: id, night: room.phase.night });
  }
  game.bodyguardLast = ns.protectId;
  applyDeaths(room, outcome.deaths);
  game.lastDeaths = outcome.deaths;
  if (!outcome.deaths.length) log(room, "log.noDeath", {}, true);
  game.silenced = null;
  if (ns.silenceId && getPlayer(room, ns.silenceId)?.alive) {
    game.silenced = { playerId: ns.silenceId, day: room.phase.night };
    log(room, "log.silenced", { name: nameOf(room, ns.silenceId) }, true);
  }
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
  turnWildChildren(room);
}

/** A Wild Child whose model has died turns werewolf (and keeps it, even if the model is revived). */
function turnWildChildren(room: Room) {
  const game = room.game!;
  for (const [childId, modelId] of Object.entries(game.wildModels ?? {})) {
    const child = getPlayer(room, childId);
    if (!child?.alive || game.roles[childId] !== "wildChild" || getPlayer(room, modelId)?.alive !== false) continue;
    game.roles[childId] = "werewolf";
    (game.wildTurned ??= []).push({ playerId: childId, night: room.phase.night, day: room.phase.day });
    log(room, "log.wildChildTurned", { actor: child.name, target: nameOf(room, modelId) });
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
  const w: Winner | null = game.tannerWin ? "tanner" : checkWin(aliveIds(room), game.roles, game.lovers);
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
  log(room, "log.verdictStart", { name: nameOf(room, game.nominees[index]) });
}

export function verdictEligible(room: Room): string[] {
  const nominees = new Set(room.game?.nominees ?? []);
  return aliveIds(room).filter((id) => !nominees.has(id));
}

/** The Silencer's victim can't talk or vote today. */
export function isSilenced(room: Room, id: string): boolean {
  const s = room.game?.silenced;
  return !!s && s.playerId === id && s.day === room.phase.day && room.phase.kind !== "night" && room.phase.kind !== "gameOver";
}

/** A revealed Idiot lives on but has lost his vote; the silenced can't vote today. */
export function hasLostVote(room: Room, id: string): boolean {
  return !!room.game?.revealedIdiots?.includes(id) || isSilenced(room, id);
}

/** How many votes a player's ballot counts for (the Mayor: 2). */
export function voteWeight(room: Room, id: string): number {
  const role = room.game?.roles[id];
  return (role && ROLES[role]?.voteWeight) || 1;
}

const voteWeights = (room: Room): Record<string, number> =>
  Object.fromEntries(room.players.map((p) => [p.id, voteWeight(room, p.id)]));

export function voteEligible(room: Room): string[] {
  const vote = room.game?.vote;
  if (!vote) return [];
  return (vote.kind === "verdict" ? verdictEligible(room) : aliveIds(room)).filter((id) => !hasLostVote(room, id));
}

function closeNomination(room: Room): "defense" | "revote" | "none" {
  const game = room.game!;
  const vote = game.vote!;
  vote.closed = true;
  const rules = room.settings.nomination;
  const isRevote = !!vote.candidates;
  const tally = tallyNomination(
    vote.ballots,
    {
      ...rules,
      // A second tie in a revote sends nobody up.
      tie: isRevote && rules.tie === "revote" ? "none" : rules.tie,
    },
    voteWeights(room),
  );
  game.nomination = tally;
  // Record the full count for the end-of-game story.
  const counts = Object.entries(tally.counts)
    .sort((x, y) => y[1] - x[1])
    .map(([id, n]) => `${nameOf(room, id)} ${n}`)
    .join(", ");
  log(room, "log.nominationTally", { counts: counts || "—", skips: tally.skips });
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
  const eligible = verdictEligible(room)
    .filter((id) => !hasLostVote(room, id))
    .reduce((n, id) => n + voteWeight(room, id), 0);
  const tally = tallyVerdict(vote.ballots, eligible, room.settings.verdict, voteWeights(room));
  const nomineeId = vote.nomineeId!;
  let deaths: Death[] = [];
  const idiotSpared = tally.executed && game.roles[nomineeId] === "idiot" && !hasLostVote(room, nomineeId);
  if (idiotSpared) {
    // The village sees who he really is: he stays alive but never votes again.
    (game.revealedIdiots ??= []).push(nomineeId);
    log(room, "log.idiotRevealed", { name: nameOf(room, nomineeId) }, true);
  } else if (tally.executed && getPlayer(room, nomineeId)?.alive) {
    // The Tanner wanted nothing more than to hang.
    if (game.roles[nomineeId] === "tanner") game.tannerWin = true;
    const res = cascadeDeaths([{ playerId: nomineeId, cause: "execution" }], deathCtx(room));
    deaths = res.deaths;
    applyDeaths(room, deaths);
    game.pendingHunters.push(...res.hunters);
    game.hunterReturn = "afterVerdict";
  }
  game.verdicts.push({ ...tally, nomineeId, ballots: { ...vote.ballots }, deaths, ...(idiotSpared ? { idiotRevealed: true } : {}) });
  if (!idiotSpared)
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
  if (kind === "defense" && room.game) room.game.defenseDone = [];
  room.phase = { ...room.phase, kind };
  const secs = kind === "discussion" ? room.settings.discussionSeconds : room.settings.defenseSeconds;
  timerOp(room, "start", secs);
}

/** Players who still have to vote when voting is mandatory (offline players don't block). */
export function pendingVoters(room: Room): Player[] {
  const vote = room.game?.vote;
  if (!vote || vote.closed) return [];
  return voteEligible(room)
    .filter((id) => !(id in vote.ballots))
    .map((id) => getPlayer(room, id)!)
    .filter((p) => p && (p.connected || p.isBot));
}

/** True when the host ran a countdown for this vote and it has hit zero. */
function voteTimeUp(room: Room, now = Date.now()): boolean {
  const t = room.timer;
  if (!t.durationMs) return false;
  return t.running ? !!t.endsAt && t.endsAt <= now : t.remainingMs <= 0;
}

/**
 * Anyone who didn't vote in time is counted as voting at random: for another
 * living player (one of the candidates in a revote) in the nomination, and
 * for execute or spare in the verdict.
 */
function fillMissingBallots(room: Room) {
  const game = room.game!;
  const vote = game.vote;
  if (!vote || vote.closed) return;
  for (const id of voteEligible(room)) {
    if (id in vote.ballots) continue;
    let choice: string | null = null;
    if (vote.kind === "verdict") choice = Math.random() < 0.5 ? "execute" : "spare";
    else {
      const pool = (vote.candidates ?? aliveIds(room)).filter((c) => c !== id && getPlayer(room, c)?.alive);
      if (pool.length) choice = pool[Math.floor(Math.random() * pool.length)];
    }
    if (!choice) continue;
    vote.ballots[id] = choice;
    log(room, "log.voteRandom", { actor: nameOf(room, id), target: vote.kind === "verdict" ? choice : nameOf(room, choice) });
  }
}

/**
 * Once the vote's countdown is over, everyone who still hasn't voted votes at
 * random right away (the vote stays open until it is closed). True when it
 * added any ballot.
 */
export function fillVotesIfTimeUp(room: Room, now = Date.now()): boolean {
  const vote = room.game?.vote;
  if (!vote || vote.closed || !voteTimeUp(room, now)) return false;
  const before = Object.keys(vote.ballots).length;
  fillMissingBallots(room);
  return Object.keys(vote.ballots).length !== before;
}

/**
 * Votes can't be closed while people (online) still haven't voted and the
 * vote time hasn't run out. When it runs out, missing votes count as random.
 */
function missingVoters(room: Room): ActionResult | null {
  if (voteTimeUp(room)) return null;
  const pending = pendingVoters(room);
  return pending.length ? fail("err.votesMissing", { count: pending.length }) : null;
}

/**
 * Wolves must bite: the host can't move on until the pack has picked someone.
 * If every living wolf is offline, a random valid victim is chosen so the game goes on.
 */
function enforceWolfBite(room: Room): ActionResult | null {
  if (room.settings.wolvesMustBite === false) return null;
  const ns = room.game!.nightState;
  if (ns.wolfFinalized) return null;
  const wolves = stepActors(room, "werewolf");
  if (!wolves.length || wolves.some((w) => ns.wolfVotes[w.id])) return null;
  const targets = validTargets(room, wolves[0], "werewolf");
  if (!targets.length) return null;
  if (wolves.some((w) => w.connected || w.isBot)) return fail("err.wolvesMustBite");
  const target = targets[Math.floor(Math.random() * targets.length)];
  ns.wolfVotes[wolves[0].id] = target;
  log(room, "log.wolfAutoTarget", { target: nameOf(room, target) });
  return null;
}

/**
 * True when the current step has been confirmed and nothing is left to wait
 * for, so the auto narrator may move on: a night role has acted (or has nobody
 * alive to act), the hunter has fired, or every voter has voted.
 */
export function autoReady(room: Room): boolean {
  const game = room.game;
  if (!game || game.pendingWin) return false;
  switch (room.phase.kind) {
    case "night":
      return !!currentStep(room) && !awaitingConfirmation(room);
    case "hunter":
      return !!game.pendingHunters[0] && !awaitingConfirmation(room);
    case "nominate":
    case "verdict": {
      const vote = game.vote;
      if (!vote || vote.closed) return false;
      return voteEligible(room).every((id) => id in vote.ballots);
    }
    default:
      return false;
  }
}

const present = (p: Player) => p.connected || p.isBot;

/**
 * Night roles and the hunter must confirm before anyone (host or auto
 * narrator) can move on. A role with nobody alive, or whose players are all
 * offline, never blocks the game.
 */
export function awaitingConfirmation(room: Room): ActionResult | null {
  const game = room.game;
  if (!game) return null;
  if (room.phase.kind === "night") {
    const step = currentStep(room);
    if (!step) return null;
    const online = stepActors(room, step).filter(present);
    if (!online.length) return null;
    const ns = game.nightState;
    if (step === "werewolf") {
      if (room.settings.wolvesMustBite === false || ns.wolfFinalized) return null;
      // Nobody left to bite (only the pack and the White Wolf alive): nothing to wait for.
      if (!validTargets(room, online[0], step).length) return null;
      const votes = online.map((w) => ns.wolfVotes[w.id]);
      return votes.every((v) => !!v) && new Set(votes).size === 1 ? null : fail("err.roleNotDone", { role: NIGHT_STEP_ROLE[step] });
    }
    return ns.done[step] ? null : fail("err.roleNotDone", { role: NIGHT_STEP_ROLE[step] });
  }
  if (room.phase.kind === "hunter") {
    const h = game.pendingHunters[0];
    const hunter = h ? getPlayer(room, h) : null;
    if (hunter && present(hunter) && !(hunter.id in game.hunterShots)) return fail("err.roleNotDone", { role: "hunter" });
  }
  return null;
}

/** A key that changes whenever the game moves to a different step. */
export function stepKey(room: Room): string {
  const p = room.phase;
  return `${p.kind}:${p.night}:${p.day}:${p.stepIndex}:${p.verdictIndex}:${room.game?.pendingHunters[0] ?? ""}`;
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
      const waiting = awaitingConfirmation(room);
      if (waiting) return waiting;
      if (currentStep(room) === "werewolf") {
        const blocked = enforceWolfBite(room);
        if (blocked) return blocked;
      }
      // For the story: a called role that didn't act (dead, or its player offline).
      const leaving = currentStep(room);
      if (leaving && !isStepDone(room, leaving) && !(leaving === "werewolf" && Object.keys(game.nightState.wolfVotes).length)) {
        log(room, stepActors(room, leaving).length ? "log.stepOffline" : "log.stepNobody", { step: leaving });
      }
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
      const waitingShot = awaitingConfirmation(room);
      if (waitingShot) return waitingShot;
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
    case "nominate": {
      const missing = missingVoters(room);
      if (missing) return missing;
      // Close the (secret) vote and reveal who voted for whom.
      fillMissingBallots(room);
      closeNomination(room);
      room.phase = { ...room.phase, kind: "nominateResult" };
      return ok;
    }
    case "nominateResult": {
      const outcome = game.nominationOutcome;
      game.nominationOutcome = null;
      if (outcome === "revote") {
        room.phase = { ...room.phase, kind: "nominate" };
        resetTimer(room);
        openNomination(room, game.nomination?.tiedIds ?? null);
      } else if (outcome === "defense") enterTimed(room, "defense");
      else startNight(room);
      return ok;
    }
    case "defense":
      openVerdict(room, 0);
      return ok;
    case "verdict": {
      const missing = missingVoters(room);
      if (missing) return missing;
      fillMissingBallots(room);
      closeVerdict(room);
      return ok;
    }
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
      // A new name is fine at any time (everyone is told); the look only before the game.
      if (action.name !== undefined) {
        const name = sanitizeName(action.name);
        if (!name) return fail("err.nameRequired");
        if (room.players.some((p) => p.id !== player.id && p.name.toLowerCase() === name.toLowerCase()))
          return fail("err.nameTaken");
        if (name !== player.name) {
          log(room, "log.renamed", { old: player.name, name }, true);
          player.name = name;
        }
      }
      if (room.phase.kind !== "lobby") return ok;
      if (action.avatar && AVATARS.includes(action.avatar)) player.avatar = action.avatar;
      if (action.style)
        player.style = limitStyle(sanitizeStyle({ ...player.style, ...action.style }), player.isBot ? "all" : player.owned ?? []);
      return ok;
    }
    case "night":
      return nightAction(room, player, action);
    case "vote":
      return castVote(room, player, String(action.choice ?? ""));
    case "endDefense":
      return endDefense(room, player);
    case "hunterShot":
      return hunterShot(room, player, action.targetId ?? null);
    default:
      return fail("err.unknownAction");
  }
}

/**
 * A nominee says "I'm done". Once every living nominee is done, the defense
 * ends early and the verdict vote opens.
 */
function endDefense(room: Room, player: Player): ActionResult {
  const game = room.game;
  if (!game || room.phase.kind !== "defense") return fail("err.wrongPhase");
  if (!player.alive || !game.nominees.includes(player.id)) return fail("err.notOnStand");
  const done = (game.defenseDone ??= []);
  if (!done.includes(player.id)) done.push(player.id);
  log(room, "log.defenseDone", { actor: player.name });
  const waiting = game.nominees.filter((id) => getPlayer(room, id)?.alive && !done.includes(id));
  if (!waiting.length) return advance(room);
  return ok;
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
  if (!wakesIn(game.roles[actor.id], step)) return fail("err.notYourTurn");
  const ns = game.nightState;
  const valid = new Set(validTargets(room, actor, step));
  const targets = Array.isArray(action.targets) ? action.targets.map(String) : [];
  const def = ROLES[NIGHT_STEP_ROLE[step]].night!;
  // Roles that may pass: picking nobody ends their turn.
  if (def.optional && def.kind === "pick" && !targets.length) {
    if (ns.done[step]) return fail("err.alreadyActed");
    ns.done[step] = true;
    log(room, "log.stepPass", { actor: actor.name, step });
    return ok;
  }

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
    case "wolfSeer": {
      if (ns.done.wolfSeer) return fail("err.alreadyActed");
      if (targets.length !== 1 || !valid.has(targets[0])) return fail("err.invalidTarget");
      const roleId = game.roles[targets[0]];
      ns.wolfSeerTarget = targets[0];
      ns.done.wolfSeer = true;
      (game.seerResults[actor.id] ??= []).push({ night: room.phase.night, targetId: targets[0], isWolf: isWolf(roleId), roleId });
      log(room, "log.wolfSeer", { actor: actor.name, target: nameOf(room, targets[0]), role: roleId });
      return ok;
    }
    case "wildChild": {
      if (ns.done.wildChild) return fail("err.alreadyActed");
      if (targets.length !== 1 || !valid.has(targets[0])) return fail("err.invalidTarget");
      (game.wildModels ??= {})[actor.id] = targets[0];
      ns.done.wildChild = true;
      log(room, "log.wildChild", { actor: actor.name, target: nameOf(room, targets[0]) });
      return ok;
    }
    case "medium": {
      if (ns.done.medium) return fail("err.alreadyActed");
      if (targets.length !== 1 || !valid.has(targets[0])) return fail("err.invalidTarget");
      const roleId = game.roles[targets[0]];
      ns.mediumTarget = targets[0];
      ns.done.medium = true;
      (game.seerResults[actor.id] ??= []).push({ night: room.phase.night, targetId: targets[0], isWolf: isWolf(roleId), roleId });
      log(room, "log.medium", { actor: actor.name, target: nameOf(room, targets[0]), role: roleId });
      return ok;
    }
    case "bigBadWolf":
    case "silencer":
    case "whiteWolf":
    case "serialKiller": {
      if (ns.done[step]) return fail("err.alreadyActed");
      if (targets.length !== 1 || !valid.has(targets[0])) return fail("err.invalidTarget");
      const field = { bigBadWolf: "bigBadTarget", silencer: "silenceId", whiteWolf: "whiteWolfTarget", serialKiller: "killerTarget" } as const;
      ns[field[step]] = targets[0];
      ns.done[step] = true;
      log(room, `log.${step}`, { actor: actor.name, target: nameOf(room, targets[0]) });
      return ok;
    }
    case "arsonist": {
      if (ns.done.arsonist) return fail("err.alreadyActed");
      if (action.ignite) {
        if (!(game.doused ?? []).some((id) => getPlayer(room, id)?.alive)) return fail("err.nothingToIgnite");
        ns.ignite = true;
        log(room, "log.ignite", { actor: actor.name });
      } else if (!targets.length) {
        log(room, "log.stepPass", { actor: actor.name, step });
      } else {
        if (targets.length !== 1 || !valid.has(targets[0])) return fail("err.invalidTarget");
        ns.douseId = targets[0];
        log(room, "log.douse", { actor: actor.name, target: nameOf(room, targets[0]) });
      }
      ns.done.arsonist = true;
      return ok;
    }
    case "cursedWolf": {
      if (ns.done.cursedWolf) return fail("err.alreadyActed");
      const curse = !!action.curse;
      if (curse) {
        if (game.curseUsed) return fail("err.curseUsed");
        if (!ns.wolfFinalized || !ns.wolfTarget) return fail("err.nobodyToCurse");
      }
      ns.curse = curse;
      ns.done.cursedWolf = true;
      log(room, curse ? "log.curse" : "log.cursePass", { actor: actor.name, target: nameOf(room, ns.wolfTarget) });
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
  if (isSilenced(room, voter.id)) return fail("err.silenced");
  if (hasLostVote(room, voter.id)) return fail("err.noVoteIdiot");
  if (voter.id in vote.ballots) return fail("err.alreadyVoted");
  if (vote.kind === "nominate") {
    if (choice === SKIP && room.settings.mandatoryVote) return fail("err.skipNotAllowed");
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
      "wolvesMustBite",
      "mandatoryVote",
      "voiceChat",
      "autoAdvance",
      "aiBots",
      "noScreen",
      "autoKickAway",
      "bilingualScreen",
    ] as const
  ).forEach(bool);
  const secs = (v: unknown, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 10 && n <= 3600 ? n : fallback;
  };
  if ("botSpeed" in patch) {
    const v = Number(patch.botSpeed);
    if (!(BOT_SPEEDS as readonly number[]).includes(v)) return fail("err.invalidSettings");
    s.botSpeed = v;
  }
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
    if (!Array.isArray(patch.nightOrder)) return fail("err.invalidSettings");
    // An order saved before new roles existed still works: their steps are slotted in.
    s.nightOrder = completeNightOrder(patch.nightOrder);
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
        resetTimer(room);
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
          if (last.idiotRevealed) game.revealedIdiots = (game.revealedIdiots ?? []).filter((id) => id !== last.nomineeId);
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
      // A locked role can be taken out but not added (it may be left over from yesterday).
      if (ROLE_IDS.some((r) => isLocked(room, r) && counts[r] > (room.settings.roleCounts[r] ?? 0))) return fail("err.roleLocked");
      room.settings = { ...room.settings, roleCounts: counts };
      return ok;
    }
    case "useSuggested":
      if (!inLobby) return fail("err.wrongPhase");
      room.settings = { ...room.settings, roleCounts: suggestRoles(room.players.length, openRoles(room)) };
      return ok;
    case "assignRandom":
      if (!inLobby) return fail("err.wrongPhase");
      return assignRandom(room);
    case "assignManual": {
      if (!inLobby) return fail("err.wrongPhase");
      if (!getPlayer(room, action.playerId)) return fail("err.invalidTarget");
      if (action.roleId === null) delete room.assignment[action.playerId];
      else if (!ROLES[action.roleId]) return fail("err.invalidTarget");
      else if (isLocked(room, action.roleId) && room.assignment[action.playerId] !== action.roleId) return fail("err.roleLocked");
      else room.assignment[action.playerId] = action.roleId;
      return ok;
    }
    case "addBots": {
      if (!inLobby) return fail("err.wrongPhase");
      const count = Math.max(1, Math.min(MAX_PLAYERS - room.players.length, Math.round(Number(action.count)) || 1));
      const rnd = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
      for (let i = 0; i < count; i++) {
        addPlayer(room, {
          name: botName(room),
          avatar: AVATARS[(room.players.length * 7) % AVATARS.length],
          locale: room.locale,
          isBot: true,
          style: { font: rnd(NAME_FONTS), effect: rnd(NAME_EFFECTS), frame: rnd(AVATAR_FRAMES), chat: rnd(CHAT_DECOS) },
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
      if (!([...["wolves", "village", "lovers", "draw"], ...SOLO_ROLES] as string[]).includes(action.winner)) return fail("err.invalidTarget");
      return endGame(room, action.winner);
    case "newGame":
      if (room.phase.kind === "lobby") return fail("err.wrongPhase");
      for (const p of room.players) p.alive = true;
      room.game = null;
      room.assignment = {};
      room.phase = { kind: "lobby", night: 0, day: 0, steps: [], stepIndex: 0, verdictIndex: 0 };
      room.settings = { ...room.settings, roleCounts: suggestRoles(room.players.length, openRoles(room)) };
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
