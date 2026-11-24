import { describe, expect, it } from "vitest";
import { FREE_ROLES, ROLE_IDS, isPremiumRole, suggestRoles, totalRoles } from "../shared/roles";

describe("suggestRoles", () => {
  it("keeps the classic setup with only the free roles", () => {
    const c = suggestRoles(8);
    expect([c.werewolf, c.seer, c.bodyguard, c.witch, c.villager]).toEqual([2, 1, 1, 1, 3]);
    expect(ROLE_IDS.filter((r) => isPremiumRole(r) && c[r])).toEqual([]);
  });

  it("uses unlocked premium roles and fills every seat", () => {
    const c = suggestRoles(15, ROLE_IDS);
    expect(ROLE_IDS.filter((r) => isPremiumRole(r) && c[r]).length).toBeGreaterThan(5);
    expect(totalRoles(c)).toBe(15);
  });

  it("random setups stay valid and, over many deals, use every role", () => {
    const seen = new Set<string>();
    for (let n = 4; n <= 20; n++)
      for (let k = 0; k < 100; k++) {
        const c = suggestRoles(n, ROLE_IDS, Math.random);
        expect(totalRoles(c)).toBe(n);
        expect(c.werewolf).toBeGreaterThanOrEqual(1);
        expect([0, 2]).toContain(c.sister);
        for (const r of ROLE_IDS) if (c[r]) seen.add(r);
      }
    expect([...seen].sort()).toEqual([...ROLE_IDS].sort());
  });

  it("never suggests a role that isn't available", () => {
    for (let n = 4; n <= 20; n++) {
      const c = suggestRoles(n, FREE_ROLES, Math.random);
      expect(ROLE_IDS.filter((r) => !FREE_ROLES.includes(r) && c[r])).toEqual([]);
    }
  });
});
