// The Ghosts' Prophecy (Sổ Tiên Tri Hồn Ma): while the living play, the dead
// and the spectators bet on what happens next. Who dies tonight, who goes to
// the gallows today, which side wins. A right guess few others made scores
// big, three right in a row scores more, and the best ghost of the game is
// named the Underworld Fortune Teller at the end. Pure, shared by server and client.

import type { Game, Room, Winner } from "./types";

export type RoundKind = "night" | "day";
export type BetKind = RoundKind | "winner";
/** "Nobody dies" / "nobody is hanged". */
export const NONE = "none";
export const WINNER_PICKS = ["village", "wolves", "other"] as const;
export type WinnerPick = (typeof WINNER_PICKS)[number];
export const SPECTATOR_KEY = "spec:";

/** Points for a right guess: 100 × ghosts in the round ÷ ghosts with the same pick, at most this. */
export const MAX_ROUND_POINTS = 400;
/** Right guesses in a row from which points are worth half more. */
export const STREAK_FROM = 3;
export const STREAK_BONUS = 1.5;
/** Points for the right winning side, before the early-bet multiplier. */
export const WINNER_POINTS = 150;

export interface ProphecyRound {
  kind: RoundKind;
  /** The night or day it is about. */
  n: number;
  /** open: ghosts can bet · locked: no more bets, waiting for the answer · done: scored. */
  status: "open" | "locked" | "done";
  /** Ghost key (a player id, or SPECTATOR_KEY + a spectator id) to a player id or NONE. */
  ballots: Record<string, string>;
  /** Picks that came true (every player who died, or NONE). */
  answer?: string[];
  /** Points each ghost who bet won this round (0 for a miss). */
  points?: Record<string, number>;
}

export interface ProphecyState {
  rounds: ProphecyRound[];
  winnerBets: Record<string, { pick: WinnerPick; day: number }>;
  /** Set when the game ends. */
  winnerPoints?: Record<string, number>;
  scores: Record<string, number>;
  hits: Record<string, number>;
  /** Rounds each ghost bet in (the winner bet not counted). */
  played: Record<string, number>;
  streaks: Record<string, number>;
  /** Spectators are not seated: their name and face travel with their bets. */
  spectators: Record<string, { name: string; avatar: string }>;
  /** Rounds already told in the dead players' chat (server side). */
  announced?: number;
  /** The Fortune Teller was named in the dead players' chat (server side). */
  tellerTold?: boolean;
}

export const emptyProphecy = (): ProphecyState => ({
  rounds: [],
  winnerBets: {},
  scores: {},
  hits: {},
  played: {},
  streaks: {},
  spectators: {},
});

const of = (game: Game) => (game.prophecy ??= emptyProphecy());
const running = (room: Room) => !!room.game && room.phase.kind !== "lobby" && room.phase.kind !== "gameOver";
const isSpectatorKey = (key: string) => key.startsWith(SPECTATOR_KEY);

/** A dead player in a running game, or a spectator: may bet. */
export function isGhost(room: Room, key: string): boolean {
  if (!running(room)) return false;
  if (isSpectatorKey(key)) return true;
  const p = room.players.find((x) => x.id === key);
  return !!p && !p.alive;
}

/** The side a game's winner counts as. */
export function winnerGroup(w: Winner): WinnerPick {
  return w === "village" || w === "wolves" ? w : "other";
}

/** The earlier the winner bet, the more it is worth: x3 by day 1, x2 on day 2, x1.5 on day 3, then x1. */
export function winnerMultiplier(day: number): number {
  return day <= 1 ? 3 : day === 2 ? 2 : day === 3 ? 1.5 : 1;
}

const findRound = (p: ProphecyState, kind: RoundKind, status: ProphecyRound["status"][]) =>
  p.rounds.find((r) => r.kind === kind && status.includes(r.status));

/** Opens the bets on a night or a day (no-op if that one is already there). */
export function openRound(room: Room, kind: RoundKind, n: number) {
  if (!room.game) return;
  const p = of(room.game);
  if (p.rounds.some((r) => r.kind === kind && r.n === n)) return;
  p.rounds.push({ kind, n, status: "open", ballots: {} });
}

