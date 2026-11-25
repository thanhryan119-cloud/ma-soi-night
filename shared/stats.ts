// Career stats for signed-in players (pure, shared by server and client).
// One record per account, updated once when a game ends. Guests and bots
// have no stats: only a Google account gives a player a lasting identity.

import { SOLO_ROLES, teamOf } from "./roles";
import type { PlayerStyle } from "./cosmetics";
import type { Room, RoleId, Team, Winner } from "./types";

/** "abandon": left the game (or was away too long) before it ended: a loss. */
export type Outcome = "win" | "loss" | "draw" | "abandon";

export interface WinCount {
  games: number;
  wins: number;
}

export interface RecentGame {
  t: number;
  role: RoleId;
  outcome: Outcome;
  /** null: the player left before the end. */
  winner: Winner | null;
  survived: boolean;
  lover: boolean;
  players: number;
  /** Real people at the table (not bots). Missing on games recorded before this was tracked. */
  humans?: number;
  /** false: too few real people, so a casual game (casual totals only, not standard or the leaderboard). */
  counted?: boolean;
}

/** Games with fewer than MIN_HUMANS_FOR_STATS real people: their own win rate, apart from standard. */
export interface CasualStats {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  abandons: number;
  byRole: Partial<Record<RoleId, WinCount>>;
}

/**
 * The top-level numbers are the standard ones (games with at least
 * MIN_HUMANS_FOR_STATS real people): win rate, streaks, leaderboard, quests.
 * Every other game lands in `casual`.
 */
export interface UserStats {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  /** Games left before the end (also counted in `losses`). Missing on older records. */
  abandons?: number;
  /** Games the player was still alive at the end. */
  survived: number;
  byRole: Partial<Record<RoleId, WinCount>>;
  byTeam: Record<Team, WinCount>;
  /** Games as one of Cupid's lovers. */
  lover: WinCount;
  /** Current run of wins in a row. */
  streak: number;
  bestStreak: number;
  lastPlayed: number;
  /** Newest first. */
  recent: RecentGame[];
  /** Missing on records made before casual games were counted (see casualOf). */
  casual?: CasualStats;
}

/** What anyone may see of a player: their look, and their stats when they have an account. */
export interface PublicProfile {
  userId: string | null;
  name: string;
  avatar: string;
  avatarUrl: string | null;
  style: PlayerStyle | null;
  isBot: boolean;
  memberSince: number | null;
  stats: UserStats | null;
}

/** One mode's numbers on the leaderboard. */
export interface LeaderboardLine {
  games: number;
  wins: number;
  winRate: number;
  wolfGames: number;
}

export type StatsMode = "casual" | "standard";

/** The top-level numbers are standard; `casual` holds the casual ones. */
export interface LeaderboardRow extends LeaderboardLine {
  userId: string;
  name: string;
  avatarUrl: string | null;
  style: PlayerStyle | null;
  /** Missing from servers older than casual stats. */
  casual?: LeaderboardLine;
  /** When the account was made (ms), so the newest unranked accounts show first. */
  createdAt: number;
}

const NO_LINE: LeaderboardLine = { games: 0, wins: 0, winRate: 0, wolfGames: 0 };

/** A row's numbers in one mode. */
export const lineOf = (r: LeaderboardRow, mode: StatsMode): LeaderboardLine =>
  mode === "casual" ? (r.casual ?? NO_LINE) : r;

export const RECENT_GAMES = 10;
/** A game counts toward the numbers (games, wins, win rate, roles…) only with this many real people. */
export const MIN_HUMANS_FOR_STATS = 6;

export function emptyStats(): UserStats {
  return {
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    abandons: 0,
    survived: 0,
    byRole: {},
    byTeam: { wolves: { games: 0, wins: 0 }, village: { games: 0, wins: 0 }, solo: { games: 0, wins: 0 } },
    lover: { games: 0, wins: 0 },
    streak: 0,
    bestStreak: 0,
    lastPlayed: 0,
    recent: [],
  };
}

/** 0..1, or 0 when no game was played. */
export const winRate = (s: Pick<WinCount, "games" | "wins">) => (s.games ? s.wins / s.games : 0);

/**
 * Did this player win? Lovers win together, a solo role wins alone, everyone
 * else wins with their team (by their final role).
 */
export function outcomeFor(winner: Winner, role: RoleId, lover: boolean): Outcome {
  if (winner === "draw") return "draw";
  if (winner === "lovers") return lover ? "win" : "loss";
  if ((SOLO_ROLES as readonly string[]).includes(winner)) return role === winner ? "win" : "loss";
  const team: Team = teamOf(role);
  return winner === team ? "win" : "loss";
}

export interface GameResult {
  userId: string;
  game: RecentGame;
}

