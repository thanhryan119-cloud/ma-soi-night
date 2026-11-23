import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, hostAction } from "../shared/engine";
import {
  cleanPassword,
  leaveRoom,
  lobbyPerson,
  makeMachineRoom,
  nextOwner,
  ownerAction,
  roomSummary,
  sortRooms,
  type RoomSummary,
} from "../shared/multiplayer";
import { buildView } from "../shared/views";
import { gameResults } from "../shared/stats";
import { canSpeak } from "../shared/social";
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

describe("leaving", () => {
  function running(userIds: (string | null)[] = []) {
    const { room, owner, ids } = machineRoom(4);
    ids.forEach((id, i) => (room.players.find((p) => p.id === id)!.userId = userIds[i] ?? null));
    ownerAction(room, owner, { type: "addBots", count: 4 });
    ownerAction(room, owner, { type: "useSuggested" });
    expect(ownerAction(room, owner, { type: "start" }).ok).toBe(true);
    return { room, owner, ids };
  }

  it("before the game: the player just goes, no stats", () => {
    const { room, ids } = machineRoom();
    const res = leaveRoom(room, ids[2], "left");
    expect(res).toMatchObject({ ok: true, removed: true });
    expect(res.abandon).toBeUndefined();
    expect(room.players.some((p) => p.id === ids[2])).toBe(false);
  });

  it("being away only matters during a game", () => {
    const { room, ids } = machineRoom();
    expect(leaveRoom(room, ids[1], "away").ok).toBe(false);
    expect(room.players).toHaveLength(4);
  });

  it("during a game: a bot takes the seat (same name and role) and it is a loss for the player", () => {
    const { room, ids } = running([null, "u-quit"]);
    const seat = room.players.find((p) => p.id === ids[1])!;
    const { name, token } = seat;
    const role = room.game!.roles[ids[1]];
    const res = leaveRoom(room, ids[1], "left", 77);
    expect(res.ok).toBe(true);
    expect(res.abandon).toMatchObject({ userId: "u-quit", game: { t: 77, role, outcome: "abandon", winner: null, survived: false } });
    expect(seat).toMatchObject({ isBot: true, connected: true, userId: null, name });
    expect(seat.token).not.toBe(token);
    expect(room.game!.roles[ids[1]]).toBe(role);
    expect(room.abandoned).toContain(ids[1]);
    expect(room.log.some((e) => e.key === "log.abandon" && e.public)).toBe(true);
    // Leaving twice is not possible: the seat is a bot now.
    expect(leaveRoom(room, ids[1], "left").ok).toBe(false);
    // At the end of the game the player is not counted again.
    hostAction(room, { type: "endGame", winner: "village" });
    expect(gameResults(room).map((r) => r.userId)).not.toContain("u-quit");
  });

  it("the owner leaving hands the room to the next player", () => {
    const { room, owner, ids } = running();
    leaveRoom(room, owner, "away");
    expect(room.ownerId).toBe(ids[1]);
    expect(room.log.some((e) => e.key === "log.abandonAway")).toBe(true);
  });

  it("guests leave without a stats entry", () => {
    const { room, ids } = running();
    expect(leaveRoom(room, ids[3], "left").abandon).toBeNull();
  });
});

describe("room settings", () => {
  it("bots are three times as fast by default; only listed speeds are allowed", () => {
    const room = createRoom("SPD1", "vi");
    expect(room.settings.botSpeed).toBe(3);
    expect(hostAction(room, { type: "updateSettings", settings: { botSpeed: 1.5 } }).ok).toBe(true);
    expect(room.settings.botSpeed).toBe(1.5);
    expect(hostAction(room, { type: "updateSettings", settings: { botSpeed: 50 } }).ok).toBe(false);
    expect(room.settings.botSpeed).toBe(1.5);
  });

  it("absent players are kicked in online rooms only (by default)", () => {
    expect(createRoom("OFF1", "vi").settings.autoKickAway).toBe(false);
    expect(machineRoom().room.settings.autoKickAway).toBe(true);
  });

  it("new rooms start with the agreed defaults", () => {
    const s = machineRoom().room.settings;
    expect(s).toMatchObject({
      discussionSeconds: 120,
      defenseSeconds: 30,
      botSpeed: 3,
      autoKickAway: true,
      aiBots: true,
      wolvesMustBite: true,
      mandatoryVote: true,
      voiceChat: true,
      decoyActions: true,
      deadSeeRoles: true,
      revealRoleOnDeath: false,
      bodyguardSelf: true,
      witchSelfSave: true,
      witchBothSameNight: true,
      hunterShootsWhenPoisoned: true,
    });
  });
});

describe("online defaults and the defender's chat", () => {
  it("discussion lasts 2 minutes and the defense 30 seconds by default", () => {
    expect(createRoom("DEF1", "vi").settings).toMatchObject({ discussionSeconds: 120, defenseSeconds: 30 });
  });

  it("online rooms: the players on the stand keep the chat during the verdict vote", () => {
    const { room, owner, ids } = machineRoom();
    ownerAction(room, owner, { type: "addBots", count: 4 });
    ownerAction(room, owner, { type: "useSuggested" });
    ownerAction(room, owner, { type: "start" });
    room.game!.nominees = [ids[1]];
    room.phase = { ...room.phase, kind: "verdict" };
    expect(canSpeak(room, { kind: "player", playerId: ids[1] })).toBeNull();
    expect(canSpeak(room, { kind: "player", playerId: ids[2] })).toBe("err.onlyNominees");
    // A room with a human host keeps the chat closed during the vote.
    room.machineHost = false;
    expect(canSpeak(room, { kind: "player", playerId: ids[1] })).toBe("err.chatClosed");
  });
});
