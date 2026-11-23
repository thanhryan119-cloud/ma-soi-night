"use client";

// Avatars in a woodcut / engraving style (24 emoji ids), drawn as inline SVG.
// The wide phase and game-over scenes now come from Tarot.tsx (SceneArt
// below), drawn in the same black-and-white stencil style as the role cards.

import { TarotScene } from "./Tarot";
import { useId } from "react";

const INK = "#efe3c2";
const GOLD = "#e8b45a";
const BG = "#1a153d";
const DEEP = "#0d0a22";
const RED = "#c8323b";

/** Hatch patterns (unique per SVG so several drawings can share a page). */
function Hatch({ id, color = INK, gap = 4, angle = 45, width = 1.1, opacity = 0.55 }: { id: string; color?: string; gap?: number; angle?: number; width?: number; opacity?: number }) {
  return (
    <pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform={`rotate(${angle})`}>
      <line x1="0" y1="0" x2="0" y2={gap} stroke={color} strokeWidth={width} opacity={opacity} />
    </pattern>
  );
}

function useIds() {
  const raw = useId().replace(/:/g, "");
  return { h: `h${raw}`, x: `x${raw}`, g: `g${raw}`, r: `r${raw}` };
}

/** Shared <defs>: light hatch, cross hatch, gold hatch, red hatch. */
function Defs({ ids }: { ids: ReturnType<typeof useIds> }) {
  return (
    <defs>
      <Hatch id={ids.h} />
      <Hatch id={ids.x} angle={-45} />
      <Hatch id={ids.g} color={GOLD} gap={3.5} opacity={0.7} />
      <Hatch id={ids.r} color={RED} gap={3} opacity={0.9} width={1.4} />
    </defs>
  );
}

