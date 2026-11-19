"use client";

// Original black-and-white stencil tarot cards (linocut / woodblock feel):
// bold white line-work and solid white moons on pure black, chunky striped
// hatching, an arched panel, a roman numeral in a white pill on top and a
// white name plaque at the bottom.

import { cosR, sinR } from "./trig";
import { useId } from "react";
import type { RoleId } from "@shared/types";
import { useT } from "@/lib/i18n";

const INK = "#000000";
const INK2 = "#000000";
const GOLD = "#ffffff"; // the cut "ink" of the stencil
const PALE = "#ffffff";
const EMBER = "#ffffff";

const g = { stroke: GOLD, strokeWidth: 1.6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const n2 = (v: number) => Math.round(v * 100) / 100;

interface Fill {
  hatch: string;
  dots: string;
}

/** Four-point sparkle. */
function Spark({ x, y, s = 3, fill = PALE }: { x: number; y: number; s?: number; fill?: string }) {
  const k = s * 0.28;
  return <path d={`M${x} ${y - s} L${x + k} ${y - k} L${x + s} ${y} L${x + k} ${y + k} L${x} ${y + s} L${x - k} ${y + k} L${x - s} ${y} L${x - k} ${y - k} Z`} fill={fill} />;
}

function Sparks({ pts }: { pts: [number, number, number?][] }) {
  return (
    <>
      {pts.map(([x, y, s]) => (
        <Spark key={`${x}-${y}`} x={x} y={y} s={s ?? 2.4} />
      ))}
    </>
  );
}

/** Straight engraved rays, alternating long and short. */
function Rays({ cx, cy, r1, r2, n = 24, w = 0.6 }: { cx: number; cy: number; r1: number; r2: number; n?: number; w?: number; op?: number }) {
  return (
    <g stroke={GOLD} strokeWidth={w} strokeLinecap="round">
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const r = i % 2 ? r1 + (r2 - r1) * 0.62 : r2;
        return <line key={i} x1={n2(cx + cosR(a) * r1)} y1={n2(cy + sinR(a) * r1)} x2={n2(cx + cosR(a) * r)} y2={n2(cy + sinR(a) * r)} />;
      })}
    </g>
  );
}

/** Wavy flame rays of a sun. */
function Flames({ cx, cy, r1, r2, n = 16 }: { cx: number; cy: number; r1: number; r2: number; n?: number }) {
  return (
    <>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const d = Math.PI / n;
        const rt = i % 2 ? r1 + (r2 - r1) * 0.65 : r2;
        const p = (ang: number, r: number) => `${n2(cx + cosR(ang) * r)} ${n2(cy + sinR(ang) * r)}`;
        return (
          <path
            key={i}
            d={`M${p(a - d * 0.8, r1)} Q${p(a - d * 0.9, (r1 + rt) / 2)} ${p(a + d * 0.5, rt)} Q${p(a + d * 0.2, (r1 + rt) / 2)} ${p(a + d * 0.8, r1)}`}
            fill={INK}
            {...g}
            strokeWidth={1.16}
          />
        );
      })}
    </>
  );
}

/** A sun with a serene engraved face. */
function SunFace({ cx, cy, r, rays = true }: { cx: number; cy: number; r: number; rays?: boolean }) {
  const k = r / 20;
  const F = INK;
  return (
    <>
      {rays && <Flames cx={cx} cy={cy} r1={r * 0.96} r2={r * 1.75} n={18} />}
      <g transform={`translate(${cx} ${cy}) scale(${k})`} fill="none" stroke={F} strokeLinecap="round" strokeLinejoin="round">
        <circle r="20" fill={PALE} stroke={GOLD} strokeWidth={1.2 / k} />
        <circle r="17.5" strokeWidth={0.6 / k} />
        <path d="M-11 -8 Q-6 -11 -2 -8 M2 -8 Q6 -11 11 -8" strokeWidth={1.8 / k} />
        <path d="M-11 -3 Q-6.5 -6.5 -2 -3 Q-6.5 -1 -11 -3 Z M2 -3 Q6.5 -6.5 11 -3 Q6.5 -1 2 -3 Z" strokeWidth={1.8 / k} />
        <circle cx="-6.5" cy="-3.4" r="1.5" fill={F} stroke="none" />
        <circle cx="6.5" cy="-3.4" r="1.5" fill={F} stroke="none" />
        <path d="M0 -5 Q-1.5 2 -2.6 4 Q0 5.6 2.6 4" strokeWidth={1.7 / k} />
        <path d="M-5.5 9.5 Q0 7.2 5.5 9.5 Q0 13.5 -5.5 9.5 Z M-5.5 9.5 H5.5" strokeWidth={1.7 / k} />
        <path d="M-13 3 l2 1.5 M-14 5.5 l2 1 M13 3 l-2 1.5 M14 5.5 l-2 1" strokeWidth={0.5 / k} />
      </g>
    </>
  );
}

/** Crescent moon opening to the right. */
function Crescent({ cx, cy, R, fill = PALE, face = false }: { cx: number; cy: number; R: number; fill?: string; face?: boolean }) {
  const x = n2(cx + R * 0.3);
  const y1 = n2(cy - R * 0.95);
  const y2 = n2(cy + R * 0.95);
  return (
    <>
      <path d={`M${x} ${y1} A${R} ${R} 0 1 0 ${x} ${y2} A${n2(R * 1.15)} ${n2(R * 1.15)} 0 0 1 ${x} ${y1} Z`} fill={fill} {...g} strokeWidth={1.74} />
      {face && (
        <path
          d={`M${n2(cx - R * 0.45)} ${n2(cy - R * 0.2)} q${n2(R * 0.18)} ${n2(R * 0.12)} ${n2(R * 0.34)} 0 M${n2(cx - R * 0.2)} ${n2(cy + R * 0.42)} q${n2(R * 0.12)} ${n2(R * 0.08)} ${n2(R * 0.22)} -${n2(R * 0.04)}`}
          fill="none"
          {...g}
          stroke={fill === PALE ? INK : GOLD}
          strokeWidth={1.1}
        />
      )}
    </>
  );
}

