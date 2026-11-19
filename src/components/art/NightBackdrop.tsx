"use client";

// App-wide backdrop: a black night sky with a moon, twinkling stars, forest
// silhouettes and wolves watching from the dark — amber eyes in a patch of
// grey-brown fur that slowly emerge, blink and fade away.

import { cosR, sinR } from "./trig";
import { useEffect, useState } from "react";

interface Watcher {
  x: number;
  y: number;
  s: number;
  tilt: number;
  delay: number;
  dur: number;
  fur: { d: string; c: string; w: number }[];
}
interface Star {
  x: number;
  y: number;
  r: number;
  delay: number;
}

function rng(seed: number) {
  let t = seed;
  return () => {
    t = (t * 1664525 + 1013904223) % 4294967296;
    return t / 4294967296;
  };
}

const FUR = ["#6e6761", "#8a7864", "#4c4642", "#a39484", "#7a5a3e"];

function furStrokes(r: () => number) {
  const out: Watcher["fur"] = [];
  for (let i = 0; i < 70; i++) {
    // Points inside an ellipse around both eyes, brushed outward from the bridge of the nose.
    const a = r() * Math.PI * 2;
    const rad = Math.sqrt(r());
    const x = Math.cos(a) * rad * 82;
    const y = Math.sin(a) * rad * 34 - 4;
    const ang = Math.atan2(y + 30, x) + (r() - 0.5) * 0.6;
    const len = 5 + r() * 9;
    const bend = (r() - 0.5) * 4;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    out.push({
      d: `M${x.toFixed(1)} ${y.toFixed(1)} Q${((x + x2) / 2 + bend).toFixed(1)} ${((y + y2) / 2 - bend).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`,
      c: FUR[Math.floor(r() * FUR.length)],
      w: 0.6 + r() * 0.9,
    });
  }
  return out;
}

function build() {
  const r = rng(Math.floor(Math.random() * 1e9));
  const stars: Star[] = Array.from({ length: 90 }, () => ({ x: r() * 1000, y: r() * 600, r: 0.6 + r() * 1.6, delay: r() * 6 }));
  const watchers: Watcher[] = [];
  let guard = 0;
  while (watchers.length < 14 && guard++ < 500) {
    const x = 40 + r() * 920;
    const y = 300 + r() * 480;
    const edge = x < 250 || x > 750 || y > 660;
    if (!edge && r() < 0.8) continue;
    if (watchers.some((w) => Math.hypot(w.x - x, w.y - y) < 150)) continue;
    watchers.push({ x, y, s: 0.55 + r() * 0.65, tilt: (r() - 0.5) * 10, delay: r() * 10, dur: 9 + r() * 9, fur: furStrokes(r) });
  }
  return { stars, watchers };
}

// One almond-shaped wolf eye, outer corner slightly raised (local units).
const ALMOND = "M-20 3 C-12 -9 8 -12 20 -4 C13 7 -8 10 -20 3 Z";

