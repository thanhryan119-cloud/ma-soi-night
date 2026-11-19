"use client";

// Original vintage-tarot illustrations (flat colours, heavy black outlines,
// cream card stock, roman numeral at the top and a name banner at the bottom).

import { cosR, sinR } from "./trig";
import { useId } from "react";
import type { RoleId } from "@shared/types";
import { useT } from "@/lib/i18n";

const K = "#1d1b1a"; // outline ink
const CREAM = "#f6efe0";
const PAPER = "#efe2c4";
const MUST = "#e9b44c";
const TEAL = "#2f6f6a";
const DTEAL = "#1f3f3d";
const ORANGE = "#d0583a";
const SLATE = "#7d9aa8";
const NAVY = "#22313f";
const SKIN = "#efc39b";
const SAND = "#e8d5ac";
const GREEN = "#6fa86b";

const line = { stroke: K, strokeWidth: 1.6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };

/** Little face: closed or open eyes, nose and mouth. */
function Face({ x, y, open = false }: { x: number; y: number; open?: boolean }) {
  return open ? (
    <>
      <circle cx={x - 3} cy={y - 1} r="0.9" fill={K} />
      <circle cx={x + 3} cy={y - 1} r="0.9" fill={K} />
      <path d={`M${x} ${y} v2.5 M${x - 2} ${y + 4.5} q2 1.2 4 0`} fill="none" stroke={K} strokeWidth="0.9" strokeLinecap="round" />
    </>
  ) : (
    <>
      <path d={`M${x - 4.5} ${y - 1} q1.5 1.2 3 0 M${x + 1.5} ${y - 1} q1.5 1.2 3 0 M${x} ${y} v2.5 M${x - 2} ${y + 4.5} q2 1 4 0`} fill="none" stroke={K} strokeWidth="0.9" strokeLinecap="round" />
    </>
  );
}