function Heart({ cx, cy, s, fill }: { cx: number; cy: number; s: number; fill: string }) {
  return (
    <path
      d={`M${cx} ${cy + s * 0.9} C${cx - s * 1.25} ${cy + s * 0.15} ${cx - s * 1.0} ${cy - s * 0.95} ${cx} ${cy - s * 0.35} C${cx + s * 1.0} ${cy - s * 0.95} ${cx + s * 1.25} ${cy + s * 0.15} ${cx} ${cy + s * 0.9} Z`}
      fill={fill}
      {...g}
      strokeWidth={1.74}
    />
  );
}

function Wheat({ x, y, h, lean = 0 }: { x: number; y: number; h: number; lean?: number }) {
  const tx = x + lean;
  const ty = y - h;
  return (
    <g {...g} strokeWidth={1.16} fill={INK}>
      <path d={`M${x} ${y} Q${x + lean * 0.3} ${y - h * 0.5} ${tx} ${ty}`} fill="none" />
      {Array.from({ length: 5 }, (_, i) => {
        const py = ty + 3 + i * 4.2;
        const px = tx - lean * (i * 4.2) / h;
        return (
          <g key={i}>
            <ellipse cx={n2(px - 2.4)} cy={n2(py)} rx="2.2" ry="1.1" transform={`rotate(-35 ${n2(px - 2.4)} ${n2(py)})`} />
            <ellipse cx={n2(px + 2.4)} cy={n2(py)} rx="2.2" ry="1.1" transform={`rotate(35 ${n2(px + 2.4)} ${n2(py)})`} />
          </g>
        );
      })}
      <ellipse cx={tx} cy={ty} rx="1.1" ry="2.3" />
    </g>
  );
}

function Pine({ x, y, h }: { x: number; y: number; h: number }) {
  const w = h * 0.32;
  return (
    <path
      d={`M${x} ${y - h} L${x - w * 0.5} ${y - h * 0.62} L${x - w * 0.25} ${y - h * 0.62} L${x - w * 0.8} ${y - h * 0.28} L${x - w * 0.35} ${y - h * 0.28} L${x - w} ${y} H${x + w} L${x + w * 0.35} ${y - h * 0.28} L${x + w * 0.8} ${y - h * 0.28} L${x + w * 0.25} ${y - h * 0.62} L${x + w * 0.5} ${y - h * 0.62} Z`}
      fill={INK}
      {...g}
      strokeWidth={1.16}
    />
  );
}


/** Stylised swirl cloud: overlapping white puffs with black curls cut in. */
function Cloud({ cx, cy, s = 1 }: { cx: number; cy: number; s?: number }) {
  const puffs: [number, number, number][] = [
    [-13, 2, 7.5],
    [-4, -5, 9.5],
    [8, -3, 8.5],
    [16, 3, 6.5],
    [2, 5, 8],
    [-9, 7, 6],
  ];
  return (
    <g transform={`translate(${cx} ${cy}) scale(${s})`}>
      {puffs.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={PALE} stroke={INK} strokeWidth={1.2 / s} />
      ))}
      {puffs.slice(0, 4).map(([x, y, r], i) => (
        <path key={`c${i}`} d={`M${x - r * 0.45} ${y + r * 0.1} a${r * 0.42} ${r * 0.42} 0 1 1 ${r * 0.42} ${r * 0.42} a${r * 0.2} ${r * 0.2} 0 1 1 -${r * 0.2} -${r * 0.2}`} fill="none" stroke={INK} strokeWidth={1.3 / s} strokeLinecap="round" />
      ))}
    </g>
  );
}

/** Eight-pointed compass star. */
function Compass({ cx, cy, r, fill = PALE }: { cx: number; cy: number; r: number; fill?: string }) {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.22 : i % 4 ? r * 0.6 : r;
    pts.push(`${n2(cx + cosR(a) * rr)} ${n2(cy + sinR(a) * rr)}`);
  }
  return <path d={`M${pts.join(" L")} Z`} fill={fill} />;
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

/** Engraved front-facing face: brows, almond eyes (or closed lids), nose, lips. */
function Face({ x, y, r = 6.5, closed = false, glow = false }: { x: number; y: number; r?: number; closed?: boolean; glow?: boolean }) {
  const k = r / 6.5;
  const eyeY = y - 0.6 * k;
  const ex = 2.5 * k;
  return (
    <>
      <ellipse cx={x} cy={y} rx={r * 0.88} ry={r} fill={INK} {...g} strokeWidth={1.3} />
      {closed ? (
        <path d={`M${x - ex - 1.3 * k} ${eyeY} q${1.3 * k} ${1 * k} ${2.6 * k} 0 M${x + ex - 1.3 * k} ${eyeY} q${1.3 * k} ${1 * k} ${2.6 * k} 0`} fill="none" {...g} strokeWidth={0.8} />
      ) : (
        <>
          <path d={`M${x - ex - 1.4 * k} ${eyeY - 1.6 * k} q${1.4 * k} -${0.8 * k} ${2.8 * k} 0 M${x + ex - 1.4 * k} ${eyeY - 1.6 * k} q${1.4 * k} -${0.8 * k} ${2.8 * k} 0`} fill="none" {...g} strokeWidth={0.65} />
          <circle cx={x - ex} cy={eyeY} r={0.75 * k} fill={glow ? EMBER : GOLD} />
          <circle cx={x + ex} cy={eyeY} r={0.75 * k} fill={glow ? EMBER : GOLD} />
        </>
      )}
      <path d={`M${x} ${y - 0.2 * k} l-${0.7 * k} ${2.2 * k} h${1.2 * k}`} fill="none" {...g} strokeWidth={0.65} />
      <path d={`M${x - 1.5 * k} ${y + 3.6 * k} q${1.5 * k} ${0.8 * k} ${3 * k} 0`} fill="none" {...g} strokeWidth={0.72} />
    </>
  );
}

