"use client";

// Original black-and-white stencil tarot cards (linocut / woodblock feel):
// bold white line-work and solid white moons on pure black, chunky striped
// hatching, an arched panel, a roman numeral in a white pill on top and a
// white name plaque at the bottom.

import { cosR, sinR } from "./trig";
import { useId } from "react";
import type { RoleId } from "@shared/types";
import type { Scene } from "./Woodcut";
import { useT } from "@/lib/i18n";

const INK = "#000000";
const INK2 = "#000000";
const GOLD = "#ffffff"; // the cut "ink" of the stencil
const PALE = "#ffffff";

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
  cursedWolf: "XV",
  wolfSeer: "IX",
  elder: "V",
  idiot: "0",
  lycan: "XIX",
  sister: "III",
  wildChild: "XXI",
  medium: "XIII",
  mayor: "IV",
  minion: "X",
  knight: "XI",
  silencer: "XII",
  bigBadWolf: "XVI",
  whiteWolf: "XVII",
  tanner: "XX",
  serialKiller: "XXII",
  arsonist: "XXIII",
};

/** Fold lines on a robe. */
function Folds({ d }: { d: string }) {
  return <path d={d} fill="none" {...g} strokeWidth={0.72} />;
}

/**
 * The werewolf's head (drawn at 0.66 scale, centred on the card).
 * The wolf-side roles reuse it so they read as the same beast:
 * `invert` draws it black with a white edge (the Cursed Wolf on its moon),
 * `eyes` picks open, slit-pupilled or shut eyes, `torn` rips the left ear.
 */
function WolfHead({ invert = false, eyes = "open", torn = false }: { invert?: boolean; eyes?: "open" | "slit" | "closed"; torn?: boolean }) {
  const fg = invert ? INK : PALE;
  const cut = invert ? PALE : INK;
  const edge = invert ? { stroke: PALE, strokeWidth: 2.4, strokeLinejoin: "round" as const } : {};
  return (
    <g transform="translate(60 98) scale(0.66)">
      {[1, -1].map((sx) => {
        const rip = torn && sx === 1;
        return (
          <g key={sx} transform={sx === -1 ? "scale(-1 1)" : undefined}>
            {rip ? (
              <>
                <path d="M-16 -50 L-30 -80 L-34 -73 L-38 -84 L-42 -76 L-52 -36 Z" fill={fg} {...edge} />
                <path d="M-22 -52 L-31 -70 L-45 -44 Z" fill={cut} />
                <path d="M-36 -60 L-33 -53 M-30 -60 L-28 -55" stroke={fg} strokeWidth="2.4" strokeLinecap="round" />
              </>
            ) : (
              <>
                <path d="M-16 -50 L-40 -98 L-52 -36 Z" fill={fg} {...edge} />
                <path d="M-22 -52 L-38 -84 L-45 -44 Z" fill={cut} />
                <path d="M-36 -72 L-31 -60 M-41 -62 L-36 -52 M-30 -66 L-27 -57" stroke={fg} strokeWidth="2.4" strokeLinecap="round" />
              </>
            )}
            <path d="M-48 -34 L-62 -20 L-53 -18 L-68 -2 L-55 -2 L-66 16 L-51 12 L-58 30 L-41 22 L-43 40 L-29 30 L-31 20 L-43 17 L-39 4 L-49 2 L-41 -12 L-49 -17 Z" fill={fg} {...edge} />
            <path d="M-34 -28 L-6 -36 L-10 -27 L-27 -21 Z" fill={fg} {...edge} />
            <path d="M-31 -5 L-13 -1 L-23 3 Z" fill={fg} {...edge} />
            <path d="M-11 -3 L-15 24" stroke={fg} strokeWidth="2.6" strokeLinecap="round" />
            {eyes === "closed" ? (
              <path d="M-33 -15 Q-20 -6 -7 -15 M-29 -11 l-2 4 M-20 -9 v4.4 M-12 -11 l2 4" fill="none" stroke={fg} strokeWidth="2.8" strokeLinecap="round" />
            ) : (
              <>
                <path d="M-33 -14 Q-20 -25 -7 -14 Q-20 -7 -33 -14 Z" fill={fg} {...edge} />
                {eyes === "slit" ? <ellipse cx="-18.5" cy="-14.5" rx="1.8" ry="5" fill={cut} /> : <circle cx="-18.5" cy="-14.5" r="3.8" fill={cut} />}
              </>
            )}
          </g>
        );
      })}
      <path d="M0 -62 L7 -41 L3 -22 L0 -12 L-3 -22 L-7 -41 Z" fill={fg} {...edge} />
      <path d="M-9 -6 Q0 -10 9 -6 L12 22 Q0 30 -12 22 Z" fill={fg} {...edge} />
      <path d="M-9 14 Q0 9 9 14 Q5 23 0 24 Q-5 23 -9 14 Z" fill={cut} />
      <path d="M0 24 V29 M-9 28 Q0 33 9 28" fill="none" stroke={cut} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M-26 34 L-18 52 L-10 42 L-4 60 L0 46 L4 60 L10 42 L18 52 L26 34 L14 40 L0 32 L-14 40 Z" fill={fg} {...edge} />
    </g>
  );
}

/**
 * A human head cut in the same stencil style as the werewolf's: a black face
 * built from white slabs (jaw, brows, almond eyes, cheek marks, nose, mouth).
 * Every village role wears it, with its trade shown in the hair, eyes, mouth,
 * beard and what the card puts on or around it.
 */
