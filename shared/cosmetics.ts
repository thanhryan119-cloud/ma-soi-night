import { PREMIUM_ROLES } from "./roles";

// Profile cosmetics a player can pick: name font, name effect, avatar frame and
// chat bubble decoration.
// Ids are whitelisted here; labels live in messages (profile.font.<id> etc.),
// visuals in src/app/globals.css (.nf-<id>, .ne-<id>, .af-<id>, .cb-<id>).

export const NAME_FONTS = ["default", "serif", "script", "condensed", "mono", "brush"] as const;
export const NAME_EFFECTS = ["none", "glow", "blood", "flicker", "shimmer", "glitch"] as const;
export const AVATAR_FRAMES = ["none", "ring", "blood", "double", "moon", "thorns", "pulse"] as const;
/** Decorations laid over a player's chat colour; "plain" (just the colour) is free. */
export const CHAT_DECOS = ["plain", "stars", "moon", "blood", "frost", "ember", "gold"] as const;

/**
 * Basic chat colours. Each player in a room gets one nobody else has (see
 * engine addPlayer), so every message shows at a glance who wrote it. The
 * order spreads neighbouring seats far apart on the colour wheel. 20 colours
 * for MAX_PLAYERS = 20; all dark enough for white text.
 */
export const CHAT_COLORS = [
  "#b91c1c", "#1d4ed8", "#15803d", "#b45309", "#6d28d9",
  "#0f766e", "#be185d", "#c2410c", "#0369a1", "#4d7c0f",
  "#a21caf", "#7c4a2d", "#4338ca", "#047857", "#be123c",
  "#0e7490", "#a16207", "#7e22ce", "#475569", "#57534e",
] as const;

/** The first chat colour no one in the list is using. */
export function freeChatColor(taken: readonly (number | undefined)[]): number {
  const used = new Set(taken);
  const i = CHAT_COLORS.findIndex((_, k) => !used.has(k));
  return i < 0 ? taken.length % CHAT_COLORS.length : i;
}

export type NameFont = (typeof NAME_FONTS)[number];
export type NameEffect = (typeof NAME_EFFECTS)[number];
export type AvatarFrame = (typeof AVATAR_FRAMES)[number];
export type ChatDeco = (typeof CHAT_DECOS)[number];

export interface PlayerStyle {
  font: NameFont;
  effect: NameEffect;
  frame: AvatarFrame;
  chat: ChatDeco;
}

export const DEFAULT_STYLE: PlayerStyle = { font: "default", effect: "none", frame: "none", chat: "plain" };

/** Same look on every part. */
export const sameStyle = (a: PlayerStyle, b: PlayerStyle) =>
  a.font === b.font && a.effect === b.effect && a.frame === b.frame && a.chat === b.chat;

const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

/** Keeps only known ids; anything else falls back to the default. */
export function sanitizeStyle(input: unknown): PlayerStyle {
  const s = (input ?? {}) as Partial<Record<keyof PlayerStyle, unknown>>;
  return {
    font: pick(NAME_FONTS, s.font, "default"),
    effect: pick(NAME_EFFECTS, s.effect, "none"),
    frame: pick(AVATAR_FRAMES, s.frame, "none"),
    chat: pick(CHAT_DECOS, s.chat, "plain"),
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
// Shop: every font, effect, frame and chat decoration except the defaults is sold through payOS,
// and so is every premium role (Cursed Wolf, Wolf Seer, Elder, Idiot).
// An item id is "<kind>:<value>", e.g. "effect:glow" or "role:cursedWolf".
// ---------------------------------------------------------------------------

export type StyleKind = keyof PlayerStyle;
export type ItemKind = StyleKind | "role";
export type ItemId = `${ItemKind}:${string}`;

/** Price of one item, in VND. */
export const ITEM_PRICE_VND = 50_000;

const OPTIONS: Record<ItemKind, readonly string[]> = {
  font: NAME_FONTS,
  effect: NAME_EFFECTS,
  frame: AVATAR_FRAMES,
  chat: CHAT_DECOS,
  role: PREMIUM_ROLES,
};

/** What everyone gets for free (the defaults). */
export const FREE_ITEMS: readonly ItemId[] = ["font:default", "effect:none", "frame:none", "chat:plain"];

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
  const has = (kind: StyleKind) => isFreeItem(itemId(kind, style[kind])) || owned.includes(itemId(kind, style[kind]));
  return {
    font: has("font") ? style.font : DEFAULT_STYLE.font,
    effect: has("effect") ? style.effect : DEFAULT_STYLE.effect,
    frame: has("frame") ? style.frame : DEFAULT_STYLE.frame,
    chat: has("chat") ? style.chat : DEFAULT_STYLE.chat,
  };
}

/** Equips an item: the style with that one part swapped in. */
export function equip(style: PlayerStyle, id: ItemId): PlayerStyle {
  const [kind, value] = id.split(":") as [ItemKind, string];
  if (kind === "role") return style;
  return sanitizeStyle({ ...style, [kind]: value });
}
