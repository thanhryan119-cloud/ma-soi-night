// Draws the avatar frame art in public/frames/*.svg.
// Run with `node scripts/avatar-frames.mjs` after changing a frame here.
//
// Each frame is one or two layers laid over the avatar by .af-<id>::before
// and ::after in src/app/globals.css. A layer's box is the avatar grown by
// 16% on every side (some frames reach further up for ears or a crown), so in
// the 0..100 wide viewBox the avatar's edge sits at radius R = 50 / 1.32.
// Colours follow the woodcut art (src/components/art/Woodcut.tsx).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "frames");
const R = 50 / 1.32; // avatar edge, ~37.9

const INK = "#efe3c2";
const GOLD = "#e8b45a";
const RED = "#c8323b";

const f = (n) => Number(n.toFixed(2)).toString();

/** Point at radius r, angle deg clockwise from 12 o'clock, around (cx, cy). */
function pt(r, deg, cx = 50, cy = 50) {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}
const P = (r, deg, cx, cy) => pt(r, deg, cx, cy).map(f).join(",");

/** Repeatable pseudo-random numbers, so the art does not change between runs. */
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const svg = (body, h = 100) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 ${f(h)}">${body}</svg>\n`;
const ring = (r, stroke, w, extra = "", cx = 50, cy = 50) =>
  `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="none" stroke="${stroke}" stroke-width="${f(w)}" ${extra}/>`;
const glow = (id, sd) =>
  `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
/** Four-point sparkle. */
const sparkle = (x, y, s, fill) =>
  `<path d="M${f(x)},${f(y - s)} Q${f(x + s * 0.18)},${f(y - s * 0.18)} ${f(x + s)},${f(y)} Q${f(x + s * 0.18)},${f(y + s * 0.18)} ${f(x)},${f(y + s)} Q${f(x - s * 0.18)},${f(y + s * 0.18)} ${f(x - s)},${f(y)} Q${f(x - s * 0.18)},${f(y - s * 0.18)} ${f(x)},${f(y - s)}Z" fill="${fill}"/>`;
/** A cut gem: dark rim, colour, white glint. */
const gem = (x, y, r, color, rim = "#2a1606") =>
  `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r + 0.9)}" fill="${rim}"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${color}"/><circle cx="${f(x - r * 0.35)}" cy="${f(y - r * 0.35)}" r="${f(r * 0.32)}" fill="#fff" opacity=".85"/>`;
/** The dark line that cuts the frame off from the photo. */
const seat = (cx = 50, cy = 50) => ring(R + 0.6, "#07060f", 1.6, "", cx, cy);

const frames = {};

// --- ring: polished silver bezel with knurled edge and four studs ----------
frames["ring"] = svg(
  `<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#ffffff"/><stop offset=".25" stop-color="#9aa0aa"/><stop offset=".5" stop-color="#f4f4f6"/>
  <stop offset=".75" stop-color="#6c717b"/><stop offset="1" stop-color="#e6e7ea"/></linearGradient></defs>` +
    ring(48.6, "#07060f", 2) +
    ring(44.6, "url(#s)", 7.4) +
    ring(48, "#4b4f57", 0.9, `stroke-dasharray="0.7 1.6"`) +
    ring(41.4, "#fff", 1.1) +
    seat() +
    [0, 90, 180, 270]
      .map((d) => {
        const [x, y] = pt(44.6, d);
        return `<rect x="${f(x - 3.2)}" y="${f(y - 3.2)}" width="6.4" height="6.4" transform="rotate(45 ${f(x)} ${f(y)})" fill="#fff" stroke="#07060f" stroke-width="1.1"/><rect x="${f(x - 1.3)}" y="${f(y - 1.3)}" width="2.6" height="2.6" transform="rotate(45 ${f(x)} ${f(y)})" fill="#9aa0aa"/>`;
      })
      .join("") +
    [45, 135, 225, 315].map((d) => `<circle cx="${P(44.6, d).split(",")[0]}" cy="${P(44.6, d).split(",")[1]}" r="1.5" fill="#fff" stroke="#07060f" stroke-width=".7"/>`).join(""),
);
// The glint that runs round the bezel.
frames["ring-shine"] = svg(
  `<defs><filter id="b"><feGaussianBlur stdDeviation="1.2"/></filter></defs>` +
    ring(44.6, "#fff", 6, `stroke-dasharray="16 264" stroke-linecap="round" opacity=".85" filter="url(#b)"`),
);

// --- blood: dark crimson rings, dripping -----------------------------------
{
  const H = 109; // reaches further down for the drips
  const drips = [
    [-28, 9],
    [-14, 13],
    [6, 7],
    [24, 15],
    [36, 8],
  ]
    .map(([dx, len]) => {
      const x = 50 + dx;
      const top = 50 + Math.sqrt(46 * 46 - dx * dx) - 2;
      const w = 2.1;
      const y = top + len;
      return `<path d="M${f(x - w)},${f(top)} L${f(x - w * 0.75)},${f(y)} A${f(w * 1.15)},${f(w * 1.15)} 0 1 0 ${f(x + w * 0.75)},${f(y)} L${f(x + w)},${f(top)}Z" fill="url(#d)" stroke="#2a0306" stroke-width=".7"/><ellipse cx="${f(x - w * 0.35)}" cy="${f(y)}" rx=".55" ry="1.1" fill="#ff9a9c" opacity=".8"/>`;
    })
    .join("");
  frames["blood"] = svg(
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a5e"/><stop offset=".55" stop-color="${RED}"/><stop offset="1" stop-color="#5c060b"/></linearGradient>
<linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b0f14"/><stop offset="1" stop-color="#e5383b"/></linearGradient></defs>` +
      ring(47.6, "#2a0306", 3) +
      ring(44, "url(#g)", 5) +
      ring(44, "#2a0306", 0.6, `stroke-dasharray="1 3.2"`) +
      ring(41.2, "#ff8f92", 0.9) +
      seat() +
      drips,
    H,
  );
  // One drop that falls from the longest drip.
  const x = 74;
  frames["blood-drop"] = svg(
    `<path d="M${x},${f(H - 12)} C${x + 2.6},${f(H - 8)} ${x + 2.6},${f(H - 4.5)} ${x},${f(H - 4.5)} C${x - 2.6},${f(H - 4.5)} ${x - 2.6},${f(H - 8)} ${x},${f(H - 12)}Z" fill="#e5383b" stroke="#2a0306" stroke-width=".6"/>`,
    H,
  );
}