function HumanHead({
  hair = "short",
  brows = "plain",
  eyes = "open",
  nose = "plain",
  mouth = "calm",
  beard = "none",
  ears = true,
  cheeks = "mark",
}: {
  hair?: "short" | "long" | "curly" | "bald" | "none";
  brows?: "plain" | "angry" | "bushy" | "raised";
  eyes?: "open" | "closed" | "star" | "heart" | "cross" | "slit";
  nose?: "plain" | "hook";
  mouth?: "calm" | "smile" | "grin" | "stern" | "crooked" | "none";
  beard?: "none" | "short" | "long";
  ears?: boolean;
  cheeks?: "mark" | "heart" | "none";
}) {
  const BROW = {
    plain: "M41 81 L56 77 L55 82 L45 84 Z",
    angry: "M41 78 L57 82 L56 86 L43 83 Z",
    bushy: "M39 83 L41 76 L44 79 L47 74 L50 78 L53 74 L55 78 L58 76 L56 83 L44 86 Z",
    raised: "M42 80 Q49 72 57 78 L56 80.5 Q49 75.5 43 82.5 Z",
  }[brows];
  return (
    <g>
      <path d="M37 84 Q37 54 60 52 Q83 54 83 84 L81 104 Q74 122 60 130 Q46 122 39 104 Z" fill={INK} />
      {hair === "curly" &&
        [180, 157.5, 135, 112.5, 90, 67.5, 45, 22.5, 0].map((a) => {
          const x = n2(60 + 24 * cosR((a * Math.PI) / 180));
          const y = n2(76 - 25 * sinR((a * Math.PI) / 180));
          return (
            <g key={a}>
              <circle cx={x} cy={y} r="7" fill={PALE} stroke={INK} strokeWidth="1" />
              <path d={`M${n2(x - 2.4)} ${y} a2.4 2.4 0 1 1 2.4 2.4`} fill="none" stroke={INK} strokeWidth="1.1" strokeLinecap="round" />
            </g>
          );
        })}
      {(hair === "short" || hair === "long") && (
        <>
          <path d="M38 86 Q35 58 60 53 Q85 58 82 86 L79 74 L73 69 L68 74 L62 68 L56 74 L50 68 L46 73 L41 72 Z" fill={PALE} />
          <path d="M48 58 L46 65 M58 56 L57 63 M70 58 L71 65" stroke={INK} strokeWidth="1.2" strokeLinecap="round" />
        </>
      )}
      {hair === "bald" && <path d="M46 63 Q60 59 74 63 M44 69 Q60 65 76 69" fill="none" stroke={PALE} strokeWidth="1.4" strokeLinecap="round" />}
      {[1, -1].map((sx) => (
        <g key={sx} transform={sx === -1 ? "translate(120 0) scale(-1 1)" : undefined}>
          {hair === "long" && <path d="M39 80 L35 100 L30 136 L35 129 L37 139 L41 125 L42 104 Z" fill={PALE} />}
          {ears && <path d="M38 88 Q31 87 31 95 Q31 103 38 104 L39 100 Q35 99 35 95 Q35 91 39 92 Z" fill={PALE} />}
          {hair === "bald" && <path d="M39 86 L32 80 L36 79 L31 72 L38 76 L37 70 L42 78 Z" fill={PALE} />}
          <path d="M38 84 L39 104 L46 118 L55 126 L60 128 L60 125 L51 118 L43 105 L42 86 Z" fill={PALE} />
          <path d={BROW} fill={PALE} />
          {eyes === "closed" ? (
            <path d="M42 90 Q49 95 56 90 M44 92 l-1 2.4 M49 93.2 v2.6 M54 92 l1 2.4" fill="none" stroke={PALE} strokeWidth="1.6" strokeLinecap="round" />
          ) : eyes === "slit" ? (
            <>
              <path d="M42 90 Q49 86 56 90 Q49 93 42 90 Z" fill={PALE} />
              <ellipse cx="49" cy="89.6" rx="0.9" ry="1.8" fill={INK} />
            </>
          ) : (
            <>
              <path d="M42 90 Q49 84 56 90 Q49 94 42 90 Z" fill={PALE} />
              {eyes === "star" ? (
                <Spark x={49} y={89.4} s={3.2} fill={INK} />
              ) : eyes === "heart" ? (
                <path d="M49 92 C45.4 89.6 46 86.4 49 88.2 C52 86.4 52.6 89.6 49 92 Z" fill={INK} />
              ) : (
                <circle cx={eyes === "cross" ? 53.4 : 49} cy="89.4" r="2.4" fill={INK} />
              )}
            </>
          )}
          {cheeks === "mark" && <path d="M44 99 L54 101 L48 104 Z" fill={PALE} />}
          {cheeks === "heart" && <path d="M47 104 C42.5 101 43.5 97.5 47 99.6 C50.5 97.5 51.5 101 47 104 Z" fill={PALE} />}
        </g>
      ))}
      {nose === "hook" ? (
        <path d="M58.4 84 H61.6 L66.5 100 Q64 104 59.5 102.5 L61 99 Z" fill={PALE} />
      ) : (
        <>
          <path d="M58.4 84 H61.6 L63.5 99 Q60 102.5 56.5 99 Z" fill={PALE} />
          <circle cx="58.5" cy="99.6" r="0.8" fill={INK} />
          <circle cx="61.5" cy="99.6" r="0.8" fill={INK} />
        </>
      )}
      {beard === "short" && <path d="M42 104 L45 116 L52 124 L60 130 L68 124 L75 116 L78 104 L72 114 L66 119 L60 118 L54 119 L48 114 Z" fill={PALE} />}
      {beard === "long" && (
        <>
          <path d="M41 104 L42 122 L47 138 L50 132 L53 150 L57 140 L60 158 L63 140 L67 150 L70 132 L73 138 L78 122 L79 104 L72 114 L66 118 L60 117 L54 118 L48 114 Z" fill={PALE} />
          <path d="M52 124 L54 140 M60 122 V148 M68 124 L66 140" stroke={INK} strokeWidth="1" strokeLinecap="round" />
        </>
      )}
      {beard !== "none" && <path d="M48 112 Q52 104 60 106 Q68 104 72 112 L68 109 Q64 108 60 110 Q56 108 52 109 Z" fill={PALE} />}
      {mouth === "calm" && (
        <>
          <path d="M52 111 Q60 108 68 111 Q60 115 52 111 Z" fill={PALE} />
          <path d="M53 111 H67" stroke={INK} strokeWidth="0.9" />
        </>
      )}
      {mouth === "smile" && <path d="M50 108 Q60 118 70 108 Q60 112 50 108 Z" fill={PALE} />}
      {mouth === "grin" && (
        <>
          <path d="M46 106 Q60 125 74 106 Q60 110 46 106 Z" fill={PALE} />
          <path d="M52.5 108.6 l0.6 4.4 M60 109.8 V117 M67.5 108.6 l-0.6 4.4" stroke={INK} strokeWidth="1" strokeLinecap="round" />
        </>
      )}
      {mouth === "stern" && <path d="M51 110 H69 L68 113 H52 Z" fill={PALE} />}
      {mouth === "crooked" && (
        <>
          <path d="M49 112 Q58 106 71 107 Q62 117 49 112 Z" fill={PALE} />
          <path d="M60 108.6 v3.4" stroke={INK} strokeWidth="1.2" />
        </>
      )}
      {beard === "none" && <path d="M56 120 L60 125 L64 120 Q60 122 56 120 Z" fill={PALE} />}
    </g>
  );
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
      <WolfHead />
      {/* clouds */}
      <Cloud cx={22} cy={152} s={1.05} />
      <Cloud cx={58} cy={160} s={1.2} />
      <Cloud cx={96} cy={152} s={1.05} />
      <Cloud cx={16} cy={112} s={0.6} />
      <Cloud cx={104} cy={114} s={0.6} />
    </>
  ),
  // A fortune-teller in a starry veil and coin headscarf, stars in her eyes,
  // a moon jewel on her brow and a crystal ball in her hands.
  seer: (f) => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <Crescent cx={20} cy={34} R={6} />
      <Crescent cx={94} cy={34} R={6} />
      <Sparks pts={[[38, 28, 2], [80, 26, 1.8], [16, 70, 1.8], [104, 70, 1.8], [18, 120, 1.6], [102, 120, 1.6]]} />
      {/* starry veil */}
      <path d="M28 166 Q26 112 34 84 Q38 50 60 46 Q82 50 86 84 Q94 112 92 166 Z" fill={INK} stroke={PALE} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M28 166 Q26 112 34 84 Q38 50 60 46 Q82 50 86 84 Q94 112 92 166 Z" fill={f.dots} />
      <path d="M42 134 Q60 142 78 134 L82 166 H38 Z" fill={INK} stroke={PALE} strokeWidth="1.4" strokeLinejoin="round" />
      <HumanHead hair="none" eyes="star" mouth="calm" />
      {/* headscarf with a fringe of coins and a moon jewel */}
      <path d="M36 80 Q35 54 60 50 Q85 54 84 80 Q74 70 60 70 Q46 70 36 80 Z" fill={INK} stroke={PALE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M40 72 Q42 58 60 55 Q78 58 80 72" fill="none" stroke={PALE} strokeWidth="0.8" strokeDasharray="1.6 1.6" />
      {[[41.3, 78], [47, 74.9], [53.3, 73], [60, 72.4], [66.7, 73], [73, 74.9], [78.7, 78]].map(([x, y]) => (
        <g key={x}>
          <circle cx={x} cy={y} r="1.9" fill={PALE} />
          <circle cx={x} cy={y} r="0.6" fill={INK} />
        </g>
      ))}
      <Crescent cx={58} cy={62} R={4.6} />
      <Spark x={65} y={59} s={2.2} />
      {/* crystal ball held in both hands */}
      <circle cx="60" cy="150" r="14" fill={PALE} stroke={INK} strokeWidth="1.2" />
      <path d="M50 143 A10.5 10.5 0 0 1 56.5 139" fill="none" stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
      <Crescent cx={60} cy={152} R={5.5} fill={INK} />
      <Compass cx={68} cy={145} r={3.2} fill={INK} />
      <path d="M38 162 Q40 150 49 150 L47.5 154 L51 154 L48.5 157.5 L52 159 Q46 168 38 162 Z M82 162 Q80 150 71 150 L72.5 154 L69 154 L71.5 157.5 L68 159 Q74 168 82 162 Z" fill={PALE} stroke={INK} strokeWidth="0.8" strokeLinejoin="round" />
    </>
  ),
  // A witch in her bent pointed hat: slit eyes, hooked nose, a crooked grin
  // and a wart, a cauldron bubbling under her chin and potions on the shelf.
  witch: (f) => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <circle cx="94" cy="38" r="13" fill={PALE} />
      <circle cx="90" cy="34" r="2.2" fill={INK} />
      <circle cx="97" cy="43" r="1.5" fill={INK} />
      <Sparks pts={[[22, 32, 2.2], [40, 26, 1.6], [16, 70, 1.8], [104, 72, 1.8]]} />
      {/* cloak with a high spiked collar */}
      <path d="M18 166 Q22 136 44 130 L60 134 L76 130 Q98 136 102 166 Z" fill={INK} stroke={PALE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M42 131 L26 114 L50 127 Z M78 131 L94 114 L70 127 Z" fill={PALE} />
      <HumanHead hair="long" ears={false} brows="angry" eyes="slit" nose="hook" mouth="crooked" cheeks="none" />
      <circle cx="68" cy="104" r="1.6" fill={PALE} />
      {/* the hat, tip bent over */}
      <path d="M42 70 L54 38 Q58 26 70 22 Q82 18 88 26 Q78 24 72 32 L78 70 Z" fill={INK} stroke={PALE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M44.2 64 L77 64 L78 70 L42 70 Z" fill={PALE} />
      <path d="M56 62.5 H64 V71.5 H56 Z" fill={INK} stroke={PALE} strokeWidth="1" />
      <path d="M58.4 65 H61.6 V69 H58.4 Z" fill={PALE} />
      <path d="M22 74 Q60 60 98 74 Q60 84 22 74 Z" fill={INK} stroke={PALE} strokeWidth="1.6" strokeLinejoin="round" />
      {/* cauldron */}
      <circle cx="50" cy="135" r="2.6" fill={INK} stroke={PALE} strokeWidth="1" />
      <circle cx="62" cy="132.5" r="3.2" fill={INK} stroke={PALE} strokeWidth="1" />
      <circle cx="71" cy="136" r="2" fill={INK} stroke={PALE} strokeWidth="1" />
      <path d="M36 142 Q34 166 60 166 Q86 166 84 142 Z" fill={INK} stroke={PALE} strokeWidth="1.8" />
      <path d="M44 152 Q60 158 76 152" fill="none" stroke={PALE} strokeWidth="0.8" />
      <path d="M32 142 Q60 135 88 142 Q60 149 32 142 Z" fill={PALE} />
      <ellipse cx="60" cy="142" rx="22" ry="2.6" fill={INK} />
      {/* potion bottles */}
      <path d="M22 162 Q16 162 16 154 Q16 148 21 146 V140 H25 V146 Q30 148 30 154 Q30 162 22 162 Z" fill={PALE} />
      <path d="M98 162 Q92 162 92 156 L95 142 H101 L104 156 Q104 162 98 162 Z" fill={PALE} />
      <path d="M17 154 H29 M94 152 H102" stroke={INK} strokeWidth="1.2" />
      <path d="M12 166 L12 162 H108 V166 Z" fill={f.hatch} />
    </>
  ),
  // A farmer in a wide straw hat with a stalk of wheat between his teeth,
  // sheaves on either side and the sun overhead.
  villager: (f) => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <SunFace cx={98} cy={34} r={8} />
      <Sparks pts={[[22, 34, 2], [40, 28, 1.6], [16, 94, 1.6], [104, 94, 1.6]]} />
      <path d="M22 166 Q24 140 44 133 L60 140 L76 133 Q96 140 98 166 Z" fill={INK} stroke={PALE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M52 134 L60 150 L68 134" fill="none" stroke={PALE} strokeWidth="1.4" />
      <path d="M55.5 140 h9 M57.5 145 h5" stroke={PALE} strokeWidth="1" />
      <Folds d="M36 148 L33 166 M84 148 L87 166" />
      <Wheat x={16} y={166} h={44} lean={-3} />
      <Wheat x={23} y={166} h={36} lean={2} />
      <Wheat x={104} y={166} h={44} lean={3} />
      <Wheat x={97} y={166} h={36} lean={-2} />
      <HumanHead hair="short" mouth="smile" />
      <StrawHat f={f} />
      {/* a stalk of wheat in his teeth */}
      <g transform="rotate(62 68 110)">
        <Wheat x={68} y={110} h={26} />
      </g>
    </>
  ),
  // A guard in a nasal helm and mail coif, a scar over one eye, swords crossed
  // behind him and a starred shield on his chest.
  bodyguard: (f) => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      {[40, -40].map((a) => (
        <g key={a} transform={`rotate(${a} 60 92)`}>
          <path d="M57.5 30 L60 20 L62.5 30 V140 H57.5 Z" fill={PALE} />
          <path d="M60 28 V138" stroke={INK} strokeWidth="0.8" />
          <path d="M50 140 H70 V144 H50 Z" fill={PALE} />
          <path d="M58 144 H62 V155 H58 Z" fill={INK} stroke={PALE} strokeWidth="1" />
          <circle cx="60" cy="158" r="3" fill={PALE} />
        </g>
      ))}
      <Sparks pts={[[60, 30, 2.4], [20, 92, 1.6], [100, 92, 1.6]]} />
      {/* armour */}
      <path d="M20 166 Q22 140 40 134 L60 140 L80 134 Q98 140 100 166 Z" fill={INK} stroke={PALE} strokeWidth="1.6" strokeLinejoin="round" />
      <ellipse cx="30" cy="146" rx="13" ry="9" fill={INK} stroke={PALE} strokeWidth="1.6" />
      <ellipse cx="90" cy="146" rx="13" ry="9" fill={INK} stroke={PALE} strokeWidth="1.6" />
      <path d="M19 149 Q30 141 42 147 M78 147 Q90 141 101 149" fill="none" stroke={PALE} strokeWidth="0.8" />
      {/* mail coif round the face */}
      <path d="M33 80 Q29 110 36 132 L60 141 L84 132 Q91 110 87 80 L82 82 L81 104 Q74 122 60 130 Q46 122 39 104 L38 82 Z" fill={INK} />
      <path d="M33 80 Q29 110 36 132 L60 141 L84 132 Q91 110 87 80 L82 82 L81 104 Q74 122 60 130 Q46 122 39 104 L38 82 Z" fill={f.dots} stroke={PALE} strokeWidth="1.4" strokeLinejoin="round" />
      <HumanHead hair="none" ears={false} brows="angry" mouth="stern" />
      {/* scar over the left eye */}
      <path d="M43 80 L53 99" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M44.6 85.5 l3.2 -1.6 M47.2 90.5 l3.2 -1.6 M49.8 95.5 l3.2 -1.6" stroke={PALE} strokeWidth="0.7" strokeLinecap="round" />
      {/* nasal helm */}
      <path d="M36 84 Q33 50 60 45 Q87 50 84 84 L80 80 Q60 70 40 80 Z" fill={INK} stroke={PALE} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M60 46 Q84 50 84 78 Q72 72 60 71 Z" fill={f.hatch} />
      <path d="M60 46 V71" stroke={PALE} strokeWidth="1.4" />
      <path d="M38 78 Q60 66 82 78" fill="none" stroke={PALE} strokeWidth="3.2" />
      {[42, 51, 60, 69, 78].map((x) => (
        <circle key={x} cx={x} cy={n2(72 + 6 * ((x - 60) / 22) ** 2)} r="0.9" fill={INK} />
      ))}
      <path d="M57.6 71 H62.4 L62 98 L60 101 L58 98 Z" fill={PALE} stroke={INK} strokeWidth="0.6" />
      {/* starred shield on the chest */}
      <path d="M44 139 H76 V150 Q76 160 60 166 Q44 160 44 150 Z" fill={INK} stroke={PALE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M48 142 H72 V150 Q72 157 60 162 Q48 157 48 150 Z" fill="none" stroke={PALE} strokeWidth="0.7" />
      <Compass cx={60} cy={151} r={7} />
    </>
  ),
  // A bearded hunter in a feathered cap, quiver over one shoulder and a
  // longbow at the other, pines at his back.
  hunter: (f) => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <Crescent cx={22} cy={34} R={7} />
      <Sparks pts={[[40, 28, 2], [80, 26, 1.8], [102, 40, 1.8]]} />
      <Pine x={14} y={166} h={42} />
      <Pine x={106} y={166} h={42} />
      {/* longbow */}
      <path d="M88 30 Q114 98 88 164" fill="none" stroke={PALE} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M88 30 V164" stroke={PALE} strokeWidth="0.8" />
      {/* quiver of arrows */}
      <g transform="rotate(-12 30 130)">
        <path d="M26 80 V62 M30 80 V58 M34 80 V64" stroke={PALE} strokeWidth="1.2" />
        <path d="M26 62 l-2.6 -6 l2.6 2.4 l2.6 -2.4 Z M30 58 l-2.6 -6 l2.6 2.4 l2.6 -2.4 Z M34 64 l-2.6 -6 l2.6 2.4 l2.6 -2.4 Z" fill={PALE} />
        <rect x="23" y="78" width="14" height="58" rx="2" fill={INK} stroke={PALE} strokeWidth="1.6" />
        <path d="M23 86 H37 M23 128 H37" stroke={PALE} strokeWidth="1.2" />
      </g>
      <path d="M20 166 Q22 140 42 133 L60 140 L78 133 Q98 140 100 166 Z" fill={INK} stroke={PALE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M34 137 L42 133 L86 166 L74 166 Z" fill={f.hatch} stroke={PALE} strokeWidth="1" strokeLinejoin="round" />
      <path d="M52 134 L60 146 L68 134" fill="none" stroke={PALE} strokeWidth="1.2" />
      <HumanHead hair="short" beard="short" />
      <HunterCap f={f} />
    </>
  ),
  // Cupid: curly hair, hearts in the eyes and on the cheeks, wings at his
  // back, a heart pierced by an arrow overhead and a bow at his chest.
  cupid: (f) => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      {[1, -1].map((sx) => (
        <g key={sx} transform={sx === -1 ? "translate(120 0) scale(-1 1)" : undefined}>
          <path
            d="M50 82 C40 70 26 60 10 58 C14 64 12 68 16 73 C13 78 16 82 20 86 C18 91 22 95 27 97 C27 102 32 106 38 106 C44 104 48 100 51 97 Z"
            fill={PALE}
          />
          <path d="M47 86 L18 66 M47 90 L19 79 M47 94 L25 89 M48 98 L33 100" stroke={INK} strokeWidth="1.4" strokeLinecap="round" />
        </g>
      ))}
      <path d="M36 47 L86 21" stroke={PALE} strokeWidth="1.6" strokeLinecap="round" />
      <Heart cx={60} cy={34} s={8} fill={PALE} />
      <path d="M86 21 L80 21.6 M86 21 L83.4 26.4" stroke={PALE} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M36 47 L32 46.4 L34 42.6 L38 43.2 M38.6 45.6 L34.6 45 L36.6 41.2 L40.6 41.8" fill="none" stroke={PALE} strokeWidth="0.9" />
      <Sparks pts={[[20, 34, 2], [100, 40, 2], [16, 116, 1.6], [104, 116, 1.6]]} />
      <path d="M24 166 Q26 142 46 134 Q60 140 74 134 Q94 142 96 166 Z" fill={INK} stroke={PALE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M38 137 L48 134 L92 166 L80 166 Z" fill={f.dots} stroke={PALE} strokeWidth="1" strokeLinejoin="round" />
      <HumanHead hair="curly" eyes="heart" mouth="smile" cheeks="heart" />
      {/* bow */}
      <path d="M24 152 Q60 130 96 152" fill="none" stroke={PALE} strokeWidth="3" strokeLinecap="round" />
      <path d="M24 152 H96" stroke={PALE} strokeWidth="0.8" />
      <Heart cx={60} cy={158} s={4} fill={PALE} />
    </>
  ),
  // The werewolf's head turned black against a huge bleeding moon: a torn ear,
  // slit eyes, a pentagram burnt on its brow and a broken chain at its throat.
  cursedWolf: (f) => (
    <>
      <circle cx="60" cy="86" r="50" fill="none" stroke={PALE} strokeWidth="0.9" strokeDasharray="2 2.2" />
      <circle cx="60" cy="86" r="45" fill={PALE} />
      {/* the moon bleeds */}
      <path d="M24 112 q3 9 1 17 q-1.6 3 -3.6 0 q-1.2 -8 2.6 -17 Z M31 120 q2 6 0.6 11 q-1.3 2.2 -2.8 0 q-0.8 -5 2.2 -11 Z M96 112 q-3 9 -1 17 q1.6 3 3.6 0 q1.2 -8 -2.6 -17 Z M89 120 q-2 6 -0.6 11 q1.3 2.2 2.8 0 q0.8 -5 -2.2 -11 Z" fill={PALE} />
      <path d="M22.5 134 q1.6 3 0 4.6 q-1.6 -1.6 0 -4.6 Z M97.5 134 q1.6 3 0 4.6 q-1.6 -1.6 0 -4.6 Z" fill={PALE} />
      <Sparks pts={[[18, 30, 2.2], [102, 30, 2.2], [16, 76, 1.6], [104, 76, 1.6]]} />
      <WolfHead invert eyes="slit" torn />
      {/* pentagram burnt on the brow */}
      <circle cx="60" cy="56" r="7" fill={INK} stroke={PALE} strokeWidth="1.2" />
      <path d="M60 50 L63.5 60.8 L54.3 54.1 L65.7 54.1 L56.5 60.8 Z" fill="none" stroke={PALE} strokeWidth="0.9" strokeLinejoin="round" />
      {/* broken chain at the throat */}
      {[1, -1].map((sx) => (
        <g key={sx} transform={sx === -1 ? "translate(120 0) scale(-1 1)" : undefined} fill={INK} stroke={PALE}>
          {[0, 1, 2, 3, 4].map((i) => {
            const x = 20 + i * 6;
            const y = 136 + i * 2.4;
            return i % 2 ? (
              <path key={i} d={`M${x - 2.6} ${n2(y - 0.9)} L${x + 2.6} ${n2(y + 0.9)}`} strokeWidth="2.6" strokeLinecap="round" />
            ) : (
              <ellipse key={i} cx={x} cy={y} rx="4" ry="2.4" transform={`rotate(20 ${x} ${y})`} strokeWidth="1.6" />
            );
          })}
          {/* the snapped end */}
          <path d="M47 146.5 l2.6 -2 M47.5 149 l3 0.4" stroke={PALE} strokeWidth="1.2" strokeLinecap="round" />
        </g>
      ))}
      {/* ground with the curse circle */}
      <path d="M12 154 Q36 148 60 151 Q84 148 108 154 V164 H12 Z" fill={f.hatch} {...g} strokeWidth={1.16} />
      <ellipse cx="60" cy="159" rx="40" ry="5" fill={INK} stroke={PALE} strokeWidth="1.2" />
      <path d="M60 154 L83.5 162.1 L22 157.1 L98 157.1 L36.5 162.1 Z" fill="none" stroke={PALE} strokeWidth="0.8" strokeLinejoin="round" />
    </>
  ),
  // The werewolf's head in a mystic's hood, its own eyes shut and a third eye
  // wide open on its brow, clawed paws cradling a crystal ball below.
  wolfSeer: () => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <Crescent cx={22} cy={36} R={7} />
      <Sparks pts={[[98, 30, 2.4], [40, 26, 2], [80, 26, 2], [16, 70, 1.8], [104, 70, 1.8]]} />
      {/* hood */}
      <path d="M20 166 Q14 74 60 38 Q106 74 100 166 Z" fill={INK} stroke={PALE} strokeWidth="1.8" strokeLinejoin="round" />
      <WolfHead eyes="closed" />
      {/* third eye */}
      <Rays cx={60} cy={66} r1={8} r2={13} n={16} w={0.8} />
      <path d="M50 66 Q60 57 70 66 Q60 75 50 66 Z" fill={PALE} stroke={INK} strokeWidth="1.2" />
      <circle cx="60" cy="66" r="3.4" fill={INK} />
      <circle cx="61" cy="65" r="1" fill={PALE} />
      {/* clawed paws around the crystal ball */}
      <circle cx="60" cy="149" r="14" fill={PALE} stroke={INK} strokeWidth="1.2" />
      <path d="M50 141 A11 11 0 0 1 57 137.5" fill="none" stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
      <path d="M52 149 Q60 142 68 149 Q60 156 52 149 Z" fill={INK} />
      <circle cx="60" cy="149" r="2.6" fill={PALE} />
      <path d="M38 160 q1 -10 10 -10 l-1 3 l3 0 l-2 3 l3 1 Q46 166 38 160 Z M82 160 q-1 -10 -10 -10 l1 3 l-3 0 l2 3 l-3 1 Q74 166 82 160 Z" fill={PALE} stroke={INK} strokeWidth="0.8" strokeLinejoin="round" />
    </>
  ),
  // A bald elder with bushy brows, eyes shut in thought and a long beard,
  // leaning on his staff under a crescent moon.
  elder: (f) => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <Crescent cx={86} cy={36} R={8} face />
      <Sparks pts={[[24, 34, 2.2], [40, 26, 1.6], [16, 84, 1.6], [104, 70, 1.6]]} />
      <Pine x={16} y={166} h={44} />
      <path d="M18 166 Q20 138 42 130 L60 138 L78 130 Q100 138 102 166 Z" fill={INK} stroke={PALE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M30 140 Q60 156 90 140 L94 148 Q60 164 26 148 Z" fill={f.hatch} stroke={PALE} strokeWidth="1" />
      {/* staff */}
      <path d="M99 54 V166" stroke={PALE} strokeWidth="2.8" />
      <path d="M99 54 q-7 -2 -7 -9 q0 -7 7 -7 q6 0 6 6" fill="none" stroke={PALE} strokeWidth="2.4" strokeLinecap="round" />
      <HumanHead hair="bald" brows="bushy" eyes="closed" mouth="none" beard="long" />
      <ellipse cx="98" cy="128" rx="4" ry="3.4" fill={INK} stroke={PALE} strokeWidth="1.3" />
      <path d="M95 127 h6 M95 130 h6" stroke={PALE} strokeWidth="0.7" />
    </>
  ),
  // A fool in a three-pointed belled cap: brows up, eyes crossed, a huge grin,
  // a ruff at his neck and balls in the air.
  idiot: (f) => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <SunFace cx={96} cy={30} r={6} />
      <Sparks pts={[[24, 30, 2], [44, 24, 1.6], [104, 120, 1.6]]} />
      {/* juggled balls */}
      <circle cx="16" cy="98" r="4" fill={PALE} />
      <circle cx="104" cy="94" r="4" fill={PALE} />
      <circle cx="20" cy="124" r="3.2" fill={INK} stroke={PALE} strokeWidth="1.2" />
      <path d="M14 92 Q12 78 20 70 M106 88 Q108 78 102 72 M18 104 Q16 114 19 120" fill="none" stroke={PALE} strokeWidth="0.7" strokeDasharray="1.4 1.6" />
      {/* diamond tunic and ruff */}
      <path d="M20 166 Q22 142 42 134 L60 140 L78 134 Q98 142 100 166 Z" fill={INK} stroke={PALE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M38 152 L45 143 L52 152 L45 161 Z M68 152 L75 143 L82 152 L75 161 Z M53 162 L60 153 L67 162 L60 170 Z" fill={f.hatch} stroke={PALE} strokeWidth="1" />
      <path d="M32 136 L38 129 L43 138 L49 130 L54 139 L60 131 L66 139 L71 130 L77 138 L82 129 L88 136 L81 143 L74 140 L67 146 L60 142 L53 146 L46 140 L39 143 Z" fill={PALE} />
      <path d="M43 138 L46 140 M54 139 L53 146 M66 139 L67 146 M77 138 L74 140" stroke={INK} strokeWidth="0.9" />
      <HumanHead hair="none" brows="raised" eyes="cross" mouth="grin" />
      {/* belled cap */}
      <path d="M40 68 Q22 44 10 62 Q22 58 36 76 Z" fill={PALE} stroke={INK} strokeWidth="1" />
      <path d="M80 68 Q98 44 110 62 Q98 58 84 76 Z" fill={PALE} stroke={INK} strokeWidth="1" />
      <path d="M52 56 Q54 34 70 26 Q64 40 68 54 Z" fill={PALE} stroke={INK} strokeWidth="1" />
      <path d="M38 78 Q38 54 60 50 Q82 54 82 78 Q60 66 38 78 Z" fill={INK} stroke={PALE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M38 78 Q38 54 60 50 Q82 54 82 78 Q60 66 38 78 Z" fill={f.hatch} />
      <path d="M38 78 Q60 66 82 78 L82 74 Q60 62 38 74 Z" fill={PALE} />
      {[[11, 63], [109, 63], [70, 25]].map(([x, y]) => (
        <g key={x}>
          <circle cx={x} cy={y} r="3.2" fill={PALE} stroke={INK} strokeWidth="0.8" />
          <path d={`M${x - 1.4} ${y + 1} h2.8`} stroke={INK} strokeWidth="0.8" />
        </g>
      ))}
    </>
  ),
  // A villager under the full moon with wolf ears pricking through the hair,
  // slit eyes and claw marks torn across the sky: wolf blood, village heart.
  lycan: (f) => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <circle cx="60" cy="62" r="40" fill="none" stroke={PALE} strokeWidth="0.9" strokeDasharray="2 2.2" />
      <Sparks pts={[[20, 32, 2], [100, 32, 2], [16, 120, 1.6], [104, 120, 1.6]]} />
      {/* claw marks */}
      <path d="M18 46 L30 74 M24 42 L36 70 M30 40 L42 66" stroke={PALE} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M102 46 L90 74 M96 42 L84 70 M90 40 L78 66" stroke={PALE} strokeWidth="1.6" strokeLinecap="round" />
      <Shoulders />
      <path d="M30 150 Q60 162 90 150 L92 166 H28 Z" fill={f.hatch} stroke={PALE} strokeWidth="1" />
      <HumanHead hair="curly" brows="angry" eyes="slit" mouth="stern" />
      {/* wolf ears pricking through the curls */}
      <path d="M36 66 L28 34 L52 54 Z M84 66 L92 34 L68 54 Z" fill={PALE} stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M38 59 L33 42 L46 53 Z M82 59 L87 42 L74 53 Z" fill={INK} />
    </>
  ),
  // Two sisters cheek to cheek under one shawl, a heart between them.
  sister: (f) => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <Crescent cx={20} cy={34} R={6} />
      <SunFace cx={98} cy={32} r={6} />
      <Sparks pts={[[44, 28, 1.8], [76, 28, 1.8], [16, 80, 1.6], [104, 80, 1.6]]} />
      <path d="M14 166 Q16 128 40 120 Q60 128 80 120 Q104 128 106 166 Z" fill={INK} stroke={PALE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 166 Q16 128 40 120 Q60 128 80 120 Q104 128 106 166 Z" fill={f.dots} />
      <At x={40} y={90} s={0.62}>
        <HumanHead hair="long" eyes="closed" mouth="smile" />
      </At>
      <At x={80} y={90} s={0.62}>
        <HumanHead hair="long" eyes="closed" mouth="smile" />
      </At>
      <Heart cx={60} cy={130} s={9} fill={PALE} />
      <Heart cx={60} cy={60} s={5} fill={PALE} />
    </>
  ),
  // A wild-haired child among the pines, wide-eyed, and behind them the
  // shadow of the wolf they may become.
  wildChild: (f) => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <Crescent cx={96} cy={34} R={7} />
      <Sparks pts={[[22, 30, 2], [44, 24, 1.6], [76, 24, 1.6]]} />
      <g opacity="0.45">
        <At x={60} y={66} s={0.8} ay={98}>
          <WolfHead eyes="slit" />
        </At>
      </g>
      <Pine x={18} y={166} h={60} />
      <Pine x={102} y={166} h={60} />
      <path d="M30 166 Q32 146 48 140 L60 145 L72 140 Q88 146 90 166 Z" fill={INK} stroke={PALE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M40 152 L46 146 L52 154 L58 147 L64 154 L70 147 L76 153" fill="none" stroke={PALE} strokeWidth="1" />
      <At x={60} y={112} s={0.72}>
        <HumanHead hair="curly" brows="raised" eyes="open" mouth="calm" />
      </At>
      <path d="M12 164 H108" stroke={PALE} strokeWidth="1" />
      <path d="M12 166 H108 V164 Z" fill={f.hatch} />
    </>
  ),
  // A hooded medium with eyes shut, a candle burning in her hands and the
  // spirits of the dead curling up out of the smoke.
  medium: (f) => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <Crescent cx={22} cy={34} R={7} />
      <Sparks pts={[[98, 30, 2.2], [40, 26, 1.6], [80, 26, 1.6]]} />
      {/* hood */}
      <path d="M22 166 Q18 80 60 44 Q102 80 98 166 Z" fill={INK} stroke={PALE} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M22 166 Q18 80 60 44 Q102 80 98 166 Z" fill={f.hatch} opacity="0.5" />
      <HumanHead hair="none" eyes="closed" mouth="none" />
      {/* spirits of the dead rising out of the smoke */}
      <path d="M14 128 Q8 100 18 86 Q28 76 28 92 Q28 100 24 106 Q32 114 24 130 Z" fill={PALE} stroke={INK} strokeWidth="1" />
      <path d="M106 128 Q112 100 102 86 Q92 76 92 92 Q92 100 96 106 Q88 114 96 130 Z" fill={PALE} stroke={INK} strokeWidth="1" />
      <circle cx="17" cy="92" r="1.4" fill={INK} />
      <circle cx="22" cy="92" r="1.4" fill={INK} />
      <circle cx="98" cy="92" r="1.4" fill={INK} />
      <circle cx="103" cy="92" r="1.4" fill={INK} />
      {/* candle */}
      <Flames cx={60} cy={132} r1={4} r2={9} n={10} />
      <path d="M60 124 Q55 130 60 136 Q65 130 60 124 Z" fill={PALE} />
      <rect x="55" y="137" width="10" height="22" fill={PALE} stroke={INK} strokeWidth="1" />
      <path d="M48 160 H72" stroke={PALE} strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  // The mayor in a tall hat, a sash across the chest and the village medal.
  mayor: (f) => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <SunFace cx={96} cy={32} r={7} />
      <Sparks pts={[[22, 32, 2], [40, 26, 1.6], [16, 80, 1.6], [104, 84, 1.6]]} />
      <Shoulders />
      <path d="M40 134 L82 166 L72 166 L34 140 Z" fill={f.hatch} stroke={PALE} strokeWidth="1" />
      <circle cx="60" cy="150" r="7" fill={PALE} stroke={INK} strokeWidth="1" />
      <Spark x={60} y={150} s={3} fill={INK} />
      <HumanHead hair="short" brows="bushy" mouth="stern" beard="short" />
      {/* top hat */}
      <path d="M40 66 H80 V62 H40 Z" fill={PALE} />
      <path d="M46 62 V30 H74 V62 Z" fill={INK} stroke={PALE} strokeWidth="1.6" />
      <path d="M46 54 H74 V58 H46 Z" fill={PALE} />
    </>
  ),
  // A hooded schemer with a sly grin, a wolf mask hanging from one hand.
  minion: (f) => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <Crescent cx={22} cy={34} R={7} />
      <Sparks pts={[[98, 30, 2], [80, 24, 1.6], [16, 80, 1.6]]} />
      <path d="M24 166 Q20 84 60 50 Q100 84 96 166 Z" fill={INK} stroke={PALE} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M24 166 Q20 84 60 50 Q100 84 96 166 Z" fill={f.hatch} opacity="0.5" />
      <HumanHead hair="none" brows="angry" eyes="slit" mouth="crooked" />
      <At x={94} y={142} s={0.34} ay={98}>
        <WolfHead eyes="closed" />
      </At>
      <path d="M94 124 V112" stroke={PALE} strokeWidth="1" />
    </>
  ),
  // A knight in a visored helm, holding a notched sword spotted with rust.
  knight: (f) => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <Crescent cx={96} cy={34} R={7} />
      <Sparks pts={[[22, 30, 2], [40, 26, 1.6], [104, 84, 1.6]]} />
      <Shoulders />
      <path d="M30 140 Q60 150 90 140 L92 148 Q60 158 28 148 Z" fill={f.hatch} stroke={PALE} strokeWidth="1" />
      <HumanHead hair="none" brows="plain" eyes="open" mouth="stern" />
      {/* helm */}
      <path d="M36 82 Q36 50 60 46 Q84 50 84 82 L78 82 Q76 60 60 58 Q44 60 42 82 Z" fill={PALE} stroke={INK} strokeWidth="1.2" />
      <path d="M60 40 Q66 30 60 22" fill="none" stroke={PALE} strokeWidth="2.4" strokeLinecap="round" />
      {/* the rusty sword */}
      <path d="M18 160 L18 70 L21 62 L24 70 L24 160 Z" fill={PALE} stroke={INK} strokeWidth="1" />
      <path d="M12 150 H30" stroke={PALE} strokeWidth="3" strokeLinecap="round" />
      <path d="M18 92 l3 2 l-3 2 M24 112 l-3 2 l3 2" fill="none" stroke={INK} strokeWidth="1" />
      <circle cx="21" cy="84" r="1.2" fill={INK} />
      <circle cx="20" cy="104" r="1.4" fill={INK} />
      <circle cx="22" cy="126" r="1.2" fill={INK} />
    </>
  ),
  // The wolf with its own muzzle bound shut, a finger to the lips of the moon.
  silencer: () => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <Crescent cx={22} cy={36} R={7} face />
      <Sparks pts={[[98, 30, 2], [40, 26, 1.6], [80, 26, 1.6], [16, 80, 1.6], [104, 80, 1.6]]} />
      <WolfHead eyes="slit" />
      {/* the gag */}
      <path d="M36 118 Q60 110 84 118 L84 126 Q60 118 36 126 Z" fill={PALE} stroke={INK} strokeWidth="1.2" />
      <path d="M50 114 l4 12 M58 113 l4 12 M66 113 l4 12" stroke={INK} strokeWidth="1" />
      <Cloud cx={22} cy={152} s={1} />
      <Cloud cx={98} cy={152} s={1} />
    </>
  ),
  // A huge wolf head, slit-eyed, with a gnawed bone and two moons behind.
  bigBadWolf: () => (
    <>
      <Rays cx={60} cy={92} r1={44} r2={64} n={56} w={0.9} />
      <circle cx="24" cy="36" r="8" fill={PALE} />
      <circle cx="96" cy="36" r="8" fill={PALE} />
      <Sparks pts={[[44, 26, 1.8], [76, 26, 1.8], [14, 90, 1.6], [106, 90, 1.6]]} />
      <At x={60} y={96} s={1.25} ay={98}>
        <WolfHead eyes="slit" torn />
      </At>
      {/* gnawed bone */}
      <path d="M30 152 H90" stroke={PALE} strokeWidth="5" strokeLinecap="round" />
      <circle cx="28" cy="149" r="4" fill={PALE} />
      <circle cx="28" cy="155" r="4" fill={PALE} />
      <circle cx="92" cy="149" r="4" fill={PALE} />
      <circle cx="92" cy="155" r="4" fill={PALE} />
    </>
  ),
  // The black wolf turned white, alone on the snow under a black moon.
  whiteWolf: (f) => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <circle cx="60" cy="60" r="30" fill={INK} stroke={PALE} strokeWidth="1.2" />
      <Sparks pts={[[20, 30, 2.2], [100, 30, 2.2], [16, 70, 1.8], [104, 70, 1.8], [30, 130, 1.6], [90, 130, 1.6]]} />
      <WolfHead eyes="open" />
      <path d="M12 154 Q36 146 60 150 Q84 146 108 154 V164 H12 Z" fill={PALE} />
      <path d="M12 158 H108" stroke={INK} strokeWidth="0.8" strokeDasharray="2 3" />
      <path d="M12 154 Q36 146 60 150 Q84 146 108 154" fill="none" stroke={INK} strokeWidth="0.6" />
      <rect x="12" y="160" width="96" height="4" fill={f.hatch} />
    </>
  ),
  // A man with a noose around his neck and a contented smile.
  tanner: (f) => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <SunFace cx={22} cy={34} r={6} />
      <Sparks pts={[[98, 30, 2], [80, 26, 1.6], [104, 84, 1.6]]} />
      {/* gallows beam and rope */}
      <path d="M14 30 H70" stroke={PALE} strokeWidth="4" strokeLinecap="round" />
      <path d="M60 30 V52" stroke={PALE} strokeWidth="2" strokeDasharray="3 1.5" />
      <Shoulders />
      <path d="M30 150 Q60 160 90 150 L92 166 H28 Z" fill={f.hatch} stroke={PALE} strokeWidth="1" />
      <HumanHead hair="short" eyes="closed" mouth="smile" />
      <path d="M44 128 Q60 140 76 128" fill="none" stroke={PALE} strokeWidth="3" />
      <path d="M58 132 v8 l2 3 l2 -3 v-8" fill={PALE} stroke={INK} strokeWidth="0.8" />
    </>
  ),
  // A shadow in a deep hood, eyes narrowed, a knife raised beside the face.
  serialKiller: (f) => (
    <>
      <Rays cx={60} cy={92} r1={40} r2={62} n={48} w={0.8} />
      <Crescent cx={96} cy={34} R={7} />
      <Sparks pts={[[22, 30, 2], [40, 26, 1.6], [16, 80, 1.6]]} />
      <path d="M22 166 Q18 80 60 44 Q102 80 98 166 Z" fill={INK} stroke={PALE} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M22 166 Q18 80 60 44 Q102 80 98 166 Z" fill={f.hatch} opacity="0.6" />
      <HumanHead hair="none" brows="angry" eyes="slit" mouth="none" />
      {/* knife */}
      <path d="M100 66 L106 102 L96 102 Z" fill={PALE} stroke={INK} strokeWidth="1" />
      <path d="M94 102 H108" stroke={PALE} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M101 102 V118" stroke={PALE} strokeWidth="4" strokeLinecap="round" />
      <path d="M101 72 L102.5 96" stroke={INK} strokeWidth="0.6" />
    </>
  ),
  // A grinning firebug with a torch, the village roofs burning behind.
  arsonist: (f) => (
    <>
      <Flames cx={60} cy={92} r1={40} r2={62} n={20} />
      <Sparks pts={[[22, 30, 2], [98, 30, 2], [16, 80, 1.6], [104, 84, 1.6]]} />
      {/* burning roofs */}
      <path d="M12 140 L24 128 L36 140 Z M84 140 L96 128 L108 140 Z" fill={PALE} />
      <Shoulders />
      <path d="M30 150 Q60 160 90 150 L92 166 H28 Z" fill={f.hatch} stroke={PALE} strokeWidth="1" />
      <HumanHead hair="curly" brows="raised" eyes="star" mouth="grin" />
      {/* torch */}
      <path d="M98 166 L92 112" stroke={PALE} strokeWidth="3" strokeLinecap="round" />
      <path d="M92 112 Q84 100 91 88 Q92 98 96 96 Q94 88 100 82 Q104 96 98 108 Z" fill={PALE} stroke={INK} strokeWidth="0.8" />
    </>
  ),
};

