"use client";

// App-wide backdrop: a black night sky with a moon, twinkling stars, forest
// silhouettes and pairs of wolf eyes that slowly open, blink and vanish.
// Purely decorative, fixed behind everything, generated on the client.

import { useEffect, useState } from "react";

interface Eyes {
  x: number;
  y: number;
  s: number;
  color: string;
  delay: number;
  dur: number;
  tilt: number;
}
interface Star {
  x: number;
  y: number;
  r: number;
  delay: number;
}

function rand(seed: number) {
  // Small deterministic PRNG so the layout stays stable while the page is open.
  let t = seed;
  return () => {
    t = (t * 1664525 + 1013904223) % 4294967296;
    return t / 4294967296;
  };
}

function build() {
  const r = rand(Math.floor(Math.random() * 1e9));
  const stars: Star[] = Array.from({ length: 90 }, () => ({
    x: r() * 1000,
    y: r() * 620,
    r: 0.6 + r() * 1.6,
    delay: r() * 6,
  }));
  const eyes: Eyes[] = [];
  // Eyes mostly lurk low, in the treeline and at the edges, away from the centre.
  while (eyes.length < 26) {
    const x = 20 + r() * 960;
    const y = 300 + r() * 500;
    const edge = x < 260 || x > 740 || y > 680;
    if (!edge && r() < 0.75) continue;
    eyes.push({
      x,
      y,
      s: 1.1 + r() * 1.4,
      color: r() < 0.7 ? "#f2c14e" : "#e0404b",
      delay: r() * 10,
      dur: 7 + r() * 9,
      tilt: (r() - 0.5) * 14,
    });
  }
  return { stars, eyes };
}

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
          {[
            ["gold", "#f2c14e"],
            ["red", "#e0404b"],
          ].map(([k, c]) => (
            <radialGradient key={k} id={`nb-eye-${k}`}>
              <stop offset="0%" stopColor="#fff6d5" />
              <stop offset="45%" stopColor={c} />
              <stop offset="100%" stopColor={c} stopOpacity="0" />
            </radialGradient>
          ))}
          <pattern id="nb-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <line x1="0" y1="0" x2="0" y2="6" stroke="#efe3c2" strokeWidth="1" opacity="0.18" />
          </pattern>
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

        {/* Lurking eyes */}
        {scene?.eyes.map((e, i) => (
          <g
            key={i}
            className="nb-eyes"
            transform={`translate(${e.x} ${e.y}) rotate(${e.tilt}) scale(${e.s})`}
            style={{ animationDelay: `${e.delay}s`, animationDuration: `${e.dur}s` }}
          >
            <ellipse cx="-9" cy="0" rx="10" ry="6" fill={`url(#nb-eye-${e.color === "#e0404b" ? "red" : "gold"})`} opacity="0.6" />
            <ellipse cx="9" cy="0" rx="10" ry="6" fill={`url(#nb-eye-${e.color === "#e0404b" ? "red" : "gold"})`} opacity="0.6" />
            <ellipse cx="-9" cy="0" rx="4.2" ry="2.2" fill={e.color} />
            <ellipse cx="9" cy="0" rx="4.2" ry="2.2" fill={e.color} />
            <ellipse cx="-9" cy="0" rx="0.9" ry="2" fill="#050409" />
            <ellipse cx="9" cy="0" rx="0.9" ry="2" fill="#050409" />
          </g>
        ))}
      </svg>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.65)_100%)]" />
    </div>
  );
}
