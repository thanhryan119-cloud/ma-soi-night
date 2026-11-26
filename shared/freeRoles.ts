// Free special roles of the day. The basic roles are always open; the special
// (advanced) ones take turns: each cycle shuffles them and opens them in
// batches of 5, then 6, then 7 (the last batch takes whatever is left), one
// batch per day. Once every special role has had its day, a new cycle starts
// with a new shuffle. Days turn over at midnight in Vietnam, like the quests.
//
// A role card bought in the shop (item "role:<id>") keeps that role open every
// day in the rooms its owner creates.

import { ROLE_IDS, isAdvancedRole } from "./roles";
import type { RoleId } from "./types";

export const SPECIAL_ROLES: readonly RoleId[] = ROLE_IDS.filter(isAdvancedRole);

/** How many special roles open on each day of a cycle, in order. */
export const FREE_BATCH_SIZES = [5, 6, 7] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
/** Days turn over at midnight in Vietnam (UTC+7). */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
/** Day 0 of the rotation: 2026-11-27 in Vietnam. */
const EPOCH_DAY = Date.UTC(2026, 10, 27) / DAY_MS;

/** Days since the rotation began (negative before it). */
export const rotationDay = (t: number) => Math.floor((t + VN_OFFSET_MS) / DAY_MS) - EPOCH_DAY;
/** When the free roles next change (ms). */
export const nextRotation = (t: number) => (Math.floor((t + VN_OFFSET_MS) / DAY_MS) + 1) * DAY_MS - VN_OFFSET_MS;

/** The batches of one cycle, e.g. [[5 roles], [6 roles], [6 roles]] for 17 special roles. */
function batchesOf(order: readonly RoleId[]): RoleId[][] {
  const out: RoleId[][] = [];
  let i = 0;
  for (let k = 0; i < order.length; k++) {
    const size = FREE_BATCH_SIZES[Math.min(k, FREE_BATCH_SIZES.length - 1)];
    out.push(order.slice(i, i + size));
    i += size;
  }
  return out;
}

/** Days in one cycle (3 for 17 special roles). */
export const CYCLE_DAYS = batchesOf(SPECIAL_ROLES).length;

/** A small seeded generator, so every server and browser agrees on the shuffle. */
function seeded(seed: number) {
  let a = (seed + 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** The order of the special roles in one cycle. */
export function cycleOrder(cycle: number): RoleId[] {
  const rand = seeded(cycle * 7919 + 17);
  const order = [...SPECIAL_ROLES];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** The special roles free on a given rotation day. */
export function freeRolesOnDay(day: number): RoleId[] {
  const cycle = Math.floor(day / CYCLE_DAYS);
  const pos = day - cycle * CYCLE_DAYS;
  return batchesOf(cycleOrder(cycle))[pos] ?? [];
}

/** The special roles free right now. */
export const freeRolesAt = (t: number) => freeRolesOnDay(rotationDay(t));

/** Days until a special role is free again (0: today). */
export function daysUntilFree(role: RoleId, t: number): number {
  const today = rotationDay(t);
  for (let d = 0; d <= CYCLE_DAYS * 2; d++) if (freeRolesOnDay(today + d).includes(role)) return d;
  return CYCLE_DAYS * 2;
}

/** Role cards an account owns, from its shop items. */
export const ownedRoles = (owned: readonly string[]): RoleId[] =>
  owned.filter((id) => id.startsWith("role:")).map((id) => id.slice(5) as RoleId);

/** Special roles a room may not use now: not free today and the creator has no card for them. */
export function lockedRolesAt(t: number, creatorOwned: readonly string[] = []): RoleId[] {
  const open = new Set([...freeRolesAt(t), ...ownedRoles(creatorOwned)]);
  return SPECIAL_ROLES.filter((r) => !open.has(r));
}
