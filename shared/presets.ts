// Role "maps": ready-made ways to deal the roles for a table of any size.
// Each map is a recipe (how big the pack is, which special wolves, which solo
// roles, which village roles). Roles the room can't use (locked) are skipped:
// the pack falls back to plain Werewolves and the village to plain Villagers.

import { BASIC_ROLE_IDS, ROLE_IDS, emptyRoleCounts, suggestRoles } from "./roles";
import type { RoleId } from "./types";

export const PRESET_IDS = ["basic", "advanced", "noVillager", "strongPack", "thirdParty", "blind"] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const PRESET_EMOJI: Record<PresetId, string> = {
  basic: "🌱",
  advanced: "🔮",
  noVillager: "✨",
  strongPack: "🐺",
  thirdParty: "🎭",
  blind: "🙈",
};

/** How many village power roles a table of `n` usually gets (one more step for each threshold reached). */
const VILLAGE_STEPS = [4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18];
const villageSlots = (n: number) => VILLAGE_STEPS.filter((from) => n >= from).length;

/** Every village power role, most useful first (the Sisters last: they take two seats). */
const ALL_VILLAGE: RoleId[] = [
  "seer", "bodyguard", "witch", "hunter", "mayor", "medium", "cupid", "elder", "knight", "lycan", "idiot", "wildChild", "sister",
];
/** Village roles that learn nothing at night (for the blind map). */
const BLIND_VILLAGE: RoleId[] = ["bodyguard", "witch", "hunter", "mayor", "knight", "elder", "cupid", "idiot", "wildChild", "sister"];
const SPECIAL_WOLVES: RoleId[] = ["wolfSeer", "cursedWolf", "bigBadWolf", "silencer"];

interface Recipe {
  /** Pack size (plain and special wolves, the White Wolf included), before solo killers take theirs. */
  pack: number;
  /** Special wolves to put in the pack, in order. At least one plain Werewolf always stays. */
  specials?: RoleId[];
  /** Solo roles with the size they join from. */
  solos?: [RoleId, number][];
  /** Minion from this many players. */
  minionFrom?: number;
  /** Village power roles, in order. */
  village: RoleId[];
  /** How many village power roles to deal (default: every seat left). */
  villagePower?: number;
}

function build(n: number, open: ReadonlySet<RoleId>, r: Recipe): Record<RoleId, number> {
  const c = emptyRoleCounts();
  if (n <= 0) return c;
  let pack = Math.max(1, r.pack);
  for (const [role, from] of r.solos ?? []) {
    if (!open.has(role) || n < from) continue;
    c[role] = 1;
    // A solo killer costs the pack a wolf; the White Wolf sits in the pack.
    if (role === "serialKiller" || role === "arsonist") pack = Math.max(1, pack - 1);
  }
  pack = Math.max(pack, c.whiteWolf + 1);
  let room = pack - c.whiteWolf - 1;
  for (const role of r.specials ?? []) {
    if (room <= 0) break;
    if (!open.has(role)) continue;
    c[role] = 1;
    room--;
  }
  c.werewolf = room + 1;
  if (r.minionFrom !== undefined && open.has("minion") && n >= r.minionFrom) c.minion = 1;

  let seats = n - ROLE_IDS.reduce((s, role) => s + c[role], 0);
  let power = r.villagePower ?? Infinity;
  for (const role of r.village) {
    const size = role === "sister" ? 2 : 1;
    if (!open.has(role) || size > seats || size > power) continue;
    c[role] = size;
    seats -= size;
    power -= size;
  }
  // A village of powers only: one odd seat left (the Sisters didn't fit) goes to the pack.
  if (r.villagePower === undefined && seats === 1) {
    c.werewolf++;
    seats = 0;
  }
  c.villager = Math.max(0, seats);
  return c;
}

function recipe(id: PresetId, n: number): Recipe | null {
  const usual = Math.max(1, Math.floor((n + 1) / 4));
  switch (id) {
    case "basic":
    case "advanced":
      return null;
    case "noVillager":
      // A village full of powers: one wolf more on bigger tables to make up for it.
      return { pack: Math.max(1, Math.floor((n + 2) / 4)), village: ALL_VILLAGE };
    case "strongPack":
      // Two wolves from 6 players, so a special wolf always joins the plain one.
      return {
        pack: n >= 6 ? Math.max(2, usual) : usual,
        specials: SPECIAL_WOLVES,
        minionFrom: 7,
        village: ALL_VILLAGE,
        villagePower: villageSlots(n),
      };
    case "thirdParty":
      return {
        pack: usual,
        solos: [["tanner", 5], ["serialKiller", 7], ["arsonist", 10], ["whiteWolf", 13]],
        village: ALL_VILLAGE,
        villagePower: villageSlots(n),
      };
    case "blind":
      // Nobody learns roles at night, so the pack is a bit smaller.
      return { pack: Math.max(1, Math.floor(n / 4)), village: BLIND_VILLAGE, villagePower: villageSlots(n) + 1 };
  }
}

function deal(id: PresetId, n: number, open: readonly RoleId[]): Record<RoleId, number> {
  if (id === "basic") return suggestRoles(n, BASIC_ROLE_IDS.filter((r) => open.includes(r)));
  if (id === "advanced") return suggestRoles(n, open);
  return build(n, new Set(open), recipe(id, n)!);
}

/**
 * The setup a map deals for `n` players with the roles in `open`, and the
 * roles it would have used that are locked (so the map is only partly dealt).
 */
export function presetRoles(
  id: PresetId,
  n: number,
  open: readonly RoleId[] = ROLE_IDS,
): { counts: Record<RoleId, number>; missing: RoleId[] } {
  const counts = deal(id, n, open);
  const full = deal(id, n, ROLE_IDS);
  const missing = ROLE_IDS.filter((r) => full[r] > 0 && !open.includes(r));
  return { counts, missing };
}