/** Fold lines on a robe. */
function Folds({ d }: { d: string }) {
  return <path d={d} fill="none" {...g} strokeWidth={0.72} />;
}

// Arch panel: x 13..107, y 24..164, centre x = 60. Every card shows a figure.
const ART: Record<RoleId, (f: Fill) => React.ReactNode> = {
  // A wolf's head staring out of swirling clouds beneath the moon.
  werewolf: () => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <circle cx="94" cy="36" r="10" fill={PALE} />
      <circle cx="91" cy="34" r="2" fill={INK} />
      <circle cx="97" cy="40" r="1.4" fill={INK} />
      <Crescent cx={22} cy={36} R={7} />
      <Sparks pts={[[40, 30, 2], [80, 28, 1.8], [18, 70, 1.8], [102, 68, 1.8]]} />
      <g transform="translate(60 98) scale(0.66)">
        {[1, -1].map((sx) => (
          <g key={sx} transform={sx === -1 ? "scale(-1 1)" : undefined}>
            <path d="M-16 -50 L-40 -98 L-52 -36 Z" fill={PALE} />
            <path d="M-22 -52 L-38 -84 L-45 -44 Z" fill={INK} />
            <path d="M-36 -72 L-31 -60 M-41 -62 L-36 -52 M-30 -66 L-27 -57" stroke={PALE} strokeWidth="2.4" strokeLinecap="round" />
            <path d="M-48 -34 L-62 -20 L-53 -18 L-68 -2 L-55 -2 L-66 16 L-51 12 L-58 30 L-41 22 L-43 40 L-29 30 L-31 20 L-43 17 L-39 4 L-49 2 L-41 -12 L-49 -17 Z" fill={PALE} />
            <path d="M-34 -28 L-6 -36 L-10 -27 L-27 -21 Z" fill={PALE} />
            <path d="M-31 -5 L-13 -1 L-23 3 Z" fill={PALE} />
            <path d="M-11 -3 L-15 24" stroke={PALE} strokeWidth="2.6" strokeLinecap="round" />
            <path d="M-33 -14 Q-20 -25 -7 -14 Q-20 -7 -33 -14 Z" fill={PALE} />
            <circle cx="-18.5" cy="-14.5" r="3.8" fill={INK} />
          </g>
        ))}
        <path d="M0 -62 L7 -41 L3 -22 L0 -12 L-3 -22 L-7 -41 Z" fill={PALE} />
        <path d="M-9 -6 Q0 -10 9 -6 L12 22 Q0 30 -12 22 Z" fill={PALE} />
        <path d="M-9 14 Q0 9 9 14 Q5 23 0 24 Q-5 23 -9 14 Z" fill={INK} />
        <path d="M0 24 V29 M-9 28 Q0 33 9 28" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M-26 34 L-18 52 L-10 42 L-4 60 L0 46 L4 60 L10 42 L18 52 L26 34 L14 40 L0 32 L-14 40 Z" fill={PALE} />
      </g>
      {/* clouds */}
      <Cloud cx={22} cy={152} s={1.05} />
      <Cloud cx={58} cy={160} s={1.2} />
      <Cloud cx={96} cy={152} s={1.05} />
      <Cloud cx={16} cy={112} s={0.6} />
      <Cloud cx={104} cy={114} s={0.6} />
    </>
  ),
  // An owl with outspread wings perched on a crystal orb.
  seer: () => (
    <>
      <path d="M50 34 Q60 26 70 34 Q60 42 50 34 Z" fill={PALE} />
      <circle cx="60" cy="34" r="3.2" fill={INK} />
      <circle cx="60" cy="34" r="1.2" fill={PALE} />
      <Rays cx={60} cy={34} r1={11} r2={16} n={16} w={0.9} />
      <Crescent cx={20} cy={34} R={6} />
      <Crescent cx={98} cy={34} R={6} />
      {/* wings */}
      {[1, -1].map((sx) => (
        <g key={sx} transform={sx === -1 ? "translate(120 0) scale(-1 1)" : undefined}>
          <path
            d="M50 82 C40 70 26 60 10 58 C14 64 12 68 16 73 C13 78 16 82 20 86 C18 91 22 95 27 97 C27 102 32 106 38 106 C44 104 48 100 51 97 Z"
            fill={PALE}
          />
          <path d="M47 86 L18 66 M47 90 L19 79 M47 94 L25 89 M48 98 L33 100" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
        </g>
      ))}
      {/* body */}
      <path d="M46 72 L44 58 L52 66 Q60 63 68 66 L76 58 L74 72 Q78 86 74 102 Q68 114 60 114 Q52 114 46 102 Q42 86 46 72 Z" fill={PALE} />
      <circle cx="53.5" cy="76" r="6.5" fill={INK} />
      <circle cx="66.5" cy="76" r="6.5" fill={INK} />
      <circle cx="53.5" cy="76" r="3.4" fill={PALE} />
      <circle cx="66.5" cy="76" r="3.4" fill={PALE} />
      <circle cx="54" cy="76.5" r="1.7" fill={INK} />
      <circle cx="66" cy="76.5" r="1.7" fill={INK} />
      <path d="M57.5 82 L60 89 L62.5 82 Z" fill={INK} />
      <path d="M52 96 l3 3 l3 -3 M58 96 l3 3 l3 -3 M64 96 l3 3 l3 -3 M55 103 l3 3 l3 -3 M61 103 l3 3 l3 -3" fill="none" stroke={INK} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
      {/* talons */}
      <path d="M53 113 l-2 6 M56 114 v6 M64 114 v6 M67 113 l2 6" stroke={PALE} strokeWidth="1.8" strokeLinecap="round" />
      {/* crystal orb on its stand */}
      <circle cx="60" cy="136" r="16" fill={PALE} />
      <path d="M48 132 A12 12 0 0 1 56 123" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
      <Crescent cx={62} cy={138} R={6} fill={INK} />
      <Compass cx={70} cy={130} r={3.4} fill={INK} />
      <path d="M44 152 H76 L82 162 H38 Z" fill={PALE} />
      <path d="M46 156 H74" stroke={INK} strokeWidth="1.2" />
    </>
  ),
  // The witch's familiar: a black cat in a pointed hat against a full moon.
  witch: (f) => (
    <>
      <circle cx="60" cy="76" r="38" fill={PALE} />
      <circle cx="60" cy="76" r="34" fill="none" stroke={INK} strokeWidth="1.2" />
      <Sparks pts={[[18, 32, 2.4], [102, 30, 2.4], [16, 110, 1.8], [104, 112, 1.8]]} />
      <path d="M12 166 Q36 146 60 152 Q84 146 108 166 Z" fill={f.hatch} />
      {/* potion bottles */}
      <path d="M22 160 Q16 160 16 152 Q16 146 21 144 V138 H25 V144 Q30 146 30 152 Q30 160 22 160 Z" fill={PALE} />
      <path d="M96 160 Q90 160 90 154 L93 140 H99 L102 154 Q102 160 96 160 Z" fill={PALE} />
      <path d="M17 152 H29 M92 150 H100" stroke={INK} strokeWidth="1.2" />
      {/* tail */}
      <path d="M74 150 C92 152 98 134 86 124 C82 121 78 124 80 128" fill="none" stroke={PALE} strokeWidth="6" strokeLinecap="round" />
      <path d="M74 150 C92 152 98 134 86 124 C82 121 78 124 80 128" fill="none" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
      {/* body and head */}
      <path d="M44 156 C40 132 44 108 54 94 L66 94 C76 108 80 132 76 156 Z" fill={INK} stroke={PALE} strokeWidth="1.6" />
      <path d="M48 82 L46 62 L56 71 Q60 69 64 71 L74 62 L72 82 Q72 95 60 96 Q48 95 48 82 Z" fill={INK} stroke={PALE} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M52 86.5 q3.5 -4 7 0 q-3.5 3 -7 0 Z M61 86.5 q3.5 -4 7 0 q-3.5 3 -7 0 Z" fill={PALE} />
      <path d="M55.5 83.5 v6 M64.5 83.5 v6" stroke={INK} strokeWidth="1.3" />
      <path d="M58.5 91 h3 l-1.5 1.8 Z" fill={PALE} />
      <path d="M44 90 L54 92 M44 94 L54 94 M76 90 L66 92 M76 94 L66 94" stroke={PALE} strokeWidth="0.8" strokeLinecap="round" />
      {/* witch hat */}
      <ellipse cx="60" cy="72" rx="15" ry="3.4" fill={INK} stroke={PALE} strokeWidth="1.3" />
      <path d="M50 72 L58 48 Q61 38 72 40 Q66 44 66 50 L70 72 Z" fill={INK} stroke={PALE} strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M51.5 67 H68.5" stroke={PALE} strokeWidth="2" />
      {/* paws and chest tuft */}
      <path d="M52 156 q3 -4 6 0 M62 156 q3 -4 6 0" fill="none" stroke={PALE} strokeWidth="1.2" />
      <path d="M56 100 l4 6 l4 -6" fill="none" stroke={PALE} strokeWidth="1.2" />
    </>
  ),
  // A farmer with a straw hat, the sun as his halo, cradling a sheaf of wheat.
  villager: (f) => (
    <>
      <SunFace cx={84} cy={48} r={10} />
      <Sparks pts={[[24, 40, 1.8], [40, 34, 1.4], [30, 66, 1.4]]} />
      <path d="M12 136 Q36 124 60 130 Q84 124 108 134 V164 H12 Z" fill={f.hatch} {...g} strokeWidth={1.16} />
      {/* distant cottage */}
      <rect x="86" y="118" width="12" height="10" fill={INK} {...g} strokeWidth={1.01} />
      <path d="M84 119 L92 111 L100 119 Z" fill={INK} {...g} strokeWidth={1.01} />
      <rect x="90" y="121" width="3" height="3" fill={EMBER} />
      <Wheat x={22} y={162} h={40} lean={-3} />
      <Wheat x={29} y={162} h={32} lean={2} />
      {/* legs and boots */}
      <path d="M48 128 H59 L58 154 H49 Z M61 128 H72 L71 154 H62 Z" fill={INK} {...g} strokeWidth={1.45} />
      <path d="M46 154 H59 V159 H46 Z M61 154 H74 V159 H61 Z" fill={f.hatch} {...g} strokeWidth={1.3} />
      {/* tunic */}
      <path d="M46 92 Q60 86 74 92 L78 130 H42 Z" fill={INK} {...g} strokeWidth={1.74} />
      <path d="M43 116 H77" {...g} strokeWidth={2.03} />
      <rect x="57" y="113.5" width="6" height="5" fill={INK} {...g} strokeWidth={1.01} />
      <Folds d="M52 118 L50 130 M68 118 L70 130 M60 92 V112" />
      <Face x={60} y={80} r={6.5} />
      {/* straw hat */}
      <path d="M52 74 Q53 64 60 64 Q67 64 68 74 Z" fill={f.hatch} {...g} strokeWidth={1.45} />
      <ellipse cx="60" cy="74" rx="15" ry="3" fill={INK} {...g} strokeWidth={1.45} />
      <path d="M53 71 H67" {...g} strokeWidth={1.3} />
      {/* sheaf of wheat held across the chest */}
      <g transform="rotate(48 60 112)">
        <Wheat x={57} y={128} h={40} />
        <Wheat x={60.5} y={128} h={44} />
        <Wheat x={64} y={128} h={38} />
        <path d="M55 116 H66" {...g} strokeWidth={1.89} />
      </g>
      <path d="M48 95 Q42 108 50 116 M72 95 Q78 104 68 108" fill="none" {...g} strokeWidth={1.59} />
      <circle cx="51" cy="116" r="2.4" fill={INK} {...g} strokeWidth={1.16} />
      <circle cx="67" cy="108" r="2.4" fill={INK} {...g} strokeWidth={1.16} />
    </>
  ),
  // An armoured knight, sword raised, shield braced.
  bodyguard: (f) => (
    <>
      <Rays cx={60} cy={70} r1={20} r2={46} n={44} w={0.45} op={0.55} />
      <Sparks pts={[[22, 40], [98, 104, 1.6], [24, 100, 1.6]]} />
      <path d="M12 160 Q40 150 60 154 Q80 150 108 160 V164 H12 Z" fill={f.hatch} {...g} strokeWidth={1.16} />
      {/* sword raised in the right hand */}
      <path d="M82.5 66 H85.5 V30 L84 26 L82.5 30 Z" fill={INK} {...g} strokeWidth={1.3} />
      <path d="M78 66 H90" {...g} strokeWidth={2.32} />
      <path d="M83 66 H85 V74 H83 Z" fill={f.hatch} {...g} strokeWidth={1.01} />
      <circle cx="84" cy="76" r="1.8" fill={INK} {...g} strokeWidth={1.01} />
      {/* legs */}
      <path d="M47 120 H58 L57 154 H47 Z M62 120 H73 L73 154 H63 Z" fill={INK} {...g} strokeWidth={1.45} />
      <path d="M48 134 H57 M63 134 H72" {...g} strokeWidth={0.87} />
      <path d="M44 154 H58 V158 H44 Z M62 154 H76 V158 H62 Z" fill={INK} {...g} strokeWidth={1.3} />
      {/* armoured torso */}
      <path d="M44 80 Q60 72 76 80 L78 122 H42 Z" fill={INK} {...g} strokeWidth={1.74} />
      <path d="M60 78 V120 M46 98 Q60 104 74 98 M45 110 Q60 116 75 110" fill="none" {...g} strokeWidth={0.87} />
      <path d="M66 82 Q74 86 76 100 L77 120 H70 Z" fill={f.hatch} />
      <ellipse cx="45" cy="82" rx="7" ry="5" fill={INK} {...g} strokeWidth={1.45} />
      <ellipse cx="75" cy="82" rx="7" ry="5" fill={INK} {...g} strokeWidth={1.45} />
      {/* sword arm */}
      <path d="M78 84 Q88 84 85 76" fill="none" {...g} strokeWidth={2.32} />
      {/* helmet */}
      <path d="M53 70 H67 L69 77 H51 Z" fill={INK} {...g} strokeWidth={1.3} />
      <path d="M51 70 V58 Q51 48 60 47 Q69 48 69 58 V70 Z" fill={INK} {...g} strokeWidth={1.74} />
      <path d="M53 60 H67" {...g} strokeWidth={2.03} />
      <path d="M60 48 V70 M55 64 h2 M63 64 h2 M55 67 h2 M63 67 h2" {...g} strokeWidth={0.72} />
      <path d="M60 47 Q64 38 74 40 Q68 42 66 48 Q64 46 60 47 Z" fill={f.hatch} {...g} strokeWidth={1.16} />
      {/* shield */}
      <path d="M32 92 H64 V110 Q64 130 48 140 Q32 130 32 110 Z" fill={INK} {...g} strokeWidth={2.17} />
      <path d="M36 96 H60 V110 Q60 126 48 135 Q36 126 36 110 Z" fill="none" {...g} strokeWidth={0.72} />
      <circle cx="48" cy="111" r="7.5" fill={PALE} {...g} strokeWidth={1.3} />
      <path d="M48 104.5 L49.8 109.2 L54.5 111 L49.8 112.8 L48 117.5 L46.2 112.8 L41.5 111 L46.2 109.2 Z" fill={INK} />
    </>
  ),
  // The quarry: a horned stag, crowned with antlers, above the hunter's crossed arrows.
  hunter: () => (
    <>
      <Rays cx={60} cy={56} r1={30} r2={52} n={44} w={0.8} />
      <Sparks pts={[[20, 106, 2], [100, 106, 2], [60, 30, 2.4]]} />
      {/* antlers */}
      {[1, -1].map((sx) => (
        <g key={sx} transform={sx === -1 ? "translate(120 0) scale(-1 1)" : undefined} fill="none" stroke={PALE} strokeLinecap="round" strokeLinejoin="round">
          <path d="M53 70 C46 58 40 46 34 28" strokeWidth="4.2" />
          <path d="M44 54 L28 50 M40 44 L46 30 M37 37 L24 32 M47 62 L36 64" strokeWidth="3" />
        </g>
      ))}
      {/* ears */}
      <path d="M49 80 Q34 72 28 80 Q36 88 50 86 Z M71 80 Q86 72 92 80 Q84 88 70 86 Z" fill={PALE} />
      <path d="M46 81 Q38 78 34 80 M74 81 Q82 78 86 80" fill="none" stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
      {/* head */}
      <path d="M48 78 Q46 69 53 67 L60 70 L67 67 Q74 69 72 78 L70 104 Q68 124 60 132 Q52 124 50 104 Z" fill={PALE} />
      <path d="M51.5 90 q4 -4 8 -1 q-4 3 -8 1 Z M60.5 89 q4 -3 8 1 q-4 2 -8 -1 Z" fill={INK} />
      <path d="M60 72 V84 M56 74 l4 6 l4 -6" fill="none" stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M55 100 Q60 104 65 100 M56 108 Q60 111 64 108" fill="none" stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
      <ellipse cx="60" cy="124" rx="5" ry="3.6" fill={INK} />
      {/* crossed arrows */}
      {[1, -1].map((sx) => (
        <g key={`a${sx}`} transform={sx === -1 ? "translate(120 0) scale(-1 1)" : undefined}>
          <path d="M22 162 L92 132" stroke={PALE} strokeWidth="2" strokeLinecap="round" />
          <path d="M92 132 L84 130 L88 138 Z" fill={PALE} />
          <path d="M22 162 L18 156 L26 158 Z M27 160 L23 154 L31 156 Z" fill={PALE} />
        </g>
      ))}
    </>
  ),
  // Two lovers holding hands beneath a winged heart pierced by Cupid's arrow.
  cupid: (f) => (
    <>
      <Rays cx={60} cy={52} r1={14} r2={34} n={40} w={0.45} op={0.6} />
      {[1, -1].map((sx) => (
        <g key={sx} transform={sx === -1 ? "translate(120 0) scale(-1 1)" : undefined}>
          <path d="M51 52 C44 42 34 40 30 44 C34 46 35 48 32 50 C37 51 37 54 34 56 C39 57 41 58 39 61 C44 60 48 58 52 56 Z" fill={INK} {...g} strokeWidth={1.3} />
          <path d="M50 53 L35 46 M50 55 L36 52 M50 57 L39 57" {...g} strokeWidth={0.65} />
        </g>
      ))}
      <Heart cx={60} cy={53} s={10} fill={PALE} />
      <path d="M60 62 C52 56 50 51 51 48 Q55 55 60 62 Z" fill={f.hatch} />
      <path d="M40 66 L82 40" {...g} strokeWidth={1.45} />
      <path d="M82 40 L76.5 40.5 M82 40 L79.5 45" {...g} strokeWidth={1.45} />
      <path d="M40 66 L36 65.5 L38 62 L42 62.5 M42.5 64.5 L38.5 64 L40.5 60.5 L44.5 61" fill="none" {...g} strokeWidth={0.87} />
      <Sparks pts={[[22, 40], [98, 40], [20, 92, 1.4], [100, 92, 1.4]]} />
      <path d="M12 160 Q36 150 60 154 Q84 150 108 160 V164 H12 Z" fill={f.hatch} {...g} strokeWidth={1.16} />
      {/* her: long hair, flowing dress */}
      <path d="M36 82 Q32 98 35 108 L40 104 Q38 94 41 86 Z" fill={INK} {...g} strokeWidth={1.16} />
      <path d="M38 94 Q44 89 50 94 L58 158 H26 Z" fill={INK} {...g} strokeWidth={1.74} />
      <path d="M38 94 Q44 89 50 94 L58 158 H26 Z" fill={f.dots} />
      <Folds d="M36 120 L32 158 M44 118 V158 M50 120 L54 158 M37 112 Q44 116 51 112" />
      <Face x={44} y={82} r={6.2} />
      <path d="M37.5 82 Q37 73 44 72.5 Q51 73 50.5 82 Q48 77 44 76.5 Q40 77 37.5 82 Z" fill={f.hatch} {...g} strokeWidth={1.16} />
      <path d="M39 74 l-1.5 -2 M44 72.5 v-2.4 M49 74 l1.5 -2" {...g} strokeWidth={0.87} />
      <circle cx="44" cy="70" r="1" fill={GOLD} />
      {/* him: short hair, tunic */}
      <path d="M68 128 H75 L74 154 H69 Z M77 128 H84 L83 154 H78 Z" fill={INK} {...g} strokeWidth={1.3} />
      <path d="M66 154 H75 V158 H66 Z M77 154 H86 V158 H77 Z" fill={f.hatch} {...g} strokeWidth={1.16} />
      <path d="M70 94 Q76 89 82 94 L86 130 H66 Z" fill={INK} {...g} strokeWidth={1.74} />
      <path d="M67 116 H85" {...g} strokeWidth={1.74} />
      <Folds d="M76 94 V114 M71 118 L70 130 M81 118 L82 130" />
      <Face x={76} y={82} r={6.2} />
      <path d="M69.5 80 Q69 72 76 71.5 Q83 72 82.5 80 Q80 76 76 76 Q72 76 69.5 80 Z" fill={f.hatch} {...g} strokeWidth={1.16} />
      {/* joined hands */}
      <path d="M49 98 Q54 106 60 110 M71 98 Q66 106 60 110" fill="none" {...g} strokeWidth={1.59} />
      <circle cx="60" cy="110" r="2.6" fill={INK} {...g} strokeWidth={1.16} />
    </>
  ),
};