// --- double: two engraved rings with a turning dial between them -----------
frames["double"] = svg(
  ring(48.6, "#07060f", 2.2) +
    ring(47.2, RED, 2) +
    ring(44.6, RED, 0.6) +
    ring(41.4, INK, 2.4) +
    ring(41.4, "#07060f", 0.5, `stroke-dasharray="0.6 1.4"`) +
    seat() +
    [0, 90, 180, 270]
      .map((d) => {
        const a = P(49.8, d);
        const b = P(46.2, d - 4.5);
        const c = P(46.2, d + 4.5);
        return `<path d="M${a} L${b} L${c}Z" fill="${INK}" stroke="#07060f" stroke-width=".6"/>`;
      })
      .join(""),
);
frames["double-dial"] = svg(
  Array.from({ length: 72 }, (_, i) => {
    const d = i * 5;
    const big = i % 6 === 0;
    return `<line x1="${P(big ? 42.6 : 43.1, d).split(",")[0]}" y1="${P(big ? 42.6 : 43.1, d).split(",")[1]}" x2="${P(big ? 46.2 : 45, d).split(",")[0]}" y2="${P(big ? 46.2 : 45, d).split(",")[1]}" stroke="${big ? INK : RED}" stroke-width="${big ? 1.1 : 0.7}" stroke-linecap="round"/>`;
  }).join(""),
);