/** No more bets on the open round of that kind. */
export function lockRound(room: Room, kind: RoundKind) {
  const r = room.game?.prophecy && findRound(room.game.prophecy, kind, ["open"]);
  if (r) r.status = "locked";
}

/** Scores the pending round of that kind with who died (an empty list: nobody). */
export function resolveRound(room: Room, kind: RoundKind, died: string[]): ProphecyRound | null {
  const p = room.game?.prophecy;
  const r = p && findRound(p, kind, ["open", "locked"]);
  if (!p || !r) return null;
  r.status = "done";
  r.answer = died.length ? [...new Set(died)] : [NONE];
  r.points = scoreRound(r.ballots, r.answer, p.streaks);
  for (const [key, pts] of Object.entries(r.points)) {
    p.played[key] = (p.played[key] ?? 0) + 1;
    if (pts > 0) {
      p.hits[key] = (p.hits[key] ?? 0) + 1;
      p.streaks[key] = (p.streaks[key] ?? 0) + 1;
      p.scores[key] = (p.scores[key] ?? 0) + pts;
    } else p.streaks[key] = 0;
  }
  return r;
}

/**
 * Points per ghost who bet. A right pick is worth 100 × everyone who bet ÷ those
 * who made that same pick (a lone right guess among five: 400). From the third
 * right guess in a row, half more. `streaks` is read before this round counts.
 */
export function scoreRound(ballots: Record<string, string>, answer: string[], streaks: Record<string, number> = {}): Record<string, number> {
  const keys = Object.keys(ballots);
  const same: Record<string, number> = {};
  for (const pick of Object.values(ballots)) same[pick] = (same[pick] ?? 0) + 1;
  const out: Record<string, number> = {};
  for (const key of keys) {
    const pick = ballots[key];
    if (!answer.includes(pick)) {
      out[key] = 0;
      continue;
    }
    let pts = Math.min(MAX_ROUND_POINTS, Math.round((100 * keys.length) / same[pick]));
    if ((streaks[key] ?? 0) + 1 >= STREAK_FROM) pts = Math.round(pts * STREAK_BONUS);
    out[key] = pts;
  }
  return out;
}

/** Players hanged by the village today (a revealed Idiot lives, so he is not one). */
export function hangedToday(game: Game): string[] {
  return game.verdicts.filter((v) => v.executed && !v.idiotRevealed).map((v) => v.nomineeId);
}

/** The game is over: the day's bets are scored, an unfinished night dropped, the winner bets paid. */
export function finishProphecy(room: Room, winner: Winner) {
  const game = room.game;
  if (!game?.prophecy) return;
  const p = game.prophecy;
  const k = room.phase.kind;
  const dayOpen = findRound(p, "day", ["open", "locked"]);
  if (dayOpen && k !== "night") resolveRound(room, "day", hangedToday(game));
  p.rounds = p.rounds.filter((r) => r.status === "done");
  const group = winnerGroup(winner);
  p.winnerPoints = {};
  for (const [key, bet] of Object.entries(p.winnerBets)) {
    const pts = bet.pick === group ? Math.round(WINNER_POINTS * winnerMultiplier(bet.day)) : 0;
    p.winnerPoints[key] = pts;
    if (pts) p.scores[key] = (p.scores[key] ?? 0) + pts;
  }
}

export interface BetInput {
  kind: BetKind;
  pick: string;
}

/** Places (or changes, while the round is open) a ghost's bet. null when it went in, otherwise an i18n error key. */
export function placeBet(room: Room, key: string, bet: BetInput, spectator?: { name: string; avatar: string }): string | null {
  const game = room.game;
  if (!game || !running(room)) return "err.wrongPhase";
  if (!isGhost(room, key)) return "err.ghostsOnly";
  const p = of(game);
  const pick = String(bet?.pick ?? "");
  if (bet?.kind === "winner") {
    if (!(WINNER_PICKS as readonly string[]).includes(pick)) return "err.invalidTarget";
    if (p.winnerBets[key]) return "err.prophecyPlaced";
    p.winnerBets[key] = { pick: pick as WinnerPick, day: Math.max(1, room.phase.day) };
  } else if (bet?.kind === "night" || bet?.kind === "day") {
    const r = findRound(p, bet.kind, ["open"]);
    if (!r) return "err.prophecyClosed";
    const target = room.players.find((x) => x.id === pick);
    if (pick !== NONE && !target?.alive) return "err.invalidTarget";
    r.ballots[key] = pick;
  } else return "err.unknownAction";
  if (spectator && isSpectatorKey(key)) p.spectators[key] = { name: spectator.name, avatar: spectator.avatar };
  return null;
}

