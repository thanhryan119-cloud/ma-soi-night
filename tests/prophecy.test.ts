import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, hostAction, playerAction } from "../shared/engine";
import { buildView } from "../shared/views";
import { NONE, botBets, placeBet, prophecyResult, scoreRound, winnerMultiplier } from "../shared/prophecy";
import { gameResults } from "../shared/stats";
import type { RoleId, Room } from "../shared/types";

function setupRoom(roles: RoleId[]): { room: Room; ids: string[] } {
  const room = createRoom("TEST1", "vi");
  room.settings.mandatoryVote = false;
  const ids = roles.map((_, i) => addPlayer(room, { name: `P${i + 1}` }).player!.id);
  ids.forEach((id, i) => hostAction(room, { type: "assignManual", playerId: id, roleId: roles[i] }));
  expect(hostAction(room, { type: "start" }).ok).toBe(true);
  return { room, ids };
}

const next = (room: Room) => hostAction(room, { type: "next" });
const kill = (room: Room, playerId: string) => hostAction(room, { type: "override", action: { kind: "kill", playerId } });

describe("prophecy scoring", () => {
  it("pays more for a right guess few others made, capped", () => {
    const pts = scoreRound({ a: "x", b: "y", c: "y", d: "y", e: "y" }, ["x"]);
    expect(pts).toEqual({ a: 400, b: 0, c: 0, d: 0, e: 0 });
    expect(scoreRound({ a: "x", b: "x" }, ["x"])).toEqual({ a: 100, b: 100 });
    // Eight ghosts, a lone right guess: 800 would be too much.
    const many = Object.fromEntries("abcdefgh".split("").map((k, i) => [k, i ? "y" : "x"]));
    expect(scoreRound(many, ["x"]).a).toBe(400);
  });

  it("gives half more from the third right guess in a row", () => {
    expect(scoreRound({ a: "x", b: "x" }, ["x"], { a: 2, b: 1 })).toEqual({ a: 150, b: 100 });
  });

  it("any one of several deaths counts as right", () => {
    expect(scoreRound({ a: "x", b: "z", c: NONE }, ["x", "z"])).toEqual({ a: 300, b: 300, c: 0 });
  });

  it("rewards an early winner bet", () => {
    expect([1, 2, 3, 4, 9].map(winnerMultiplier)).toEqual([3, 2, 1.5, 1, 1]);
  });
});

