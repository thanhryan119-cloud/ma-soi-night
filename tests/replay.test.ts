import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, hostAction } from "../shared/engine";
import { leaveRoom } from "../shared/multiplayer";
import { GAME_ID_PATTERN, gameRecord, newGameId } from "../shared/replay";
import { gameResults } from "../shared/stats";
import type { RoleId } from "../shared/types";

function startedGame(roles: RoleId[], users: (string | null)[]) {
  const room = createRoom("RPLY", "vi");
  const ids = roles.map((_, i) => addPlayer(room, { name: `P${i}`, userId: users[i] }).player!.id);
  ids.forEach((id, i) => hostAction(room, { type: "assignManual", playerId: id, roleId: roles[i] }));
  expect(hostAction(room, { type: "start" }).ok).toBe(true);
  return { room, ids };
}

describe("saved games", () => {
  it("game ids match the pattern the server accepts", () => {
    for (let i = 0; i < 20; i++) expect(newGameId()).toMatch(GAME_ID_PATTERN);
    expect("../../etc/passwd").not.toMatch(GAME_ID_PATTERN);
  });

  it("every game gets an id at the start, and there is no record until it ends", () => {
    const { room } = startedGame(["werewolf", "villager", "seer", "villager"], ["u1", null, "u3", null]);
    expect(room.game!.recordId).toMatch(GAME_ID_PATTERN);
    expect(gameRecord(room, room.game!.recordId!)).toBeNull();
  });

  it("the record has every seat with its role, lovers, changed roles and the story", () => {
    const { room, ids } = startedGame(["werewolf", "villager", "seer", "villager"], ["u1", null, "u3", null]);
    room.game!.lovers = [ids[1], ids[2]];
    hostAction(room, { type: "override", action: { kind: "changeRole", playerId: ids[3], roleId: "hunter" } });
    hostAction(room, { type: "override", action: { kind: "kill", playerId: ids[0] } });
    hostAction(room, { type: "endGame", winner: "village" });
    const id = room.game!.recordId!;
    const rec = gameRecord(room, id, 99)!;
    expect(rec).toMatchObject({ id, t: 99, winner: "village" });
    expect(rec.players.map((p) => p.roleId)).toEqual(["werewolf", "villager", "seer", "hunter"]);
    expect(rec.players.map((p) => p.userId)).toEqual(["u1", null, "u3", null]);
    expect(rec.players.map((p) => p.lover)).toEqual([false, true, true, false]);
    expect(rec.players[0].alive).toBe(false);
    expect(rec.players[3].startRole).toBe("villager");
    expect(rec.players[0].startRole).toBeUndefined();
    expect(rec.log.length).toBeGreaterThan(0);
    expect(rec.log.some((e) => e.key === "log.join")).toBe(false);
    expect(rec.startedAt).toBe(rec.log[0].t);
  });

  it("the history of everyone at the table links to the saved game", () => {
    const { room } = startedGame(["werewolf", "villager", "seer", "villager"], ["u1", "u2", "u3", null]);
    hostAction(room, { type: "endGame", winner: "wolves" });
    const res = gameResults(room);
    expect(res).toHaveLength(3);
    for (const r of res) expect(r.game.gameId).toBe(room.game!.recordId);
  });

  it("someone who leaves before the end is linked to the same game", () => {
    const { room, ids } = startedGame(["werewolf", "villager", "seer", "villager", "villager", "villager"], ["u1", "u2", "u3", "u4", "u5", "u6"]);
    const left = leaveRoom(room, ids[1], "left");
    expect(left.abandon?.game.gameId).toBe(room.game!.recordId);
  });
});