const PANEL = "M9 26 Q9 22 13 22 H107 Q111 22 111 26 V162 Q111 166 107 166 H13 Q9 166 9 162 Z";

function Patterns({ id }: { id: string }) {
  return (
    <defs>
      <pattern id={`${id}h`} width="2.8" height="2.8" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)">
        <line x1="0" y1="0" x2="0" y2="2.8" stroke={GOLD} strokeWidth="1.1" />
      </pattern>
      <pattern id={`${id}d`} width="3" height="3" patternUnits="userSpaceOnUse">
        <circle cx="0.8" cy="0.8" r="0.6" fill={GOLD} />
        <circle cx="2.3" cy="2.3" r="0.45" fill={GOLD} />
      </pattern>
      <clipPath id={`${id}c`}>
        <path d={PANEL} />
      </clipPath>
    </defs>
  );
}

function CardFrame({ id, numeral, title, children }: { id: string; numeral?: string; title?: string; children: React.ReactNode }) {
  return (
    <>
      <Patterns id={id} />
      <rect x="1" y="1" width="118" height="198" rx="7" fill={INK} stroke={GOLD} strokeWidth="1.6" />
      <rect x="5" y="5" width="110" height="190" rx="5" fill="none" stroke={GOLD} strokeWidth="1" />
      <g clipPath={`url(#${id}c)`}>
        <rect x="10" y="20" width="100" height="150" fill={INK2} />
        
        {children}
      </g>
      <path d={PANEL} fill="none" stroke={GOLD} strokeWidth="1.4" />
      {/* corner ornaments above the arch */}
      <Crescent cx={14} cy={15} R={4} />
      <Spark x={106} y={15} s={3.4} fill={GOLD} />
      <circle cx="22" cy="20" r="1.2" fill={GOLD} />
      <circle cx="98" cy="20" r="1.2" fill={GOLD} />
      {numeral && (
        <>
          <rect x={60 - (numeral.length * 3.4 + 6)} y="6" width={numeral.length * 6.8 + 12} height="13" rx="6.5" fill={PALE} />
          <text x="60" y="16.3" textAnchor="middle" fontSize="10" fontFamily="Georgia, 'Times New Roman', serif" fontWeight="700" letterSpacing="0.5" fill={INK}>
            {numeral}
          </text>
        </>
      )}
      <rect x="10" y="169" width="100" height="22" rx="3" fill={INK} stroke={GOLD} strokeWidth="1.4" />
      <rect x="13" y="172" width="94" height="16" rx="2" fill={PALE} />
      {title && (
        <text
          x="60"
          y="184.2"
          textAnchor="middle"
          fontSize={title.length > 10 ? 10 : 12}
          style={{ fontFamily: "var(--font-title), Georgia, serif" }}
          letterSpacing="0.6"
          fill={INK}
        >
          {title}
        </text>
      )}
    </>
  );
}