describe("prophecy in a game", () => {
  it("lets only the dead bet, locks when the pack has chosen and scores at dawn", () => {
    const { room, ids } = setupRoom(["werewolf", "werewolf", "villager", "villager", "villager", "villager", "villager"]);
    const [w1, w2, v1, v2, , g1, g2] = ids;
    next(room); // night 1, werewolf step
    expect(room.phase.kind).toBe("night");
    kill(room, g1);
    kill(room, g2);

    expect(placeBet(room, v1, { kind: "night", pick: v2 })).toBe("err.ghostsOnly");
    expect(placeBet(room, g1, { kind: "night", pick: v1 })).toBeNull();
    expect(placeBet(room, g2, { kind: "night", pick: v2 })).toBeNull();
    expect(placeBet(room, g2, { kind: "night", pick: g1 })).toBe("err.invalidTarget");

    // The living see nothing, the dead see the open round (no tally yet).
    expect(buildView(room, "player", v1).prophecy).toBeUndefined();
    const ghostView = buildView(room, "player", g1).prophecy!;
    expect(ghostView.canBet).toBe(true);
    expect(ghostView.rounds[0]).toMatchObject({ kind: "night", n: 1, status: "open", count: 2, mine: v1 });
    expect(ghostView.rounds[0].tally).toBeUndefined();

    playerAction(room, w1, { type: "night", targets: [v1] });
    playerAction(room, w2, { type: "night", targets: [v1] });
    expect(next(room).ok).toBe(true); // leaves the werewolf step: dawn
    expect(room.phase.kind).toBe("dawn");
    expect(room.players.find((p) => p.id === v1)!.alive).toBe(false);

    const p = room.game!.prophecy!;
    const night = p.rounds.find((r) => r.kind === "night")!;
    expect(night.status).toBe("done");
    expect(night.answer).toEqual([v1]);
    expect(p.scores[g1]).toBe(200);
    expect(p.scores[g2] ?? 0).toBe(0);
    expect(p.streaks[g1]).toBe(1);

    // The day's bets are open now; v1 just died and can bet too.
    const view = buildView(room, "player", v1).prophecy!;
    expect(view.rounds).toEqual([expect.objectContaining({ kind: "day", n: 1, status: "open" })]);
    expect(view.last).toMatchObject({ kind: "night", answer: [v1], tally: { [v1]: 1, [v2]: 1 } });
  });

  it("closes the day's bets at the nomination and scores the hanging at nightfall", () => {
    const { room, ids } = setupRoom(["werewolf", "villager", "villager", "villager", "villager", "villager"]);
    const [w1, v1, v2, v3, g1, g2] = ids;
    hostAction(room, { type: "updateSettings", settings: { wolvesMustBite: false } });
    next(room); // night 1
    next(room); // dawn (no bite)
    kill(room, g1);
    kill(room, g2);
    expect(placeBet(room, g1, { kind: "day", pick: w1 })).toBeNull();
    expect(placeBet(room, g2, { kind: "day", pick: NONE })).toBeNull();
    next(room); // discussion
    next(room); // nominate
    for (const id of [v1, v2, v3]) playerAction(room, id, { type: "vote", choice: w1 });
    playerAction(room, w1, { type: "vote", choice: v1 });
    next(room); // nomination result
    expect(placeBet(room, g2, { kind: "day", pick: w1 })).toBe("err.prophecyClosed");
    // Tomorrow night's bets are already open.
    expect(placeBet(room, g2, { kind: "night", pick: v1 })).toBeNull();
    next(room); // defense
    next(room); // verdict
    for (const id of [v1, v2, v3]) playerAction(room, id, { type: "vote", choice: "execute" });
    next(room); // verdict result: the wolf hangs, the village wins
    expect(room.game!.pendingWin).toBe("village");
    expect(hostAction(room, { type: "confirmWin" }).ok).toBe(true);
    expect(room.phase.kind).toBe("gameOver");

    const p = room.game!.prophecy!;
    expect(p.rounds.map((r) => [r.kind, r.status])).toEqual([["night", "done"], ["day", "done"]]);
    expect(p.scores[g1]).toBe(200);
    // Everyone sees the board at the end, with the Fortune Teller.
    const end = buildView(room, "player", v1).prophecy!;
    expect(end.fortuneTeller?.key).toBe(g1);
    expect(end.board.map((l) => l.key)).toEqual([g1, g2]);
    expect(buildView(room, "screen").prophecy?.fortuneTeller?.key).toBe(g1);
  });

  it("pays the winner bets with the early multiplier and records the result", () => {
    const { room, ids } = setupRoom(["werewolf", "villager", "villager", "villager", "villager", "villager"]);
    const [, , , , g1, g2] = ids;
    room.players.find((p) => p.id === g1)!.userId = "user-g1";
    next(room); // night 1
    kill(room, g1);
    kill(room, g2);
    expect(placeBet(room, g1, { kind: "winner", pick: "wolves" })).toBeNull();
    expect(placeBet(room, g1, { kind: "winner", pick: "village" })).toBe("err.prophecyPlaced");
    expect(placeBet(room, g2, { kind: "winner", pick: "village" })).toBeNull();
    hostAction(room, { type: "endGame", winner: "wolves" });
    const p = room.game!.prophecy!;
    expect(p.winnerPoints).toEqual({ [g1]: 450, [g2]: 0 });
    expect(prophecyResult(room, g1)).toEqual({ score: 450, hits: 1, rounds: 1, teller: true });
    const mine = gameResults(room).find((r) => r.userId === "user-g1")!;
    expect(mine.game.prophecy).toEqual({ score: 450, hits: 1, rounds: 1, teller: true });
  });

  it("dead bots bet by themselves, and a spectator bets under their own key", () => {
    const { room, ids } = setupRoom(["werewolf", "villager", "villager", "villager", "villager", "villager"]);
    const bot = room.players.find((p) => p.id === ids[5])!;
    bot.isBot = true;
    next(room);
    kill(room, bot.id);
    expect(botBets(room, () => 0.5)).toBe(true);
    const p = room.game!.prophecy!;
    expect(p.rounds[0].ballots[bot.id]).toBeTruthy();
    expect(p.winnerBets[bot.id]).toBeTruthy();
    expect(botBets(room)).toBe(false);

    expect(placeBet(room, "spec:abc", { kind: "night", pick: NONE }, { name: "Lan", avatar: "🦉" })).toBeNull();
    const spec = buildView(room, "spectator", null, "abc").prophecy!;
    expect(spec.rounds[0].mine).toBe(NONE);
    expect(spec.board.some((l) => l.name === "Lan")).toBe(true);
    // Without their id a spectator view carries no bets.
    expect(buildView(room, "spectator").prophecy).toBeUndefined();
  });
});
