import { describe, expect, it } from "vitest";
import vi from "../messages/vi.json";
import en from "../messages/en.json";
import { FAQ, STARTER_ROLES, filterFaq, filterRoles, fold, nightRule, seerTricks } from "../shared/guide";
import { ROLES, ROLE_IDS } from "../shared/roles";
import type { RoleId } from "../shared/types";

const name = (r: RoleId) => (vi.roles as Record<string, { name: string }>)[r].name;

describe("guide", () => {
  it("lists every role once, the starter roles first", () => {
    const all = filterRoles("all", "", name);
    expect(new Set(all).size).toBe(ROLE_IDS.length);
    expect(all.slice(0, STARTER_ROLES.length)).toEqual(STARTER_ROLES);
  });

  it("filters by team and finds roles without accents", () => {
    expect(filterRoles("wolves", "", name).every((r) => ROLES[r].team === "wolves")).toBe(true);
    expect(filterRoles("solo", "", name)).toContain("arsonist");
    expect(filterRoles("all", "tien tri", name)).toContain("seer");
    expect(fold("Phù Thủy Đêm")).toBe("phu thuy dem");
  });

  it("knows when roles wake up", () => {
    expect(nightRule("seer")).toBe("every");
    expect(nightRule("villager")).toBe("never");
    expect(nightRule("cupid")).toBe("firstNight");
    expect(nightRule("whiteWolf")).toBe("otherNight");
    expect(nightRule("medium")).toBe("afterDeath");
  });

  it("names the roles that fool the Seer", () => {
    expect(seerTricks()).toContain("lycan");
    expect(seerTricks()).not.toContain("werewolf");
  });

  it("every question has a question and an answer in both languages", () => {
    const items = (m: typeof vi) => m.guide.faq.items as Record<string, { q: string; a: string }>;
    for (const { id } of FAQ) {
      expect(items(vi)[id]?.q, id).toBeTruthy();
      expect(items(en)[id]?.a, id).toBeTruthy();
    }
    expect(filterFaq("tech", "", (id) => id).length).toBeGreaterThan(0);
    expect(filterFaq("all", "zzz-nothing", (id) => id)).toEqual([]);
  });
});