// --- moon: night-blue ring full of stars, with a glowing crescent ----------
{
  const r = rng(7);
  const stars = Array.from({ length: 22 }, (_, i) => {
    const [x, y] = pt(43.2 + (r() - 0.5) * 3.2, i * (360 / 22) + r() * 8);
    return i % 4 === 0 ? sparkle(x, y, 1.6, "#fffbe8") : `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.35 + r() * 0.45)}" fill="#fff"/>`;
  }).join("");
  const [mx, my] = pt(43, 42);
  frames["moon"] = svg(
    `<defs><linearGradient id="n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4a86"/><stop offset="1" stop-color="#0e1230"/></linearGradient>
<radialGradient id="m" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#fffbe8"/><stop offset="1" stop-color="#e8d9a0"/></radialGradient>${glow("gl", 1.6)}
<mask id="c"><rect width="100" height="100" fill="#fff"/><circle cx="${f(mx - 5.2)}" cy="${f(my + 3.4)}" r="10.4" fill="#000"/></mask></defs>` +
      ring(48.6, "#c9d3ee", 1.2) +
      ring(44, "url(#n)", 7) +
      stars +
      ring(40.4, "#c9d3ee", 1) +
      seat() +
      `<g filter="url(#gl)"><circle cx="${f(mx)}" cy="${f(my)}" r="12" fill="url(#m)" mask="url(#c)"/></g>` +
      `<g mask="url(#c)" fill="#cbb978" opacity=".7"><circle cx="${f(mx + 5.5)}" cy="${f(my - 3)}" r="1.5"/><circle cx="${f(mx + 7.4)}" cy="${f(my + 3.2)}" r="1.1"/><circle cx="${f(mx + 2.6)}" cy="${f(my - 7.6)}" r=".9"/></g>`,
  );
  frames["moon-twinkle"] = svg(
    `<defs>${glow("t", 0.8)}</defs><g filter="url(#t)">` +
      [
        [190, 2.6],
        [118, 2],
        [262, 2.2],
        [320, 1.7],
      ]
        .map(([d, s]) => {
          const [x, y] = pt(43.4, d);
          return sparkle(x, y, s, "#fff");
        })
        .join("") +
      `</g>`,
  );
}

