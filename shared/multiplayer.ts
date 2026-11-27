// Online play (pure, shared by server and client): the lobby's room list, and
// machine-host rooms where the machine narrates and a player (the room owner)
// sets the room up without ever seeing anyone's role.

import { MAX_PLAYERS, MIN_PLAYERS, PLAY_NOW_PLAYERS, assignRandom, getPlayer, hostAction, log, randomToken, sanitizeName } from "./engine";
import { abandonResult, type GameResult } from "./stats";
import { totalRoles } from "./roles";
import type { ActionResult, Locale, OwnerAction, PhaseKind, Room, Settings } from "./types";

/** The machine always runs the game and every phone shows the narration. */
export const MACHINE_FORCED: Partial<Settings> = { autoAdvance: true, noScreen: true };

export interface RoomSummary {
  code: string;
  title: string;
  machineHost: boolean;
  locked: boolean;
  players: number;
  bots: number;
  max: number;
  locale: Locale;
  status: "waiting" | "playing" | "over";
  createdAt: number;
}

export interface LobbyPerson {
  id: string;
  name: string;
  avatar: string;
  avatarUrl: string | null;
  userId: string | null;
}

const statusOf = (kind: PhaseKind): RoomSummary["status"] =>
  kind === "lobby" ? "waiting" : kind === "gameOver" ? "over" : "playing";

export function roomSummary(room: Room): RoomSummary {
  return {
    code: room.code,
    title: room.title || room.code,
    machineHost: !!room.machineHost,
    locked: !!room.passwordHash,
    players: room.players.length,
    bots: room.players.filter((p) => p.isBot).length,
    max: MAX_PLAYERS,
    locale: room.locale,
    status: statusOf(room.phase.kind),
    createdAt: room.createdAt,
  };
}

/** Rooms waiting for players first, then the newest. */
export function sortRooms(rooms: RoomSummary[]): RoomSummary[] {
  const rank = { waiting: 0, playing: 1, over: 2 } as const;
  return [...rooms].sort((a, b) => rank[a.status] - rank[b.status] || b.createdAt - a.createdAt);
}

/** Turns a new room into a machine-host room owned by `ownerId`. */
export function makeMachineRoom(room: Room, ownerId: string) {
  room.machineHost = true;
  room.ownerId = ownerId;
  // Online play: someone away gets a bot playing for them and may come back,
  // so being away for 5 minutes no longer puts them out (the owner can turn it on).
  room.settings = { ...room.settings, autoKickAway: false, ...MACHINE_FORCED };
}

export const isOwner = (room: Room, playerId: string | null | undefined) =>
  !!room.machineHost && !!playerId && room.ownerId === playerId;

/** The next owner when the current one is gone: the longest-seated human who is online. */
export function nextOwner(room: Room): string | null {
  const humans = room.players.filter((p) => !p.isBot && p.connected && p.id !== room.ownerId);
  humans.sort((a, b) => a.joinedAt - b.joinedAt);
  return humans[0]?.id ?? null;
}

/** Makes `playerId` the owner. The room now counts as theirs: one-room-per-account and their role cards. */
export function setOwner(room: Room, playerId: string) {
  const next = getPlayer(room, playerId);
  if (!next) return;
  room.ownerId = next.id;
  room.creatorId = next.userId ?? null;
  // A fresh start: the new owner is here right now.
  next.activeAt = Date.now();
  log(room, "log.ownerChanged", { name: next.name });
}

// ---------------------------------------------------------------------------
// The room's leader away from the lobby, and the lobby starting by itself
// ---------------------------------------------------------------------------

/** The owner (or human host) has not touched the page for this long: others may take the room over. */
export const LEADER_IDLE_MS = 90_000;
/** After this long the room passes to the next person by itself. */
export const LEADER_TAKEOVER_MS = 3 * 60_000;
/** Enough people are here: the game starts by itself after this countdown. */
export const AUTO_START_MS = 45_000;
/** Someone new joins during the countdown: they get at least this long to look around. */
export const AUTO_START_MIN_LEFT_MS = 15_000;

/** People (not bots) online in the room. */
export const onlineHumans = (room: Room) => room.players.filter((p) => !p.isBot && p.connected);

/**
 * How long whoever runs the lobby (the owner of a machine-host room, or the
 * human host) has been away: offline, or online without touching the page.
 * 0 outside the lobby, or when we know nothing yet (an older phone that never reports).
 */
