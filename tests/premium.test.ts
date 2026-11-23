import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, hostAction, playerAction, unlockedRoles } from "../shared/engine";
import { makeMachineRoom, ownerAction } from "../shared/multiplayer";
import { PREMIUM_ROLES, completeNightOrder, roleItem } from "../shared/roles";
import { resolveNight } from "../shared/rules";
import { buildView } from "../shared/views";
import type { RoleId, Room } from "../shared/types";

const ALL = PREMIUM_ROLES.map(roleItem);

/** A started game with exactly these roles (the host owns every premium role). */
function game(roles: RoleId[]): { room: Room; id: (r: RoleId, n?: number) => string } {
  const room = createRoom("PREM", "vi");
  room.hostOwned = ALL;
  // These scripts let players skip votes (the default now makes voting compulsory).
  room.settings.mandatoryVote = false;
  roles.forEach((_, i) => addPlayer(room, { name: `P${i}` }));
  for (const p of room.players) p.connected = true;
  room.players.forEach((p, i) => expect(hostAction(room, { type: "assignManual", playerId: p.id, roleId: roles[i] }).ok).toBe(true));
  expect(hostAction(room, { type: "start" }).ok).toBe(true);
  hostAction(room, { type: "next" }); // night 1
  const id = (r: RoleId, n = 0) => room.players.filter((p) => room.game!.roles[p.id] === r)[n].id;
  return { room, id };
}

const step = (room: Room) => room.phase.steps[room.phase.stepIndex];
/** Presses "next" until the given night step (or dawn) is reached. */
function until(room: Room, target: string) {
  for (let i = 0; i < 20 && room.phase.kind === "night" && step(room) !== target; i++) {
    const r = hostAction(room, { type: "next" });
    if (!r.ok) throw new Error(`${step(room)}: ${r.error}`);
  }
}

describe("premium roles are locked until bought", () => {
  it("are locked for a guest host", () => {
    const room = createRoom("LOCK1", "vi");
    for (let i = 0; i < 6; i++) addPlayer(room, { name: `P${i}` });
    expect(unlockedRoles(room)).not.toContain("cursedWolf");
    const counts = { ...room.settings.roleCounts, cursedWolf: 1 };
    const res = hostAction(room, { type: "setRoleCounts", roleCounts: counts });
    expect(res).toMatchObject({ ok: false, error: "err.roleLocked", params: { role: "cursedWolf" } });
    expect(hostAction(room, { type: "assignManual", playerId: room.players[0].id, roleId: "elder" }).error).toBe("err.roleLocked");
  });

  it("the host's purchase unlocks that one role for the room", () => {
    const room = createRoom("LOCK2", "vi");
    room.hostOwned = [roleItem("elder")];
    expect(hostAction(room, { type: "setRoleCounts", roleCounts: { ...room.settings.roleCounts, elder: 1 } }).ok).toBe(true);
    expect(hostAction(room, { type: "setRoleCounts", roleCounts: { ...room.settings.roleCounts, idiot: 1 } }).ok).toBe(false);
    // Taking a role out is always allowed, even if the room no longer owns it.
    room.hostOwned = [];
    expect(hostAction(room, { type: "setRoleCounts", roleCounts: { ...room.settings.roleCounts, elder: 0 } }).ok).toBe(true);
    expect(buildView(room, "host").unlockedRoles).not.toContain("elder");
    expect(JSON.stringify(buildView(room, "screen"))).not.toContain("hostOwned");
  });

  it("a machine-host room uses what the owner owns", () => {
    const room = createRoom("LOCK3", "vi");
    const owner = addPlayer(room, { name: "Chủ", owned: [roleItem("cursedWolf")] }).player!;
    makeMachineRoom(room, owner.id);
    const guest = addPlayer(room, { name: "Khách" }).player!;
    hostAction(room, { type: "addBots", count: 6 });
    const counts = { ...room.settings.roleCounts, cursedWolf: 1 };
    expect(ownerAction(room, owner.id, { type: "setRoleCounts", roleCounts: counts }).ok).toBe(true);
    expect(buildView(room, "player", owner.id).unlockedRoles).toContain("cursedWolf");
    expect(buildView(room, "player", guest.id).unlockedRoles).toBeUndefined();
  });

  it("can't start a game dealt a locked role", () => {
    const room = createRoom("LOCK4", "vi");
    room.hostOwned = ALL;
    for (let i = 0; i < 4; i++) addPlayer(room, { name: `P${i}` });
    const roles: RoleId[] = ["werewolf", "idiot", "villager", "villager"];
    room.players.forEach((p, i) => hostAction(room, { type: "assignManual", playerId: p.id, roleId: roles[i] }));
    room.hostOwned = [];
    expect(hostAction(room, { type: "start" }).error).toBe("err.roleLocked");
  });
});

