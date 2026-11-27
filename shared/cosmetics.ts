
import { SPECIAL_ROLES } from "./freeRoles";
import { teamOf } from "./roles";
import type { RoleId } from "./types";

// Profile cosmetics a player can pick: name font, name effect, avatar frame,
// chat bubble decoration and profile card background.
// Ids are whitelisted here; labels live in messages (profile.font.<id> etc.),
// visuals in src/app/globals.css (.nf-<id>, .ne-<id>, .af-<id>, .cb-<id>, .pc-<id>).

export const NAME_FONTS = ["default", "serif", "script", "condensed", "mono", "brush"] as const;
export const NAME_EFFECTS = ["none", "glow", "blood", "flicker", "shimmer", "glitch"] as const;
export const AVATAR_FRAMES = [
  "none", "ring", "blood", "double", "moon", "thorns", "pulse", "crown", "frost", "runes", "wolf",
] as const;
/** Decorations laid over a player's chat colour; "plain" (just the colour) is free. */
export const CHAT_DECOS = ["plain", "stars", "moon", "blood", "frost", "ember", "gold"] as const;
/** Backgrounds behind the avatar and name on the profile card; "plain" is free. */
export const CARD_BGS = ["plain", "stars", "bloodmoon", "pines", "tarot", "mist", "gold"] as const;

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
export type CardBg = (typeof CARD_BGS)[number];

export interface PlayerStyle {
  font: NameFont;
  effect: NameEffect;
  frame: AvatarFrame;
  chat: ChatDeco;
  card: CardBg;
}

export const DEFAULT_STYLE: PlayerStyle = { font: "default", effect: "none", frame: "none", chat: "plain", card: "plain" };

/** Same look on every part. */
export const sameStyle = (a: PlayerStyle, b: PlayerStyle) =>
  a.font === b.font && a.effect === b.effect && a.frame === b.frame && a.chat === b.chat && a.card === b.card;

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
    card: pick(CARD_BGS, s.card, "plain"),
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
// Shop: every font, effect, frame, chat decoration and card background except the defaults is sold through payOS.
// An item id is "<kind>:<value>", e.g. "effect:glow".
// Special roles: a few are free each day (see freeRoles.ts); a role card
// ("role:<id>") keeps one open every day, and a bundle ("bundle:<name>") sells
// a group of role cards at 20% off.
// ---------------------------------------------------------------------------

export type StyleKind = keyof PlayerStyle;
export type ItemKind = StyleKind;
export type ItemId = `${ItemKind | "role" | "bundle"}:${string}`;

/** Price of one item, in VND. */
export const ITEM_PRICE_VND = 49_000;

const OPTIONS: Record<ItemKind, readonly string[]> = {
  font: NAME_FONTS,
  effect: NAME_EFFECTS,
  frame: AVATAR_FRAMES,
  chat: CHAT_DECOS,
  card: CARD_BGS,
};

/** What everyone gets for free (the defaults). */
export const FREE_ITEMS: readonly ItemId[] = ["font:default", "effect:none", "frame:none", "chat:plain", "card:plain"];

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

/** Role cards: one per special role. */
export const ROLE_ITEMS: readonly ItemId[] = SPECIAL_ROLES.map((r) => `role:${r}` as ItemId);
export const isRoleItem = (id: unknown): id is ItemId => typeof id === "string" && ROLE_ITEMS.includes(id as ItemId);

/** Bundles take this much off the role cards in them that the buyer does not have yet. */
export const BUNDLE_DISCOUNT = 0.2;
export const BUNDLE_NAMES = ["wolves", "village", "solo", "all"] as const;
export type BundleName = (typeof BUNDLE_NAMES)[number];
/** The role cards in each bundle. */
export const BUNDLES: Record<BundleName, readonly RoleId[]> = {
  wolves: SPECIAL_ROLES.filter((r) => teamOf(r) === "wolves"),
  village: SPECIAL_ROLES.filter((r) => teamOf(r) === "village"),
  solo: SPECIAL_ROLES.filter((r) => teamOf(r) === "solo"),
  all: SPECIAL_ROLES,
};
export const BUNDLE_ITEMS: readonly ItemId[] = BUNDLE_NAMES.map((b) => `bundle:${b}` as ItemId);
export const isBundle = (id: unknown): id is ItemId => typeof id === "string" && BUNDLE_ITEMS.includes(id as ItemId);

/** What a purchase hands over: a bundle's role cards, or the item itself. */
export function itemsGranted(id: ItemId): ItemId[] {
  if (!isBundle(id)) return [id];
  return BUNDLES[id.slice(7) as BundleName].map((r) => `role:${r}` as ItemId);
}

/** Anything sold for money: cosmetics, role cards and bundles. */
export const isSellable = (id: unknown): id is ItemId => isShopItem(id) || isRoleItem(id) || isBundle(id);

/**
 * What an item costs this buyer, in VND. A bundle only charges for the role
 * cards the buyer does not have yet, 20% off, rounded to the thousand.
 * 0 means there is nothing left to buy.
 */
export function itemPrice(id: ItemId, owned: readonly string[] = []): number {
  if (!isBundle(id)) return owned.includes(id) ? 0 : ITEM_PRICE_VND;
  const missing = itemsGranted(id).filter((r) => !owned.includes(r)).length;
  return Math.round((missing * ITEM_PRICE_VND * (1 - BUNDLE_DISCOUNT)) / 1000) * 1000;
}

/** A bundle's price before the discount, for the role cards still missing. */
export const bundleListPrice = (id: ItemId, owned: readonly string[] = []) =>
  itemsGranted(id).filter((r) => !owned.includes(r)).length * ITEM_PRICE_VND;

/** Everything an account can own. */
export const OWNABLE_ITEMS: readonly ItemId[] = [...SHOP_ITEMS, ...ROLE_ITEMS];

/** Keeps only real, ownable item ids (deduplicated). */
export function sanitizeOwned(input: unknown): ItemId[] {
  return Array.isArray(input) ? [...new Set(input.filter((id) => isShopItem(id) || isRoleItem(id)))] : [];
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
    card: has("card") ? style.card : DEFAULT_STYLE.card,
  };
}

/** Equips an item: the style with that one part swapped in. */
export function equip(style: PlayerStyle, id: ItemId): PlayerStyle {
  const [kind, value] = id.split(":") as [ItemKind, string];
  if (!(kind in OPTIONS)) return style;
  return sanitizeStyle({ ...style, [kind]: value });
}
