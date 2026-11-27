
// Profile cosmetics a player can pick, all free for everyone: name font, name effect, avatar frame,
// chat bubble decoration and profile card background.
// Ids are whitelisted here; labels live in messages (profile.font.<id> etc.),
// visuals in src/app/globals.css (.nf-<id>, .ne-<id>, .af-<id>, .cb-<id>, .pc-<id>).

export const NAME_FONTS = ["default", "serif", "script", "condensed", "mono", "brush"] as const;
export const NAME_EFFECTS = ["none", "glow", "blood", "flicker", "shimmer", "glitch", "fire", "gold"] as const;
export const AVATAR_FRAMES = [
  "none", "ring", "blood", "double", "moon", "thorns", "pulse", "crown", "frost", "runes", "wolf",
] as const;
/** Decorations laid over a player's chat colour; "plain" is just the colour. */
export const CHAT_DECOS = ["plain", "stars", "moon", "blood", "frost", "ember", "gold", "paws"] as const;
/** Backgrounds behind the avatar and name on the profile card. */
export const CARD_BGS = ["plain", "stars", "bloodmoon", "pines", "tarot", "mist", "gold", "village"] as const;

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
