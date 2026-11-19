import { describe, expect, it } from "vitest";
import { addPlayer, autoReady, createRoom, hostAction, playerAction } from "../shared/engine";
import { botChatLine, newBotChatMemory, truthChance } from "../shared/botChat";
import type { RoleId, Room } from "../shared/types";

function setup(roles: RoleId[]): { room: Room; ids: string[] } {
  const room = createRoom("CHAT1", "vi");
  const ids = roles.map((_, i) => addPlayer(room, { name: `P${i + 1}` }).player!.id);
  ids.forEach((id, i) => hostAction(room, { type: "assignManual", playerId: id, roleId: roles[i] }));
  expect(hostAction(room, { type: "start" }).ok).toBe(true);
  return { room, ids };
}

describe("bot chat honesty", () => {
  it("wolves tell the truth 20–40% of the time, the village 80–100%", () => {
    const { room, ids } = setup(["werewolf", "werewolf", "seer", "villager", "villager", "bodyguard"]);
    for (const id of ids.slice(0, 2)) {
      const p = truthChance(room, id);
      expect(p).toBeGreaterThanOrEqual(0.2);
      expect(p).toBeLessThanOrEqual(0.4);
    }
    for (const id of ids.slice(2)) {
      const p = truthChance(room, id);
      expect(p).toBeGreaterThanOrEqual(0.8);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it("an honest seer reports its real result; a lying wolf never accuses its packmate", () => {
    const { room, ids } = setup(["werewolf", "werewolf", "seer", "villager", "villager"]);
    room.game!.seerResults[ids[2]] = [{ night: 1, targetId: ids[0], isWolf: true }];
    const seer = room.players[2];
    const mem = newBotChatMemory();
    const line = botChatLine(room, seer, mem, () => 0); // rnd 0 → honest, shares the result
    expect(line).toContain("P1");
    expect(line).toContain("là Sói");

    const wolf = room.players[0];
    for (let i = 0; i < 200; i++) {
      const m = newBotChatMemory();
      const text = botChatLine(room, wolf, m) ?? "";
      if (/Treo|vote|là Sói!/.test(text)) expect(text).not.toContain("P2");
    }
  });
});

describe("auto narrator readiness", () => {
  it("is ready once the night role has acted", () => {
    const { room, ids } = setup(["werewolf", "seer", "villager", "villager"]);
    hostAction(room, { type: "next" }); // role reveal → night
    while (room.phase.kind === "night" && room.phase.steps[room.phase.stepIndex] !== "seer") {
      if (room.phase.steps[room.phase.stepIndex] === "werewolf") playerAction(room, ids[0], { type: "night", targets: [ids[2]] });
      hostAction(room, { type: "next" });
    }
    expect(room.phase.steps[room.phase.stepIndex]).toBe("seer");
    expect(autoReady(room)).toBe(false);
    expect(playerAction(room, ids[1], { type: "night", targets: [ids[0]] }).ok).toBe(true);
    expect(autoReady(room)).toBe(true);
  });
});
