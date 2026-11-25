import { describe, expect, it } from "vitest";
import { addPlayer, createRoom, hostAction, isSilenced, playerAction } from "../shared/engine";
import { isAdvancedRole, isWolf, teamOf } from "../shared/roles";
import { checkWin, resolveNight, tallyNomination, tallyVerdict } from "../shared/rules";
import { outcomeFor } from "../shared/stats";
import { canSpeak } from "../shared/social";
import { buildView } from "../shared/views";
import type { RoleId, Room } from "../shared/types";

/** A started game with exactly these roles, on night 1 (everyone offline so nothing blocks the narrator). */
function game(roles: RoleId[]): { room: Room; id: (r: RoleId, n?: number) => string } {
  const room = createRoom("MORE", "vi");
  room.settings.mandatoryVote = false;
  roles.forEach((_, i) => addPlayer(room, { name: `P${i}` }));
  for (const p of room.players) p.connected = false;
  room.players.forEach((p, i) => expect(hostAction(room, { type: "assignManual", playerId: p.id, roleId: roles[i] }).ok).toBe(true));
  expect(hostAction(room, { type: "start" }).ok).toBe(true);
  hostAction(room, { type: "next" }); // night 1
  const id = (r: RoleId, n = 0) => room.players.filter((p) => room.game!.originalRoles[p.id] === r)[n].id;
  return { room, id };
}

