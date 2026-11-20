import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, hostAction } from "../shared/engine";
import {
  cleanPassword,
  lobbyPerson,
  makeMachineRoom,
  nextOwner,
  ownerAction,
  roomSummary,
  sortRooms,
  type RoomSummary,
} from "../shared/multiplayer";
import { buildView } from "../shared/views";
import { checkPassword, hashPassword } from "../server/lobby";

function machineRoom(humans = 4) {
  const room = createRoom("MCH1", "vi");
  const ids = Array.from({ length: humans }, (_, i) => {
    const p = addPlayer(room, { name: `P${i}` }).player!;
    p.connected = true;
    return p.id;
  });
  makeMachineRoom(room, ids[0]);
  return { room, owner: ids[0], ids };
}

describe("machine-host rooms", () => {
  it("the machine always narrates and every phone shows the narration", () => {
    const { room, owner } = machineRoom();
    expect(room.settings.autoAdvance).toBe(true);
    expect(room.settings.noScreen).toBe(true);
    expect(ownerAction(room, owner, { type: "updateSettings", settings: { autoAdvance: false, noScreen: false, discussionSeconds: 90 } }).ok).toBe(true);
    expect(room.settings).toMatchObject({ autoAdvance: true, noScreen: true, discussionSeconds: 90 });
  });

  it("only the owner can set the room up", () => {
    const { room, ids } = machineRoom();
    expect(ownerAction(room, ids[1], { type: "addBots", count: 1 })).toMatchObject({ ok: false, error: "err.notOwner" });
    expect(room.players).toHaveLength(4);
  });

  it("the owner can't kick themself, but can kick others and manage bots", () => {
    const { room, owner, ids } = machineRoom();
    expect(ownerAction(room, owner, { type: "kick", playerId: owner }).ok).toBe(false);
    expect(ownerAction(room, owner, { type: "kick", playerId: ids[3] }).ok).toBe(true);
    expect(ownerAction(room, owner, { type: "addBots", count: 5 }).ok).toBe(true);
    expect(room.players).toHaveLength(8);
    expect(ownerAction(room, owner, { type: "removeBots" }).ok).toBe(true);
    expect(room.players).toHaveLength(3);
  });

  it("start: the machine deals the roles, and the owner still only sees their own", () => {
    const { room, owner } = machineRoom();
    ownerAction(room, owner, { type: "addBots", count: 4 });
    ownerAction(room, owner, { type: "useSuggested" });
    const res = ownerAction(room, owner, { type: "start" });
    expect(res.ok).toBe(true);
    expect(room.phase.kind).toBe("roleReveal");
    expect(Object.keys(room.game!.roles)).toHaveLength(8);

    const view = buildView(room, "player", owner);
    const visible = view.players.filter((p) => p.roleId).map((p) => p.id);
    const allowed = new Set([owner, ...(view.me?.teammates ?? [])]);
    expect(visible.every((id) => allowed.has(id))).toBe(true);
    expect(view.players.some((p) => p.assignedRole || p.effects)).toBe(false);
    expect(view.log).toBeUndefined();
    expect(view.machineHost).toBe(true);
    expect(view.ownerId).toBe(owner);
  });

  it("start refuses when the role count doesn't match the players", () => {
    const { room, owner } = machineRoom();
    ownerAction(room, owner, { type: "addBots", count: 4 });
    ownerAction(room, owner, { type: "setRoleCounts", roleCounts: { ...room.settings.roleCounts, villager: 0 } });
    expect(ownerAction(room, owner, { type: "start" })).toMatchObject({ ok: false, error: "err.roleCountMismatch" });
    expect(room.phase.kind).toBe("lobby");
  });

  it("the owner gets the role suggestion; other players don't", () => {
    const { room, owner, ids } = machineRoom();
    expect(buildView(room, "player", owner).suggested).toBeDefined();
    expect(buildView(room, "player", ids[1]).suggested).toBeUndefined();
  });

  it("an ordinary room has no owner", () => {
    const room = createRoom("HUM1", "vi");
    const p = addPlayer(room, { name: "A" }).player!;
    expect(ownerAction(room, p.id, { type: "start" }).ok).toBe(false);
    expect(buildView(room, "player", p.id)).toMatchObject({ machineHost: false, ownerId: null });
  });

  it("the next owner is the longest-seated human who is online", () => {
    const { room, ids } = machineRoom();
    hostAction(room, { type: "addBots", count: 2 });
    room.players.find((p) => p.id === ids[1])!.connected = false;
    expect(nextOwner(room)).toBe(ids[2]);
  });
});

describe("lobby", () => {
  it("summarises a room without anything secret", () => {
    const { room } = machineRoom(2);
    room.title = "Mít";
    room.passwordHash = hashPassword("bí mật");
    hostAction(room, { type: "addBots", count: 3 });
    const s = roomSummary(room);
    expect(s).toMatchObject({ code: "MCH1", title: "Mít", machineHost: true, locked: true, players: 5, bots: 3, status: "waiting" });
    expect(JSON.stringify(s)).not.toContain(room.passwordHash!);
  });

  it("lists rooms waiting for players first, newest first", () => {
    const r = (code: string, status: RoomSummary["status"], createdAt: number) => ({ code, status, createdAt }) as RoomSummary;
    expect(sortRooms([r("A", "playing", 3), r("B", "waiting", 1), r("C", "waiting", 2), r("D", "over", 9)]).map((x) => x.code)).toEqual([
      "C",
      "B",
      "A",
      "D",
    ]);
  });

  it("people in the lobby need a name; the photo only comes from a real account", () => {
    expect(lobbyPerson("s1", { name: "  " })).toBeNull();
    expect(lobbyPerson("s1", { name: "An", avatar: "🦊", avatarUrl: "http://evil" })).toMatchObject({ name: "An", avatar: "🦊", avatarUrl: null, userId: null });
    expect(lobbyPerson("s1", { name: "An" }, { id: "u1", avatarUrl: "/avatars/x.jpg" })).toMatchObject({ userId: "u1", avatarUrl: "/avatars/x.jpg" });
  });
});

describe("room passwords", () => {
  it("are stored hashed and checked exactly", () => {
    const h = hashPassword("trăng tròn");
    expect(h).not.toContain("trăng");
    expect(checkPassword(h, "trăng tròn")).toBe(true);
    expect(checkPassword(h, "trăng")).toBe(false);
    expect(checkPassword(h, undefined)).toBe(false);
    expect(checkPassword(null, undefined)).toBe(true);
  });

  it("an empty password means an open room", () => {
    expect(cleanPassword("   ")).toBeNull();
    expect(cleanPassword(" abc ")).toBe("abc");
  });
});