function Stars({ pts, fill = CREAM }: { pts: [number, number][]; fill?: string }) {
  return (
    <>
      {pts.map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x} ${y - 3} L${x + 0.9} ${y - 0.9} L${x + 3} ${y} L${x + 0.9} ${y + 0.9} L${x} ${y + 3} L${x - 0.9} ${y + 0.9} L${x - 3} ${y} L${x - 0.9} ${y - 0.9} Z`} fill={fill} />
      ))}
    </>
  );
}

/** Radiating rays behind a figure. */
function Rays({ cx, cy, r1, r2, n = 16, color = K, w = 0.8 }: { cx: number; cy: number; r1: number; r2: number; n?: number; color?: string; w?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        return <line key={i} x1={cx + cosR(a) * r1} y1={cy + sinR(a) * r1} x2={cx + cosR(a) * r2} y2={cy + sinR(a) * r2} stroke={color} strokeWidth={w} />;
      })}
    </>
  );
}

const NUMERAL: Record<RoleId, string> = {
  werewolf: "XVIII",
  villager: "I",
  seer: "II",
  bodyguard: "VII",
  witch: "XIV",
  hunter: "VIII",
  cupid: "VI",
};

// Panel: x 8..112, y 22..168 (centre x = 60)
const ART: Record<RoleId, React.ReactNode> = {
  werewolf: (
    <>
      <rect x="8" y="22" width="104" height="146" fill={NAVY} />
      <Stars pts={[[20, 34], [100, 40], [26, 72], [96, 78], [16, 52]]} />
      <Rays cx={62} cy={58} r1={24} r2={34} n={24} color={MUST} w={1.2} />
      <circle cx="62" cy="58" r="22" fill={MUST} {...line} />
      <path d="M50 54 q4 3 8 0 M66 54 q4 3 8 0 M62 58 v6 M57 68 q5 3 10 0" fill="none" stroke={K} strokeWidth="1.2" strokeLinecap="round" />
      <path d="M8 132 Q40 116 70 126 Q92 132 112 120 V168 H8 Z" fill={TEAL} {...line} />
      <path d="M14 128 l5 -3 M28 124 l5 -2 M82 128 l5 -2 M98 124 l4 -2" stroke={DTEAL} strokeWidth="1.2" />
      {/* howling wolf */}
      <path
        d="M30 150 C29 132 33 120 41 112 L38 96 L47 104 C52 99 57 94 62 88 L75 82 L71 92 L65 95 C69 103 68 114 61 121 C67 130 71 140 71 150 Z"
        fill="#9aa3a6"
        {...line}
        strokeWidth={1.8}
      />
      <path d="M44 120 q6 4 4 12 M52 134 q4 6 2 14 M60 98 q-6 2 -8 8" fill="none" stroke={K} strokeWidth="1" />
      <path d="M56 101 l4 -1.4" stroke={ORANGE} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 150 H112 V168 H8 Z" fill={DTEAL} {...line} />
      <path d="M14 158 h20 M44 160 h30 M84 157 h20" stroke={TEAL} strokeWidth="1.5" />
    </>
  ),
  villager: (
    <>
      <rect x="8" y="22" width="104" height="146" fill="#a9c2cc" />
      <circle cx="92" cy="40" r="9" fill={MUST} {...line} />
      <path d="M8 120 Q50 104 112 116 V168 H8 Z" fill={GREEN} {...line} />
      {/* cottage */}
      <path d="M62 78 L82 60 L102 78" fill={ORANGE} {...line} />
      <rect x="66" y="78" width="32" height="30" fill={SAND} {...line} />
      <rect x="78" y="92" width="8" height="16" fill={DTEAL} {...line} />
      <rect x="69" y="83" width="7" height="7" fill={MUST} {...line} strokeWidth={1} />
      {/* villager */}
      <path d="M26 166 L30 118 Q40 108 50 118 L54 166 Z" fill={ORANGE} {...line} />
      <path d="M30 140 h24 M32 128 l-2 38 M48 128 l3 38" stroke={K} strokeWidth="0.9" />
      <rect x="28" y="136" width="24" height="5" fill={MUST} {...line} strokeWidth={1.2} />
      <circle cx="40" cy="104" r="9" fill={SKIN} {...line} />
      <path d="M31 101 q9 -12 18 0 q-2 -6 -9 -7 q-7 1 -9 7 Z" fill="#6b4a2f" {...line} strokeWidth={1.2} />
      <Face x={40} y={105} open />
      {/* arm + lantern */}
      <path d="M50 120 Q60 126 62 136" fill="none" {...line} strokeWidth={4} stroke={ORANGE} />
      <path d="M50 120 Q60 126 62 136" fill="none" stroke={K} strokeWidth="1" />
      <path d="M62 136 v4" stroke={K} strokeWidth="1.2" />
      <rect x="57" y="140" width="10" height="13" rx="2" fill={MUST} {...line} />
      <path d="M62 143 v7" stroke={ORANGE} strokeWidth="2" />
      {/* pitchfork */}
      <path d="M22 166 L22 102 M17 104 v-8 M22 102 v-8 M27 104 v-8 M17 104 q5 3 10 0" fill="none" {...line} />
    </>
  ),
  seer: (
    <>
      <rect x="8" y="22" width="104" height="146" fill={DTEAL} />
      <Stars pts={[[18, 32], [102, 34], [96, 62], [20, 64], [60, 30]]} fill={MUST} />
      <path d="M60 38 a28 28 0 0 1 0 56 a20 20 0 0 0 0 -56 Z" fill={MUST} opacity="0.35" />
      {/* hooded seer */}
      <path d="M30 168 C30 128 38 96 60 86 C82 96 90 128 90 168 Z" fill={TEAL} {...line} />
      <path d="M40 168 C42 136 48 112 60 104 C72 112 78 136 80 168" fill="none" stroke={K} strokeWidth="1" />
      <path d="M44 92 C44 70 76 70 76 92 L72 104 L48 104 Z" fill={NAVY} {...line} />
      <ellipse cx="60" cy="92" rx="9" ry="10" fill={SKIN} {...line} />
      <Face x={60} y={93} />
      <Stars pts={[[60, 80]]} fill={MUST} />
      {/* hands + crystal ball */}
      <circle cx="60" cy="130" r="13" fill={CREAM} {...line} />
      <path d="M53 124 a8 8 0 0 1 8 -4" fill="none" stroke={SLATE} strokeWidth="1.5" />
      <path d="M50 132 a10 10 0 0 0 20 0" fill={MUST} opacity="0.35" />
      <path d="M45 140 q5 6 15 6 q10 0 15 -6" fill={SKIN} {...line} />
      <path d="M44 162 Q60 152 76 162 Q60 158 44 162 Z" fill={MUST} {...line} strokeWidth={1.2} />
    </>
  ),
  bodyguard: (
    <>
      <rect x="8" y="22" width="104" height="146" fill={MUST} />
      <Rays cx={60} cy={70} r1={30} r2={60} n={18} color={ORANGE} w={1.4} />
      <path d="M8 150 H112 V168 H8 Z" fill={SAND} {...line} />
      {/* cape */}
      <path d="M38 96 Q30 140 26 166 L94 166 Q90 140 82 96 Z" fill={ORANGE} {...line} />
      {/* body armour */}
      <path d="M44 96 L76 96 L80 150 L40 150 Z" fill={SLATE} {...line} />
      <path d="M44 112 h32 M42 128 h36" stroke={K} strokeWidth="1" />
      <path d="M44 150 L42 166 M76 150 L78 166 M52 150 v16 M68 150 v16" stroke={K} strokeWidth="1.4" />
      {/* helmet head */}
      <circle cx="60" cy="82" r="10" fill={SKIN} {...line} />
      <path d="M49 82 C49 64 71 64 71 82 L71 76 L49 76 Z" fill="#b9b9b0" {...line} />
      <path d="M60 64 v-8 M56 58 h8" stroke={K} strokeWidth="1.4" />
      <path d="M60 56 q6 -6 4 -12" fill="none" stroke={ORANGE} strokeWidth="2.4" strokeLinecap="round" />
      <Face x={60} y={84} open />
      {/* shield */}
      <path d="M26 104 L50 100 L50 128 Q50 142 38 150 Q26 142 26 128 Z" fill={TEAL} {...line} />
      <path d="M38 106 V144 M28 122 H48" stroke={MUST} strokeWidth="3.4" />
      {/* sword */}
      <path d="M86 54 V128" stroke={CREAM} strokeWidth="4" />
      <path d="M86 54 V128" fill="none" stroke={K} strokeWidth="1" />
      <path d="M78 128 h16 M86 128 v12" stroke={K} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M86 50 l-2.5 5 h5 Z" fill={CREAM} {...line} strokeWidth={1} />
    </>
  ),
  witch: (
    <>
      <rect x="8" y="22" width="104" height="146" fill={TEAL} />
      <Stars pts={[[18, 34], [100, 30], [102, 70], [16, 80]]} fill={MUST} />
      <circle cx="96" cy="46" r="8" fill={CREAM} {...line} />
      <circle cx="100" cy="43" r="7" fill={TEAL} />
      {/* robe */}
      <path d="M32 166 C34 132 42 108 56 100 C70 108 76 132 78 166 Z" fill={DTEAL} {...line} />
      <path d="M44 166 C46 140 50 120 56 112" fill="none" stroke={K} strokeWidth="1" />
      {/* head + hat */}
      <ellipse cx="56" cy="92" rx="8.5" ry="9.5" fill={SKIN} {...line} />
      <path d="M44 96 q-2 -10 2 -16 M68 96 q2 -10 -2 -16" fill="none" stroke={ORANGE} strokeWidth="3" />
      <path d="M34 84 h44 l-4 -4 h-36 Z" fill={NAVY} {...line} />
      <path d="M42 80 L56 44 L66 64 L72 80 Z" fill={NAVY} {...line} />
      <path d="M44 76 h26" stroke={MUST} strokeWidth="2.4" />
      <Face x={56} y={93} open />
      {/* arm with potion */}
      <path d="M68 116 Q82 112 86 100" fill="none" stroke={DTEAL} strokeWidth="5" strokeLinecap="round" />
      <path d="M68 116 Q82 112 86 100" fill="none" stroke={K} strokeWidth="1" />
      <path d="M84 84 h6 v6 l5 8 v10 h-16 v-10 l5 -8 Z" fill={GREEN} {...line} />
      <path d="M83 82 h8" stroke={ORANGE} strokeWidth="3" />
      {/* cauldron */}
      <path d="M78 140 h30 q0 22 -15 24 q-15 -2 -15 -24 Z" fill={K} />
      <ellipse cx="93" cy="140" rx="15" ry="4" fill={GREEN} {...line} />
      <circle cx="88" cy="132" r="2.2" fill={GREEN} {...line} strokeWidth={0.8} />
      <circle cx="97" cy="128" r="1.6" fill={GREEN} {...line} strokeWidth={0.8} />
    </>
  ),
  hunter: (
    <>
      <rect x="8" y="22" width="104" height="146" fill={SAND} />
      <circle cx="30" cy="40" r="10" fill={ORANGE} {...line} />
      {[16, 32, 92, 106].map((x, i) => (
        <path key={x} d={`M${x} 150 L${x - 10} 150 L${x} ${110 - (i % 2) * 14} L${x + 10} 150 Z`} fill={DTEAL} {...line} />
      ))}
      <path d="M8 148 H112 V168 H8 Z" fill={GREEN} {...line} />
      {/* hunter */}
      <path d="M44 166 L48 118 Q58 108 68 118 L74 166 Z" fill={ORANGE} {...line} />
      <path d="M48 140 h24 M52 130 l-4 36 M66 130 l4 36" stroke={K} strokeWidth="0.9" />
      <path d="M40 118 Q58 104 76 118 L72 150 Q58 140 44 150 Z" fill={MUST} opacity="0.0" />
      <circle cx="58" cy="104" r="9" fill={SKIN} {...line} />
      <path d="M48 104 C48 88 68 88 68 102 L70 98 L74 104 L66 100 Z" fill={DTEAL} {...line} />
      <path d="M64 92 l12 -6" stroke={ORANGE} strokeWidth="2" strokeLinecap="round" />
      <Face x={57} y={105} open />
      {/* bow & arrow drawn to the right */}
      <path d="M92 86 C104 104 104 132 92 150" fill="none" stroke={MUST} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M92 86 C104 104 104 132 92 150" fill="none" stroke={K} strokeWidth="1" />
      <path d="M92 86 L64 118 L92 150" fill="none" stroke={K} strokeWidth="0.8" />
      <path d="M62 118 H110" stroke={K} strokeWidth="1.6" />
      <path d="M110 118 l-6 -3 v6 Z" fill={K} />
      <path d="M66 120 L84 120" fill="none" stroke={ORANGE} strokeWidth="4" strokeLinecap="round" />
      <path d="M66 120 L84 120" fill="none" stroke={K} strokeWidth="0.8" />
    </>
  ),
  cupid: (
    <>
      <rect x="8" y="22" width="104" height="146" fill={MUST} />
      <Rays cx={60} cy={60} r1={18} r2={58} n={20} color={ORANGE} w={1.2} />
      <circle cx="60" cy="60" r="14" fill={CREAM} {...line} />
      <path d="M8 150 Q60 136 112 150 V168 H8 Z" fill={SLATE} {...line} />
      {/* wings */}
      <path d="M52 104 C34 92 22 98 18 112 C28 110 34 116 34 124 C42 118 48 116 52 116 Z" fill={CREAM} {...line} />
      <path d="M68 104 C86 92 98 98 102 112 C92 110 86 116 86 124 C78 118 72 116 68 116 Z" fill={CREAM} {...line} />
      <path d="M26 108 q6 0 10 6 M94 108 q-6 0 -10 6" fill="none" stroke={K} strokeWidth="0.9" />
      {/* body */}
      <path d="M48 140 C46 120 50 108 60 106 C70 108 74 120 72 140 Z" fill={SKIN} {...line} />
      <path d="M46 132 Q60 140 74 132 L76 146 Q60 152 44 146 Z" fill={TEAL} {...line} />
      <path d="M52 146 L50 160 M68 146 L70 160" stroke={SKIN} strokeWidth="5" strokeLinecap="round" />
      <path d="M52 146 L50 160 M68 146 L70 160" stroke={K} strokeWidth="0.8" />
      <circle cx="60" cy="96" r="10" fill={SKIN} {...line} />
      <path d="M50 94 q2 -10 10 -10 q8 0 10 10 q-3 -5 -6 -5 q-2 3 -4 3 q-2 -3 -4 -3 q-4 0 -6 5 Z" fill={MUST} {...line} strokeWidth={1} />
      <Face x={60} y={97} />
      {/* heart */}
      <path d="M60 80 C50 72 46 62 52 58 C56 55 60 58 60 62 C60 58 64 55 68 58 C74 62 70 72 60 80 Z" fill={ORANGE} {...line} transform="translate(0 -26)" />
      {/* bow */}
      <path d="M78 102 q14 14 0 30" fill="none" stroke={K} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M78 102 v30" stroke={K} strokeWidth="0.8" />
    </>
  ),
};

function CardShell({ numeral, title, children, clipId }: { numeral?: string; title?: string; children: React.ReactNode; clipId: string }) {
  return (
    <>
      <rect x="1" y="1" width="118" height="198" rx="8" fill={CREAM} stroke={K} strokeWidth="1.4" />
      <clipPath id={clipId}>
        <rect x="8" y="22" width="104" height="146" />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>{children}</g>
      <rect x="8" y="22" width="104" height="146" fill="none" stroke={K} strokeWidth="2" />
      {numeral && (
        <>
          <rect x="44" y="6" width="32" height="13" fill={PAPER} stroke={K} strokeWidth="1" />
          <text x="60" y="16" textAnchor="middle" fontSize="9.5" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" fill={K}>
            {numeral}
          </text>
        </>
      )}
      <rect x="8" y="172" width="104" height="20" fill={PAPER} stroke={K} strokeWidth="1.2" />
      {title && (
        <text
          x="60"
          y="186"
          textAnchor="middle"
          fontSize={title.length > 10 ? 9.5 : 11}
          fontFamily="Georgia, 'Times New Roman', serif"
          fontWeight="700"
          letterSpacing="1"
          fill={K}
        >
          {title.toUpperCase()}
        </text>
      )}
    </>
  );
}

/** A vintage tarot card for a role (name and numeral included). */
export function RoleArt({ role, className = "" }: { role: RoleId; className?: string }) {
  const t = useT();
  const id = `t${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 120 200" className={className} role="img" aria-label={t(`roles.${role}.name`)}>
      <CardShell numeral={NUMERAL[role]} title={t(`roles.${role}.name`)} clipId={id}>
        {ART[role]}
      </CardShell>
    </svg>
  );
}

/** The back of a tarot card: a sun-star mandala on midnight teal. */
export function CardBack({ className = "" }: { className?: string }) {
  const id = `b${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 120 200" className={className} role="img" aria-hidden>
      <rect x="1" y="1" width="118" height="198" rx="8" fill={CREAM} stroke={K} strokeWidth="1.4" />
      <clipPath id={id}>
        <rect x="8" y="8" width="104" height="184" rx="3" />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <rect x="8" y="8" width="104" height="184" fill={DTEAL} />
        <Rays cx={60} cy={100} r1={22} r2={70} n={32} color={MUST} w={1} />
        <circle cx="60" cy="100" r="30" fill={MUST} stroke={K} strokeWidth="1.6" />
        <path
          d="M60 72 L66 94 L88 100 L66 106 L60 128 L54 106 L32 100 L54 94 Z"
          fill={DTEAL}
          stroke={K}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <circle cx="60" cy="100" r="6" fill={MUST} stroke={K} strokeWidth="1.2" />
        <Stars pts={[[24, 26], [96, 26], [24, 174], [96, 174], [60, 22], [60, 178]]} fill={MUST} />
        <path d="M20 40 Q60 30 100 40 M20 160 Q60 170 100 160" fill="none" stroke={MUST} strokeWidth="1" />
      </g>
      <rect x="8" y="8" width="104" height="184" rx="3" fill="none" stroke={K} strokeWidth="2" />
    </svg>
  );
}
