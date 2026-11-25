import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, hostAction } from "../shared/engine";
import {
  applyResult,
  casualOf,
  gameResults,
  isRanked,
  outcomeFor,
  MIN_HUMANS_FOR_STATS,
  MIN_RANKED_GAMES,
  rankLeaderboard,
  winRate,
  RECENT_GAMES,
  type LeaderboardRow,
  type RecentGame,
} from "../shared/stats";
import type { RoleId, Winner } from "../shared/types";

function finishedGame(winner: Winner, roles: RoleId[], users: (string | null)[]) {
  const room = createRoom("STAT", "vi");
  const ids = roles.map((_, i) => addPlayer(room, { name: `P${i}`, userId: users[i] }).player!.id);
  ids.forEach((id, i) => hostAction(room, { type: "assignManual", playerId: id, roleId: roles[i] }));
  expect(hostAction(room, { type: "start" }).ok).toBe(true);
  return { room, ids, end: () => hostAction(room, { type: "endGame", winner }) };
}

const game = (over: Partial<RecentGame> = {}): RecentGame => ({
  t: 1,
  role: "villager",
  outcome: "win",
  winner: "village",
  survived: true,
  lover: false,
  players: 8,
  ...over,
});

describe("who won", () => {
  it("players win with their team, lovers win together, a draw is nobody's win", () => {
    expect(outcomeFor("wolves", "werewolf", false)).toBe("win");
    expect(outcomeFor("wolves", "seer", false)).toBe("loss");
    expect(outcomeFor("village", "hunter", false)).toBe("win");
    expect(outcomeFor("lovers", "werewolf", true)).toBe("win");
    expect(outcomeFor("lovers", "villager", false)).toBe("loss");
    expect(outcomeFor("draw", "werewolf", false)).toBe("draw");
  });
});

describe("game results", () => {
  it("only signed-in humans get a result, and only once the game is over", () => {
    const { room, ids, end } = finishedGame("wolves", ["werewolf", "villager", "villager", "seer"], ["u-wolf", "u-vil", null, "u-seer"]);
    expect(gameResults(room)).toEqual([]); // still running
    end();
    const res = gameResults(room, 42);
    expect(res.map((r) => r.userId)).toEqual(["u-wolf", "u-vil", "u-seer"]);
    expect(res[0].game).toMatchObject({ t: 42, role: "werewolf", outcome: "win", winner: "wolves", players: 4 });
    expect(res[1].game.outcome).toBe("loss");
    expect(ids).toHaveLength(4);
  });

  it(`counts a game only with at least ${MIN_HUMANS_FOR_STATS} real people (bots don't count)`, () => {
    const roles: RoleId[] = ["werewolf", "werewolf", "villager", "villager", "villager", "seer", "villager", "villager"];
    const six = finishedGame("village", roles, ["u1", null, null, null, null, null, null, null]);
    six.room.players.slice(6).forEach((p) => (p.isBot = true)); // 6 people + 2 bots
    six.end();
    expect(gameResults(six.room)[0].game).toMatchObject({ humans: 6, players: 8, counted: true });

    const five = finishedGame("village", roles, ["u1", null, null, null, null, null, null, null]);
    five.room.players.slice(5).forEach((p) => (p.isBot = true)); // 5 people + 3 bots
    five.end();
    expect(gameResults(five.room)[0].game).toMatchObject({ humans: 5, players: 8, counted: false });
  });

  it("bots never get stats", () => {
    const { room, end } = finishedGame("village", ["werewolf", "villager", "villager", "villager"], ["u1", null, null, null]);
    room.players[0].isBot = true;
    end();
    expect(gameResults(room)).toEqual([]);
  });
});

