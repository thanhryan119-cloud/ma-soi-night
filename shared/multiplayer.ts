// Online play (pure, shared by server and client): the lobby's room list, and
// machine-host rooms where the machine narrates and a player (the room owner)
// sets the room up without ever seeing anyone's role.

import { MAX_PLAYERS, assignRandom, getPlayer, hostAction, log, randomToken, sanitizeName } from "./engine";
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
  // Online play: someone gone for 5 minutes is out (the owner can turn it off).
  room.settings = { ...room.settings, autoKickAway: true, ...MACHINE_FORCED };
}

export const isOwner = (room: Room, playerId: string | null | undefined) =>
  !!room.machineHost && !!playerId && room.ownerId === playerId;

/** The next owner when the current one is gone: the longest-seated human who is online. */
export function nextOwner(room: Room): string | null {
  const humans = room.players.filter((p) => !p.isBot && p.connected && p.id !== room.ownerId);
  humans.sort((a, b) => a.joinedAt - b.joinedAt);
  return humans[0]?.id ?? null;
}

/**
 * What the room owner may do. Everything that would show roles (manual
 * assignment, the host's overrides, acting for others) stays with the machine.
 */
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
    case "kick":
      if (action.playerId === ownerId) return { ok: false, error: "err.invalidTarget" };
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
 * and it counts as a loss for them. `away`: they were offline too long.
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

  const abandon = abandonResult(room, p.id, now);
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