// --- thorns: twisted bramble with hooked thorns and drops of blood ---------
{
  const strand = (phase, rr, amp) => {
    let d = "";
    for (let i = 0; i <= 360; i += 3) {
      const [x, y] = pt(rr + amp * Math.sin(((i * 9 + phase) * Math.PI) / 180), i);
      d += `${i ? "L" : "M"}${f(x)},${f(y)}`;
    }
    return d + "Z";
  };
  const r = rng(11);
  const thorns = Array.from({ length: 18 }, (_, i) => {
    const d = i * 20 + (r() - 0.5) * 8;
    const len = 4.2 + r() * 2;
    const hook = i % 2 ? 7 : -7;
    const a = P(44.2, d - 4);
    const b = P(44.2, d + 4);
    const tip = P(44.2 + len, d + hook);
    const ctl = P(44.4 + len * 0.6, d);
    const drop = i % 5 === 2 ? (([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="1.05" fill="#e5383b" stroke="#2a0306" stroke-width=".4"/>`)(pt(44.2 + len, d + hook)) : "";
    return `<path d="M${a} Q${ctl} ${tip} Q${ctl} ${b}Z" fill="#3e2616" stroke="#07060f" stroke-width=".6"/><path d="M${P(44.6, d - 1)} Q${ctl} ${tip}" fill="none" stroke="#b08058" stroke-width=".45"/>${drop}`;
  }).join("");
  const inner = Array.from({ length: 12 }, (_, i) => {
    const d = i * 30 + 10;
    return `<path d="M${P(41.6, d - 3)} L${P(R + 0.4, d + 4)} L${P(41.6, d + 3)}Z" fill="#3a2414" stroke="#07060f" stroke-width=".4"/>`;
  }).join("");
  frames["thorns"] = svg(
    ring(43.4, "#07060f", 6.4) +
      `<path d="${strand(0, 43.4, 1.5)}" fill="none" stroke="#5e3a20" stroke-width="2.6"/>` +
      `<path d="${strand(180, 43.4, 1.5)}" fill="none" stroke="#8a5a34" stroke-width="2.2"/>` +
      `<path d="${strand(180, 43.6, 1.5)}" fill="none" stroke="#c89a68" stroke-width=".55"/>` +
      thorns +
      inner +
      seat(),
  );
  frames["thorns-glow"] = svg(
    `<defs><radialGradient id="g"><stop offset=".74" stop-color="#e5383b" stop-opacity="0"/><stop offset=".86" stop-color="#e5383b" stop-opacity=".75"/><stop offset="1" stop-color="#e5383b" stop-opacity="0"/></radialGradient></defs><circle cx="50" cy="50" r="50" fill="url(#g)"/>`,
  );
}

// --- pulse: red ring with a heartbeat trace running round it ---------------
{
  let d = "";
  for (let i = 0; i <= 360; i += 1) {
    const k = i % 120; // three beats round the ring
    let rr = 45;
    if (k >= 20 && k < 26) rr = 45 + Math.sin(((k - 20) / 6) * Math.PI) * 1.2; // P wave
    else if (k === 30) rr = 43.6;
    else if (k === 32) rr = 49.6; // R spike
    else if (k === 34) rr = 40.8;
    else if (k === 36) rr = 45.4;
    else if (k >= 42 && k < 52) rr = 45 + Math.sin(((k - 42) / 10) * Math.PI) * 1.8; // T wave
    const [x, y] = pt(rr, i);
    d += `${i ? "L" : "M"}${f(x)},${f(y)}`;
  }
  frames["pulse"] = svg(
    `<defs>${glow("gl", 1)}</defs>` +
      ring(48.6, "#2a0306", 1.4) +
      ring(45, "#3b070c", 7.4) +
      ring(41.6, RED, 1.6) +
      seat() +
      `<path d="${d}" fill="none" stroke="#ff6b6e" stroke-width="1.9" stroke-linejoin="round" filter="url(#gl)"/>` +
      [32, 152, 272].map((a) => `<circle cx="${P(49.6, a).split(",")[0]}" cy="${P(49.6, a).split(",")[1]}" r="1" fill="#fff"/>`).join(""),
  );
  frames["pulse-wave"] = svg(ring(44, "#e5383b", 3.5));
}

// --- crown: gold filigree band, gems and a crown on top --------------------
{
  const H = 100 * (1.5 / 1.32); // the layer reaches 34% above the avatar
  const cy = H - 50;
  const beads = Array.from({ length: 48 }, (_, i) => {
    const [x, y] = pt(40.6, i * 7.5, 50, cy);
    return `<circle cx="${f(x)}" cy="${f(y)}" r=".85" fill="#ffe9a8" stroke="#5a3a08" stroke-width=".3"/>`;
  }).join("");
  const scroll = Array.from({ length: 16 }, (_, i) => {
    const d = i * 22.5 + 11.25;
    return `<path d="M${P(44.6, d - 7, 50, cy)} Q${P(47.4, d - 3.5, 50, cy)} ${P(44.6, d, 50, cy)} Q${P(41.8, d + 3.5, 50, cy)} ${P(44.6, d + 7, 50, cy)}" fill="none" stroke="#6b4a0c" stroke-width=".7"/>`;
  }).join("");
  const gems = [
    [90, 2.5, "#c8323b"],
    [180, 2.8, "#c8323b"],
    [270, 2.5, "#c8323b"],
    [135, 1.8, "#3a7bd5"],
    [225, 1.8, "#3a7bd5"],
    [45, 1.8, "#2fa36b"],
    [315, 1.8, "#2fa36b"],
  ]
    .map(([d, s, c]) => {
      const [x, y] = pt(44.6, d, 50, cy);
      return gem(x, y, s, c);
    })
    .join("");
  // Crown: band on the ring's top, five points with pearls, a big ruby.
  const top = cy - 47;
  const crown =
    `<path d="M29,${f(top + 4)} L33,${f(top - 12)} L40.5,${f(top - 4)} L50,${f(top - 19)} L59.5,${f(top - 4)} L67,${f(top - 12)} L71,${f(top + 4)} Q50,${f(top - 2)} 29,${f(top + 4)}Z" fill="url(#g)" stroke="#3a2404" stroke-width="1.1" stroke-linejoin="round"/>` +
    `<path d="M29,${f(top + 4)} Q50,${f(top - 2)} 71,${f(top + 4)} L70,${f(top + 8)} Q50,${f(top + 2.4)} 30,${f(top + 8)}Z" fill="#b8862a" stroke="#3a2404" stroke-width="1"/>` +
    `<path d="M36,${f(top - 6)} L40.5,${f(top - 1)} M50,${f(top - 14)} L50,${f(top - 3)} M64,${f(top - 6)} L59.5,${f(top - 1)}" stroke="#fff3c0" stroke-width=".8" opacity=".7"/>` +
    [
      [33, top - 12],
      [50, top - 19],
      [67, top - 12],
    ]
      .map(([x, y]) => `<circle cx="${f(x)}" cy="${f(y)}" r="2.1" fill="#fffbe8" stroke="#3a2404" stroke-width=".7"/>`)
      .join("") +
    gem(50, top - 3.2, 2.8, "#c8323b", "#3a2404") +
    gem(40.2, top + 0.6, 1.5, "#3a7bd5", "#3a2404") +
    gem(59.8, top + 0.6, 1.5, "#3a7bd5", "#3a2404");
  frames["crown"] = svg(
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="#fff3b0"/><stop offset=".3" stop-color="${GOLD}"/><stop offset=".55" stop-color="#9a6b16"/>
<stop offset=".75" stop-color="#ffe08a"/><stop offset="1" stop-color="#7a5410"/></linearGradient></defs>` +
      ring(48.4, "#2a1804", 2.2, "", 50, cy) +
      ring(44.6, "url(#g)", 6.6, "", 50, cy) +
      scroll +
      beads +
      seat(50, cy) +
      gems +
      crown,
    H,
  );
  frames["crown-glint"] = svg(
    `<defs>${glow("t", 0.7)}</defs><g filter="url(#t)">` +
      sparkle(...pt(44.6, 118, 50, cy), 3.2, "#fff") +
      sparkle(60.5, top - 9, 2.6, "#fff") +
      sparkle(...pt(44.6, 238, 50, cy), 2.4, "#fff") +
      `</g>`,
    H,
  );
}

// --- frost: ice ring with crystal shards and snowflakes --------------------
{
  const r = rng(23);
  const shards = Array.from({ length: 20 }, (_, i) => {
    const d = i * 18 + (r() - 0.5) * 6;
    const len = i % 2 ? 3 + r() * 1.6 : 5 + r() * 1.4;
    const w = i % 2 ? 2.4 : 3.4;
    return `<path d="M${P(44.4, d - w)} L${P(44.4 + len, d)} L${P(44.4, d + w)}Z" fill="url(#i)" stroke="#e9fbff" stroke-width=".55" stroke-linejoin="round"/><path d="M${P(44.6, d)} L${P(44.2 + len, d)}" stroke="#fff" stroke-width=".35"/>`;
  }).join("");
  const flake = (x, y, s) =>
    `<g stroke="#fff" stroke-width=".7" stroke-linecap="round">` +
    [0, 60, 120]
      .map((a) => {
        const [x1, y1] = pt(s, a, x, y);
        const [x2, y2] = pt(s, a + 180, x, y);
        return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`;
      })
      .join("") +
    `</g><circle cx="${f(x)}" cy="${f(y)}" r=".7" fill="#fff"/>`;
  frames["frost"] = svg(
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#8fd3f4"/><stop offset=".6" stop-color="#e6f8ff"/><stop offset="1" stop-color="#3d8fc4"/></linearGradient>
<linearGradient id="i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4fdff"/><stop offset="1" stop-color="#6fc0ea"/></linearGradient></defs>` +
      shards +
      ring(43.6, "#0b2a44", 6.2) +
      ring(43.6, "url(#g)", 4.6) +
      ring(43.6, "#ffffff", 0.5, `stroke-dasharray="3 1 1 4" opacity=".8"`) +
      ring(40.6, "#bfe9ff", 0.9) +
      seat() +
      [30, 150, 270].map((d) => flake(...pt(43.6, d), 2.6)).join(""),
  );
  frames["frost-shine"] = svg(
    `<defs>${glow("t", 0.7)}</defs><g filter="url(#t)">` + sparkle(...pt(43.6, 85), 2.6, "#fff") + sparkle(...pt(43.6, 215), 2, "#fff") + sparkle(...pt(43.6, 330), 1.6, "#fff") + `</g>`,
  );
}

// --- runes: an arcane circle of glowing runes ------------------------------
{
  // Rune strokes in a 0..1 box (x right, y down), loosely after the elder futhark.
  const RUNES = [
    "M.3,0 L.3,1 M.3,.15 L.75,0 M.3,.4 L.75,.25", // fehu
    "M.3,0 L.3,1 M.3,0 L.7,.25 L.3,.5 L.7,1", // raido
    "M.3,0 L.3,1 M.3,.25 L.7,.5 L.3,.75", // thurisaz
    "M.5,0 L.5,1 M.15,.15 L.5,.45 L.85,.15", // algiz
    "M.5,0 L.85,.35 L.15,.75 L.5,1 M.5,0 L.15,.35 L.85,.75 L.5,1", // othala-ish
    "M.2,0 L.2,1 M.8,0 L.8,1 M.2,.3 L.8,.6", // hagalaz
    "M.5,0 L.5,1 M.2,.2 L.8,.8", // nauthiz
    "M.2,1 L.5,0 L.8,1", // kenaz turned
    "M.2,0 L.2,1 M.2,0 L.8,.35 L.8,.65 L.2,1", // berkano-ish
    "M.5,0 L.5,1 M.5,0 L.85,.3 M.5,.35 L.85,.65", // ansuz
    "M.2,0 L.8,1 M.8,0 L.2,1", // gebo
    "M.2,1 L.2,0 L.8,.5 L.8,0 M.8,1 L.8,.5", // ehwaz-ish
  ];
  const glyphs = RUNES.map((path, i) => {
    const d = i * 30 + 15;
    const [x, y] = pt(44.2, d);
    const s = 5.4;
    return `<path d="${path}" transform="translate(${f(x)} ${f(y)}) rotate(${f(d)}) translate(${f(-s / 2)} ${f(-s / 2)}) scale(${s})" stroke-width="${f(1.35 / s)}"/>`;
  }).join("");
  const dots = Array.from({ length: 12 }, (_, i) => {
    const [x, y] = pt(44.4, i * 30);
    return `<circle cx="${f(x)}" cy="${f(y)}" r=".7"/>`;
  }).join("");
  frames["runes"] = svg(
    `<defs>${glow("gl", 1.2)}</defs>` +
      ring(44.4, "#0c0820", 9.4) +
      `<g filter="url(#gl)">` +
      ring(48.6, "#b98cff", 1) +
      ring(40.2, "#b98cff", 1) +
      `</g>` +
      ring(47, "#6be3d6", 0.4, `stroke-dasharray="0.5 2"`) +
      seat(),
  );
  frames["runes-spin"] = svg(
    `<defs>${glow("gl", 0.9)}</defs><g filter="url(#gl)" fill="none" stroke="#e2ccff" stroke-linecap="round" stroke-linejoin="round">${glyphs}</g><g fill="#6be3d6">${dots}</g>`,
  );
}

// --- wolf: a ring of grey fur with wolf ears -------------------------------
{
  const H = 100 * (1.5 / 1.32);
  const cy = H - 50;
  const r = rng(5);
  const COLORS = ["#4a4e56", "#6b7079", "#8d939c", "#b8bdc4", "#3a3d44"];
  const fur = Array.from({ length: 150 }, (_, i) => {
    const d = i * 2.4 + r() * 2;
    const len = 6.4 + r() * 4.2;
    const lean = (r() - 0.5) * 9;
    const a = P(R + 1, d, 50, cy);
    const c = P(R + 1 + len * 0.6, d + lean * 0.5, 50, cy);
    const b = P(Math.min(R + 1 + len, 49.6), d + lean, 50, cy);
    return `<path d="M${a} Q${c} ${b}" stroke="${COLORS[Math.floor(r() * COLORS.length)]}" stroke-width="${f(1.1 + r() * 0.7)}"/>`;
  }).join("");
  frames["wolf"] = svg(
    ring(44, "#1c1e23", 11, "", 50, cy) + `<g fill="none" stroke-linecap="round">${fur}</g>` + seat(50, cy),
    H,
  );
  // Ears: outer dark fur, inner lighter, a tuft at the base.
  const ear = (side) => {
    const m = (x) => (side < 0 ? x : 100 - x);
    const base = cy - 38;
    return (
      `<path d="M${m(13)},${f(base + 12)} L${m(18)},${f(base - 24)} Q${m(25)},${f(base - 20)} ${m(45)},${f(base - 1)} Z" fill="#3a3d44" stroke="#07060f" stroke-width="1.1" stroke-linejoin="round"/>` +
      `<path d="M${m(20)},${f(base + 6)} L${m(21.4)},${f(base - 16)} Q${m(26)},${f(base - 13)} ${m(37)},${f(base - 1)} Z" fill="#9b6b6b" stroke="#5a3a3a" stroke-width=".6"/>` +
      `<path d="M${m(22.4)},${f(base - 12)} L${m(25)},${f(base - 2)} M${m(26)},${f(base - 10)} L${m(29)},${f(base - 1)} M${m(30)},${f(base - 7)} L${m(32.5)},${f(base)}" stroke="#d8c3b4" stroke-width=".7"/>` +
      `<path d="M${m(18)},${f(base - 24)} L${m(20.4)},${f(base - 19)} M${m(18.6)},${f(base - 21)} L${m(15)},${f(base + 8)}" stroke="#8d939c" stroke-width=".9"/>`
    );
  };
  frames["wolf-ears"] = svg(ear(-1) + ear(1), H);
}

mkdirSync(OUT, { recursive: true });
for (const [name, body] of Object.entries(frames)) writeFileSync(join(OUT, `${name}.svg`), body);
console.log(`wrote ${Object.keys(frames).length} files to ${OUT}`);