const ink = { fill: "none", stroke: INK, strokeWidth: 2.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

// ---------------------------------------------------------------------------
// Scenes (viewBox 200 x 120)
// ---------------------------------------------------------------------------

export type Scene =
  | "night"
  | "dawn"
  | "discussion"
  | "execute"
  | "spare"
  | "hunter"
  | "wolves"
  | "village"
  | "lovers"
  | "draw"
  | "hero";

/** A wide scene (projector phases, phones, game over), drawn in the cards' stencil style. */
export function SceneArt({ scene, className = "" }: { scene: Scene; className?: string }) {
  return <TarotScene scene={scene} className={className} />;
}

// ---------------------------------------------------------------------------
// Avatars (viewBox 64 x 64): engraved medallions keyed by the emoji ids
// ---------------------------------------------------------------------------

const A = { ...ink, strokeWidth: 2.6 };
const eyes = (y = 30, dx = 6, r = 2.2) => (
  <>
    <circle cx={32 - dx} cy={y} r={r} fill={INK} />
    <circle cx={32 + dx} cy={y} r={r} fill={INK} />
  </>
);

const AVATAR_DRAW: Record<string, (ids: ReturnType<typeof useIds>) => React.ReactNode> = {
  "🦊": () => (
    <>
      <path d="M14 18 L22 32 M50 18 L42 32" {...A} />
      <path d="M14 18 L24 26 L32 24 L40 26 L50 18 L48 34 L32 50 L16 34 Z" fill={GOLD} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M22 38 L32 50 L42 38 Q32 42 22 38 Z" fill={INK} />
      {eyes(32, 7, 2)}
      <circle cx="32" cy="48" r="2" fill={DEEP} />
    </>
  ),
  "🐻": () => (
    <>
      <circle cx="19" cy="20" r="6" fill={BG} stroke={INK} strokeWidth="2.4" />
      <circle cx="45" cy="20" r="6" fill={BG} stroke={INK} strokeWidth="2.4" />
      <circle cx="32" cy="35" r="16" fill={BG} stroke={INK} strokeWidth="2.6" />
      <ellipse cx="32" cy="41" rx="7" ry="5" fill={INK} />
      <ellipse cx="32" cy="38.5" rx="3" ry="2" fill={DEEP} />
      {eyes(31, 7, 2)}
    </>
  ),
  "🐼": () => (
    <>
      <circle cx="19" cy="20" r="6" fill={INK} />
      <circle cx="45" cy="20" r="6" fill={INK} />
      <circle cx="32" cy="35" r="16" fill={INK} />
      <ellipse cx="25" cy="32" rx="4.5" ry="6" fill={DEEP} transform="rotate(-25 25 32)" />
      <ellipse cx="39" cy="32" rx="4.5" ry="6" fill={DEEP} transform="rotate(25 39 32)" />
      <circle cx="25" cy="32" r="1.5" fill={INK} />
      <circle cx="39" cy="32" r="1.5" fill={INK} />
      <ellipse cx="32" cy="41" rx="3" ry="2" fill={DEEP} />
    </>
  ),
  "🐸": () => (
    <>
      <circle cx="21" cy="22" r="7" fill={BG} stroke={INK} strokeWidth="2.4" />
      <circle cx="43" cy="22" r="7" fill={BG} stroke={INK} strokeWidth="2.4" />
      <circle cx="21" cy="22" r="3" fill={INK} />
      <circle cx="43" cy="22" r="3" fill={INK} />
      <path d="M12 34 Q12 50 32 50 Q52 50 52 34 Q52 26 43 28 L21 28 Q12 26 12 34 Z" fill="#57cc99" stroke={INK} strokeWidth="2.4" />
      <path d="M20 38 Q32 46 44 38" {...A} strokeWidth={2} />
    </>
  ),
  "🦉": () => (
    <>
      <path d="M16 16 L22 24 M48 16 L42 24" {...A} />
      <ellipse cx="32" cy="36" rx="17" ry="18" fill={BG} stroke={INK} strokeWidth="2.6" />
      <circle cx="25" cy="31" r="6.5" fill={GOLD} stroke={INK} strokeWidth="2" />
      <circle cx="39" cy="31" r="6.5" fill={GOLD} stroke={INK} strokeWidth="2" />
      <circle cx="25" cy="31" r="2.6" fill={DEEP} />
      <circle cx="39" cy="31" r="2.6" fill={DEEP} />
      <path d="M32 36 l-3 5 h6 Z" fill={INK} />
      <path d="M24 46 l2 3 l2 -3 M30 47 l2 3 l2 -3 M36 46 l2 3 l2 -3" stroke={INK} strokeWidth="1.4" fill="none" />
    </>
  ),
  "🐱": () => (
    <>
      <path d="M16 30 L16 14 L26 22 M48 30 L48 14 L38 22" fill={BG} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="32" cy="35" r="16" fill={BG} stroke={INK} strokeWidth="2.6" />
      <path d="M24 31 q2 -3 4 0 M36 31 q2 -3 4 0" {...A} strokeWidth={2} />
      <path d="M32 38 l-2 2 h4 Z" fill={RED} />
      <path d="M14 38 h10 M14 43 l10 -2 M50 38 h-10 M50 43 l-10 -2" stroke={INK} strokeWidth="1.3" />
    </>
  ),
  "🐶": () => (
    <>
      <ellipse cx="17" cy="30" rx="6" ry="12" fill={INK} transform="rotate(15 17 30)" />
      <ellipse cx="47" cy="30" rx="6" ry="12" fill={INK} transform="rotate(-15 47 30)" />
      <circle cx="32" cy="34" r="15" fill={BG} stroke={INK} strokeWidth="2.6" />
      <ellipse cx="32" cy="41" rx="6" ry="4.5" fill={INK} />
      <ellipse cx="32" cy="38.5" rx="2.6" ry="1.8" fill={DEEP} />
      {eyes(31, 6, 2)}
    </>
  ),
  "🐰": () => (
    <>
      <ellipse cx="25" cy="16" rx="4.5" ry="12" fill={BG} stroke={INK} strokeWidth="2.4" />
      <ellipse cx="39" cy="16" rx="4.5" ry="12" fill={BG} stroke={INK} strokeWidth="2.4" />
      <path d="M25 9 v12 M39 9 v12" stroke={RED} strokeWidth="1.6" opacity="0.7" />
      <circle cx="32" cy="38" r="14" fill={BG} stroke={INK} strokeWidth="2.6" />
      {eyes(36, 5.5, 2)}
      <path d="M32 41 l-2 2 h4 Z M32 43 v3" fill={INK} stroke={INK} strokeWidth="1.2" />
    </>
  ),
  "🦁": () => (
    <>
      <path d="M32 6 L37 14 L46 10 L46 19 L56 21 L50 28 L57 35 L48 38 L50 48 L41 46 L37 55 L32 48 L27 55 L23 46 L14 48 L16 38 L7 35 L14 28 L8 21 L18 19 L18 10 L27 14 Z" fill={GOLD} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <circle cx="32" cy="32" r="12" fill={BG} stroke={INK} strokeWidth="2.4" />
      {eyes(29, 4.5, 1.8)}
      <path d="M32 33 l-3 3 h6 Z M32 36 v3 M28 40 q4 2 8 0" fill={INK} stroke={INK} strokeWidth="1.3" />
    </>
  ),
  "🐯": (ids) => (
    <>
      <circle cx="18" cy="20" r="5" fill={GOLD} stroke={INK} strokeWidth="2.2" />
      <circle cx="46" cy="20" r="5" fill={GOLD} stroke={INK} strokeWidth="2.2" />
      <circle cx="32" cy="34" r="16" fill={GOLD} stroke={INK} strokeWidth="2.6" />
      <path d="M32 19 v7 M26 20 l2 6 M38 20 l-2 6 M17 32 h6 M17 38 h5 M47 32 h-6 M47 38 h-5" stroke={DEEP} strokeWidth="2.2" strokeLinecap="round" />
      <ellipse cx="32" cy="41" rx="7" ry="5" fill={INK} />
      <path d="M32 38 l-2 2 h4 Z" fill={DEEP} />
      {eyes(31, 6, 2)}
      <rect width="0" height="0" fill={`url(#${ids.h})`} />
    </>
  ),
  "🐨": () => (
    <>
      <circle cx="15" cy="26" r="9" fill={BG} stroke={INK} strokeWidth="2.4" />
      <circle cx="49" cy="26" r="9" fill={BG} stroke={INK} strokeWidth="2.4" />
      <circle cx="15" cy="26" r="4" fill={INK} opacity="0.5" />
      <circle cx="49" cy="26" r="4" fill={INK} opacity="0.5" />
      <circle cx="32" cy="35" r="15" fill={BG} stroke={INK} strokeWidth="2.6" />
      <ellipse cx="32" cy="38" rx="5" ry="7" fill={INK} />
      {eyes(31, 7.5, 1.8)}
    </>
  ),
  "🐷": () => (
    <>
      <path d="M16 22 L18 12 L26 18 M48 22 L46 12 L38 18" fill="#e89aa8" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="32" cy="34" r="16" fill="#e89aa8" stroke={INK} strokeWidth="2.6" />
      <ellipse cx="32" cy="39" rx="8" ry="6" fill={BG} stroke={INK} strokeWidth="2" />
      <circle cx="29" cy="39" r="1.6" fill={INK} />
      <circle cx="35" cy="39" r="1.6" fill={INK} />
      {eyes(29, 7, 2)}
    </>
  ),
  "🐵": () => (
    <>
      <circle cx="14" cy="32" r="6" fill={GOLD} stroke={INK} strokeWidth="2.2" />
      <circle cx="50" cy="32" r="6" fill={GOLD} stroke={INK} strokeWidth="2.2" />
      <circle cx="32" cy="32" r="16" fill={BG} stroke={INK} strokeWidth="2.6" />
      <path d="M20 34 Q20 24 26 26 Q32 28 38 26 Q44 24 44 34 Q44 46 32 46 Q20 46 20 34 Z" fill={GOLD} stroke={INK} strokeWidth="1.6" />
      {eyes(31, 5, 2)}
      <path d="M27 40 q5 3 10 0" {...A} strokeWidth={1.8} />
    </>
  ),
  "🦄": (ids) => (
    <>
      <path d="M30 18 L36 2 L38 20" fill={GOLD} stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M32 8 l4 2 M31 13 l6 2" stroke={DEEP} strokeWidth="1.2" />
      <path d="M22 54 C20 40 22 26 34 20 C44 20 50 30 52 40 L44 44 L40 38 C36 44 36 50 38 54 Z" fill={BG} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M26 22 C18 28 16 40 20 52" fill="none" stroke="#b388eb" strokeWidth="3" strokeLinecap="round" />
      <circle cx="40" cy="30" r="2" fill={INK} />
      <rect width="0" height="0" fill={`url(#${ids.h})`} />
    </>
  ),
  "🐙": () => (
    <>
      <path d="M14 34 Q14 10 32 10 Q50 10 50 34 Z" fill="#b388eb" stroke={INK} strokeWidth="2.6" />
      {[16, 25, 34, 43].map((x, i) => (
        <path key={x} d={`M${x + 2} 34 q${i % 2 ? 4 : -4} 8 0 14 q${i % 2 ? -4 : 4} 4 0 8`} {...A} strokeWidth={2.4} />
      ))}
      {eyes(26, 6, 2.4)}
    </>
  ),
  "🦇": () => (
    <>
      <path d="M32 26 C26 22 16 20 6 26 C12 28 14 34 12 40 C18 36 24 38 28 42 Z M32 26 C38 22 48 20 58 26 C52 28 50 34 52 40 C46 36 40 38 36 42 Z" fill={DEEP} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <ellipse cx="32" cy="34" rx="6" ry="9" fill={INK} />
      <path d="M28 26 l1 -6 l3 4 l3 -4 l1 6" fill={INK} />
      <circle cx="30" cy="31" r="1.2" fill={RED} />
      <circle cx="34" cy="31" r="1.2" fill={RED} />
    </>
  ),
  "🐲": () => (
    <>
      <path d="M12 46 C14 30 24 20 38 20 L54 26 L50 32 L42 32 L46 40 L36 40 C32 46 26 50 12 46 Z" fill="#57cc99" stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M26 22 L22 10 L30 18 M34 20 L34 8 L38 20" fill="none" stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="36" cy="27" r="2" fill={RED} />
      <path d="M44 36 l3 2 M40 36 l2 3" stroke={INK} strokeWidth="1.4" />
      <path d="M50 30 q6 -2 8 -6" fill="none" stroke={GOLD} strokeWidth="1.6" />
    </>
  ),
  "🌙": (ids) => (
    <>
      <circle cx="32" cy="32" r="18" fill={INK} />
      <circle cx="40" cy="26" r="16" fill={BG} />
      <path d="M20 22 a18 18 0 0 0 12 28" fill={`url(#${ids.x})`} />
      <path d="M46 44 l1 3 3 1 -3 1 -1 3 -1 -3 -3 -1 3 -1 Z" fill={GOLD} />
    </>
  ),
  "⭐": (ids) => (
    <>
      <path d="M32 8 L38 25 L56 25 L41 36 L47 54 L32 43 L17 54 L23 36 L8 25 L26 25 Z" fill={GOLD} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M32 8 L38 25 L56 25 L41 36 L47 54 L32 43 Z" fill={`url(#${ids.x})`} />
    </>
  ),
  "🍀": () => (
    <>
      {[
        [24, 24],
        [40, 24],
        [24, 40],
        [40, 40],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="9" fill="#57cc99" stroke={INK} strokeWidth="2.2" />
      ))}
      <path d="M32 32 q8 12 4 22" {...A} />
    </>
  ),
  "🔥": (ids) => (
    <>
      <path d="M32 6 C40 18 50 24 48 40 C46 52 38 56 32 56 C24 56 16 50 16 40 C16 30 24 26 24 16 C28 22 30 24 32 6 Z" fill={RED} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M32 26 C36 34 42 38 40 46 C38 52 26 52 24 46 C22 40 28 36 32 26 Z" fill={GOLD} />
      <path d="M32 26 C36 34 42 38 40 46 C38 52 32 52 32 52 Z" fill={`url(#${ids.x})`} />
    </>
  ),
  "🎩": (ids) => (
    <>
      <rect x="20" y="12" width="24" height="30" fill={DEEP} stroke={INK} strokeWidth="2.4" />
      <rect x="20" y="12" width="24" height="30" fill={`url(#${ids.h})`} />
      <rect x="20" y="34" width="24" height="6" fill={RED} />
      <ellipse cx="32" cy="44" rx="20" ry="5" fill={DEEP} stroke={INK} strokeWidth="2.4" />
    </>
  ),
  "👻": () => (
    <>
      <path d="M14 54 V28 C14 16 22 10 32 10 C42 10 50 16 50 28 V54 L44 48 L38 54 L32 48 L26 54 L20 48 Z" fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="25" cy="28" rx="3" ry="4.5" fill={DEEP} />
      <ellipse cx="39" cy="28" rx="3" ry="4.5" fill={DEEP} />
      <ellipse cx="32" cy="38" rx="3" ry="4" fill={DEEP} />
    </>
  ),
  "🎃": (ids) => (
    <>
      <path d="M32 14 q2 -6 8 -6" fill="none" stroke="#57cc99" strokeWidth="2.6" />
      <ellipse cx="32" cy="35" rx="20" ry="17" fill="#e07a2e" stroke={INK} strokeWidth="2.4" />
      <path d="M32 18 V52 M22 20 Q18 35 22 51 M42 20 Q46 35 42 51" stroke={INK} strokeWidth="1.4" fill="none" opacity="0.7" />
      <path d="M22 30 l4 -4 l4 4 Z M34 30 l4 -4 l4 4 Z M22 40 q10 8 20 0 l-3 3 l-3 -3 l-4 4 l-4 -4 l-3 3 Z" fill={DEEP} />
      <rect width="0" height="0" fill={`url(#${ids.h})`} />
    </>
  ),
};

export const hasAvatarArt = (emoji: string) => emoji in AVATAR_DRAW;

/** Engraved medallion for an emoji avatar id. */
export function AvatarArt({ emoji, className = "" }: { emoji: string; className?: string }) {
  const ids = useIds();
  const draw = AVATAR_DRAW[emoji];
  if (!draw) return null;
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={emoji}>
      <Defs ids={ids} />
      <circle cx="32" cy="32" r="31" fill={BG} />
      <path d="M8 46 A28 28 0 0 0 56 46 Z" fill={`url(#${ids.x})`} opacity="0.5" />
      {draw(ids)}
      <circle cx="32" cy="32" r="30" fill="none" stroke={GOLD} strokeWidth="2" />
    </svg>
  );
}