// ---------------------------------------------------------------------------
// Wide scenes (viewBox 200 x 120) in the same stencil style as the cards:
// phases on the projector and phones, and the end-of-game winners. They reuse
// the cards' wolf and human heads, rays, moons, clouds and pines.
// ---------------------------------------------------------------------------

/** A farmer's wide straw hat, in HumanHead coordinates. */
function StrawHat({ f }: { f: Fill }) {
  return (
    <>
      <path d="M43 66 Q43 42 60 40 Q77 42 77 66 Z" fill={INK} />
      <path d="M43 66 Q43 42 60 40 Q77 42 77 66 Z" fill={f.hatch} {...g} strokeWidth={1.4} />
      <path d="M43 59 H77 V65 H43 Z" fill={INK} stroke={PALE} strokeWidth="1.2" />
      <path d="M20 70 Q60 54 100 70 Q60 80 20 70 Z" fill={PALE} stroke={INK} strokeWidth="1" />
      <path d="M28 70 L32 65.5 M38 71.5 L41 63 M48 73 L50 61.5 M58 73.5 L59 61 M68 73.5 L68 61.2 M78 72.5 L77 62.5 M88 71 L85.5 64.5" stroke={INK} strokeWidth="1" strokeLinecap="round" />
    </>
  );
}

