import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, playerAction } from "../shared/engine";

describe("changing your own name", () => {
  const setup = () => {
    const room = createRoom("TEST", "vi");
    addPlayer(room, { name: "Khach", avatar: "🐺", locale: "vi" });
    addPlayer(room, { name: "Ban", avatar: "🐺", locale: "vi" });
    room.players[1].userId = "user-1";
    return room;
  };

  it("needs a signed-in account", () => {
    const room = setup();
    const [guest, member] = room.players;
    expect(playerAction(room, guest.id, { type: "updateProfile", name: "Ten moi" })).toMatchObject({ ok: false, error: "err.signInToRename" });
    expect(guest.name).toBe("Khach");
    expect(playerAction(room, member.id, { type: "updateProfile", name: "Ten moi" }).ok).toBe(true);
    expect(member.name).toBe("Ten moi");
  });

  it("still lets a guest update the look with the same name", () => {
    const room = setup();
    const guest = room.players[0];
    expect(playerAction(room, guest.id, { type: "updateProfile", name: "Khach", avatar: guest.avatar }).ok).toBe(true);
  });
});
