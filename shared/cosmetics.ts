// Profile cosmetics a player can pick: name font, name effect and avatar frame.
// Ids are whitelisted here; labels live in messages (profile.font.<id> etc.),
// visuals in src/app/globals.css (.nf-<id>, .ne-<id>, .af-<id>).

export const NAME_FONTS = ["default", "serif", "script", "condensed", "mono", "brush"] as const;
export const NAME_EFFECTS = ["none", "glow", "blood", "flicker", "shimmer", "glitch"] as const;
export const AVATAR_FRAMES = ["none", "ring", "blood", "double", "moon", "thorns", "pulse"] as const;

export type NameFont = (typeof NAME_FONTS)[number];
export type NameEffect = (typeof NAME_EFFECTS)[number];
export type AvatarFrame = (typeof AVATAR_FRAMES)[number];

export interface PlayerStyle {
  font: NameFont;
  effect: NameEffect;
  frame: AvatarFrame;
}

export const DEFAULT_STYLE: PlayerStyle = { font: "default", effect: "none", frame: "none" };

const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

/** Keeps only known ids; anything else falls back to the default. */
export function sanitizeStyle(input: unknown): PlayerStyle {
  const s = (input ?? {}) as Partial<Record<keyof PlayerStyle, unknown>>;
  return {
    font: pick(NAME_FONTS, s.font, "default"),
    effect: pick(NAME_EFFECTS, s.effect, "none"),
    frame: pick(AVATAR_FRAMES, s.frame, "none"),
  };
}

/** Avatar photo URLs are only accepted from our own upload folder or Google. */
export function sanitizeAvatarUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  if (/^\/avatars\/[a-z0-9-]+\.(jpg|png|webp)$/.test(url)) return url;
  if (/^https:\/\/lh\d\.googleusercontent\.com\/[\w\-./=?&%]+$/.test(url) && url.length < 600) return url;
  return null;
}

// ---------------------------------------------------------------------------
// Shop: every font, effect and frame except the defaults is sold through payOS.
// An item id is "<kind>:<value>", e.g. "effect:glow" or "frame:moon".
// ---------------------------------------------------------------------------

export type ItemKind = keyof PlayerStyle;
export type ItemId = `${ItemKind}:${string}`;

/** Price of one item, in VND. */
export const ITEM_PRICE_VND = 50_000;

const OPTIONS: Record<ItemKind, readonly string[]> = { font: NAME_FONTS, effect: NAME_EFFECTS, frame: AVATAR_FRAMES };

/** What everyone gets for free (the defaults). */
export const FREE_ITEMS: readonly ItemId[] = ["font:default", "effect:none", "frame:none"];

export const itemId = (kind: ItemKind, value: string): ItemId => `${kind}:${value}`;

export function isFreeItem(id: string): boolean {
  return FREE_ITEMS.includes(id as ItemId);
}

/** Every item that can be bought. */
export const SHOP_ITEMS: readonly ItemId[] = (Object.keys(OPTIONS) as ItemKind[]).flatMap((kind) =>
  OPTIONS[kind].map((v) => itemId(kind, v)).filter((id) => !isFreeItem(id)),
);

export function isShopItem(id: unknown): id is ItemId {
  return typeof id === "string" && SHOP_ITEMS.includes(id as ItemId);
}

/** Keeps only real, sellable item ids (deduplicated). */
export function sanitizeOwned(input: unknown): ItemId[] {
  return Array.isArray(input) ? [...new Set(input.filter(isShopItem))] : [];
}

/**
 * Drops every part of a style the player does not own (back to the default).
 * `"all"` is for bots, which show off the whole collection.
 */
export function limitStyle(style: PlayerStyle, owned: readonly string[] | "all"): PlayerStyle {
  if (owned === "all") return style;
  const has = (kind: ItemKind) => isFreeItem(itemId(kind, style[kind])) || owned.includes(itemId(kind, style[kind]));
  return {
    font: has("font") ? style.font : DEFAULT_STYLE.font,
    effect: has("effect") ? style.effect : DEFAULT_STYLE.effect,
    frame: has("frame") ? style.frame : DEFAULT_STYLE.frame,
  };
}

/** Equips an item: the style with that one part swapped in. */
export function equip(style: PlayerStyle, id: ItemId): PlayerStyle {
  const [kind, value] = id.split(":") as [ItemKind, string];
  return sanitizeStyle({ ...style, [kind]: value });
}
