"use client";

// Landing-page hero: two rows of role cards around a large Narrator card,
// with a band of occult and celestial symbols between the rows.

import type { RoleId } from "@shared/types";
import { cosR, sinR } from "./trig";
import { CardBack, NarratorCard, RoleArt } from "./Tarot";

const TOP: RoleId[] = ["werewolf", "seer", "witch", "hunter"];
const BOTTOM: (RoleId | "back")[] = ["villager", "bodyguard", "cupid", "back"];

const W = "#ffffff";
const n2 = (v: number) => Math.round(v * 100) / 100;

function Star8({ x, y, r }: { x: number; y: number; r: number }) {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.2 : i % 4 ? r * 0.55 : r;
    pts.push(`${n2(x + cosR(a) * rr)} ${n2(y + sinR(a) * rr)}`);
  }
  return (
    <>
      <circle cx={x} cy={y} r={r * 0.8} fill="none" stroke={W} strokeWidth="1" />
      <path d={`M${pts.join(" L")} Z`} fill={W} />
      <circle cx={x} cy={y} r={r * 0.14} fill="#000" />
    </>
  );
}

function Phase({ x, y, k }: { x: number; y: number; k: number }) {
  // k: 0 new, 1 crescent, 2 half, 3 gibbous, 4 full
  return (
    <>
      <circle cx={x} cy={y} r="7" fill={k === 4 ? W : "#000"} stroke={W} strokeWidth="1.3" />
      {k === 2 && <path d={`M${x} ${y - 7} A7 7 0 0 1 ${x} ${y + 7} Z`} fill={W} />}
      {k === 1 && <path d={`M${x} ${y - 7} A7 7 0 0 1 ${x} ${y + 7} A4 7 0 0 0 ${x} ${y - 7} Z`} fill={W} />}
      {k === 3 && <path d={`M${x} ${y - 7} A7 7 0 0 1 ${x} ${y + 7} A4 7 0 0 1 ${x} ${y - 7} Z`} fill={W} />}
    </>
  );
}

/** A symmetrical band of occult symbols (half of it; mirrored for the other side). */
function SymbolBand({ flip = false }: { flip?: boolean }) {
  return (
    <svg viewBox="0 0 200 44" className="w-full" aria-hidden style={flip ? { transform: "scaleX(-1)" } : undefined}>
      {/* crescent */}
      <path d="M16 8 A14 14 0 1 0 16 36 A11 14 0 0 1 16 8 Z" fill={W} />
      {/* compass star */}
      <Star8 x={46} y={22} r={15} />
      {/* pendulum */}
      <path d="M72 4 V28" stroke={W} strokeWidth="1.2" />
      <path d="M72 28 L67 34 L72 42 L77 34 Z" fill={W} />
      <circle cx="72" cy="4" r="2" fill={W} />
      {/* moon phases */}
      <Phase x={90} y={14} k={1} />
      <Phase x={106} y={14} k={2} />
      <Phase x={122} y={14} k={3} />
      <Phase x={138} y={14} k={4} />
      {/* all-seeing eye */}
      <path d="M96 34 Q114 22 132 34 Q114 46 96 34 Z" fill={W} />
      <circle cx="114" cy="34" r="5" fill="#000" />
      <circle cx="114" cy="34" r="2" fill={W} />
      {/* concentric circles */}
      <circle cx="160" cy="22" r="13" fill="none" stroke={W} strokeWidth="1.4" />
      <circle cx="160" cy="22" r="8.5" fill="none" stroke={W} strokeWidth="1.4" />
      <circle cx="160" cy="22" r="4" fill={W} />
      {/* alchemical sigil: triangle crossed */}
      <path d="M186 8 L196 26 H176 Z M178 20 H194" fill="none" stroke={W} strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="186" cy="34" r="4" fill="none" stroke={W} strokeWidth="1.4" />
      <path d="M186 30 V38 M182 34 H190" stroke={W} strokeWidth="1.2" />
    </svg>
  );
}

function Card({ id, delay }: { id: RoleId | "back"; delay: number }) {
  return (
    <div className="tarot-rise" style={{ animationDelay: `${delay}ms` }}>
      {id === "back" ? <CardBack className="w-full" /> : <RoleArt role={id} className="w-full" />}
    </div>
  );
}

export function TarotGrid({ className = "" }: { className?: string }) {
  return (
    <div className={`mx-auto grid w-full max-w-3xl grid-cols-[1fr_1fr_2fr_1fr_1fr] items-center gap-x-1.5 gap-y-1 sm:gap-x-3 sm:gap-y-2 ${className}`}>
      <div className="tarot-rise col-start-3 row-span-3 row-start-1 self-center" style={{ animationDelay: "0ms" }}>
        <NarratorCard className="w-full drop-shadow-[0_0_24px_rgba(255,255,255,0.12)]" />
      </div>
      {TOP.map((r, i) => (
        <Card key={r} id={r} delay={120 + i * 80} />
      ))}
      <div className="col-span-2 px-1">
        <SymbolBand />
      </div>
      <div className="col-span-2 px-1">
        <SymbolBand flip />
      </div>
      {BOTTOM.map((r, i) => (
        <Card key={r} id={r} delay={440 + i * 80} />
      ))}
    </div>
  );
}