describe("career stats", () => {
  it("counts games, wins, roles, teams and streaks", () => {
    let s = applyResult(undefined, game({ role: "werewolf", winner: "wolves" }));
    s = applyResult(s, game({ role: "werewolf", winner: "wolves", survived: false }));
    s = applyResult(s, game({ role: "seer", outcome: "loss", winner: "wolves" }));
    s = applyResult(s, game({ role: "villager", outcome: "draw", winner: "draw" }));
    s = applyResult(s, game({ role: "villager", lover: true, winner: "lovers" }));
    expect(s).toMatchObject({ games: 5, wins: 3, losses: 1, draws: 1, survived: 4, streak: 1, bestStreak: 2 });
    expect(s.byRole.werewolf).toEqual({ games: 2, wins: 2 });
    expect(s.byRole.villager).toEqual({ games: 2, wins: 1 });
    expect(s.byTeam).toEqual({ wolves: { games: 2, wins: 2 }, village: { games: 3, wins: 1 }, solo: { games: 0, wins: 0 } });
    expect(s.lover).toEqual({ games: 1, wins: 1 });
    expect(winRate(s)).toBeCloseTo(0.6);
    expect(s.recent[0].lover).toBe(true);
  });

  it("keeps only the latest games in the history", () => {
    let s = applyResult(undefined, game({ t: 0 }));
    for (let i = 1; i < 25; i++) s = applyResult(s, game({ t: i }));
    expect(s.recent).toHaveLength(RECENT_GAMES);
    expect(s.recent[0].t).toBe(24);
    expect(s.games).toBe(25);
  });

  it("a game with too few real people is casual: its own totals, no standard number changes", () => {
    let s = applyResult(undefined, game({ role: "werewolf", winner: "wolves" }));
    s = applyResult(s, game({ role: "werewolf", winner: "wolves" }));
    s = applyResult(s, game({ t: 9, role: "seer", outcome: "loss", winner: "wolves", humans: 3, counted: false }));
    s = applyResult(s, game({ t: 10, role: "seer", humans: 2, counted: false }));
    expect(s).toMatchObject({ games: 2, wins: 2, losses: 0, streak: 2, bestStreak: 2, lastPlayed: 10 });
    expect(s.byRole.seer).toBeUndefined();
    expect(s.byTeam.village.games).toBe(0);
    expect(s.recent[0]).toMatchObject({ role: "seer", counted: false });
    expect(winRate(s)).toBe(1);
    expect(s.casual).toEqual({ games: 2, wins: 1, losses: 1, draws: 0, abandons: 0, byRole: { seer: { games: 2, wins: 1 } } });
    expect(winRate(casualOf(s))).toBe(0.5);
  });

  it("older records without casual totals start from the casual games still in the history", () => {
    const old = applyResult(undefined, game({ role: "werewolf", winner: "wolves" }));
    old.recent = [
      game({ role: "seer", humans: 2, counted: false }),
      game({ role: "seer", outcome: "abandon", winner: null, humans: 2, counted: false }),
      ...old.recent,
    ];
    delete old.casual;
    expect(casualOf(old)).toEqual({ games: 2, wins: 1, losses: 1, draws: 0, abandons: 1, byRole: { seer: { games: 2, wins: 1 } } });
    const next = applyResult(old, game({ role: "witch", humans: 3, counted: false }));
    expect(next.casual).toMatchObject({ games: 3, wins: 2 });
    expect(next.games).toBe(1);
  });

  it("quitting a game counts as a loss and breaks the streak", () => {
    let s = applyResult(undefined, game({ role: "werewolf", winner: "wolves" }));
    s = applyResult(s, game({ role: "seer", outcome: "abandon", winner: null, survived: false }));
    expect(s).toMatchObject({ games: 2, wins: 1, losses: 1, abandons: 1, streak: 0, bestStreak: 1, survived: 1 });
    expect(s.byRole.seer).toEqual({ games: 1, wins: 0 });
    expect(winRate(s)).toBe(0.5);
  });

  it("does not change the previous record", () => {
    const a = applyResult(undefined, game());
    applyResult(a, game());
    expect(a.games).toBe(1);
  });
});

describe("leaderboard", () => {
  const row = (name: string, games: number, wins: number, createdAt = 0): LeaderboardRow => ({
    userId: name,
    name,
    avatarUrl: null,
    style: null,
    games,
    wins,
    winRate: games ? wins / games : 0,
    wolfGames: 0,
    createdAt,
  });

  it("ranks players with enough games by win rate, then wins, then games", () => {
    const ranked = rankLeaderboard([row("half", 6, 3), row("best", 5, 5), row("half2", 10, 5), row("good", 8, 6)]);
    expect(ranked.map((r) => r.name)).toEqual(["best", "good", "half2", "half"]);
  });

  it(`needs ${MIN_RANKED_GAMES} games to be ranked: 1 win out of 1 stays below 5 out of 10`, () => {
    const ranked = rankLeaderboard([row("new", 0, 0, 3), row("lucky", 1, 1, 2), row("almost", 4, 4, 1), row("steady", 10, 5)]);
    expect(ranked.map((r) => r.name)).toEqual(["steady", "new", "lucky", "almost"]);
    expect(ranked.map(isRanked)).toEqual([true, false, false, false]);
  });
});
