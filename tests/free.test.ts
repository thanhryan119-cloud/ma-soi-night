import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, hostAction, playerAction } from "../shared/engine";
import { ROLE_IDS } from "../shared/roles";
import type { RoleId } from "../shared/types";
import { buildView } from "../shared/views";

describe("everything is free", () => {
  it("a guest wears any style, in the room and after changing it", () => {
    const room = createRoom("FREE1", "vi");
    const guest = addPlayer(room, { name: "Khách", style: { effect: "blood", frame: "moon", card: "tarot" } }).player!;
    expect(buildView(room, "screen").players[0].style).toMatchObject({ effect: "blood", frame: "moon", card: "tarot" });
    expect(playerAction(room, guest.id, { type: "updateProfile", style: { effect: "glitch" } }).ok).toBe(true);
    expect(buildView(room, "host").players[0].style.effect).toBe("glitch");
  });

  it("any room may use every role, special ones included", () => {
    const room = createRoom("FREE2", "vi");
    const p = addPlayer(room, { name: "Lan" }).player!;
    // A room saved before the change may still carry an old lock list: it is ignored.
    (room as { lockedRoles?: string[] }).lockedRoles = ["tanner"];
    expect(hostAction(room, { type: "assignManual", playerId: p.id, roleId: "tanner" }).ok).toBe(true);
    expect(JSON.stringify(buildView(room, "host"))).not.toContain("lockedRoles");
    const counts = Object.fromEntries(ROLE_IDS.map((r) => [r, 0])) as Record<RoleId, number>;
    expect(hostAction(room, { type: "setRoleCounts", roleCounts: { ...counts, tanner: 1 } }).ok).toBe(true);
  });
});