export function leaderIdleMs(room: Room, now = Date.now()): number {
  if (room.phase.kind !== "lobby") return 0;
  if (!room.machineHost) return room.hostActiveAt ? Math.max(0, now - room.hostActiveAt) : 0;
  const owner = getPlayer(room, room.ownerId ?? "");
  if (!owner) return Infinity;
  if (!owner.connected) return owner.offlineSince ? Math.max(0, now - owner.offlineSince) : Infinity;
  return owner.activeAt ? Math.max(0, now - owner.activeAt) : 0;
}

/** Someone else is waiting while the leader is away: they may take the room. */
export function leaderAway(room: Room, now = Date.now()): boolean {
  if (leaderIdleMs(room, now) < LEADER_IDLE_MS) return false;
  return onlineHumans(room).some((p) => p.id !== room.ownerId);
}

/** Null when `playerId` may take the room over now, else the error. */
export function claimError(room: Room, playerId: string, now = Date.now()): string | null {
  const p = getPlayer(room, playerId);
  if (!p || p.isBot || !p.connected) return "err.notInRoom";
  if (room.phase.kind !== "lobby") return "err.wrongPhase";
  if (room.machineHost && room.ownerId === p.id) return "err.invalidTarget";
  if (!leaderAway(room, now)) return "err.leaderHere";
  return null;
}

/**
 * Machine-host lobbies start by themselves once MIN_PLAYERS people are online:
 * a countdown everyone sees, more time when someone new joins, and the owner
 * may stop it (until someone new comes). Updates the room and tells the
 * caller what to do: "start" the game now, "changed" (send the new state), or null.
 */
export function stepAutoStart(room: Room, now = Date.now()): "start" | "changed" | null {
  const count = onlineHumans(room).length;
  const hold = room.autoStartHold ?? null;
  if (hold !== null && count > hold) room.autoStartHold = null;
  const eligible = !!room.machineHost && room.phase.kind === "lobby" && count >= MIN_PLAYERS && room.autoStartHold == null;
  if (!eligible) {
    // Fewer people than the hold: the next one to come starts the countdown again.
    if (hold !== null && count < hold) room.autoStartHold = count;
    if (room.autoStartAt == null) return null;
    room.autoStartAt = null;
    return "changed";
  }
  if (room.autoStartAt == null) {
    room.autoStartAt = now + AUTO_START_MS;
    room.autoStartCount = count;
    return "changed";
  }
  if (now >= room.autoStartAt) return "start";
  if (count > (room.autoStartCount ?? 0)) {
    room.autoStartCount = count;
    if (room.autoStartAt - now < AUTO_START_MIN_LEFT_MS) {
      room.autoStartAt = now + AUTO_START_MIN_LEFT_MS;
      return "changed";
    }
  }
  room.autoStartCount = count;
  return null;
}

/** The countdown ran out: the owner's roles when they fit, else bots and the basic roles (as "play now"). */
export function autoStart(room: Room): ActionResult {
  room.autoStartAt = null;
  room.autoStartHold = null;
  const n = room.players.length;
  if (n >= MIN_PLAYERS && totalRoles(room.settings.roleCounts) === n) {
    const dealt = assignRandom(room);
    if (dealt.ok) {
      const res = hostAction(room, { type: "start" });
      if (res.ok) return res;
    }
  }
  return hostAction(room, { type: "playNow" });
}

/**
 * What the room owner may do. Everything that would show roles (manual
 * assignment, the host's overrides, acting for others) stays with the machine.
 */
export { PLAY_NOW_PLAYERS };

