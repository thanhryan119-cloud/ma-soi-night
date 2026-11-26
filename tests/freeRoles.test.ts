import { describe, expect, it } from "vitest";
import {
  CYCLE_DAYS,
  SPECIAL_ROLES,
  cycleOrder,
  daysUntilFree,
  freeRolesAt,
  freeRolesOnDay,
  lockedRolesAt,
  nextRotation,
  rotationDay,
} from "../shared/freeRoles";
import { BUNDLES, ITEM_PRICE_VND, equip, itemPrice, itemsGranted, sanitizeOwned, DEFAULT_STYLE } from "../shared/cosmetics";
import { createRoom, addPlayer, hostAction } from "../shared/engine";
import { emptyRoleCounts } from "../shared/roles";

const DAY = 24 * 60 * 60 * 1000;
/** Noon in Vietnam on 2026-11-27, day 0 of the rotation. */
const DAY0 = Date.UTC(2026, 10, 27, 5);

describe("daily free roles", () => {
  it("has 17 special roles and a 3-day cycle of 5, 6 and 6", () => {
    expect(SPECIAL_ROLES).toHaveLength(17);
    expect(CYCLE_DAYS).toBe(3);
    expect([0, 1, 2].map((d) => freeRolesOnDay(d).length)).toEqual([5, 6, 6]);
  });

  it("opens every special role exactly once per cycle", () => {
    for (let cycle = -2; cycle < 20; cycle++) {
      const seen = [0, 1, 2].flatMap((d) => freeRolesOnDay(cycle * CYCLE_DAYS + d));
      expect([...seen].sort()).toEqual([...SPECIAL_ROLES].sort());
    }
  });

  it("shuffles each cycle differently", () => {
    const orders = new Set(Array.from({ length: 10 }, (_, c) => cycleOrder(c).join()));
    expect(orders.size).toBeGreaterThan(5);
  });

  it("turns over at midnight in Vietnam", () => {
    expect(rotationDay(DAY0)).toBe(0);
    const midnight = nextRotation(DAY0);
    expect(new Date(midnight).toISOString()).toBe("2026-11-27T17:00:00.000Z");
    expect(rotationDay(midnight - 1)).toBe(0);
    expect(rotationDay(midnight)).toBe(1);
    expect(freeRolesAt(DAY0 + DAY)).toEqual(freeRolesOnDay(1));
  });

  it("counts the days until a role is free again", () => {
    for (const r of freeRolesAt(DAY0)) expect(daysUntilFree(r, DAY0)).toBe(0);
    for (const r of SPECIAL_ROLES) {
      const d = daysUntilFree(r, DAY0);
      expect(freeRolesAt(DAY0 + d * DAY)).toContain(r);
    }
  });

  it("locks the special roles that are not free and not owned", () => {
    const free = freeRolesAt(DAY0);
    const locked = lockedRolesAt(DAY0);
    expect(locked).toHaveLength(SPECIAL_ROLES.length - free.length);
    for (const r of free) expect(locked).not.toContain(r);
    const card = locked[0];
    expect(lockedRolesAt(DAY0, [`role:${card}`])).not.toContain(card);
  });
});

describe("role cards and bundles", () => {
  it("splits the bundles by team", () => {
    expect(BUNDLES.wolves.length + BUNDLES.village.length + BUNDLES.solo.length).toBe(17);
    expect(BUNDLES.all).toHaveLength(17);
  });

  it("prices a bundle 20% off its missing cards", () => {
    expect(itemPrice("bundle:all")).toBe(17 * ITEM_PRICE_VND * 0.8);
    expect(itemPrice("bundle:solo")).toBe(BUNDLES.solo.length * ITEM_PRICE_VND * 0.8);
    const one = `role:${BUNDLES.solo[0]}`;
    expect(itemPrice("bundle:solo", [one])).toBe((BUNDLES.solo.length - 1) * ITEM_PRICE_VND * 0.8);
    expect(itemPrice("bundle:solo", itemsGranted("bundle:solo"))).toBe(0);
    expect(itemPrice("role:tanner")).toBe(ITEM_PRICE_VND);
    expect(itemPrice("role:tanner", ["role:tanner"])).toBe(0);
  });

  it("grants role cards, keeps them owned and leaves the style alone", () => {
    expect(itemsGranted("bundle:wolves")).toEqual(BUNDLES.wolves.map((r) => `role:${r}`));
    expect(sanitizeOwned(["role:tanner", "role:villager", "bundle:all", "effect:glow"])).toEqual(["role:tanner", "effect:glow"]);
    expect(equip(DEFAULT_STYLE, "role:tanner")).toEqual(DEFAULT_STYLE);
  });
});

describe("locked roles in a room", () => {
  const room = () => {
    const r = createRoom("TEST", "vi");
    for (let i = 0; i < 6; i++) addPlayer(r, { name: `P${i}`, avatar: "🐺", locale: "vi" });
    r.lockedRoles = ["tanner"];
    return r;
  };

  it("cannot add a locked role but can take it out", () => {
    const r = room();
    expect(hostAction(r, { type: "setRoleCounts", roleCounts: { ...emptyRoleCounts(), tanner: 1 } })).toMatchObject({ ok: false, error: "err.roleLocked" });
    r.settings.roleCounts = { ...emptyRoleCounts(), tanner: 1 };
    expect(hostAction(r, { type: "setRoleCounts", roleCounts: emptyRoleCounts() }).ok).toBe(true);
  });

  it("does not deal or suggest a locked role", () => {
    const r = room();
    const p = r.players[0].id;
    expect(hostAction(r, { type: "assignManual", playerId: p, roleId: "tanner" })).toMatchObject({ ok: false, error: "err.roleLocked" });
    expect(hostAction(r, { type: "useSuggested" }).ok).toBe(true);
    expect(r.settings.roleCounts.tanner).toBe(0);
  });

  it("refuses to start with a locked role dealt", () => {
    const r = room();
    const ids = r.players.map((p) => p.id);
    r.assignment = { [ids[0]]: "werewolf", [ids[1]]: "tanner", [ids[2]]: "villager", [ids[3]]: "villager", [ids[4]]: "seer", [ids[5]]: "villager" };
    expect(hostAction(r, { type: "start" })).toMatchObject({ ok: false, error: "err.roleLocked" });
  });
});