describe("Cursed Wolf", () => {
  it("turns the victim into a werewolf instead of killing them (once per game)", () => {
    const { room, id } = game(["cursedWolf", "werewolf", "seer", "villager", "villager", "villager"]);
    const cw = id("cursedWolf");
    const seer = id("seer");
    expect(room.phase.steps).toEqual(["werewolf", "cursedWolf", "seer"]);
    // The Cursed Wolf bites with the pack.
    expect(playerAction(room, cw, { type: "night", targets: [seer] }).ok).toBe(true);
    expect(playerAction(room, id("werewolf"), { type: "night", targets: [seer] }).ok).toBe(true);
    until(room, "cursedWolf");
    const turn = buildView(room, "player", cw).me!.turn!;
    expect(turn.kind).toBe("curse");
    expect(turn.curse).toEqual({ victimId: seer, available: true, chosen: false });
    expect(playerAction(room, cw, { type: "night", curse: true }).ok).toBe(true);
    // The seer step is still called (and the seer acts) before the curse lands at dawn.
    until(room, "seer");
    playerAction(room, seer, { type: "night", targets: [cw] });
    until(room, "dawn");
    expect(room.phase.kind).toBe("dawn");
    expect(room.players.find((p) => p.id === seer)!.alive).toBe(true);
    expect(room.game!.roles[seer]).toBe("werewolf");
    expect(room.game!.originalRoles[seer]).toBe("seer");
    expect(room.game!.lastDeaths).toEqual([]);
    const me = buildView(room, "player", seer).me!;
    expect(me.cursedNight).toBe(1);
    expect(me.teammates.sort()).toEqual([cw, id("werewolf")].sort());
    expect(room.game!.curseUsed).toBe(true);
  });

  it("fails when the victim is guarded, and the curse stays unused", () => {
    const { room, id } = game(["cursedWolf", "bodyguard", "villager", "villager", "villager"]);
    const v = id("villager");
    playerAction(room, id("bodyguard"), { type: "night", targets: [v] });
    until(room, "werewolf");
    playerAction(room, id("cursedWolf"), { type: "night", targets: [v] });
    until(room, "cursedWolf");
    playerAction(room, id("cursedWolf"), { type: "night", curse: true });
    until(room, "dawn");
    expect(room.game!.roles[v]).toBe("villager");
    expect(room.game!.curseUsed).toBeFalsy();
  });

  it("can't curse when the pack bit nobody", () => {
    const { room, id } = game(["cursedWolf", "villager", "villager", "villager"]);
    room.settings.wolvesMustBite = false;
    until(room, "cursedWolf");
    expect(playerAction(room, id("cursedWolf"), { type: "night", curse: true }).error).toBe("err.nobodyToCurse");
    expect(playerAction(room, id("cursedWolf"), { type: "night", curse: false }).ok).toBe(true);
  });

  it("poison on the cursed victim still kills", () => {
    const r = resolveNight({
      alive: ["a", "b"],
      roles: { a: "cursedWolf", b: "villager" },
      lovers: null,
      hunterShootsWhenPoisoned: false,
      protectId: null,
      wolfTarget: "b",
      witchSave: false,
      witchPoisonId: "b",
      curse: true,
    });
    expect(r.cursedId).toBeNull();
    expect(r.deaths).toEqual([{ playerId: "b", cause: "poison" }]);
  });
});

describe("Wolf Seer", () => {
  it("bites with the pack and sees one exact role a night", () => {
    const { room, id } = game(["wolfSeer", "witch", "villager", "villager", "villager"]);
    const ws = id("wolfSeer");
    const witch = id("witch");
    expect(room.phase.steps).toEqual(["werewolf", "wolfSeer", "witch"]);
    expect(playerAction(room, ws, { type: "night", targets: [id("villager")] }).ok).toBe(true);
    until(room, "wolfSeer");
    expect(buildView(room, "player", ws).me!.turn!.targets).not.toContain(ws);
    expect(playerAction(room, ws, { type: "night", targets: [witch] }).ok).toBe(true);
    expect(room.game!.seerResults[ws]).toEqual([{ night: 1, targetId: witch, isWolf: false, roleId: "witch" }]);
    expect(playerAction(room, ws, { type: "night", targets: [witch] }).error).toBe("err.alreadyActed");
  });
});