/** A black-and-white stencil tarot card for a role (name and numeral included). */
export function RoleArt({ role, className = "" }: { role: RoleId; className?: string }) {
  const t = useT();
  const id = `t${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg viewBox="0 0 120 200" className={className} role="img" aria-label={t(`roles.${role}.name`)}>
      <CardFrame id={id} numeral={NUMERAL[role]} title={t(`roles.${role}.name`)}>
        {ART[role]({ hatch: `url(#${id}h)`, dots: `url(#${id}d)` })}
      </CardFrame>
    </svg>
  );
}

/** The back of a card: a sun face in a ring of moon phases. */
export function CardBack({ className = "" }: { className?: string }) {
  const id = `b${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg viewBox="0 0 120 200" className={className} role="img" aria-hidden>
      <Patterns id={id} />
      <rect x="1" y="1" width="118" height="198" rx="7" fill={INK} stroke={GOLD} strokeWidth="1" />
      <rect x="6" y="6" width="108" height="188" rx="4" fill={INK2} stroke={GOLD} strokeWidth="0.9" />
      
      <rect x="10" y="10" width="100" height="180" rx="3" fill="none" stroke={GOLD} strokeWidth="0.4" />
      <Rays cx={60} cy={100} r1={42} r2={52} n={60} w={0.4} op={0.6} />
      <circle cx="60" cy="100" r="41" fill="none" stroke={GOLD} strokeWidth="0.9" />
      <circle cx="60" cy="100" r="37" fill="none" stroke={GOLD} strokeWidth="0.4" />
      <SunFace cx={60} cy={100} r={17} />
      {/* moon phases around the ring */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const x = n2(60 + cosR(a) * 41);
        const y = n2(100 + sinR(a) * 41);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="4" fill={INK} stroke={GOLD} strokeWidth="0.8" />
            {i === 0 ? <circle cx={x} cy={y} r="3" fill={GOLD} /> : i === 4 ? null : <circle cx={x + (i < 4 ? -1 : 1) * (4 - Math.abs(4 - i)) * 0.9} cy={y} r="3" fill={GOLD} clipPath={`url(#${id}m${i})`} />}
            <clipPath id={`${id}m${i}`}>
              <circle cx={x} cy={y} r="3" />
            </clipPath>
          </g>
        );
      })}
      <Crescent cx={58} cy={30} R={8} face />
      <Crescent cx={58} cy={170} R={8} face />
      <Sparks pts={[[22, 24], [98, 24], [22, 176], [98, 176], [20, 100, 2], [100, 100, 2]]} />
    </svg>
  );
}

