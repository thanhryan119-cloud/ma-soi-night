import { describe, expect, it } from "vitest";
import { checkWin, tallyNomination, tallyVerdict } from "../shared/rules";
import type { NominationSettings, RoleId } from "../shared/types";

const top1: NominationSettings = { mode: "top1", n: 2, threshold: 3, tie: "allTied" };

describe("tallyNomination", () => {
  it("counts votes and skips", () => {
    const r = tallyNomination({ a: "x", b: "x", c: "y", d: "skip" }, top1);
    expect(r.counts).toEqual({ x: 2, y: 1 });
    expect(r.skips).toBe(1);
    expect(r.nominees).toEqual(["x"]);
    expect(r.tie).toBe(false);
  });

  it("nobody goes up when everyone skips", () => {
    expect(tallyNomination({ a: "skip", b: "skip" }, top1).nominees).toEqual([]);
  });

  it("tie: all tied players go up (allTied)", () => {
    const r = tallyNomination({ a: "x", b: "y", c: "z", d: "x", e: "y" }, top1);
    expect(r.tie).toBe(true);
    expect([...r.nominees].sort()).toEqual(["x", "y"]);
  });

  it("tie: nobody goes up (none)", () => {
    const r = tallyNomination({ a: "x", b: "y" }, { ...top1, tie: "none" });
    expect(r.tie).toBe(true);
    expect([...r.tiedIds].sort()).toEqual(["x", "y"]);
    expect(r.nominees).toEqual([]);
  });

  it("tie: revote returns the tied ids and no nominees yet", () => {
    const r = tallyNomination({ a: "x", b: "y" }, { ...top1, tie: "revote" });
    expect(r.nominees).toEqual([]);
    expect([...r.tiedIds].sort()).toEqual(["x", "y"]);
  });

  it("top N picks the N highest", () => {
    const r = tallyNomination(
      { a: "x", b: "x", c: "x", d: "y", e: "y", f: "z" },
      { ...top1, mode: "topN", n: 2 },
    );
    expect(r.nominees).toEqual(["x", "y"]);
  });

  it("top N with a tie on the cut-off line", () => {
    const ballots = { a: "x", b: "x", c: "y", d: "z" };
    const all = tallyNomination(ballots, { ...top1, mode: "topN", n: 2 });
    expect(all.tie).toBe(true);
    expect([...all.nominees].sort()).toEqual(["x", "y", "z"]);
    const none = tallyNomination(ballots, { ...top1, mode: "topN", n: 2, tie: "none" });
    expect(none.nominees).toEqual(["x"]);
  });

  it("threshold mode takes everyone at or above the threshold", () => {
    const r = tallyNomination(
      { a: "x", b: "x", c: "x", d: "y", e: "y", f: "y", g: "z", h: "z" },
      { ...top1, mode: "threshold", threshold: 3 },
    );
    expect([...r.nominees].sort()).toEqual(["x", "y"]);
  });
});

describe("tallyVerdict", () => {
  it("simple majority: execute > spare", () => {
    expect(tallyVerdict({ a: "execute", b: "execute", c: "spare" }, 5, { majority: "simple" })).toEqual({
      execute: 2,
      spare: 1,
      abstain: 2,
      eligible: 5,
      executed: true,
    });
  });

  it("simple majority: a tie spares", () => {
    expect(tallyVerdict({ a: "execute", b: "spare" }, 2, { majority: "simple" }).executed).toBe(false);
  });

  it("absolute majority needs more than half of eligible voters", () => {
    const ballots = { a: "execute", b: "execute", c: "spare" };
    expect(tallyVerdict(ballots, 5, { majority: "absolute" }).executed).toBe(false);
    expect(tallyVerdict(ballots, 3, { majority: "absolute" }).executed).toBe(true);
    expect(tallyVerdict({ a: "execute", b: "execute" }, 4, { majority: "absolute" }).executed).toBe(false);
  });
});

describe("checkWin", () => {
  const roles: Record<string, RoleId> = { w1: "werewolf", w2: "werewolf", s: "seer", v1: "villager", v2: "villager" };
  it("game continues", () => {
    expect(checkWin(["w1", "s", "v1"], roles, null)).toBeNull();
  });
  it("village wins when no wolves remain", () => {
    expect(checkWin(["s", "v1"], roles, null)).toBe("village");
  });
  it("wolves win when wolves >= others", () => {
    expect(checkWin(["w1", "v1"], roles, null)).toBe("wolves");
    expect(checkWin(["w1", "w2", "v1", "s"], roles, null)).toBe("wolves");
  });
  it("mixed-team lovers win when they are the last two alive", () => {
    expect(checkWin(["w1", "v1"], roles, ["w1", "v1"])).toBe("lovers");
  });
  it("same-team lovers do not trigger a lovers win", () => {
    expect(checkWin(["s", "v1"], roles, ["s", "v1"])).toBe("village");
  });
  it("draw when nobody is left", () => {
    expect(checkWin([], roles, null)).toBe("draw");
  });
});