const step = (room: Room) => room.phase.steps[room.phase.stepIndex];
function until(room: Room, target: string) {
  for (let i = 0; i < 30 && room.phase.kind === "night" && step(room) !== target; i++) {
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
/** From dawn: everyone alive (who may) nominates and hangs \`target\`. */
function hang(room: Room, target: string) {
  hostAction(room, { type: "next" }); // discussion
  hostAction(room, { type: "next" }); // nominate
  for (const p of room.players.filter((p) => p.alive && p.id !== target)) playerAction(room, p.id, { type: "vote", choice: target });
  hostAction(room, { type: "next" }); // nominate result
  hostAction(room, { type: "next" }); // defense
  hostAction(room, { type: "next" }); // verdict
  for (const p of room.players.filter((p) => p.alive && p.id !== target)) playerAction(room, p.id, { type: "vote", choice: "execute" });
  hostAction(room, { type: "next" }); // verdict result
}

describe("teams", () => {
  it("separates the pack from the side a role wins with", () => {
    expect([isWolf("minion"), teamOf("minion")]).toEqual([false, "wolves"]);
    expect([isWolf("whiteWolf"), teamOf("whiteWolf")]).toEqual([true, "solo"]);
    expect([isWolf("bigBadWolf"), isWolf("silencer"), isWolf("serialKiller")]).toEqual([true, true, false]);
    for (const r of ["mayor", "bigBadWolf", "minion", "knight", "silencer", "tanner", "whiteWolf", "serialKiller", "arsonist"] as RoleId[])
      expect(isAdvancedRole(r)).toBe(true);
  });

  it("scores solo winners alone and the Minion with the wolves", () => {
    expect(outcomeFor("serialKiller", "serialKiller", false)).toBe("win");
    expect(outcomeFor("serialKiller", "villager", false)).toBe("loss");
    expect(outcomeFor("wolves", "minion", false)).toBe("win");
    expect(outcomeFor("wolves", "whiteWolf", false)).toBe("loss");
  });
});

describe("checkWin with solo killers", () => {
  const roles: Record<string, RoleId> = { w: "werewolf", ww: "whiteWolf", sk: "serialKiller", v1: "villager", v2: "villager", m: "minion" };
  it("nobody wins while a solo killer lives among others", () => {
    expect(checkWin(["sk", "v1", "v2"], roles, null)).toBeNull();
    expect(checkWin(["sk", "w", "v1"], roles, null)).toBeNull();
  });
  it("a solo killer wins alone, or one on one with someone harmless", () => {
    expect(checkWin(["sk"], roles, null)).toBe("serialKiller");
    expect(checkWin(["sk", "v1"], roles, null)).toBe("serialKiller");
    expect(checkWin(["ww", "v1"], roles, null)).toBe("whiteWolf");
    expect(checkWin(["ww", "w"], roles, null)).toBeNull();
  });
  it("the Minion counts as a human for the wolves' majority", () => {
    expect(checkWin(["w", "m"], roles, null)).toBe("wolves");
    expect(checkWin(["w", "m", "v1"], roles, null)).toBeNull();
    expect(checkWin(["m", "v1"], roles, null)).toBe("village");
  });
});

describe("Mayor", () => {
  it("counts double in the tallies", () => {
    const t = tallyNomination({ mayor: "a", x: "b" }, { mode: "top1", n: 1, threshold: 1, tie: "none" }, { mayor: 2 });
    expect(t.counts).toEqual({ a: 2, b: 1 });
    expect(t.nominees).toEqual(["a"]);
    const v = tallyVerdict({ mayor: "spare", x: "execute" }, 3, { majority: "simple" }, { mayor: 2 });
    expect(v.executed).toBe(false);
  });
});

describe("Big Bad Wolf", () => {
  it("bites a second victim until a wolf dies", () => {
    const { room, id } = game(["werewolf", "bigBadWolf", "villager", "villager", "villager", "villager", "witch"]);
    until(room, "werewolf");
    playerAction(room, id("werewolf"), { type: "night", targets: [id("villager")] });
    playerAction(room, id("bigBadWolf"), { type: "night", targets: [id("villager")] });
    until(room, "bigBadWolf");
    expect(playerAction(room, id("bigBadWolf"), { type: "night", targets: [id("villager")] }).error).toBe("err.invalidTarget");
    expect(playerAction(room, id("bigBadWolf"), { type: "night", targets: [id("villager", 1)] }).ok).toBe(true);
    until(room, "none");
    expect(alive(room, id("villager"))).toBe(false);
    expect(alive(room, id("villager", 1))).toBe(false);
  });

  it("the second bite is gone once a wolf has died", () => {
    const { room, id } = game(["werewolf", "bigBadWolf", "villager", "villager", "villager", "villager", "witch"]);
    until(room, "werewolf");
    playerAction(room, id("werewolf"), { type: "night", targets: [id("villager")] });
    playerAction(room, id("bigBadWolf"), { type: "night", targets: [id("villager")] });
    until(room, "witch");
    playerAction(room, id("witch"), { type: "night", poisonId: id("werewolf") });
    until(room, "none");
    skipDay(room);
    until(room, "bigBadWolf");
    const view = buildView(room, "player", id("bigBadWolf")).me!;
    expect(view.turn!.targets).toEqual([]);
    expect(view.turn!.optional).toBe(true);
    expect(playerAction(room, id("bigBadWolf"), { type: "night", targets: [] }).ok).toBe(true);
  });
});

describe("Minion", () => {
  it("knows the pack, the pack doesn't know him, the Seer sees a villager", () => {
    const { room, id } = game(["werewolf", "minion", "seer", "villager", "villager"]);
    expect(buildView(room, "player", id("minion")).me!.teammates).toEqual([id("werewolf")]);
    expect(buildView(room, "player", id("werewolf")).me!.teammates).toEqual([]);
    expect(room.phase.steps).not.toContain("minion");
    until(room, "seer");
    playerAction(room, id("seer"), { type: "night", targets: [id("minion")] });
    expect(room.game!.seerResults[id("seer")][0].isWolf).toBe(false);
  });
});

describe("Knight", () => {
  it("a wolf dies the night after biting him to death", () => {
    const { room, id } = game(["werewolf", "werewolf", "knight", "villager", "villager", "villager", "villager"]);
    until(room, "werewolf");
    playerAction(room, id("werewolf"), { type: "night", targets: [id("knight")] });
    playerAction(room, id("werewolf", 1), { type: "night", targets: [id("knight")] });
    until(room, "none");
    expect(alive(room, id("knight"))).toBe(false);
    skipDay(room);
    until(room, "werewolf");
    playerAction(room, id("werewolf"), { type: "night", targets: [id("villager")] });
    playerAction(room, id("werewolf", 1), { type: "night", targets: [id("villager")] });
    until(room, "none");
    const deadWolves = [id("werewolf"), id("werewolf", 1)].filter((w) => !alive(room, w));
    expect(deadWolves).toHaveLength(1);
    expect(room.game!.lastDeaths.find((d) => d.playerId === deadWolves[0])!.cause).toBe("rust");
  });
});

describe("Silencer", () => {
  it("the silenced player can't chat or vote the next day", () => {
    const { room, id } = game(["werewolf", "silencer", "villager", "villager", "villager", "villager", "villager"]);
    until(room, "werewolf");
    playerAction(room, id("werewolf"), { type: "night", targets: [id("villager")] });
    playerAction(room, id("silencer"), { type: "night", targets: [id("villager")] });
    until(room, "silencer");
    expect(playerAction(room, id("silencer"), { type: "night", targets: [id("villager", 1)] }).ok).toBe(true);
    until(room, "none");
    const muted = id("villager", 1);
    hostAction(room, { type: "next" }); // discussion
    expect(isSilenced(room, muted)).toBe(true);
    expect(canSpeak(room, { kind: "player", playerId: muted })).toBe("err.silenced");
    expect(buildView(room, "screen").players.find((p) => p.id === muted)!.silenced).toBe(true);
    hostAction(room, { type: "next" }); // nominate
    expect(playerAction(room, muted, { type: "vote", choice: id("werewolf") }).error).toBe("err.silenced");
  });
});

describe("Tanner", () => {
  it("wins alone when the village hangs him", () => {
    const { room, id } = game(["werewolf", "tanner", "villager", "villager", "villager", "villager"]);
    until(room, "werewolf");
    playerAction(room, id("werewolf"), { type: "night", targets: [id("villager")] });
    until(room, "none");
    hang(room, id("tanner"));
    expect(alive(room, id("tanner"))).toBe(false);
    expect(room.game!.pendingWin).toBe("tanner");
  });
});

describe("White Wolf", () => {
  it("is only called on even nights and may kill one of the pack", () => {
    const { room, id } = game(["werewolf", "whiteWolf", "villager", "villager", "villager", "villager", "villager"]);
    expect(room.phase.steps).not.toContain("whiteWolf");
    until(room, "werewolf");
    playerAction(room, id("werewolf"), { type: "night", targets: [id("villager")] });
    playerAction(room, id("whiteWolf"), { type: "night", targets: [id("villager")] });
    until(room, "none");
    skipDay(room);
    expect(room.phase.steps).toContain("whiteWolf");
    until(room, "werewolf");
    playerAction(room, id("werewolf"), { type: "night", targets: [id("villager", 1)] });
    playerAction(room, id("whiteWolf"), { type: "night", targets: [id("villager", 1)] });
    until(room, "whiteWolf");
    expect(playerAction(room, id("whiteWolf"), { type: "night", targets: [id("villager", 2)] }).error).toBe("err.invalidTarget");
    expect(playerAction(room, id("whiteWolf"), { type: "night", targets: [id("werewolf")] }).ok).toBe(true);
    until(room, "none");
    expect(alive(room, id("werewolf"))).toBe(false);
  });
});

describe("Serial Killer", () => {
  it("kills each night and survives the wolves' bite", () => {
    const r = resolveNight({
      alive: ["w", "sk", "v"],
      roles: { w: "werewolf", sk: "serialKiller", v: "villager" },
      lovers: null,
      hunterShootsWhenPoisoned: false,
      protectId: null,
      wolfTarget: "sk",
      witchSave: false,
      witchPoisonId: null,
      immune: ["sk"],
      killerTarget: "v",
    });
    expect(r.attackBlockedBy).toBe("immune");
    expect(r.deaths).toEqual([{ playerId: "v", cause: "killer" }]);
  });

  it("the Bodyguard stops the knife", () => {
    const { room, id } = game(["werewolf", "serialKiller", "bodyguard", "villager", "villager", "villager"]);
    until(room, "bodyguard");
    playerAction(room, id("bodyguard"), { type: "night", targets: [id("villager")] });
    until(room, "werewolf");
    playerAction(room, id("werewolf"), { type: "night", targets: [id("serialKiller")] });
    until(room, "serialKiller");
    playerAction(room, id("serialKiller"), { type: "night", targets: [id("villager")] });
    until(room, "none");
    expect(alive(room, id("villager"))).toBe(true);
    expect(alive(room, id("serialKiller"))).toBe(true);
  });
});

describe("Arsonist", () => {
  it("douses houses, then burns them all at once", () => {
    const { room, id } = game(["werewolf", "arsonist", "villager", "villager", "villager", "villager", "villager"]);
    until(room, "werewolf");
    playerAction(room, id("werewolf"), { type: "night", targets: [id("villager")] });
    until(room, "arsonist");
    expect(playerAction(room, id("arsonist"), { type: "night", ignite: true }).error).toBe("err.nothingToIgnite");
    expect(playerAction(room, id("arsonist"), { type: "night", targets: [id("villager", 1)] }).ok).toBe(true);
    until(room, "none");
    skipDay(room);
    until(room, "werewolf");
    playerAction(room, id("werewolf"), { type: "night", targets: [id("villager", 3)] });
    until(room, "arsonist");
    playerAction(room, id("arsonist"), { type: "night", targets: [id("werewolf")] });
    expect(buildView(room, "player", id("arsonist")).me!.turn!.arson!.doused).toEqual([id("villager", 1)]);
    until(room, "none");
    skipDay(room);
    until(room, "werewolf");
    playerAction(room, id("werewolf"), { type: "night", targets: [id("villager", 4)] });
    until(room, "arsonist");
    expect(playerAction(room, id("arsonist"), { type: "night", ignite: true }).ok).toBe(true);
    until(room, "none");
    expect(alive(room, id("villager", 1))).toBe(false);
    expect(alive(room, id("werewolf"))).toBe(false);
    expect(room.game!.lastDeaths.filter((d) => d.cause === "fire").map((d) => d.playerId).sort()).toEqual(
      [id("villager", 1), id("werewolf")].sort(),
    );
  });
});
