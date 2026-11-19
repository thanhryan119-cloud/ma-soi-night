"use client";

// App-wide backdrop: a black night sky with a moon, twinkling stars, forest
// silhouettes and a few wolves' eyes lurking in the dark. Each pair is an
// original ink-sketch drawing — pale fur strokes around the brows, nose
// bridge and cheeks, almond eyes with light irises — that slowly surfaces,
// blinks and sinks back into the night.

import { useEffect, useState } from "react";
import { cosR, sinR } from "./trig";

interface Watcher {
  x: number;
  y: number;
  s: number;
  tilt: number;
  delay: number;
  dur: number;
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

const W = "#f2efe8";
const FUR = ["#f4f1ea", "#d6d3cc", "#aeaaa2", "#85817a", "#5f5c57"];
const f1 = (v: number) => v.toFixed(1);

/** One tapered, slightly curved hair stroke from (x, y) at angle a. */
function hair(x: number, y: number, a: number, len: number, w: number, bend: number) {
  const dx = cosR(a);
  const dy = sinR(a);
  const px = -dy * (w / 2);
  const py = dx * (w / 2);
  const tx = x + dx * len;
  const ty = y + dy * len;
  const mx = x + dx * len * 0.55 - dy * bend;
  const my = y + dy * len * 0.55 + dx * bend;
  return `M${f1(x + px)} ${f1(y + py)} Q${f1(mx + px * 0.5)} ${f1(my + py * 0.5)} ${f1(tx)} ${f1(ty)} Q${f1(mx - px * 0.5)} ${f1(my - py * 0.5)} ${f1(x - px)} ${f1(y - py)} Z`;
}

interface Stroke {
  d: string;
  c: string;
}

/** Fur for the left half of the face (mirrored for the right) and the shared nose bridge. */
function buildFur() {
  const r = rng(424242);
  const side: Stroke[] = [];
  const centre: Stroke[] = [];
  const add = (out: Stroke[], n: number, region: () => [number, number, number]) => {
    for (let i = 0; i < n; i++) {
      const [x, y, a] = region();
      out.push({ d: hair(x, y, a, 9 + r() * 20, 0.8 + r() * 1.5, (r() - 0.5) * 8), c: FUR[Math.floor(r() * FUR.length)] });
    }
  };
  // brow: an arc above the eye, hairs sweeping up and outward
  add(side, 160, () => {
    const t = r();
    const x = -112 + t * 84;
    const y = -20 - Math.sin(t * Math.PI) * 18 - r() * 16;
    return [x, y, -2.2 - t * 0.5 + (r() - 0.5) * 0.5];
  });
  // temple, out to the side
  add(side, 45, () => [-138 + r() * 34, -26 + r() * 46, -2.75 + (r() - 0.5) * 0.6]);
  // cheek under the eye, hairs falling down and outward
  add(side, 60, () => [-104 + r() * 58, 14 + r() * 26, 2.0 + (r() - 0.5) * 0.7]);
  // fur between the brows pointing up, the nose bridge pointing down
  add(centre, 80, () => [-46 + r() * 92, -60 + r() * 36, -1.57 + (r() - 0.5) * 0.9]);
  add(centre, 90, () => {
    const y = -26 + r() * 64;
    const spread = 32 * (1 - (y + 26) / 90);
    const x = (r() * 2 - 1) * spread;
    return [x, y, 1.57 - x * 0.03 + (r() - 0.5) * 0.5];
  });
  return { side, centre };
}

function build() {
  const r = rng(Math.floor(Math.random() * 1e9));
  const stars: Star[] = Array.from({ length: 90 }, () => ({ x: r() * 1000, y: r() * 600, r: 0.6 + r() * 1.6, delay: r() * 6 }));
  const watchers: Watcher[] = [];
  let guard = 0;
  while (watchers.length < 6 && guard++ < 1000) {
    const x = 90 + r() * 820;
    const y = 300 + r() * 470;
    const edge = x < 260 || x > 740 || y > 680;
    if (!edge && r() < 0.85) continue;
    if (watchers.some((w) => Math.hypot(w.x - x, w.y - y) < 200)) continue;
    // small, and on a long cycle so each pair surfaces only a third as often
    watchers.push({ x, y, s: 0.3 + r() * 0.22, tilt: (r() - 0.5) * 8, delay: r() * 45, dur: 30 + r() * 27 });
  }
  return { stars, watchers, fur: buildFur() };
}

// Left eye, outer corner raised, inner corner dipping toward the nose.
const EYE = "M-94 -6 C-84 -23 -54 -25 -36 4 L-29 13 C-48 8 -77 11 -94 -6 Z";

export function NightBackdrop() {
  const [scene, setScene] = useState<ReturnType<typeof build> | null>(null);
  useEffect(() => setScene(build()), []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[#050409]">
      <svg className="h-full w-full" viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="nb-moon-glow">
            <stop offset="0%" stopColor={W} stopOpacity="0.22" />
            <stop offset="100%" stopColor={W} stopOpacity="0" />
          </radialGradient>
          {scene && (
            <>
              <clipPath id="nb-eye-clip">
                <path d={EYE} />
              </clipPath>
              <g id="nb-fur-half">
                {scene.fur.side.map((h, i) => (
                  <path key={i} d={h.d} fill={h.c} />
                ))}
              </g>
              <g id="nb-eye-left">
                <path d={EYE} fill="#000" />
                <g clipPath="url(#nb-eye-clip)">
                  <circle cx="-61" cy="-6" r="11" fill="#d9d5cc" />
                  <circle cx="-61" cy="-6" r="11" fill="none" stroke="#6e6a63" strokeWidth="2" />
                  <circle cx="-60" cy="-6" r="5.6" fill="#141312" />
                  <ellipse cx="-65" cy="-10" rx="2.6" ry="1.8" fill="#fff" />
                  <path d="M-94 -6 C-84 -23 -54 -25 -36 4 L-36 -30 H-96 Z" fill="#000" />
                </g>
                <path d="M-96 -5 C-85 -25 -53 -27 -35 3" fill="none" stroke={W} strokeWidth="2.4" strokeLinecap="round" />
                <path d="M-90 -3 C-75 9 -50 7 -32 11" fill="none" stroke="#9c9890" strokeWidth="1.3" strokeLinecap="round" />
                <path d={hair(-35, 6, 0.95, 16, 2.4, 1)} fill={W} />
                <path d={hair(-94, -6, 3.5, 12, 2, -1)} fill={W} />
              </g>
            </>
          )}
        </defs>

        {/* Moon */}
        <circle cx="820" cy="150" r="190" fill="url(#nb-moon-glow)" />
        <circle cx="820" cy="150" r="70" fill={W} />
        <circle cx="846" cy="132" r="64" fill="#050409" />

        {/* Stars */}
        {scene?.stars.map((s, i) => (
          <circle key={i} className="nb-star" cx={s.x} cy={s.y} r={s.r} fill={W} style={{ animationDelay: `${s.delay}s` }} />
        ))}

        {/* Far hills and forest */}
        <path d="M0 720 Q150 640 300 700 Q460 760 600 690 Q760 620 1000 700 V1000 H0 Z" fill="#0b0a12" />
        <path d="M0 720 Q150 640 300 700 Q460 760 600 690 Q760 620 1000 700" fill="none" stroke={W} strokeOpacity="0.16" strokeWidth="2" />
        {Array.from({ length: 34 }, (_, i) => {
          const x = i * 31 - 10;
          const h = 70 + ((i * 37) % 90);
          const base = 800 + ((i * 13) % 40);
          return <path key={i} d={`M${x} ${base} L${x - 22} ${base} L${x} ${base - h} L${x + 22} ${base} Z`} fill="#07060f" stroke={W} strokeOpacity="0.1" strokeWidth="1.5" />;
        })}
        <rect x="0" y="830" width="1000" height="170" fill="#050409" />

        {/* Wolves' eyes lurking in the dark */}
        {scene?.watchers.map((w, i) => (
          <g key={i} transform={`translate(${w.x.toFixed(1)} ${w.y.toFixed(1)}) rotate(${w.tilt.toFixed(1)}) scale(${w.s.toFixed(3)})`} opacity="0.7">
            <g className="nb-eyes" style={{ animationDelay: `${w.delay}s`, animationDuration: `${w.dur}s` }}>
              <use href="#nb-fur-half" transform="translate(-26 0)" />
              <use href="#nb-fur-half" transform="scale(-1 1) translate(-26 0)" />
              {scene.fur.centre.map((h, j) => (
                <path key={j} d={h.d} fill={h.c} />
              ))}
              <g className="nb-blink" style={{ animationDelay: `${w.delay}s`, animationDuration: `${w.dur}s` }}>
                <use href="#nb-eye-left" transform="translate(-26 0)" />
                <use href="#nb-eye-left" transform="scale(-1 1) translate(-26 0)" />
              </g>
            </g>
          </g>
        ))}
      </svg>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.65)_100%)]" />
    </div>
  );
}