export function NightBackdrop() {
  const [scene, setScene] = useState<ReturnType<typeof build> | null>(null);
  useEffect(() => setScene(build()), []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050409]">
      <svg className="h-full w-full" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="nb-moon-glow">
            <stop offset="0%" stopColor="#efe3c2" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#efe3c2" stopOpacity="0" />
          </radialGradient>
          <pattern id="nb-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#efe3c2" strokeWidth="1" opacity="0.18" />
          </pattern>
          {/* Amber iris: bright gold centre, burnt orange, dark limbal ring */}
          <radialGradient id="nb-iris" cx="45%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#ffe08a" />
            <stop offset="35%" stopColor="#f6b02e" />
            <stop offset="72%" stopColor="#c46a10" />
            <stop offset="100%" stopColor="#2a1404" />
          </radialGradient>
          {/* Fur patch that fades into the darkness */}
          <radialGradient id="nb-fur">
            <stop offset="0%" stopColor="#5b534d" stopOpacity="0.95" />
            <stop offset="55%" stopColor="#3b3430" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#050409" stopOpacity="0" />
          </radialGradient>
          <clipPath id="nb-almond">
            <path d={ALMOND} />
          </clipPath>
          <symbol id="nb-eye" overflow="visible">
            <path d={ALMOND} transform="scale(1.18)" fill="#0b0806" />
            <g clipPath="url(#nb-almond)">
              <rect x="-22" y="-14" width="44" height="28" fill="#2a1606" />
              <circle cx="1" cy="-1" r="11.5" fill="url(#nb-iris)" />
              {Array.from({ length: 18 }, (_, i) => {
                const a = (i / 18) * Math.PI * 2;
                return <line key={i} x1={1 + cosR(a) * 5} y1={-1 + sinR(a) * 5} x2={1 + cosR(a) * 11} y2={-1 + sinR(a) * 11} stroke="#8a4a08" strokeWidth="0.5" opacity="0.55" />;
              })}
              <circle cx="1" cy="-1" r="4.4" fill="#040302" />
              <path d="M-22 -14 H22 V-5 C10 -10 -8 -10 -22 -1 Z" fill="#000" opacity="0.5" />
              <ellipse cx="-3.5" cy="-5" rx="2.6" ry="1.7" fill="#fffaf0" opacity="0.92" />
              <circle cx="5" cy="2.5" r="0.9" fill="#fffaf0" opacity="0.5" />
            </g>
            <path d={ALMOND} fill="none" stroke="#000" strokeWidth="1.6" />
          </symbol>
        </defs>

        {/* Moon */}
        <circle cx="820" cy="150" r="190" fill="url(#nb-moon-glow)" />
        <circle cx="820" cy="150" r="70" fill="#efe3c2" />
        <circle cx="820" cy="150" r="70" fill="url(#nb-hatch)" />
        <circle cx="846" cy="132" r="64" fill="#050409" opacity="0.9" />

        {/* Stars */}
        {scene?.stars.map((s, i) => (
          <circle key={i} className="nb-star" cx={s.x} cy={s.y} r={s.r} fill="#efe3c2" style={{ animationDelay: `${s.delay}s` }} />
        ))}

        {/* Far hills and forest */}
        <path d="M0 720 Q150 640 300 700 Q460 760 600 690 Q760 620 1000 700 V1000 H0 Z" fill="#0b0918" />
        <path d="M0 720 Q150 640 300 700 Q460 760 600 690 Q760 620 1000 700" fill="none" stroke="#e8b45a" strokeOpacity="0.18" strokeWidth="2" />
        {Array.from({ length: 34 }, (_, i) => {
          const x = i * 31 - 10;
          const h = 70 + ((i * 37) % 90);
          const base = 800 + ((i * 13) % 40);
          return <path key={i} d={`M${x} ${base} L${x - 22} ${base} L${x} ${base - h} L${x + 22} ${base} Z`} fill="#07060f" stroke="#efe3c2" strokeOpacity="0.12" strokeWidth="1.5" />;
        })}
        <rect x="0" y="830" width="1000" height="170" fill="#050409" />

        {/* Wolves watching from the dark */}
        {scene?.watchers.map((w, i) => (
          <g key={i} transform={`translate(${w.x} ${w.y}) rotate(${w.tilt}) scale(${w.s})`}>
            <g className="nb-eyes" style={{ animationDelay: `${w.delay}s`, animationDuration: `${w.dur}s` }}>
              <ellipse cx="0" cy="-4" rx="95" ry="48" fill="url(#nb-fur)" />
              {w.fur.map((f, j) => (
                <path key={j} d={f.d} stroke={f.c} strokeWidth={f.w} fill="none" strokeLinecap="round" opacity="0.6" />
              ))}
              <g className="nb-blink" style={{ animationDelay: `${w.delay}s`, animationDuration: `${w.dur}s` }}>
                <use href="#nb-eye" transform="translate(-30 0) rotate(-6)" />
                <use href="#nb-eye" transform="translate(30 0) scale(-1 1) rotate(-6)" />
              </g>
            </g>
          </g>
        ))}
      </svg>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.65)_100%)]" />
    </div>
  );
}