export function ownerAction(room: Room, ownerId: string, action: OwnerAction): ActionResult {
  if (!isOwner(room, ownerId)) return { ok: false, error: "err.notOwner" };
  switch (action?.type) {
    case "updateSettings":
      // The machine must keep running the game and showing the narration on phones.
      return hostAction(room, { type: "updateSettings", settings: { ...(action.settings ?? {}), ...MACHINE_FORCED } });
    case "setRoleCounts":
    case "useSuggested":
    case "addBots":
    case "removeBots":
    case "newGame":
      return hostAction(room, action);
    case "transferOwner": {
      // Hand the room to another person seated here (not a bot, and online).
      const next = getPlayer(room, action.playerId);
      if (!next || next.id === ownerId || next.isBot || !next.connected) return { ok: false, error: "err.invalidTarget" };
      setOwner(room, next.id);
      return { ok: true };
    }
    case "holdAutoStart":
      if (room.phase.kind !== "lobby") return { ok: false, error: "err.wrongPhase" };
      room.autoStartAt = null;
      room.autoStartHold = onlineHumans(room).length;
      return { ok: true };
    case "kick":
      if (action.playerId === ownerId) return { ok: false, error: "err.invalidTarget" };
      return hostAction(room, action);
    case "playNow":
      // Bots, the basic roles dealt by the machine, and the game starts (see engine hostAction).
      return hostAction(room, action);
    case "start": {
      if (room.phase.kind !== "lobby") return { ok: false, error: "err.wrongPhase" };
      const total = totalRoles(room.settings.roleCounts);
      if (total !== room.players.length)
        return { ok: false, error: "err.roleCountMismatch", params: { roles: total, players: room.players.length } };
      // The machine deals the cards: nobody sees who got what.
      const dealt = assignRandom(room);
      if (!dealt.ok) return dealt;
      return hostAction(room, { type: "start" });
    }
    default:
      return { ok: false, error: "err.unknownAction" };
  }
}

/** A lobby visitor's public card (name and look only). */
export function lobbyPerson(id: string, input: unknown, account?: { id: string; avatarUrl: string | null } | null): LobbyPerson | null {
  const p = (input ?? {}) as { name?: unknown; avatar?: unknown };
  const name = sanitizeName(p.name);
  if (!name) return null;
  const avatar = typeof p.avatar === "string" && [...p.avatar].length <= 2 ? p.avatar : "🙂";
  return { id, name, avatar, avatarUrl: account?.avatarUrl ?? null, userId: account?.id ?? null };
}

export const PASSWORD_MAX = 32;
/** null when the room should be open. */
export function cleanPassword(input: unknown): string | null {
  const s = String(input ?? "").trim().slice(0, PASSWORD_MAX);
  return s || null;
}

// ---------------------------------------------------------------------------
// Leaving
// ---------------------------------------------------------------------------

/** Offline this long during a game (with `autoKickAway` on): out for good. */
export const AWAY_LIMIT_MS = 5 * 60 * 1000;

export const gameRunning = (room: Room) => !!room.game && room.phase.kind !== "lobby" && room.phase.kind !== "gameOver";

export type LeaveResult = ActionResult & {
  /** The player was taken out of the room (lobby or finished game). */
  removed?: boolean;
  /** The player gave up a running game: their stats entry (signed-in players only). */
  abandon?: GameResult | null;
};

/**
 * A player leaves. Before the game or once it is over they simply go. During
 * a game they are out for good: a bot plays their seat (same name and role)
 * and it counts as a loss for them. Someone who leaves after dying has nothing
 * left to play, so their game still counts at the end (a win if their side
 * wins). `away`: they were offline too long.
 */
export function leaveRoom(room: Room, playerId: string, reason: "left" | "away", now = Date.now()): LeaveResult {
  const p = getPlayer(room, playerId);
  if (!p || p.isBot) return { ok: false, error: "err.notInRoom" };
  const wasOwner = room.machineHost && room.ownerId === p.id;

  if (!gameRunning(room)) {
    if (reason === "away") return { ok: false, error: "err.wrongPhase" };
    if (wasOwner) room.ownerId = nextOwner(room);
    room.players = room.players.filter((x) => x.id !== p.id);
    delete room.assignment[p.id];
    log(room, "log.leave", { name: p.name });
    return { ok: true, removed: true };
  }

  const game = room.game!;
  const leftDead = !p.alive && !!p.userId;
  if (leftDead) game.leftDead = { ...game.leftDead, [p.id]: p.userId! };
  const abandon = leftDead ? null : abandonResult(room, p.id, now);
  if (wasOwner) room.ownerId = nextOwner(room);
  p.isBot = true;
  p.connected = true;
  p.userId = null;
  p.token = randomToken(); // the old phone can't come back to this seat
  room.abandoned = [...(room.abandoned ?? []), p.id];
  room.rejoinRequests = (room.rejoinRequests ?? []).filter((r) => r.playerId !== p.id);
  log(room, reason === "away" ? "log.abandonAway" : "log.abandon", { name: p.name }, true);
  return { ok: true, abandon };
}

