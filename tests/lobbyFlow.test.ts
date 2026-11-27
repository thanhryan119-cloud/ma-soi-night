import { describe, expect, it } from "vitest";
import { addPlayer, createRoom } from "../shared/engine";
import {
  AUTO_START_MIN_LEFT_MS,
  AUTO_START_MS,
  LEADER_IDLE_MS,
  autoStart,
  claimError,
  leaderAway,
  makeMachineRoom,
  ownerAction,
  setOwner,
  stepAutoStart,
} from "../shared/multiplayer";
import { buildView } from "../shared/views";

const T0 = 1_000_000;

const room = (humans: number) => {
  const r = createRoom("TEST", "vi");
  const ps = Array.from({ length: humans }, (_, i) => {
    const p = addPlayer(r, { name: `P${i}`, avatar: "🐺", locale: "vi" }).player!;
    p.connected = true;
    p.activeAt = T0;
    p.userId = `u${i}`;
    return p;
  });
  makeMachineRoom(r, ps[0].id);
  return { r, ps };
};

describe("an owner who walked away", () => {
  it("is away only after the idle time, and only with someone else waiting", () => {
    const { r, ps } = room(2);
    expect(leaderAway(r, T0 + LEADER_IDLE_MS - 1)).toBe(false);
    expect(leaderAway(r, T0 + LEADER_IDLE_MS)).toBe(true);
    ps[1].connected = false;
    expect(leaderAway(r, T0 + LEADER_IDLE_MS)).toBe(false);
  });

  it("counts an offline owner from when they left", () => {
    const { r, ps } = room(2);
    ps[0].connected = false;
    ps[0].offlineSince = T0 + 10_000;
    expect(leaderAway(r, T0 + 10_000 + LEADER_IDLE_MS - 1)).toBe(false);
    expect(leaderAway(r, T0 + 10_000 + LEADER_IDLE_MS)).toBe(true);
  });

  it("can be replaced by a waiting player, never while still here", () => {
    const { r, ps } = room(3);
    expect(claimError(r, ps[1].id, T0 + 1000)).toBe("err.leaderHere");
    expect(claimError(r, ps[0].id, T0 + LEADER_IDLE_MS)).toBe("err.invalidTarget");
    expect(claimError(r, ps[1].id, T0 + LEADER_IDLE_MS)).toBeNull();
    setOwner(r, ps[1].id);
    expect(r.ownerId).toBe(ps[1].id);
    expect(r.creatorId).toBe("u1");
    expect(ownerAction(r, ps[1].id, { type: "addBots", count: 1 }).ok).toBe(true);
  });

  it("only in the lobby", () => {
    const { r, ps } = room(4);
    expect(ownerAction(r, ps[0].id, { type: "playNow" }).ok).toBe(true);
    expect(leaderAway(r, T0 + 10 * LEADER_IDLE_MS)).toBe(false);
    expect(claimError(r, ps[1].id, T0 + 10 * LEADER_IDLE_MS)).toBe("err.wrongPhase");
  });

  it("is shown to the phones", () => {
    const { r, ps } = room(2);
    ps[0].activeAt = 1;
    expect(buildView(r, "player", ps[1].id).leaderAway).toBe(true);
  });
});

describe("the lobby starting by itself", () => {
  it("waits for enough people", () => {
    const { r } = room(3);
    expect(stepAutoStart(r, T0)).toBeNull();
    expect(r.autoStartAt ?? null).toBeNull();
  });

  it("counts down, then starts with bots filling the seats", () => {
    const { r } = room(4);
    expect(stepAutoStart(r, T0)).toBe("changed");
    expect(r.autoStartAt).toBe(T0 + AUTO_START_MS);
    expect(stepAutoStart(r, T0 + 1000)).toBeNull();
    expect(stepAutoStart(r, T0 + AUTO_START_MS)).toBe("start");
    expect(autoStart(r).ok).toBe(true);
    expect(r.phase.kind).not.toBe("lobby");
    expect(r.players.length).toBe(8);
  });

  it("uses the owner's roles when they fit", () => {
    const { r, ps } = room(5);
    const counts = { ...r.settings.roleCounts };
    for (const k of Object.keys(counts) as (keyof typeof counts)[]) counts[k] = 0;
    counts.werewolf = 1;
    counts.seer = 1;
    counts.villager = 3;
    expect(ownerAction(r, ps[0].id, { type: "setRoleCounts", roleCounts: counts }).ok).toBe(true);
    expect(autoStart(r).ok).toBe(true);
    expect(r.players.length).toBe(5);
  });

  it("gives a newcomer some time near the end", () => {
    const { r } = room(4);
    stepAutoStart(r, T0);
    const late = T0 + AUTO_START_MS - 2000;
    addPlayer(r, { name: "New", avatar: "🐺", locale: "vi" }).player!.connected = true;
    expect(stepAutoStart(r, late)).toBe("changed");
    expect(r.autoStartAt).toBe(late + AUTO_START_MIN_LEFT_MS);
  });

  it("stops when people leave, and when the owner holds it until someone new comes", () => {
    const { r, ps } = room(4);
    stepAutoStart(r, T0);
    ps[3].connected = false;
    expect(stepAutoStart(r, T0 + 1000)).toBe("changed");
    expect(r.autoStartAt).toBeNull();
    ps[3].connected = true;
    expect(stepAutoStart(r, T0 + 2000)).toBe("changed");

    expect(ownerAction(r, ps[0].id, { type: "holdAutoStart" }).ok).toBe(true);
    expect(stepAutoStart(r, T0 + 3000)).toBeNull();
    expect(r.autoStartAt).toBeNull();
    addPlayer(r, { name: "New", avatar: "🐺", locale: "vi" }).player!.connected = true;
    expect(stepAutoStart(r, T0 + 4000)).toBe("changed");
    expect(r.autoStartAt).toBe(T0 + 4000 + AUTO_START_MS);
  });

  it("never runs in a room with a human host", () => {
    const r = createRoom("HOST", "vi");
    for (let i = 0; i < 5; i++) addPlayer(r, { name: `P${i}`, avatar: "🐺", locale: "vi" }).player!.connected = true;
    expect(stepAutoStart(r, T0)).toBeNull();
  });
});
