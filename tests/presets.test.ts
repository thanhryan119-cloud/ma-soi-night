import { describe, expect, it } from "vitest";
import { validateRoleCounts } from "../shared/engine";
import { PRESET_IDS, presetRoles } from "../shared/presets";
import { BASIC_ROLE_IDS, ROLES, ROLE_IDS, isWolf, suggestRoles, totalRoles } from "../shared/roles";
import type { RoleId } from "../shared/types";

const wolves = (c: Record<RoleId, number>) => ROLE_IDS.filter((r) => isWolf(r)).reduce((s, r) => s + c[r], 0);

describe("role maps", () => {
  it("every map deals a valid setup with a pack for every table size", () => {
    for (const id of PRESET_IDS)
      for (let n = 4; n <= 20; n++) {
        const { counts, missing } = presetRoles(id, n);
        expect(totalRoles(counts), `${id} ${n}`).toBe(n);
        expect(validateRoleCounts(counts), `${id} ${n}`).toBeNull();
        expect(counts.werewolf, `${id} ${n}`).toBeGreaterThanOrEqual(1);
        expect(wolves(counts) * 2, `${id} ${n}`).toBeLessThan(n);
        expect(missing).toEqual([]);
      }
  });

  it("the basic map is the classic suggestion", () => {
    for (let n = 4; n <= 20; n++) expect(presetRoles("basic", n).counts).toEqual(suggestRoles(n, BASIC_ROLE_IDS));
  });

  it("the no-villager map has no plain villagers while there are powers left", () => {
    for (let n = 4; n <= 18; n++) expect(presetRoles("noVillager", n).counts.villager, `${n}`).toBe(0);
  });

  it("the blind map has no role that sees at night", () => {
    for (let n = 4; n <= 20; n++) {
      const c = presetRoles("blind", n).counts;
      for (const r of ["seer", "medium", "wolfSeer", "lycan"] as RoleId[]) expect(c[r]).toBe(0);
    }
  });

  it("the strong pack uses special wolves and the third-party map solo roles", () => {
    const pack = presetRoles("strongPack", 12).counts;
    expect([pack.wolfSeer, pack.cursedWolf, pack.werewolf]).toEqual([1, 1, 1]);
    expect(pack.minion).toBe(1);
    const third = presetRoles("thirdParty", 12).counts;
    expect(ROLE_IDS.filter((r) => ROLES[r].team === "solo" && third[r]).length).toBeGreaterThanOrEqual(3);
  });

  it("never deals a locked role and says which ones it had to leave out", () => {
    const open = BASIC_ROLE_IDS;
    for (const id of PRESET_IDS)
      for (let n = 4; n <= 20; n++) {
        const { counts, missing } = presetRoles(id, n, open);
        expect(totalRoles(counts)).toBe(n);
        expect(validateRoleCounts(counts)).toBeNull();
        expect(ROLE_IDS.filter((r) => counts[r] && !open.includes(r))).toEqual([]);
        for (const r of missing) expect(open).not.toContain(r);
      }
    expect(presetRoles("strongPack", 12, open).missing).toContain("wolfSeer");
  });
});
