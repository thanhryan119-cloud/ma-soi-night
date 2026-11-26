import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, hostAction } from "../shared/engine";
import { makeMachineRoom, ownerAction } from "../shared/multiplayer";

const setup = () => {
  const room = createRoom("TEST", "vi");
  const a = addPlayer(room, { name: "Chu", avatar: "🐺", locale: "vi" }).player!;
  const b = addPlayer(room, { name: "Ban", avatar: "🐺", locale: "vi" }).player!;
  a.connected = b.connected = true;
  a.userId = "u-a";
  b.userId = "u-b";
  makeMachineRoom(room, a.id);
  room.creatorId = "u-a";
  hostAction(room, { type: "addBots", count: 1 });
  return { room, a, b, bot: room.players.find((p) => p.isBot)! };
};

describe("changing the room owner", () => {
  it("hands the room to another person", () => {
    const { room, a, b } = setup();
    expect(ownerAction(room, a.id, { type: "transferOwner", playerId: b.id }).ok).toBe(true);
    expect(room.ownerId).toBe(b.id);
    expect(room.creatorId).toBe("u-b");
    // The old owner can no longer set the room up; the new one can.
    expect(ownerAction(room, a.id, { type: "addBots", count: 1 }).ok).toBe(false);
    expect(ownerAction(room, b.id, { type: "addBots", count: 1 }).ok).toBe(true);
  });

  it("refuses bots, people offline and non-owners", () => {
    const { room, a, b, bot } = setup();
    expect(ownerAction(room, a.id, { type: "transferOwner", playerId: bot.id }).ok).toBe(false);
    expect(ownerAction(room, b.id, { type: "transferOwner", playerId: b.id }).ok).toBe(false);
    b.connected = false;
    expect(ownerAction(room, a.id, { type: "transferOwner", playerId: b.id }).ok).toBe(false);
    expect(room.ownerId).toBe(a.id);
  });
});
