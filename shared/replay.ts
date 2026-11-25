// Saved games: when a game ends, its whole story (who played what, every
// night action, vote and verdict) is kept so the players can open it again
// from their match history. Pure, shared by server and client.

import type { PlayerStyle } from "./cosmetics";
import type { LogEntry, Room, RoleId, Winner } from "./types";

export interface ReplayPlayer {
  id: string;
  name: string;
  avatar: string;
  avatarUrl: string | null;
  style: PlayerStyle | null;
  isBot: boolean;
  /** The account, for the profile link (null for guests and bots). */
  userId: string | null;
  roleId: RoleId | null;
  /** The role dealt at the start, when it changed during the game (the Cursed bitten, the Wild Child turned…). */
  startRole?: RoleId;
  alive: boolean;
  lover: boolean;
}

export interface GameRecord {
  id: string;
  /** When the game ended. */
  t: number;
  /** When it started (the first night), 0 if unknown. */
  startedAt: number;
  winner: Winner;
  players: ReplayPlayer[];
  /** The full story, as everyone sees it once a game is over. */
  log: LogEntry[];
}

/** A game id: short, unguessable enough that nobody browses other games by counting. */
export function newGameId(rand: () => number = Math.random): string {
  let s = Date.now().toString(36);
  for (let i = 0; i < 10; i++) s += Math.floor(rand() * 36).toString(36);
  return s;
}

export const GAME_ID_PATTERN = /^[a-z0-9]{12,24}$/;

/** The record of a finished game (null while it is still running). */
export function gameRecord(room: Room, id: string, t = Date.now()): GameRecord | null {
  const game = room.game;
  if (!game?.winner || room.phase.kind !== "gameOver") return null;
  const lovers = new Set(game.lovers ?? []);
  const leftDead = game.leftDead ?? {};
  const log = room.log.filter((e) => e.key !== "log.join");
  return {
    id,
    t,
    startedAt: log[0]?.t ?? 0,
    winner: game.winner,
    players: room.players.map((p) => {
      const roleId = game.roles[p.id] ?? null;
      const start = game.originalRoles?.[p.id];
      return {
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        avatarUrl: p.avatarUrl ?? null,
        style: p.style ?? null,
        // A seat a player left after dying is played by a bot, but it was theirs.
        isBot: p.isBot && !leftDead[p.id],
        userId: (p.isBot ? leftDead[p.id] : p.userId) ?? null,
        roleId,
        ...(start && start !== roleId ? { startRole: start } : {}),
        alive: p.alive,
        lover: lovers.has(p.id),
      };
    }),
    log,
  };
}