/** One result per signed-in human in a finished game (none while the game is still running). */
export function gameResults(room: Room, t = Date.now()): GameResult[] {
  const game = room.game;
  if (!game?.winner || room.phase.kind !== "gameOver") return [];
  const winner = game.winner;
  const lovers = new Set(game.lovers ?? []);
  const leftDead = game.leftDead ?? {};
  const humans = room.players.filter((p) => !p.isBot || leftDead[p.id]).length;
  const counted = humans >= MIN_HUMANS_FOR_STATS;
  const seen = new Set<string>();
  const out: GameResult[] = [];
  for (const p of room.players) {
    const role = game.roles[p.id];
    // A player who left after dying: a bot sits in the seat, the result is still theirs.
    const userId = p.isBot ? leftDead[p.id] : p.userId;
    if (!userId || !role || seen.has(userId)) continue;
    seen.add(userId);
    const lover = lovers.has(p.id);
    out.push({
      userId,
      game: {
        t,
        role,
        outcome: outcomeFor(winner, role, lover),
        winner,
        survived: p.alive,
        lover,
        players: room.players.length,
        humans,
        counted,
      },
    });
  }
  return out;
}

/** The result of a player who leaves a running game (signed-in humans only). */
export function abandonResult(room: Room, playerId: string, t = Date.now()): GameResult | null {
  const game = room.game;
  const p = room.players.find((x) => x.id === playerId);
  const role = game?.roles[playerId];
  if (!game || !p || p.isBot || !p.userId || !role) return null;
  const humans = room.players.filter((x) => !x.isBot).length;
  return {
    userId: p.userId,
    game: {
      t,
      role,
      outcome: "abandon",
      winner: null,
      survived: false,
      lover: !!game.lovers?.includes(playerId),
      players: room.players.length,
      humans,
      counted: humans >= MIN_HUMANS_FOR_STATS,
    },
  };
}

const bump = (c: WinCount | undefined, won: boolean): WinCount => ({
  games: (c?.games ?? 0) + 1,
  wins: (c?.wins ?? 0) + (won ? 1 : 0),
});

export const emptyCasual = (): CasualStats => ({ games: 0, wins: 0, losses: 0, draws: 0, abandons: 0, byRole: {} });

function addCasual(c: CasualStats, g: RecentGame) {
  const won = g.outcome === "win";
  c.games++;
  if (won) c.wins++;
  else if (g.outcome === "draw") c.draws++;
  else c.losses++;
  if (g.outcome === "abandon") c.abandons++;
  c.byRole[g.role] = bump(c.byRole[g.role], won);
}

/**
 * A player's casual numbers. Records made before casual games were counted
 * have none, so they start from the casual games still in the recent history.
 */
export function casualOf(s: UserStats | null | undefined): CasualStats {
  if (s?.casual) return s.casual;
  const c = emptyCasual();
  for (const g of s?.recent ?? []) if (g.counted === false) addCasual(c, g);
  return c;
}

/** Adds one finished game to a player's stats (returns a new object). */
export function applyResult(prev: UserStats | undefined, g: RecentGame): UserStats {
  const s = prev ? structuredClone(prev) : emptyStats();
  s.casual = casualOf(s);
  s.lastPlayed = g.t;
  s.recent = [g, ...s.recent].slice(0, RECENT_GAMES);
  // Too few real people: a casual game, kept apart from the standard numbers (and the streak).
  if (g.counted === false) {
    addCasual(s.casual, g);
    return s;
  }
  const won = g.outcome === "win";
  s.games++;
  if (won) s.wins++;
  else if (g.outcome === "draw") s.draws++;
  else s.losses++;
  if (g.outcome === "abandon") s.abandons = (s.abandons ?? 0) + 1;
  if (g.survived) s.survived++;
  s.byRole[g.role] = bump(s.byRole[g.role], won);
  const team: Team = teamOf(g.role);
  s.byTeam[team] = bump(s.byTeam[team], won);
  if (g.lover) s.lover = bump(s.lover, won);
  s.streak = won ? s.streak + 1 : 0;
  s.bestStreak = Math.max(s.bestStreak, s.streak);
  return s;
}

/** Games needed before a win rate counts on the leaderboard (1 win out of 1 is not 100%). */
export const MIN_RANKED_GAMES = 5;

/** Enough games in that mode (pass a row's line, or a row for standard). */
export const isRanked = (r: Pick<LeaderboardLine, "games">) => r.games >= MIN_RANKED_GAMES;

/**
 * In one mode (standard by default), accounts with at least MIN_RANKED_GAMES games come first, by win rate; on a
 * tie, more wins first, then more games, then name. Below them, every other
 * account, newest first.
 */
export function rankLeaderboard(rows: LeaderboardRow[], mode: StatsMode = "standard"): LeaderboardRow[] {
  return [...rows].sort((ra, rb) => {
    const a = lineOf(ra, mode);
    const b = lineOf(rb, mode);
    const ranked = Number(isRanked(b)) - Number(isRanked(a));
    if (ranked) return ranked;
    if (!isRanked(a)) return rb.createdAt - ra.createdAt || ra.name.localeCompare(rb.name);
    return b.winRate - a.winRate || b.wins - a.wins || b.games - a.games || ra.name.localeCompare(rb.name);
  });
}