export interface BoardLine {
  key: string;
  /** Set for a seated player. */
  playerId?: string;
  name: string;
  avatar: string;
  score: number;
  hits: number;
  played: number;
}

/** Every ghost who bet, best score first (more right guesses, then name, break a tie). Once the game is over, the winner bet counts as a guess too. */
export function board(room: Room): BoardLine[] {
  const p = room.game?.prophecy;
  if (!p) return [];
  const keys = new Set<string>([
    ...Object.keys(p.played),
    ...Object.keys(p.winnerBets),
    ...p.rounds.flatMap((r) => Object.keys(r.ballots)),
  ]);
  return [...keys]
    .map((key) => {
      const pl = room.players.find((x) => x.id === key);
      const sp = p.spectators[key];
      return {
        key,
        ...(pl ? { playerId: pl.id } : {}),
        name: pl?.name ?? sp?.name ?? "?",
        avatar: pl?.avatar ?? sp?.avatar ?? "👁️",
        score: p.scores[key] ?? 0,
        hits: (p.hits[key] ?? 0) + (p.winnerPoints?.[key] ? 1 : 0),
        played: (p.played[key] ?? 0) + (p.winnerPoints && key in p.winnerBets ? 1 : 0),
      };
    })
    .sort((a, b) => b.score - a.score || b.hits - a.hits || a.name.localeCompare(b.name));
}

/** The Underworld Fortune Teller: the top ghost of a finished game, with points to show for it. */
export function fortuneTeller(room: Room): BoardLine | null {
  if (room.phase.kind !== "gameOver") return null;
  const top = board(room)[0];
  return top && top.score > 0 ? top : null;
}

/** A dead bot's bet: it knows the roles, so at night it bets on someone who is not a wolf. */
export function botPick(room: Room, kind: BetKind, rnd: () => number = Math.random): string {
  const game = room.game!;
  const alive = room.players.filter((p) => p.alive);
  const pickOf = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  if (kind === "winner") return rnd() < 0.15 ? "other" : rnd() < 0.5 ? "village" : "wolves";
  if (!alive.length || rnd() < 0.15) return NONE;
  if (kind === "night") {
    const prey = alive.filter((p) => game.roles[p.id] !== "werewolf");
    return (pickOf(prey.length ? prey : alive)).id;
  }
  return pickOf(alive).id;
}

/** Dead bots who have not bet yet place their bets (returns true when any did). */
export function botBets(room: Room, rnd: () => number = Math.random): boolean {
  const game = room.game;
  if (!game || !running(room)) return false;
  const p = of(game);
  let changed = false;
  for (const bot of room.players.filter((x) => x.isBot && !x.alive)) {
    for (const r of p.rounds) {
      if (r.status !== "open" || r.ballots[bot.id]) continue;
      r.ballots[bot.id] = botPick(room, r.kind, rnd);
      changed = true;
    }
    if (!p.winnerBets[bot.id]) {
      p.winnerBets[bot.id] = { pick: botPick(room, "winner", rnd) as WinnerPick, day: Math.max(1, room.phase.day) };
      changed = true;
    }
  }
  return changed;
}

// ------------------------------------------------------------------ view --

export interface ProphecyRoundView {
  kind: RoundKind;
  n: number;
  status: ProphecyRound["status"];
  /** How many ghosts bet. */
  count: number;
  mine: string | null;
  /** How the bets went (once the round is locked: no copying while it is open). */
  tally?: Record<string, number>;
  answer?: string[];
  myPoints?: number;
  /** Ghosts who guessed right and what they won (done rounds). */
  winners?: { key: string; points: number }[];
}

