import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, hostAction } from "../shared/engine";
import { PLAY_NOW_PLAYERS, makeMachineRoom, ownerAction } from "../shared/multiplayer";
import { ROLES } from "../shared/roles";

describe("play now", () => {
  it("fills with bots, deals basic roles and starts", () => {
    const room = createRoom("TEST", "vi");
    const res = addPlayer(room, { name: "Chu", avatar: "🐺", locale: "vi" });
    makeMachineRoom(room, res.player!.id);
    room.lockedRoles = ["tanner"];
    expect(ownerAction(room, res.player!.id, { type: "playNow" }).ok).toBe(true);
    expect(room.players).toHaveLength(PLAY_NOW_PLAYERS);
    expect(room.players.filter((p) => p.isBot)).toHaveLength(PLAY_NOW_PLAYERS - 1);
    expect(room.phase.kind).not.toBe("lobby");
    for (const r of Object.values(room.game!.roles)) expect(ROLES[r].advanced).toBeFalsy();
  });

  it("only works for the owner, in the lobby", () => {
    const room = createRoom("TEST", "vi");
    const a = addPlayer(room, { name: "Chu", avatar: "🐺", locale: "vi" }).player!;
    const b = addPlayer(room, { name: "Khach", avatar: "🐺", locale: "vi" }).player!;
    makeMachineRoom(room, a.id);
    expect(ownerAction(room, b.id, { type: "playNow" }).ok).toBe(false);
    expect(ownerAction(room, a.id, { type: "playNow" }).ok).toBe(true);
    expect(ownerAction(room, a.id, { type: "playNow" })).toMatchObject({ ok: false, error: "err.wrongPhase" });
  });

  it("works for a human host too, even with nobody seated yet", () => {
    const room = createRoom("TEST", "vi");
    expect(hostAction(room, { type: "playNow" }).ok).toBe(true);
    expect(room.players).toHaveLength(PLAY_NOW_PLAYERS);
    expect(room.phase.kind).not.toBe("lobby");
    for (const r of Object.values(room.game!.roles)) expect(ROLES[r].advanced).toBeFalsy();
  });
});
