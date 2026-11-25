import { describe, expect, it } from "vitest";
import { collectionSummary, nextTier, roleTier, tierFor } from "../shared/achievements";
import { ROLE_IDS } from "../shared/roles";
import { emptyStats } from "../shared/stats";

describe("role collection tiers", () => {
  it("climbs bronze, silver, gold, rainbow with wins", () => {
    expect(tierFor(0)).toBeNull();
    expect(tierFor(1)).toBe("bronze");
    expect(tierFor(4)).toBe("bronze");
    expect(tierFor(5)).toBe("silver");
    expect(tierFor(15)).toBe("gold");
    expect(tierFor(29)).toBe("gold");
    expect(tierFor(30)).toBe("rainbow");
    expect(tierFor(500)).toBe("rainbow");
  });

  it("names the next tier and stops at rainbow", () => {
    expect(nextTier(0)).toEqual({ tier: "bronze", wins: 1 });
    expect(nextTier(7)).toEqual({ tier: "gold", wins: 15 });
    expect(nextTier(30)).toBeNull();
  });

  it("reads wins per role from the stats", () => {
    const s = emptyStats();
    s.byRole.seer = { games: 20, wins: 16 };
    s.byRole.werewolf = { games: 3, wins: 0 };
    expect(roleTier(s, "seer")).toBe("gold");
    expect(roleTier(s, "werewolf")).toBeNull();
    expect(roleTier(null, "seer")).toBeNull();
    const sum = collectionSummary(s);
    expect(sum.total).toBe(ROLE_IDS.length);
    expect(sum.atLeast).toEqual({ bronze: 1, silver: 1, gold: 1, rainbow: 0 });
  });
});