/** A hunter's cap with a long feather, in HumanHead coordinates. */
function HunterCap({ f }: { f: Fill }) {
  return (
    <>
      <path d="M37 80 Q38 54 60 50 Q82 54 83 78 Q60 68 37 80 Z" fill={INK} stroke={PALE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M37 80 Q38 54 60 50 Q82 54 83 78 Q60 68 37 80 Z" fill={f.hatch} />
      <path d="M35 81 Q60 66 85 79 L84 74 Q60 61 36 76 Z" fill={PALE} />
      <path d="M78 74 Q90 50 106 28 Q100 52 83 76 Z" fill={PALE} />
      <path d="M80.5 74.5 Q92 51 105 30" fill="none" stroke={INK} strokeWidth="0.8" />
      <path d="M88 61 l4 1.2 M92 53 l4 1.2 M96.5 45 l4 1.2 M85 63 l-1.6 -3.6 M89 55 l-1.6 -3.6" stroke={INK} strokeWidth="0.7" strokeLinecap="round" />
    </>
  );
}

/**
 * Places a head drawn in card coordinates: the point (ax, ay) of the card goes
 * to (x, y) in the scene, scaled by s. Heads centre on (60, 92), wolves on (60, 98).
 */
function At({ x, y, s, ax = 60, ay = 92, children }: { x: number; y: number; s: number; ax?: number; ay?: number; children: React.ReactNode }) {
  return <g transform={`translate(${x} ${y}) scale(${s}) translate(${-ax} ${-ay})`}>{children}</g>;
}

/** Shoulders under a head placed with At (card coordinates). */
function Shoulders() {
  return <path d="M22 166 Q24 140 44 133 L60 140 L76 133 Q96 140 98 166 Z" fill={INK} stroke={PALE} strokeWidth="1.6" strokeLinejoin="round" />;
}

/** Rolling ground along the bottom of a scene. */
function Ground({ f, y = 104 }: { f: Fill; y?: number }) {
  return (
    <>
      <path d={`M0 ${y + 4} Q50 ${y - 6} 100 ${y + 2} Q150 ${y - 6} 200 ${y + 4} V120 H0 Z`} fill={INK} stroke={PALE} strokeWidth="1.4" />
      <path d={`M0 ${y + 4} Q50 ${y - 6} 100 ${y + 2} Q150 ${y - 6} 200 ${y + 4} V120 H0 Z`} fill={f.hatch} opacity="0.7" />
    </>
  );
}

const SCENE_ART: Record<Scene, (f: Fill) => React.ReactNode> = {
  // The moon with a sleeping face over the pines; wolf eyes glint in the dark.
  night: () => (
    <>
      <Rays cx={100} cy={50} r1={30} r2={72} n={56} w={0.7} />
      <circle cx="100" cy="50" r="27" fill={INK} stroke={PALE} strokeWidth="1.2" />
      <Crescent cx={95} cy={50} R={21} face />
      <Sparks pts={[[24, 18, 2.6], [46, 36, 1.8], [154, 20, 2.4], [178, 42, 1.8], [138, 12, 1.6], [62, 14, 1.6]]} />
      <Pine x={14} y={120} h={52} />
      <Pine x={34} y={120} h={38} />
      <Pine x={186} y={120} h={52} />
      <Pine x={166} y={120} h={38} />
      <path d="M44 94 q2.4 -2 4.8 0 q-2.4 1.6 -4.8 0 Z M52 94 q2.4 -2 4.8 0 q-2.4 1.6 -4.8 0 Z" fill={PALE} />
      <Cloud cx={74} cy={112} s={1.1} />
      <Cloud cx={128} cy={112} s={1.1} />
      <Cloud cx={100} cy={120} s={1.2} />
    </>
  ),
  // The sun with its calm face rising over the hills; birds take off.
  dawn: (f) => (
    <>
      <Rays cx={100} cy={88} r1={44} r2={96} n={44} w={0.7} />
      <SunFace cx={100} cy={86} r={22} />
      <path d="M0 118 Q40 88 80 100 Q120 86 160 98 Q184 90 200 96 V120 H0 Z" fill={INK} stroke={PALE} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M0 118 Q40 88 80 100 Q120 86 160 98 Q184 90 200 96 V120 H0 Z" fill={f.hatch} opacity="0.6" />
      <Cloud cx={34} cy={36} s={0.8} />
      <Cloud cx={168} cy={28} s={0.7} />
      <path d="M140 54 q5 -5 10 0 q5 -5 10 0 M154 44 q4 -4 8 0 q4 -4 8 0 M30 60 q4 -4 8 0 q4 -4 8 0" fill="none" stroke={PALE} strokeWidth="1.4" strokeLinecap="round" />
      <Sparks pts={[[66, 20, 1.8], [132, 16, 1.8]]} />
    </>
  ),
  // Three villagers puzzling it out, a question over each head.
  discussion: () => (
    <>
      <Rays cx={100} cy={70} r1={30} r2={90} n={48} w={0.6} />
      {(
        [
          [44, 70, "short", "calm"],
          [100, 64, "curly", "smile"],
          [156, 70, "long", "stern"],
        ] as const
      ).map(([x, y, hair, mouth]) => (
        <g key={x}>
          <At x={x} y={y} s={0.52}>
            <Shoulders />
            <HumanHead hair={hair} mouth={mouth} ears={hair !== "long"} />
          </At>
          <path d={`M${x - 11} ${y - 42} h22 a5 5 0 0 1 5 5 v8 a5 5 0 0 1 -5 5 h-9 l-4 5 v-5 h-9 a5 5 0 0 1 -5 -5 v-8 a5 5 0 0 1 5 -5 Z`} fill={PALE} />
          <text x={x} y={y - 30.5} textAnchor="middle" fontSize="12" fontWeight="900" fill={INK} style={{ fontFamily: "var(--font-title), Georgia, serif" }}>
            ?
          </text>
        </g>
      ))}
    </>
  ),
  // The gallows against the moon, the village watching.
  execute: (f) => (
    <>
      <Rays cx={150} cy={34} r1={16} r2={40} n={32} w={0.6} />
      <Crescent cx={150} cy={34} R={13} face />
      <Sparks pts={[[24, 20, 2.2], [110, 16, 1.6], [186, 70, 1.6]]} />
      <path d="M0 106 H200 V120 H0 Z" fill={f.hatch} {...g} strokeWidth={1.2} />
      <path d="M36 100 H112 V106 H36 Z" fill={PALE} />
      <path d="M40 106 V100 M108 106 V100" stroke={INK} strokeWidth="1" />
      <path d="M54 100 V16 H112" fill="none" stroke={PALE} strokeWidth="5" strokeLinecap="square" />
      <path d="M54 36 L74 16" stroke={PALE} strokeWidth="3.4" />
      <path d="M104 16 V38" stroke={PALE} strokeWidth="1.6" />
      <ellipse cx="104" cy="46" rx="6" ry="8" fill="none" stroke={PALE} strokeWidth="2.2" />
      {[132, 150, 168, 186].map((x, i) => (
        <g key={x}>
          <path d={`M${x - 9} 106 Q${x - 9} ${92 - (i % 2) * 3} ${x} ${92 - (i % 2) * 3} Q${x + 9} ${92 - (i % 2) * 3} ${x + 9} 106 Z`} fill={INK} stroke={PALE} strokeWidth="1.4" />
          <circle cx={x} cy={84 - (i % 2) * 3} r="6" fill={INK} stroke={PALE} strokeWidth="1.4" />
          <path d={`M${x - 2.6} ${83 - (i % 2) * 3} h1.6 M${x + 1} ${83 - (i % 2) * 3} h1.6`} stroke={PALE} strokeWidth="1.2" strokeLinecap="round" />
        </g>
      ))}
      <Cloud cx={18} cy={112} s={0.8} />
    </>
  ),
  // Spared: a dove with an olive branch flies out of the light.
  spare: () => (
    <>
      <Rays cx={100} cy={58} r1={30} r2={72} n={48} w={0.7} />
      <circle cx="100" cy="58" r="30" fill={INK} stroke={PALE} strokeWidth="1.4" />
      <path d="M62 66 C76 46 94 44 104 54 C112 40 134 30 150 34 C138 44 128 56 120 66 C132 66 140 72 144 80 C126 80 110 76 98 72 C88 82 72 82 62 66 Z" fill={PALE} />
      <path d="M108 52 L134 38 M112 58 L139 44 M117 63 L141 51" stroke={INK} strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="74" cy="64" r="1.8" fill={INK} />
      <path d="M62 66 l-8 2 l8 2 Z" fill={PALE} />
      <path d="M54 72 q10 8 26 6" fill="none" stroke={PALE} strokeWidth="1.6" strokeLinecap="round" />
      {[[58, 75, -30], [65, 78, -10], [72, 79, 10], [62, 79, 40]].map(([x, y, a]) => (
        <ellipse key={`${x}${y}`} cx={x} cy={y} rx="3.4" ry="1.5" transform={`rotate(${a} ${x} ${y})`} fill={PALE} />
      ))}
      <Sparks pts={[[30, 24, 2.2], [170, 22, 2.2], [24, 90, 1.6], [178, 92, 1.6]]} />
      <Cloud cx={40} cy={112} s={1} />
      <Cloud cx={160} cy={112} s={1} />
    </>
  ),
  // The hunter takes his last shot: arrow on its way into the target.
  hunter: (f) => (
    <>
      <Rays cx={156} cy={58} r1={30} r2={70} n={40} w={0.6} />
      <Sparks pts={[[110, 16, 2], [106, 100, 1.6], [190, 104, 1.6]]} />
      {[30, 22, 14, 6].map((r, i) => (
        <circle key={r} cx="156" cy="58" r={r} fill={i % 2 ? INK : PALE} stroke={i % 2 ? PALE : INK} strokeWidth="1.2" />
      ))}
      <At x={44} y={62} s={0.6}>
        <Shoulders />
        <HumanHead hair="short" beard="short" />
        <HunterCap f={f} />
      </At>
      <path d="M84 64 L150 58" stroke={PALE} strokeWidth="2" strokeLinecap="round" />
      <path d="M152 57.8 l-8 -3.6 l1 4 l-1 3.8 Z" fill={PALE} />
      <path d="M84 64 l-5 -4 l7 0.6 Z M88 63.6 l-5 -4 l7 0.6 Z M84 64 l-4.6 4.6 l6.8 -1.4 Z M88 63.6 l-4.6 4.6 l6.8 -1.4 Z" fill={PALE} />
    </>
  ),
  // The pack wins: three wolf heads in the light of the full moon.
  wolves: () => (
    <>
      <Rays cx={100} cy={62} r1={36} r2={96} n={56} w={0.7} />
      <circle cx="178" cy="22" r="10" fill={PALE} />
      <circle cx="175" cy="20" r="2" fill={INK} />
      <circle cx="181" cy="26" r="1.4" fill={INK} />
      <Crescent cx={20} cy={22} R={7} />
      <At x={40} y={72} s={0.52} ay={98}>
        <WolfHead eyes="slit" />
      </At>
      <At x={160} y={72} s={0.52} ay={98}>
        <WolfHead eyes="slit" />
      </At>
      <circle cx="100" cy="62" r="40" fill={INK} />
      <At x={100} y={64} s={0.76} ay={98}>
        <WolfHead />
      </At>
      <Cloud cx={30} cy={114} s={1} />
      <Cloud cx={100} cy={120} s={1.2} />
      <Cloud cx={170} cy={114} s={1} />
    </>
  ),
  // The village wins: the elder, a farmer and a young villager under the sun.
  village: (f) => (
    <>
      <Rays cx={100} cy={20} r1={14} r2={70} n={48} w={0.6} />
      <SunFace cx={100} cy={18} r={8} />
      <Sparks pts={[[30, 18, 2], [170, 18, 2]]} />
      <Wheat x={10} y={120} h={46} lean={-3} />
      <Wheat x={18} y={120} h={36} lean={2} />
      <Wheat x={190} y={120} h={46} lean={3} />
      <Wheat x={182} y={120} h={36} lean={-2} />
      <At x={46} y={70} s={0.5}>
        <Shoulders />
        <HumanHead hair="bald" brows="bushy" eyes="closed" mouth="none" beard="long" />
      </At>
      <At x={154} y={70} s={0.5}>
        <Shoulders />
        <HumanHead hair="curly" mouth="smile" />
      </At>
      <At x={100} y={70} s={0.58}>
        <Shoulders />
        <HumanHead hair="short" mouth="smile" />
        <StrawHat f={f} />
      </At>
    </>
  ),
  // The lovers win: two faces with hearts in their eyes under a pierced heart.
  lovers: () => (
    <>
      <Rays cx={100} cy={30} r1={16} r2={90} n={48} w={0.6} />
      <path d="M68 38 L134 8" stroke={PALE} strokeWidth="1.6" strokeLinecap="round" />
      <Heart cx={100} cy={24} s={10} fill={PALE} />
      <path d="M134 8 L128 8.6 M134 8 L131.4 13.4" stroke={PALE} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M68 38 L64 37.4 L66 33.6 L70 34.2 M70.6 36.6 L66.6 36 L68.6 32.2 L72.6 32.8" fill="none" stroke={PALE} strokeWidth="0.9" />
      <Sparks pts={[[24, 22, 2.2], [176, 22, 2.2], [20, 90, 1.6], [180, 90, 1.6]]} />
      <At x={70} y={76} s={0.56}>
        <Shoulders />
        <HumanHead hair="long" ears={false} eyes="heart" mouth="smile" cheeks="heart" />
      </At>
      <At x={130} y={76} s={0.56}>
        <Shoulders />
        <HumanHead hair="short" eyes="heart" mouth="smile" cheeks="heart" />
      </At>
    </>
  ),
  // Nobody wins: wolf and villager both close their eyes, sun and moon apart.
  draw: () => (
    <>
      <Crescent cx={24} cy={24} R={9} face />
      <SunFace cx={176} cy={24} r={8} />
      <path d="M100 8 V112" stroke={PALE} strokeWidth="1" strokeDasharray="3 3" />
      <At x={54} y={66} s={0.52} ay={98}>
        <WolfHead eyes="closed" />
      </At>
      <At x={146} y={68} s={0.56}>
        <Shoulders />
        <HumanHead hair="short" eyes="closed" mouth="stern" />
      </At>
      <Cloud cx={40} cy={116} s={0.9} />
      <Cloud cx={160} cy={116} s={0.9} />
    </>
  ),
  // The werewolf's head between the moons, over the clouds and the pines.
  hero: () => (
    <>
      <Rays cx={100} cy={62} r1={36} r2={96} n={56} w={0.7} />
      <circle cx="160" cy="26" r="11" fill={PALE} />
      <circle cx="157" cy="24" r="2.2" fill={INK} />
      <circle cx="164" cy="30" r="1.5" fill={INK} />
      <Crescent cx={38} cy={26} R={9} />
      <Pine x={12} y={120} h={50} />
      <Pine x={188} y={120} h={50} />
      <At x={100} y={62} s={0.78} ay={98}>
        <WolfHead />
      </At>
      <Cloud cx={46} cy={112} s={1} />
      <Cloud cx={100} cy={120} s={1.2} />
      <Cloud cx={154} cy={112} s={1} />
    </>
  ),
};

/** A wide scene in the cards' style, framed like a card lying on its side. */
export function TarotScene({ scene, className = "" }: { scene: Scene; className?: string }) {
  const id = `s${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg viewBox="0 0 200 120" className={className} role="img" aria-hidden>
      <defs>
        <pattern id={`${id}h`} width="2.8" height="2.8" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)">
          <line x1="0" y1="0" x2="0" y2="2.8" stroke={GOLD} strokeWidth="1.1" />
        </pattern>
        <pattern id={`${id}d`} width="3" height="3" patternUnits="userSpaceOnUse">
          <circle cx="0.8" cy="0.8" r="0.6" fill={GOLD} />
          <circle cx="2.3" cy="2.3" r="0.45" fill={GOLD} />
        </pattern>
        <clipPath id={`${id}c`}>
          <rect x="5" y="5" width="190" height="110" rx="4" />
        </clipPath>
      </defs>
      <rect x="1" y="1" width="198" height="118" rx="7" fill={INK} stroke={GOLD} strokeWidth="1.6" />
      <g clipPath={`url(#${id}c)`}>{SCENE_ART[scene]({ hatch: `url(#${id}h)`, dots: `url(#${id}d)` })}</g>
      <rect x="5" y="5" width="190" height="110" rx="4" fill="none" stroke={GOLD} strokeWidth="1" />
    </svg>
  );
}

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

/** Just the illustrated panel of a role card (no frame), cropped to fill its box. */
export function RoleArtPanel({ role, className = "" }: { role: RoleId; className?: string }) {
  const id = `p${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <svg viewBox="9 22 102 144" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <Patterns id={id} />
      <rect x="9" y="22" width="102" height="144" fill={INK} />
      <g clipPath={`url(#${id}c)`}>{ART[role]({ hatch: `url(#${id}h)`, dots: `url(#${id}d)` })}</g>
    </svg>
  );
}

/**
 * A whole tarot card for the role reveal: numeral, illustration, the role's
 * explanation printed inside the card, and the name plaque at the bottom.
 */
export function RoleCardFull({ role, children, className = "" }: { role: RoleId; children?: React.ReactNode; className?: string }) {
  const t = useT();
  return (
    <div className={`flex flex-col rounded-[14px] border-2 border-white bg-black p-[3.5%] text-white ${className}`}>
      <div className="flex min-h-0 flex-1 flex-col gap-2 rounded-[10px] border border-white p-2">
        <div className="mx-auto shrink-0 rounded-full bg-white px-3 font-serif text-sm leading-5 font-bold text-black">{NUMERAL[role]}</div>
        <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-white">
          <RoleArtPanel role={role} className="h-full w-full" />
        </div>
        {children && <div className="shrink-0 border-y border-white/70 px-1 py-1.5 text-center">{children}</div>}
        <div className="shrink-0 rounded-md bg-white py-1 text-center font-display text-xl leading-7 text-black">{t(`roles.${role}.name`)}</div>
      </div>
    </div>
  );
}
