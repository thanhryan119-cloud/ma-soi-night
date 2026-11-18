import { describe, expect, it } from "vitest";
import { cascadeDeaths, resolveNight, wolfConsensus } from "../shared/rules";
import type { RoleId } from "../shared/types";

const roles: Record<string, RoleId> = {
  w1: "werewolf",
  w2: "werewolf",
  seer: "seer",
  guard: "bodyguard",
  witch: "witch",
  hunter: "hunter",
  v1: "villager",
  v2: "villager",
};
const alive = Object.keys(roles);
const base = {
  alive,
  roles,
  lovers: null as [string, string] | null,
  hunterShootsWhenPoisoned: false,
  protectId: null as string | null,
  wolfTarget: null as string | null,
  witchSave: false,
  witchPoisonId: null as string | null,
};

describe("resolveNight", () => {
  it("wolf bite kills the target", () => {
    const r = resolveNight({ ...base, wolfTarget: "v1" });
    expect(r.deaths).toEqual([{ playerId: "v1", cause: "wolves" }]);
    expect(r.attackBlockedBy).toBeNull();
  });

  it("nobody dies when wolves pick nobody", () => {
    expect(resolveNight(base).deaths).toEqual([]);
  });

  it("bodyguard protection blocks the bite", () => {
    const r = resolveNight({ ...base, wolfTarget: "v1", protectId: "v1" });
    expect(r.deaths).toEqual([]);
    expect(r.attackBlockedBy).toBe("bodyguard");
  });

  it("protecting someone else does not help", () => {
    const r = resolveNight({ ...base, wolfTarget: "v1", protectId: "v2" });
    expect(r.deaths.map((d) => d.playerId)).toEqual(["v1"]);
  });

  it("witch healing potion saves the victim", () => {
    const r = resolveNight({ ...base, wolfTarget: "seer", witchSave: true });
    expect(r.deaths).toEqual([]);
    expect(r.attackBlockedBy).toBe("witch");
  });

  it("bodyguard takes priority over the witch when both save the victim", () => {
    const r = resolveNight({ ...base, wolfTarget: "seer", witchSave: true, protectId: "seer" });
    expect(r.deaths).toEqual([]);
    expect(r.attackBlockedBy).toBe("bodyguard");
  });

  it("poison is not blocked by the bodyguard", () => {
    const r = resolveNight({ ...base, witchPoisonId: "v2", protectId: "v2" });
    expect(r.deaths).toEqual([{ playerId: "v2", cause: "poison" }]);
  });

  it("bite and poison can kill two players in one night", () => {
    const r = resolveNight({ ...base, wolfTarget: "v1", witchPoisonId: "w1" });
    expect(r.deaths).toEqual([
      { playerId: "v1", cause: "wolves" },
      { playerId: "w1", cause: "poison" },
    ]);
  });

  it("poisoning the bitten player only kills them once", () => {
    const r = resolveNight({ ...base, wolfTarget: "v1", witchPoisonId: "v1" });
    expect(r.deaths).toEqual([{ playerId: "v1", cause: "wolves" }]);
  });

  it("the partner of a dead lover dies of heartbreak", () => {
    const r = resolveNight({ ...base, wolfTarget: "v1", lovers: ["v1", "w2"] });
    expect(r.deaths).toEqual([
      { playerId: "v1", cause: "wolves" },
      { playerId: "w2", cause: "heartbreak" },
    ]);
  });

  it("a bitten hunter gets a revenge shot", () => {
    const r = resolveNight({ ...base, wolfTarget: "hunter" });
    expect(r.hunters).toEqual(["hunter"]);
  });

  it("a poisoned hunter cannot shoot unless the setting allows it", () => {
    expect(resolveNight({ ...base, witchPoisonId: "hunter" }).hunters).toEqual([]);
    expect(
      resolveNight({ ...base, witchPoisonId: "hunter", hunterShootsWhenPoisoned: true }).hunters,
    ).toEqual(["hunter"]);
  });

  it("a hunter who dies of heartbreak can shoot", () => {
    const r = resolveNight({ ...base, wolfTarget: "v1", lovers: ["v1", "hunter"] });
    expect(r.hunters).toEqual(["hunter"]);
  });

  it("ignores targets that are already dead", () => {
    const r = resolveNight({ ...base, alive: alive.filter((id) => id !== "v1"), wolfTarget: "v1" });
    expect(r.deaths).toEqual([]);
  });
});

describe("cascadeDeaths", () => {
  it("an executed lover takes the partner along", () => {
    const r = cascadeDeaths([{ playerId: "w1", cause: "execution" }], { ...base, lovers: ["w1", "v2"] });
    expect(r.deaths.map((d) => [d.playerId, d.cause])).toEqual([
      ["w1", "execution"],
      ["v2", "heartbreak"],
    ]);
  });
});

describe("wolfConsensus", () => {
  it("unanimous pick", () => {
    expect(wolfConsensus({ w1: "v1", w2: "v1" })).toEqual({ target: "v1", unanimous: true, tie: false });
  });
  it("plurality wins", () => {
    expect(wolfConsensus({ w1: "v1", w2: "v1", w3: "v2" }).target).toBe("v1");
  });
  it("tie is broken by the picker", () => {
    const r = wolfConsensus({ w1: "v1", w2: "v2" }, (ids) => [...ids].sort()[1]);
    expect(r).toEqual({ target: "v2", unanimous: false, tie: true });
  });
  it("no votes means no target", () => {
    expect(wolfConsensus({}).target).toBeNull();
  });
});