/** The large centre card: the Narrator enthroned beneath an Art Nouveau arch, sunburst halo, open book. */
export function NarratorCard({ className = "" }: { className?: string }) {
  const t = useT();
  const id = `n${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const title = t("home.narratorCard");
  return (
    <svg viewBox="0 0 120 200" className={className} role="img" aria-label={title}>
      <Patterns id={id} />
      <rect x="1" y="1" width="118" height="198" rx="7" fill={INK} stroke={GOLD} strokeWidth="1.6" />
      <rect x="5" y="5" width="110" height="190" rx="5" fill="none" stroke={GOLD} strokeWidth="1" />
      {/* arch with scrollwork */}
      <path d="M16 60 Q16 22 60 18 Q104 22 104 60" fill="none" stroke={GOLD} strokeWidth="3" />
      <path d="M21 60 Q21 28 60 24 Q99 28 99 60" fill="none" stroke={GOLD} strokeWidth="1" />
      {[1, -1].map((sx) => (
        <g key={sx} transform={sx === -1 ? "translate(120 0) scale(-1 1)" : undefined}>
          <path d="M40 22 C34 14 26 16 27 22 C28 27 34 26 33 22" fill="none" stroke={GOLD} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M22 44 C14 40 12 32 18 30 C22 29 23 34 20 35" fill="none" stroke={GOLD} strokeWidth="1.4" strokeLinecap="round" />
          {/* pillar */}
          <rect x="12" y="60" width="13" height="5" fill={PALE} />
          <path d="M10 60 C10 55 14 54 15 57 M27 60 C27 55 23 54 22 57" fill="none" stroke={GOLD} strokeWidth="1.4" strokeLinecap="round" />
          <rect x="13.5" y="65" width="10" height="99" fill={PALE} />
          <path d="M16.5 68 V161 M19.5 68 V161" stroke={INK} strokeWidth="1" />
          <rect x="11" y="160" width="15" height="5" fill={PALE} />
        </g>
      ))}
      <Compass cx={60} cy={12} r={5} />
      {/* throne back */}
      <path d="M33 140 V62 Q33 46 60 44 Q87 46 87 62 V140 Z" fill={INK} stroke={GOLD} strokeWidth="1.6" />
      <path d="M37 138 V63 Q37 50 60 48 Q83 50 83 63 V138" fill="none" stroke={GOLD} strokeWidth="0.7" />
      {/* sunburst halo */}
      <Rays cx={60} cy={66} r1={9} r2={30} n={56} w={0.8} />
      <circle cx="60" cy="66" r="10" fill={PALE} />
      {/* head */}
      <path d="M53 66 Q53 56 60 56 Q67 56 67 66 Q67 76 60 78 Q53 76 53 66 Z" fill={INK} stroke={GOLD} strokeWidth="1" />
      <path d="M55 64.5 q2 -1.5 4 0 q-2 1.2 -4 0 Z M61 64.5 q2 -1.5 4 0 q-2 1.2 -4 0 Z" fill={PALE} />
      <path d="M60 65 v5 h-1.4 M57.6 73 q2.4 1.2 4.8 0" fill="none" stroke={PALE} strokeWidth="0.8" strokeLinecap="round" />
      <path d="M54 58 Q60 52 66 58 L60 55 Z" fill={PALE} />
      <circle cx="60" cy="50.5" r="1.6" fill={PALE} />
      {/* robe */}
      <path d="M44 84 Q60 76 76 84 L86 152 H34 Z" fill={INK} stroke={GOLD} strokeWidth="1.5" />
      <path d="M46 84 Q60 94 74 84 L72 91 Q60 100 48 91 Z" fill={PALE} />
      <path d="M50 89 l2 3 l2 -3 M56 91 l2 3 l2 -3 M62 91 l2 3 l2 -3 M68 89 l-2 3" fill="none" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
      <path d="M60 100 V150 M48 128 L44 150 M72 128 L76 150" stroke={GOLD} strokeWidth="0.9" />
      {/* throne arms */}
      <path d="M26 122 H44 V140 H26 Z M76 122 H94 V140 H76 Z" fill={PALE} />
      <path d="M29 126 H41 M29 131 H41 M29 136 H41 M79 126 H91 M79 131 H91 M79 136 H91" stroke={INK} strokeWidth="1" />
      {/* arms and the open book */}
      <path d="M46 88 Q38 104 44 118 M74 88 Q82 104 76 118" fill="none" stroke={GOLD} strokeWidth="1.6" />
      <path d="M42 112 Q51 107 60 112 V126 Q51 121 42 126 Z M78 112 Q69 107 60 112 V126 Q69 121 78 126 Z" fill={PALE} stroke={INK} strokeWidth="0.8" />
      <path d="M45 115 Q51 112 57 115 M45 118.5 Q51 115.5 57 118.5 M45 122 Q51 119 57 122 M63 115 Q69 112 75 115 M63 118.5 Q69 115.5 75 118.5" fill="none" stroke={INK} strokeWidth="0.7" />
      <Compass cx={69} cy={122} r={2.6} fill={INK} />
      <ellipse cx="42" cy="121" rx="3" ry="2.4" fill={INK} stroke={GOLD} strokeWidth="1" />
      <ellipse cx="78" cy="121" rx="3" ry="2.4" fill={INK} stroke={GOLD} strokeWidth="1" />
      {/* books at the feet */}
      <path d="M38 152 H82 V158 H38 Z M42 158 H78 V164 H42 Z" fill={PALE} />
      <path d="M38 155 H82 M42 161 H78" stroke={INK} strokeWidth="0.8" />
      <path d="M26 164 H94" stroke={GOLD} strokeWidth="1.4" />
      <Sparks pts={[[30, 74, 2], [90, 74, 2], [27, 100, 1.6], [93, 100, 1.6]]} />
      {/* numeral and title */}
      <rect x="10" y="169" width="100" height="22" rx="3" fill={INK} stroke={GOLD} strokeWidth="1.4" />
      <rect x="13" y="172" width="94" height="16" rx="2" fill={PALE} />
      <text x="60" y="184.2" textAnchor="middle" fontSize="12" style={{ fontFamily: "var(--font-title), Georgia, serif" }} letterSpacing="0.6" fill={INK}>
        {title}
      </text>
    </svg>
  );
}
