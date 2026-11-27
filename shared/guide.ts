// The guide page and the first-visit walkthrough: which roles a filter shows,
// when a role wakes up at night, and the questions people ask most.

import { BASIC_ROLE_IDS, ROLES, ROLE_IDS } from "./roles";
import type { RoleId } from "./types";

export const ROLE_FILTERS = ["all", "basic", "village", "wolves", "solo"] as const;
export type RoleFilter = (typeof ROLE_FILTERS)[number];

/** The six roles a first game uses: learn these first. */
export const STARTER_ROLES: RoleId[] = ["villager", "werewolf", "seer", "bodyguard", "witch", "hunter"];

export function isBasicRole(role: RoleId): boolean {
  return BASIC_ROLE_IDS.includes(role);
}

/** The roles a filter and a search show, starter roles first, then the rest as listed in ROLES. */
export function filterRoles(filter: RoleFilter, query: string, nameOf: (r: RoleId) => string): RoleId[] {
  const q = fold(query);
  const order = [...STARTER_ROLES, ...ROLE_IDS.filter((r) => !STARTER_ROLES.includes(r))];
  return order.filter((r) => {
    if (filter === "basic" && !isBasicRole(r)) return false;
    if ((filter === "village" || filter === "wolves" || filter === "solo") && ROLES[r].team !== filter) return false;
    return !q || fold(nameOf(r)).includes(q);
  });
}

/** Lower case, no Vietnamese accents: "Tiên tri" matches "tien tri". */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase().trim();
}

export type NightRule = "every" | "firstNight" | "otherNight" | "afterDeath" | "withPack" | "never";

/** When the role is called at night (a message key under guide.roles.wake). */
export function nightRule(role: RoleId): NightRule {
  const def = ROLES[role];
  const n = def.night;
  if (!n) return def.alsoWakesIn?.length ? "withPack" : "never";
  if (n.firstNightOnly) return "firstNight";
  if (n.needsDead) return "afterDeath";
  if (n.nights) return "otherNight";
  return "every";
}

/** Roles the Seer reads wrong: seen as a wolf without being one, or a wolf ally seen as harmless. */
export function seerTricks(): RoleId[] {
  return ROLE_IDS.filter((r) => ROLES[r].seenAsWolf !== (ROLES[r].team === "wolves"));
}

export const FAQ_CATEGORIES = ["all", "start", "game", "roles", "account", "tech"] as const;
export type FaqCategory = (typeof FAQ_CATEGORIES)[number];

/** Every question, by id (guide.faq.items.<id>.q / .a), and the topic it sits under. */
export const FAQ: { id: string; cat: Exclude<FaqCategory, "all"> }[] = [
  { id: "install", cat: "start" },
  { id: "free", cat: "start" },
  { id: "players", cat: "start" },
  { id: "signIn", cat: "start" },
  { id: "narrator", cat: "start" },
  { id: "seeRole", cat: "game" },
  { id: "noPower", cat: "game" },
  { id: "vote", cat: "game" },
  { id: "dead", cat: "game" },
  { id: "leave", cat: "game" },
  { id: "win", cat: "game" },
  { id: "firstRole", cat: "roles" },
  { id: "seer", cat: "roles" },
  { id: "roleSet", cat: "roles" },
  { id: "solo", cat: "roles" },
  { id: "collection", cat: "account" },
  { id: "quests", cat: "account" },
  { id: "friends", cat: "account" },
  { id: "voice", cat: "tech" },
  { id: "inApp", cat: "tech" },
  { id: "language", cat: "tech" },
  { id: "screen", cat: "tech" },
];

export function filterFaq(cat: FaqCategory, query: string, textOf: (id: string) => string): string[] {
  const q = fold(query);
  return FAQ.filter((f) => (cat === "all" || f.cat === cat) && (!q || fold(textOf(f.id)).includes(q))).map((f) => f.id);
}

/** The steps of the beginner path on the guide page (ticked off as the player does them). */
export const PATH_STEPS = ["intro", "roles", "bots", "signIn", "friends"] as const;
export type PathStep = (typeof PATH_STEPS)[number];
