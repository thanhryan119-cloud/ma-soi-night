import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, hostAction, playerAction } from "../shared/engine";
import { buildView } from "../shared/views";
import type { RoleId, Room } from "../shared/types";

const EXTRA: RoleId[] = ["lycan", "sister", "wildChild", "medium"];

describe("the extra village roles", () => {
  it("are open to every host", () => {
    const room = createRoom("XLCK", "vi");
    for (let i = 0; i < 6; i++) addPlayer(room, { name: `P${i}` });
    expect(hostAction(room, { type: "setRoleCounts", roleCounts: { ...room.settings.roleCounts, medium: 1 } }).ok).toBe(true);
  });
});

/** A started game with exactly these roles, on night 1. */
function game(roles: RoleId[]): { room: Room; id: (r: RoleId, n?: number) => string } {
  const room = createRoom("XTRA", "vi");
  room.settings.mandatoryVote = false;
  roles.forEach((_, i) => addPlayer(room, { name: `P${i}` }));
  // Offline players never block the narrator, so the script only acts where it matters.
  for (const p of room.players) p.connected = false;
  room.players.forEach((p, i) => expect(hostAction(room, { type: "assignManual", playerId: p.id, roleId: roles[i] }).ok).toBe(true));
  expect(hostAction(room, { type: "start" }).ok).toBe(true);
  hostAction(room, { type: "next" }); // night 1
  const id = (r: RoleId, n = 0) => room.players.filter((p) => room.game!.originalRoles[p.id] === r)[n].id;
  return { room, id };
}

const step = (room: Room) => room.phase.steps[room.phase.stepIndex];
function until(room: Room, target: string) {
  for (let i = 0; i < 20 && room.phase.kind === "night" && step(room) !== target; i++) {
    const r = hostAction(room, { type: "next" });
    if (!r.ok) throw new Error(`${step(room)}: ${r.error}`);
  }
}
const alive = (room: Room, id: string) => room.players.find((p) => p.id === id)!.alive;
/** From dawn to the next night, with everybody skipping the nomination. */
function skipDay(room: Room) {
  hostAction(room, { type: "next" }); // discussion
  hostAction(room, { type: "next" }); // nominate
  for (const p of room.players.filter((p) => p.alive)) playerAction(room, p.id, { type: "vote", choice: "skip" });
  hostAction(room, { type: "next" }); // nominate result
  hostAction(room, { type: "next" }); // next night
}

describe("Lycan", () => {
  it("is seen as a wolf by the Seer but plays for the village", () => {
    const { room, id } = game(["werewolf", "seer", "lycan", "villager", "villager"]);
    until(room, "seer");
    expect(playerAction(room, id("seer"), { type: "night", targets: [id("lycan")] }).ok).toBe(true);
    expect(room.game!.seerResults[id("seer")][0].isWolf).toBe(true);
    // The pack doesn't know the Lycan, and the Lycan doesn't wake with them.
    expect(buildView(room, "player", id("werewolf")).me!.teammates).toEqual([]);
    expect(room.phase.steps).not.toContain("lycan");
  });
});

describe("Sisters", () => {
  it("must be dealt as a pair", () => {
    const room = createRoom("SIS1", "vi");
    for (let i = 0; i < 6; i++) addPlayer(room, { name: `P${i}` });
    const counts = room.settings.roleCounts;
    expect(hostAction(room, { type: "setRoleCounts", roleCounts: { ...counts, sister: 1 } }).error).toBe("err.sistersPair");
    expect(hostAction(room, { type: "setRoleCounts", roleCounts: { ...counts, sister: 2 } }).ok).toBe(true);
    expect(hostAction(room, { type: "setRoleCounts", roleCounts: { ...counts, sister: 3 } }).error).toBe("err.roleMax");
  });

  it("know each other, and only each other", () => {
    const { room, id } = game(["werewolf", "sister", "sister", "villager", "villager"]);
    const view = buildView(room, "player", id("sister"));
    expect(view.me!.teammates).toEqual([id("sister", 1)]);
    expect(view.players.find((p) => p.id === id("sister", 1))!.roleId).toBe("sister");
    expect(view.players.find((p) => p.id === id("werewolf"))!.roleId).toBeUndefined();
  });
});

