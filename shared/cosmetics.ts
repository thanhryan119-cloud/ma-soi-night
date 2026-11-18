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
