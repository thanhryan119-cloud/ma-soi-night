"use client";

// Original woodcut / gothic-engraving style illustrations, drawn as inline SVG:
// heavy cream ink lines, diagonal hatching for shade, antique gold frames.
// Role cards (tarot), phase scenes for the projector, home art and 24 avatars.

import { useId } from "react";
import type { RoleId } from "@shared/types";

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
// Tarot role cards (viewBox 120 x 160)
// ---------------------------------------------------------------------------

function CardFrame({ children, ids }: { children: React.ReactNode; ids: ReturnType<typeof useIds> }) {
  return (
    <>
      <rect x="1.5" y="1.5" width="117" height="157" rx="7" fill={DEEP} stroke={GOLD} strokeWidth="2" />
      <path d="M10 150 V36 Q10 12 60 10 Q110 12 110 36 V150 Z" fill={BG} stroke={GOLD} strokeWidth="1" opacity="0.95" />
      <rect x="10" y="132" width="100" height="18" fill={`url(#${ids.x})`} opacity="0.5" />
      {children}
      {[
        [6, 6],
        [114, 6],
        [6, 154],
        [114, 154],
      ].map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x} ${y - 3} L${x + 3} ${y} L${x} ${y + 3} L${x - 3} ${y} Z`} fill={GOLD} />
      ))}
      <path d="M48 18 L60 12 L72 18" fill="none" stroke={GOLD} strokeWidth="1" />
    </>
  );
}

const ROLE_DRAW: Record<RoleId, (ids: ReturnType<typeof useIds>) => React.ReactNode> = {
  werewolf: (ids) => (
    <>
      <circle cx="62" cy="58" r="30" fill={INK} />
      <circle cx="62" cy="58" r="30" fill={`url(#${ids.x})`} />
      <path d="M70 40 a30 30 0 0 1 0 36" fill="none" stroke={DEEP} strokeWidth="1.5" opacity="0.5" />
      <path
        d="M30 140 C30 114 36 98 46 88 L42 66 L53 77 C60 70 66 64 72 56 L90 48 L86 59 L79 63 C84 72 82 85 73 93 C80 106 84 122 84 140 Z"
        fill={DEEP}
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M64 70 l5 -2" stroke={RED} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M46 104 l8 6 M44 116 l10 4 M50 126 l8 2" stroke={INK} strokeWidth="1.2" opacity="0.6" />
    </>
  ),
  villager: (ids) => (
    <>
      <circle cx="88" cy="40" r="10" fill="none" stroke={GOLD} strokeWidth="1.5" />
      <path d="M28 92 L58 62 L88 92" {...ink} />
      <rect x="34" y="92" width="48" height="40" fill={BG} stroke={INK} strokeWidth="2.4" />
      <rect x="34" y="92" width="48" height="40" fill={`url(#${ids.h})`} />
      <rect x="52" y="108" width="12" height="24" fill={DEEP} stroke={INK} strokeWidth="2" />
      <rect x="39" y="100" width="9" height="9" fill={GOLD} stroke={INK} strokeWidth="1.5" />
      <path d="M43.5 100 v9 M39 104.5 h9" stroke={DEEP} strokeWidth="1" />
      <path d="M72 72 v-12 h7 v18" {...ink} />
      <path d="M76 56 q-4 -5 1 -9 q5 -4 1 -9" fill="none" stroke={INK} strokeWidth="1.4" opacity="0.7" />
      <path d="M96 134 L88 66 M82 68 l2 -8 M88 66 l0 -9 M94 64 l-1 -8 M82 68 Q88 72 94 64" {...ink} strokeWidth={2} />
    </>
  ),
  seer: (ids) => (
    <>
      {[...Array(12)].map((_, i) => {
        const a = (i / 12) * Math.PI * 2;
        return <line key={i} x1={60 + Math.cos(a) * 32} y1={74 + Math.sin(a) * 32} x2={60 + Math.cos(a) * 40} y2={74 + Math.sin(a) * 40} stroke={GOLD} strokeWidth="1.6" />;
      })}
      <circle cx="60" cy="74" r="26" fill={BG} stroke={INK} strokeWidth="2.4" />
      <path d="M60 48 a26 26 0 0 1 0 52" fill={`url(#${ids.h})`} />
      <path d="M40 74 Q60 58 80 74 Q60 90 40 74 Z" fill={DEEP} stroke={INK} strokeWidth="2" />
      <circle cx="60" cy="74" r="6" fill={GOLD} />
      <circle cx="60" cy="74" r="2.4" fill={DEEP} />
      <path d="M42 102 L78 102 L84 122 L36 122 Z" fill={DEEP} stroke={INK} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M36 122 h48" stroke={GOLD} strokeWidth="2" />
    </>
  ),
  bodyguard: (ids) => (
    <>
      <path d="M30 44 L92 126" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d="M26 50 l10 -10 M86 120 l12 12" stroke={GOLD} strokeWidth="3" strokeLinecap="round" />
      <path d="M60 46 L90 56 L88 90 C86 110 74 122 60 130 C46 122 34 110 32 90 L30 56 Z" fill={BG} stroke={INK} strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M60 46 L90 56 L88 90 C86 110 74 122 60 130 Z" fill={`url(#${ids.h})`} />
      <path d="M60 58 V118 M42 82 H78" stroke={GOLD} strokeWidth="4" strokeLinecap="round" />
      <path d="M38 62 L60 54 L82 62" fill="none" stroke={INK} strokeWidth="1.2" opacity="0.6" />
    </>
  ),
  witch: (ids) => (
    <>
      <path d="M38 82 v-10 h12 v10" {...ink} />
      <rect x="36" y="66" width="16" height="6" rx="2" fill={GOLD} />
      <circle cx="44" cy="104" r="22" fill={BG} stroke={INK} strokeWidth="2.4" />
      <path d="M23 106 a21 21 0 0 0 42 0 Z" fill="#57cc99" opacity="0.85" />
      <path d="M23 106 a21 21 0 0 0 42 0 Z" fill={`url(#${ids.h})`} />
      <circle cx="40" cy="96" r="2" fill={INK} />
      <circle cx="50" cy="90" r="1.5" fill={INK} />
      <path d="M76 60 h12 v12 l6 10 v42 h-24 v-42 l6 -10 Z" fill={BG} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <rect x="74" y="54" width="16" height="6" rx="2" fill={GOLD} />
      <path d="M71 96 h22 v28 h-22 Z" fill="#7b4fd6" opacity="0.85" />
      <path d="M71 96 h22 v28 h-22 Z" fill={`url(#${ids.x})`} />
      <circle cx="82" cy="104" r="4" fill={INK} />
      <path d="M78 112 l8 6 M86 112 l-8 6" stroke={INK} strokeWidth="1.6" />
      <path d="M60 40 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" fill={GOLD} />
    </>
  ),
  hunter: (ids) => (
    <>
      <circle cx="62" cy="88" r="30" fill="none" stroke={GOLD} strokeWidth="1.2" strokeDasharray="3 4" />
      <circle cx="62" cy="88" r="14" fill={`url(#${ids.r})`} stroke={RED} strokeWidth="1.5" />
      <path d="M40 44 C78 62 78 114 40 132" fill="none" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <path d="M40 44 L40 132" stroke={INK} strokeWidth="1.3" />
      <path d="M30 88 H98" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M98 88 l-9 -6 v12 Z" fill={GOLD} stroke={INK} strokeWidth="1.5" />
      <path d="M30 88 l-6 -6 M30 88 l-6 6 M36 88 l-6 -6 M36 88 l-6 6" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  cupid: (ids) => (
    <>
      <path d="M30 70 q-18 -10 -14 8 q4 12 18 6 M90 70 q18 -10 14 8 q-4 12 -18 6" fill="none" stroke={INK} strokeWidth="2" />
      <path d="M22 72 l8 2 M98 72 l-8 2 M20 80 l10 0 M100 80 l-10 0" stroke={INK} strokeWidth="1.2" opacity="0.7" />
      <path d="M60 126 C32 104 28 84 34 72 C42 58 56 62 60 74 C64 62 78 58 86 72 C92 84 88 104 60 126 Z" fill={RED} stroke={INK} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M60 126 C88 104 92 84 86 72 C80 62 70 62 64 70 Z" fill={`url(#${ids.x})`} />
      <path d="M26 118 L96 58" stroke={GOLD} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M96 58 l-10 1 l3 7 Z" fill={GOLD} />
      <path d="M26 118 l-2 -8 M26 118 l8 2 M31 114 l-2 -8 M31 114 l8 2" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
};

/** A tarot card for a role. */
export function RoleArt({ role, className = "" }: { role: RoleId; className?: string }) {
  const ids = useIds();
  return (
    <svg viewBox="0 0 120 160" className={className} role="img" aria-hidden>
      <Defs ids={ids} />
      <CardFrame ids={ids}>{ROLE_DRAW[role](ids)}</CardFrame>
    </svg>
  );
}

/** The back of a tarot card (hidden role). */
export function CardBack({ className = "" }: { className?: string }) {
  const ids = useIds();
  return (
    <svg viewBox="0 0 120 160" className={className} role="img" aria-hidden>
      <Defs ids={ids} />
      <CardFrame ids={ids}>
        <rect x="10" y="20" width="100" height="112" fill={`url(#${ids.g})`} opacity="0.25" />
        {[...Array(16)].map((_, i) => {
          const a = (i / 16) * Math.PI * 2;
          return <line key={i} x1={60 + Math.cos(a) * 24} y1={78 + Math.sin(a) * 24} x2={60 + Math.cos(a) * (i % 2 ? 32 : 40)} y2={78 + Math.sin(a) * (i % 2 ? 32 : 40)} stroke={GOLD} strokeWidth="1.6" />;
        })}
        <circle cx="60" cy="78" r="20" fill={INK} />
        <circle cx="68" cy="72" r="18" fill={BG} />
        <circle cx="60" cy="78" r="20" fill="none" stroke={GOLD} strokeWidth="1.5" />
        <path d="M60 30 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z M60 112 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" fill={GOLD} />
      </CardFrame>
    </svg>
  );
}

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

function Pines({ y = 112, fill = DEEP }: { y?: number; fill?: string }) {
  const trees = [8, 26, 40, 58, 150, 164, 182, 196];
  return (
    <>
      {trees.map((x, i) => {
        const h = 26 + ((i * 7) % 14);
        return <path key={x} d={`M${x} ${y} L${x - 8} ${y} L${x} ${y - h} L${x + 8} ${y} Z M${x} ${y - h * 0.6} l-7 8 h14 Z`} fill={fill} stroke={INK} strokeWidth="1.2" strokeLinejoin="round" />;
      })}
    </>
  );
}

function Stars() {
  return (
    <>
      {[
        [20, 18],
        [48, 30],
        [90, 14],
        [118, 32],
        [70, 44],
        [34, 52],
      ].map(([x, y]) => (
        <path key={`${x}${y}`} d={`M${x} ${y - 3} L${x + 1} ${y - 1} L${x + 3} ${y} L${x + 1} ${y + 1} L${x} ${y + 3} L${x - 1} ${y + 1} L${x - 3} ${y} L${x - 1} ${y - 1} Z`} fill={GOLD} />
      ))}
    </>
  );
}

function Wolf({ x = 0, y = 0, s = 1, flip = false }: { x?: number; y?: number; s?: number; flip?: boolean }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${flip ? -s : s} ${s})`}
      d="M0 60 C0 42 4 30 12 22 L9 6 L18 14 C23 9 28 4 33 -2 L46 -8 L43 0 L37 3 C41 10 40 20 33 26 C39 36 42 48 42 60 Z"
      fill={DEEP}
      stroke={INK}
      strokeWidth={2 / s}
      strokeLinejoin="round"
    />
  );
}

const SCENES: Record<Scene, (ids: ReturnType<typeof useIds>) => React.ReactNode> = {
  night: (ids) => (
    <>
      <rect width="200" height="120" fill={`url(#${ids.x})`} opacity="0.35" />
      <Stars />
      <circle cx="160" cy="34" r="20" fill={INK} />
      <circle cx="170" cy="28" r="18" fill={BG} />
      <Pines />
    </>
  ),
  dawn: (ids) => (
    <>
      {[...Array(11)].map((_, i) => {
        const a = Math.PI + (i / 10) * Math.PI;
        return <line key={i} x1={100 + Math.cos(a) * 34} y1={92 + Math.sin(a) * 34} x2={100 + Math.cos(a) * 60} y2={92 + Math.sin(a) * 60} stroke={GOLD} strokeWidth="2" />;
      })}
      <path d="M70 92 a30 30 0 0 1 60 0 Z" fill={GOLD} stroke={INK} strokeWidth="2" />
      <path d="M70 92 a30 30 0 0 1 60 0 Z" fill={`url(#${ids.h})`} />
      <path d="M0 120 Q40 84 80 104 Q120 80 160 100 Q184 90 200 98 V120 Z" fill={DEEP} stroke={INK} strokeWidth="2" />
      <path d="M150 40 q6 -6 12 0 q6 -6 12 0" fill="none" stroke={INK} strokeWidth="1.8" />
    </>
  ),
  discussion: (ids) => (
    <>
      {[30, 64, 100, 136, 170].map((x, i) => (
        <g key={x}>
          <path d={`M${x - 16} 120 Q${x - 16} ${92 - (i % 2) * 6} ${x} ${92 - (i % 2) * 6} Q${x + 16} ${92 - (i % 2) * 6} ${x + 16} 120 Z`} fill={DEEP} stroke={INK} strokeWidth="2" />
          <circle cx={x} cy={78 - (i % 2) * 6} r="10" fill={DEEP} stroke={INK} strokeWidth="2" />
        </g>
      ))}
      <path d="M58 20 h84 a8 8 0 0 1 8 8 v22 a8 8 0 0 1 -8 8 h-50 l-12 10 v-10 h-22 a8 8 0 0 1 -8 -8 v-22 a8 8 0 0 1 8 -8 Z" fill={BG} stroke={GOLD} strokeWidth="2" />
      <path d="M58 20 h84 a8 8 0 0 1 8 8 v22 a8 8 0 0 1 -8 8 h-84 Z" fill={`url(#${ids.h})`} opacity="0.6" />
      <text x="100" y="45" textAnchor="middle" fill={GOLD} fontSize="20" fontFamily="Georgia, serif" fontWeight="700">? ? ?</text>
    </>
  ),
  execute: (ids) => (
    <>
      <path d="M0 112 H200 V120 H0 Z" fill={`url(#${ids.x})`} />
      <path d="M60 112 V14 H130 M60 34 L80 14" {...ink} strokeWidth={4} />
      <path d="M124 14 V40" stroke={INK} strokeWidth="2" />
      <ellipse cx="124" cy="50" rx="8" ry="11" fill="none" stroke={RED} strokeWidth="3" />
      <path d="M40 112 h60" stroke={INK} strokeWidth="4" strokeLinecap="round" />
      <path d="M160 30 q6 -5 12 0 q6 -5 12 0 M150 52 q5 -4 10 0 q5 -4 10 0" fill="none" stroke={INK} strokeWidth="1.8" />
    </>
  ),
  spare: (ids) => (
    <>
      {[...Array(9)].map((_, i) => {
        const a = (i / 9) * Math.PI * 2;
        return <line key={i} x1={100 + Math.cos(a) * 40} y1={60 + Math.sin(a) * 40} x2={100 + Math.cos(a) * 52} y2={60 + Math.sin(a) * 52} stroke={GOLD} strokeWidth="1.5" />;
      })}
      <path d="M62 66 C76 46 94 44 104 54 C112 40 134 30 150 34 C138 44 128 56 120 66 C132 66 140 72 144 80 C126 80 110 76 98 72 C88 82 72 82 62 66 Z" fill={INK} stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M104 54 C112 40 134 30 150 34 C138 44 128 56 120 66 Z" fill={`url(#${ids.x})`} />
      <circle cx="74" cy="64" r="1.8" fill={DEEP} />
      <path d="M62 66 l-8 2 l8 2" fill={GOLD} stroke={GOLD} strokeWidth="1" />
      <path d="M54 76 q10 8 24 4" fill="none" stroke="#57cc99" strokeWidth="2" />
    </>
  ),
  hunter: (ids) => (
    <>
      <circle cx="140" cy="60" r="36" fill="none" stroke={INK} strokeWidth="2" />
      <circle cx="140" cy="60" r="24" fill={`url(#${ids.h})`} stroke={INK} strokeWidth="2" />
      <circle cx="140" cy="60" r="11" fill={RED} stroke={INK} strokeWidth="2" />
      <path d="M20 86 L136 62" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      <path d="M136 62 l-11 -3 l3 10 Z" fill={GOLD} />
      <path d="M20 86 l-4 -8 M20 86 l-2 9 M28 84 l-4 -8 M28 84 l-2 9" stroke={GOLD} strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  wolves: (ids) => (
    <>
      <circle cx="100" cy="50" r="38" fill={RED} />
      <circle cx="100" cy="50" r="38" fill={`url(#${ids.x})`} />
      <Wolf x={62} y={56} s={1.1} />
      <Wolf x={140} y={58} s={1.05} flip />
      <path d="M0 116 Q100 92 200 116 V120 H0 Z" fill={DEEP} stroke={INK} strokeWidth="2" />
    </>
  ),
  village: (ids) => (
    <>
      {[...Array(9)].map((_, i) => {
        const a = Math.PI + (i / 8) * Math.PI;
        return <line key={i} x1={150 + Math.cos(a) * 20} y1={46 + Math.sin(a) * 20} x2={150 + Math.cos(a) * 32} y2={46 + Math.sin(a) * 32} stroke={GOLD} strokeWidth="2" />;
      })}
      <circle cx="150" cy="46" r="16" fill={GOLD} stroke={INK} strokeWidth="2" />
      {[40, 84, 120].map((x, i) => (
        <g key={x}>
          <path d={`M${x - 18} ${78 - i * 4} L${x} ${58 - i * 4} L${x + 18} ${78 - i * 4}`} {...ink} />
          <rect x={x - 14} y={78 - i * 4} width="28" height={36 + i * 4} fill={BG} stroke={INK} strokeWidth="2" />
          <rect x={x - 14} y={78 - i * 4} width="28" height={36 + i * 4} fill={`url(#${ids.h})`} />
          <rect x={x - 4} y={96} width="8" height="18" fill={GOLD} stroke={INK} strokeWidth="1.5" />
        </g>
      ))}
      <path d="M0 114 H200 V120 H0 Z" fill={DEEP} stroke={INK} strokeWidth="2" />
    </>
  ),
  lovers: (ids) => (
    <>
      {[
        [78, 0],
        [122, 1],
      ].map(([x, i]) => (
        <g key={x}>
          <path
            d={`M${x} ${96} C${x - 26} ${76} ${x - 30} ${56} ${x - 22} ${46} C${x - 14} ${36} ${x - 2} ${40} ${x} ${50} C${x + 2} ${40} ${x + 14} ${36} ${x + 22} ${46} C${x + 30} ${56} ${x + 26} ${76} ${x} ${96} Z`}
            fill={i ? RED : INK}
            stroke={INK}
            strokeWidth="2.2"
          />
          <path d={`M${x} 96 C${x + 26} 76 ${x + 30} 56 ${x + 22} 46 L${x} 50 Z`} fill={`url(#${ids.x})`} />
        </g>
      ))}
      <path d="M40 92 L164 34" stroke={GOLD} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M164 34 l-11 0 l4 9 Z" fill={GOLD} />
    </>
  ),
  draw: (ids) => (
    <>
      <path d="M78 52 a22 22 0 1 1 44 0 v14 h-8 v10 h-28 v-10 h-8 Z" fill={INK} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
      <path d="M100 30 a22 22 0 0 1 22 22 v14 h-8 v10 h-14 Z" fill={`url(#${ids.x})`} />
      <circle cx="90" cy="54" r="6" fill={DEEP} />
      <circle cx="110" cy="54" r="6" fill={DEEP} />
      <path d="M100 60 l-3 6 h6 Z" fill={DEEP} />
      <path d="M92 76 v-6 M100 76 v-6 M108 76 v-6" stroke={DEEP} strokeWidth="2" />
      <rect x="150" y="66" width="12" height="40" fill={INK} stroke={INK} />
      <path d="M156 66 q-6 -10 0 -18 q6 8 0 18 Z" fill={GOLD} />
      <path d="M40 106 h120" stroke={INK} strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  hero: (ids) => (
    <>
      <rect width="200" height="120" fill={`url(#${ids.x})`} opacity="0.25" />
      <Stars />
      <circle cx="132" cy="44" r="30" fill={INK} />
      <circle cx="132" cy="44" r="30" fill={`url(#${ids.x})`} />
      <path d="M0 120 Q50 92 104 98 Q150 86 200 104 V120 Z" fill={DEEP} stroke={INK} strokeWidth="2" />
      <Wolf x={108} y={44} s={0.85} />
      <Pines y={118} />
    </>
  ),
};

/** A wide woodcut scene (projector phases, home, lobby). */
export function SceneArt({ scene, className = "" }: { scene: Scene; className?: string }) {
  const ids = useIds();
  return (
    <svg viewBox="0 0 200 120" className={className} role="img" aria-hidden>
      <Defs ids={ids} />
      <clipPath id={`c${ids.h}`}>
        <rect x="2" y="2" width="196" height="116" rx="5" />
      </clipPath>
      <rect x="1" y="1" width="198" height="118" rx="6" fill={BG} stroke={GOLD} strokeWidth="1.5" />
      <g clipPath={`url(#c${ids.h})`}>{SCENES[scene](ids)}</g>
      <rect x="4" y="4" width="192" height="112" rx="4" fill="none" stroke={GOLD} strokeWidth="0.6" opacity="0.6" />
    </svg>
  );
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