export interface ProphecyView {
  /** This viewer may bet now. */
  canBet: boolean;
  /** Open and locked rounds, then the last scored one. */
  rounds: ProphecyRoundView[];
  last: ProphecyRoundView | null;
  myWinner: { pick: WinnerPick; day: number } | null;
  /** What a winner bet placed now would be multiplied by. */
  winnerMultiplier: number;
  me: { score: number; hits: number; played: number; streak: number } | null;
  board: BoardLine[];
  /** Set when the game is over. */
  fortuneTeller?: BoardLine | null;
  winnerBets?: Record<string, { pick: WinnerPick; day: number; points: number }>;
  winner?: WinnerPick;
  /** What this viewer's winner bet paid (set when the game is over). */
  myWinnerPoints?: number;
}

function roundView(r: ProphecyRound, key: string | null): ProphecyRoundView {
  const v: ProphecyRoundView = { kind: r.kind, n: r.n, status: r.status, count: Object.keys(r.ballots).length, mine: key ? (r.ballots[key] ?? null) : null };
  if (r.status !== "open") {
    v.tally = {};
    for (const pick of Object.values(r.ballots)) v.tally[pick] = (v.tally[pick] ?? 0) + 1;
  }
  if (r.status === "done") {
    v.answer = r.answer;
    if (key && r.points && key in r.points) v.myPoints = r.points[key];
    v.winners = Object.entries(r.points ?? {})
      .filter(([, pts]) => pts > 0)
      .map(([k, points]) => ({ key: k, points }))
      .sort((a, b) => b.points - a.points);
  }
  return v;
}

/**
 * What a viewer sees of the prophecy. The living see nothing while the game
 * runs (the bets of the dead would give the roles away); the dead, the
 * spectators and the host see it all; everyone sees it once the game is over.
 */
export function prophecyView(room: Room, opts: { key: string | null; host?: boolean }): ProphecyView | undefined {
  const game = room.game;
  if (!game || room.phase.kind === "lobby") return undefined;
  const over = room.phase.kind === "gameOver";
  const key = opts.key;
  const ghost = !!key && isGhost(room, key);
  if (!over && !ghost && !opts.host) return undefined;
  const p = game.prophecy ?? emptyProphecy();
  const done = p.rounds.filter((r) => r.status === "done");
  const lastDone = done[done.length - 1];
  const view: ProphecyView = {
    canBet: ghost,
    rounds: p.rounds.filter((r) => r.status !== "done").map((r) => roundView(r, key)),
    last: lastDone ? roundView(lastDone, key) : null,
    myWinner: key ? (p.winnerBets[key] ?? null) : null,
    winnerMultiplier: winnerMultiplier(Math.max(1, room.phase.day)),
    me: key && (ghost || key in p.played || key in p.winnerBets)
      ? { score: p.scores[key] ?? 0, hits: p.hits[key] ?? 0, played: p.played[key] ?? 0, streak: p.streaks[key] ?? 0 }
      : null,
    board: board(room),
  };
  if (over) {
    view.fortuneTeller = fortuneTeller(room);
    view.winnerBets = Object.fromEntries(
      Object.entries(p.winnerBets).map(([k, b]) => [k, { ...b, points: p.winnerPoints?.[k] ?? 0 }]),
    );
    if (game.winner) view.winner = winnerGroup(game.winner);
    if (key && p.winnerPoints && key in p.winnerPoints) view.myWinnerPoints = p.winnerPoints[key];
  }
  return view;
}

/** One player's prophecy in a finished game, for their career stats. */
export function prophecyResult(room: Room, playerId: string): { score: number; hits: number; rounds: number; teller: boolean } | undefined {
  const p = room.game?.prophecy;
  if (!p || !(playerId in p.played || playerId in p.winnerBets)) return undefined;
  const winnerHit = (p.winnerPoints?.[playerId] ?? 0) > 0;
  return {
    score: p.scores[playerId] ?? 0,
    hits: (p.hits[playerId] ?? 0) + (winnerHit ? 1 : 0),
    rounds: (p.played[playerId] ?? 0) + (playerId in p.winnerBets ? 1 : 0),
    teller: fortuneTeller(room)?.key === playerId,
  };
}