describe("Wild Child", () => {
  it("picks a model on night 1 only, and turns werewolf when the model dies", () => {
    const { room, id } = game(["werewolf", "wildChild", "villager", "villager", "villager", "villager"]);
    const child = id("wildChild");
    const model = id("villager");
    expect(step(room)).toBe("wildChild");
    expect(playerAction(room, child, { type: "night", targets: [child] }).error).toBe("err.invalidTarget");
    expect(playerAction(room, child, { type: "night", targets: [model] }).ok).toBe(true);
    expect(buildView(room, "player", child).me!.wildModelId).toBe(model);
    // The pack kills someone else: the child stays a villager.
    until(room, "werewolf");
    playerAction(room, id("werewolf"), { type: "night", targets: [id("villager", 1)] });
    until(room, "none");
    expect(room.game!.roles[child]).toBe("wildChild");
    // Night 2: the model dies, the child joins the pack.
    skipDay(room);
    expect(room.phase.kind).toBe("night");
    expect(room.phase.steps).not.toContain("wildChild");
    until(room, "werewolf");
    playerAction(room, id("werewolf"), { type: "night", targets: [model] });
    until(room, "none");
    expect(alive(room, model)).toBe(false);
    expect(room.game!.roles[child]).toBe("werewolf");
    const me = buildView(room, "player", child).me!;
    expect(me.teammates).toContain(id("werewolf"));
    expect(me.wildTurned).not.toBeNull();
    expect(buildView(room, "player", id("werewolf")).me!.teammates).toContain(child);
  });

  it("also turns when the model is hanged by day", () => {
    const { room, id } = game(["werewolf", "wildChild", "villager", "villager", "villager", "villager"]);
    const child = id("wildChild");
    const model = id("villager");
    playerAction(room, child, { type: "night", targets: [model] });
    until(room, "werewolf");
    playerAction(room, id("werewolf"), { type: "night", targets: [id("villager", 1)] });
    until(room, "none");
    hostAction(room, { type: "next" }); // discussion
    hostAction(room, { type: "next" }); // nominate
    for (const p of room.players.filter((p) => p.alive && p.id !== model)) playerAction(room, p.id, { type: "vote", choice: model });
    hostAction(room, { type: "next" }); // nominate result
    hostAction(room, { type: "next" }); // defense
    hostAction(room, { type: "next" }); // verdict
    for (const p of room.players.filter((p) => p.alive && p.id !== model)) playerAction(room, p.id, { type: "vote", choice: "execute" });
    hostAction(room, { type: "next" }); // verdict result
    expect(alive(room, model)).toBe(false);
    expect(room.game!.roles[child]).toBe("werewolf");
  });
});

describe("Medium", () => {
  it("isn't called while nobody is dead, then learns a dead player's exact role", () => {
    const { room, id } = game(["werewolf", "medium", "seer", "villager", "villager"]);
    expect(room.phase.steps).not.toContain("medium");
    until(room, "werewolf");
    playerAction(room, id("werewolf"), { type: "night", targets: [id("seer")] });
    until(room, "none");
    skipDay(room);
    expect(room.phase.steps).toContain("medium");
    until(room, "medium");
    const medium = id("medium");
    expect(playerAction(room, medium, { type: "night", targets: [id("villager")] }).error).toBe("err.invalidTarget");
    expect(playerAction(room, medium, { type: "night", targets: [id("seer")] }).ok).toBe(true);
    expect(room.game!.seerResults[medium][0]).toMatchObject({ targetId: id("seer"), roleId: "seer", isWolf: false });
  });
});