describe("Elder", () => {
  it("survives the first bite, not the second", () => {
    const { room, id } = game(["werewolf", "elder", "villager", "villager", "villager"]);
    const elder = id("elder");
    playerAction(room, id("werewolf"), { type: "night", targets: [elder] });
    until(room, "dawn");
    expect(room.players.find((p) => p.id === elder)!.alive).toBe(true);
    expect(room.game!.elderHits).toEqual([elder]);
    hostAction(room, { type: "next" }); // discussion
    hostAction(room, { type: "next" }); // nominate
    room.players.filter((p) => p.alive).forEach((p) => playerAction(room, p.id, { type: "vote", choice: "skip" }));
    hostAction(room, { type: "next" }); // nominate result
    hostAction(room, { type: "next" }); // night 2
    expect(room.phase).toMatchObject({ kind: "night", night: 2 });
    playerAction(room, id("werewolf"), { type: "night", targets: [elder] });
    until(room, "dawn");
    expect(room.players.find((p) => p.id === elder)!.alive).toBe(false);
  });
});

describe("Village Idiot", () => {
  it("survives being hanged, is revealed and loses the vote", () => {
    const { room, id } = game(["werewolf", "idiot", "villager", "villager", "villager", "villager"]);
    const idiot = id("idiot");
    const wolf = id("werewolf");
    playerAction(room, wolf, { type: "night", targets: [id("villager")] });
    until(room, "dawn");
    hostAction(room, { type: "next" }); // discussion
    hostAction(room, { type: "next" }); // nominate
    const alive = room.players.filter((p) => p.alive);
    alive.forEach((p) => playerAction(room, p.id, { type: "vote", choice: p.id === idiot ? wolf : idiot }));
    hostAction(room, { type: "next" }); // nomination result
    hostAction(room, { type: "next" }); // defense
    hostAction(room, { type: "next" }); // verdict
    expect(room.phase.kind).toBe("verdict");
    alive.filter((p) => p.id !== idiot).forEach((p) => playerAction(room, p.id, { type: "vote", choice: "execute" }));
    expect(hostAction(room, { type: "next" }).ok).toBe(true);
    expect(room.phase.kind).toBe("verdictResult");
    expect(room.players.find((p) => p.id === idiot)!.alive).toBe(true);
    expect(room.game!.verdicts.at(-1)!.idiotRevealed).toBe(true);
    // Everyone sees his card, and he can't vote any more.
    const screen = buildView(room, "screen");
    expect(screen.players.find((p) => p.id === idiot)).toMatchObject({ roleId: "idiot", noVote: true });
    expect(screen.players.find((p) => p.id === wolf)!.roleId).toBeUndefined();
    hostAction(room, { type: "next" }); // night 2
    playerAction(room, wolf, { type: "night", targets: [id("villager", 1)] });
    until(room, "dawn");
    hostAction(room, { type: "next" }); // discussion
    hostAction(room, { type: "next" }); // nominate
    expect(playerAction(room, idiot, { type: "vote", choice: wolf }).error).toBe("err.noVoteIdiot");
    expect(buildView(room, "player", idiot).me!.lostVote).toBe(true);
  });
});

describe("night order", () => {
  it("slots new steps into an order saved before they existed", () => {
    expect(completeNightOrder(["cupid", "bodyguard", "werewolf", "witch", "seer"])).toEqual([
      "cupid", "bodyguard", "werewolf", "wolfSeer", "cursedWolf", "witch", "seer",
    ]);
    expect(completeNightOrder(["seer", "werewolf", "x", "seer"])).toEqual([
      "cupid", "bodyguard", "seer", "werewolf", "wolfSeer", "cursedWolf", "witch",
    ]);
    const room = createRoom("ORD", "vi");
    expect(hostAction(room, { type: "updateSettings", settings: { nightOrder: ["seer", "werewolf", "witch", "bodyguard", "cupid"] } }).ok).toBe(true);
    expect(room.settings.nightOrder).toHaveLength(7);
  });
});
