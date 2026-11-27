import { describe, expect, it } from "vitest";
import { balanceOf, fixBalance, packSize } from "../shared/balance";
import { validateRoleCounts } from "../shared/engine";
import { PRESET_IDS, presetRoles } from "../shared/presets";
import { ROLE_IDS, emptyRoleCounts, suggestRoles, totalRoles } from "../shared/roles";
import type { RoleId } from "../shared/types";

const setup = (roles: Partial<Record<RoleId, number>>) => ({ ...emptyRoleCounts(), ...roles });

describe("power balance", () => {
  it("every suggested setup and role map counts as fair", () => {
    for (let n = 4; n <= 24; n++) {
      expect(balanceOf(suggestRoles(n)).leans, `suggest ${n}`).toBeNull();
      expect(balanceOf(suggestRoles(n, ROLE_IDS)).leans, `suggest all ${n}`).toBeNull();
      for (const id of PRESET_IDS) expect(balanceOf(presetRoles(id, n).counts).leans, `${id} ${n}`).toBeNull();
    }
  });

  it("flags a heavy pack and says why", () => {
    const b = balanceOf(setup({ werewolf: 2, bigBadWolf: 1, villager: 5 }));
    expect(b.leans).toBe("wolves");
    expect(b.reasons.map((r) => r.key)).toEqual(["packSize", "strongRoles", "noSeer"]);
  });

  it("flags a village with every power and a lone wolf", () => {
    const b = balanceOf(setup({ werewolf: 1, seer: 1, witch: 1, bodyguard: 1, hunter: 1, knight: 1, elder: 1, medium: 1, villager: 3 }));
    expect(b.leans).toBe("village");
    expect(b.reasons.some((r) => r.key === "strongRoles")).toBe(true);
  });

  it("no pack or half the table in it is as bad as it gets", () => {
    expect(balanceOf(setup({ villager: 6, seer: 1 }))).toMatchObject({ leans: "village", level: 3 });
    expect(balanceOf(setup({ werewolf: 3, villager: 3 }))).toMatchObject({ leans: "wolves", level: 3 });
  });

  it("the fix swaps roles one for one into a fair, valid setup", () => {
    const cases = [
      setup({ werewolf: 2, bigBadWolf: 1, villager: 5 }),
      setup({ werewolf: 1, seer: 1, witch: 1, bodyguard: 1, hunter: 1, knight: 1, elder: 1, medium: 1, villager: 3 }),
      setup({ villager: 6, seer: 1 }),
      setup({ werewolf: 3, villager: 3 }),
      setup({ werewolf: 4, silencer: 1, wolfSeer: 1, villager: 6 }),
    ];
    for (const c of cases) {
      const fix = fixBalance(c)!;
      expect(fix).not.toBeNull();
      expect(fix.fair).toBe(true);
      expect(totalRoles(fix.counts)).toBe(totalRoles(c));
      expect(validateRoleCounts(fix.counts)).toBeNull();
      expect(fix.counts.werewolf).toBeGreaterThanOrEqual(1);
      expect(packSize(fix.counts) * 2).toBeLessThan(totalRoles(c));
    }
  });

  it("the fix only uses open roles and leaves fair setups alone", () => {
    expect(fixBalance(suggestRoles(8))).toBeNull();
    const fix = fixBalance(setup({ werewolf: 3, villager: 5 }), ["werewolf", "villager"])!;
    expect(ROLE_IDS.filter((r) => fix.counts[r] > 0).sort()).toEqual(["villager", "werewolf"]);
  });
});
