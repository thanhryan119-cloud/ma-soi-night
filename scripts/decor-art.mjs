// Draws the profile card backgrounds and chat bubble decorations in
// public/decor/*.svg. Run with `node scripts/decor-art.mjs` after changing one.
//
// Card scenes are 400x160 and laid over the card with `cover` from the right,
// so the right side (behind nothing) carries the picture and the left stays
// calm under the avatar and name. A scene's moving layers use the same box,
// so they line up with it. Chat pieces are small tiles and corner ornaments.
// Colours follow the woodcut art (src/components/art/Woodcut.tsx).
// The visuals are wired up in src/app/globals.css (.pc-<id>, .cb-<id>).

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "decor");

const INK = "#efe3c2";
const GOLD = "#e8b45a";

const f = (n) => Number(n.toFixed(2)).toString();
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
const svg = (w, h, body, par = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"${par ? ` preserveAspectRatio="${par}"` : ""}>${body}</svg>\n`;
const scene = (body) => svg(400, 160, body);
const blur = (id, sd) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
const glow = (id, sd) =>
  `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
const sparkle = (x, y, s, fill, extra = "") =>
  `<path d="M${f(x)},${f(y - s)} Q${f(x + s * 0.16)},${f(y - s * 0.16)} ${f(x + s)},${f(y)} Q${f(x + s * 0.16)},${f(y + s * 0.16)} ${f(x)},${f(y + s)} Q${f(x - s * 0.16)},${f(y + s * 0.16)} ${f(x - s)},${f(y)} Q${f(x - s * 0.16)},${f(y - s * 0.16)} ${f(x)},${f(y - s)}Z" fill="${fill}" ${extra}/>`;
/** A pine tree: tiers of jagged triangles on a trunk, base at (x, y). */
function pine(x, y, h, fill) {
  const w = h * 0.42;
  let d = `M${f(x - w * 0.08)},${f(y)} L${f(x + w * 0.08)},${f(y)} L${f(x + w * 0.08)},${f(y - h * 0.12)}`;
  const tiers = 4;
  let pts = [];
  for (let i = 0; i < tiers; i++) {
    const yb = y - h * 0.1 - (i * h * 0.85) / tiers;
    const half = (w / 2) * (1 - i / (tiers + 0.6));
    pts.push([x + half, yb], [x + half * 0.35, yb - h * 0.1]);
  }
  const right = pts.map(([a, b]) => `L${f(a)},${f(b)}`).join("");
  const left = pts
    .slice()
    .reverse()
    .map(([a, b]) => `L${f(2 * x - a)},${f(b)}`)
    .join("");
  d += `${right}L${f(x)},${f(y - h)}${left}L${f(x - w * 0.08)},${f(y - h * 0.12)}Z`;
  return `<path d="${d}" fill="${fill}"/>`;
}
function pineRow(seed, from, to, base, hMin, hMax, fill, step = 14) {
  const r = rng(seed);
  let out = "";
  for (let x = from; x < to; x += step * (0.6 + r() * 0.7)) out += pine(x, base + r() * 6, hMin + r() * (hMax - hMin), fill);
  return out;
}
/** A sitting wolf howling up and to the left; base centre at (x, y), height h. */
function wolf(x, y, h, fill) {
  const s = h / 42;
  const p = (px, py) => `${f(x + (px - 14) * s)},${f(y + (py - 42) * s)}`;
  return (
    `<path d="M${p(4, 42)} C${p(2, 34)} ${p(5, 24)} ${p(10, 19)} L${p(9, 12)} C${p(7, 8)} ${p(4, 5)} ${p(0, 1)} L${p(5, 3)} L${p(8, 2)} L${p(11, 4)} L${p(13, 1)} L${p(15, 6)} C${p(17, 9)} ${p(18, 13)} ${p(18, 17)} C${p(23, 22)} ${p(25, 30)} ${p(24, 42)} Z" fill="${fill}"/>` +
    `<path d="M${p(22, 42)} C${p(30, 42)} ${p(34, 38)} ${p(33, 32)} C${p(31, 36)} ${p(27, 38)} ${p(22, 38)} Z" fill="${fill}"/>`
  );
}
const stars = (seed, n, area, maxR = 1.1, fill = "#fff") => {
  const r = rng(seed);
  const [x0, y0, x1, y1] = area;
  return Array.from({ length: n }, () => `<circle cx="${f(x0 + r() * (x1 - x0))}" cy="${f(y0 + r() * (y1 - y0))}" r="${f(0.25 + r() * maxR)}" fill="${fill}" opacity="${f(0.35 + r() * 0.65)}"/>`).join("");
};

const files = {};

// ===================================================================== cards

// --- stars: deep sky, milky way and a howling wolf constellation ----------
{
  const W = [
    [372, 22],
    [352, 38],
    [338, 30],
    [331, 18],
    [324, 34],
    [318, 56],
    [306, 86],
    [314, 118],
    [340, 124],
    [346, 96],
    [354, 64],
  ];
  const lines = W.map(([x, y], i) => (i ? `L${x},${y}` : `M${x},${y}`)).join("") + "M352,38 L354,64";
  files["card-stars"] = scene(
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d1856"/><stop offset=".6" stop-color="#0d0b2c"/><stop offset="1" stop-color="#05040f"/></linearGradient>
<radialGradient id="mw"><stop offset="0" stop-color="#c9c3ff" stop-opacity=".32"/><stop offset=".5" stop-color="#8a7fe0" stop-opacity=".12"/><stop offset="1" stop-color="#8a7fe0" stop-opacity="0"/></radialGradient>
<radialGradient id="neb"><stop offset="0" stop-color="#e05a9c" stop-opacity=".22"/><stop offset="1" stop-color="#e05a9c" stop-opacity="0"/></radialGradient>
${blur("b", 6)}${glow("g", 1.4)}</defs>
<rect width="400" height="160" fill="url(#sky)"/>
<ellipse cx="250" cy="80" rx="230" ry="34" fill="url(#mw)" transform="rotate(-18 250 80)" filter="url(#b)"/>
<ellipse cx="200" cy="96" rx="70" ry="26" fill="url(#neb)" transform="rotate(-18 200 96)"/>` +
      stars(3, 170, [0, 0, 400, 160], 0.75) +
      stars(4, 60, [150, 30, 360, 130], 0.5, "#dcd6ff") +
      `<path d="${lines}" fill="none" stroke="#bcc6ff" stroke-opacity=".45" stroke-width=".7" stroke-dasharray="2 1.5"/>` +
      `<g filter="url(#g)">${W.map(([x, y], i) => sparkle(x, y, i % 3 ? 2.2 : 3.2, "#fff")).join("")}</g>`,
  );
  files["card-stars-twinkle"] = scene(
    `<defs>${glow("g", 1.2)}</defs><g filter="url(#g)">` +
      [
        [62, 30, 2.4],
        [128, 112, 2],
        [176, 22, 2.8],
        [232, 132, 2],
        [276, 40, 2.2],
        [390, 100, 2.6],
        [96, 70, 1.6],
      ]
        .map(([x, y, s]) => sparkle(x, y, s, "#fff"))
        .join("") +
      `</g>`,
  );
  files["card-stars-meteor"] = scene(
    `<defs><linearGradient id="m" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>${glow("g", 1)}</defs>` +
      `<path d="M300,18 L236,52" stroke="url(#m)" stroke-width="1.6" stroke-linecap="round" filter="url(#g)"/><circle cx="300" cy="18" r="1.6" fill="#fff" filter="url(#g)"/>`,
  );
}

// --- bloodmoon: huge red moon, clouds, a wolf howling on a cliff -----------
{
  const r = rng(9);
  const craters = Array.from({ length: 9 }, () => {
    const a = r() * Math.PI * 2;
    const d = r() * 34;
    const cr = 2 + r() * 6;
    const x = 318 + Math.cos(a) * d;
    const y = 64 + Math.sin(a) * d;
    return `<circle cx="${f(x)}" cy="${f(y)}" r="${f(cr)}" fill="#5a0a12" opacity=".35"/><circle cx="${f(x - cr * 0.25)}" cy="${f(y - cr * 0.25)}" r="${f(cr * 0.8)}" fill="none" stroke="#ff9a8a" stroke-opacity=".25" stroke-width=".7"/>`;
  }).join("");
  const bats = [
    [236, 34, 5],
    [252, 24, 3.6],
    [212, 50, 3],
  ]
    .map(([x, y, s]) => `<path d="M${x - s},${y} Q${x - s * 0.5},${y - s * 0.6} ${x - s * 0.2},${y - s * 0.1} Q${x},${y - s * 0.4} ${x + s * 0.2},${y - s * 0.1} Q${x + s * 0.5},${y - s * 0.6} ${x + s},${y} Q${x + s * 0.4},${y - s * 0.15} ${x},${y + s * 0.25} Q${x - s * 0.4},${y - s * 0.15} ${x - s},${y}Z" fill="#0b0204"/>`)
    .join("");
  files["card-bloodmoon"] = scene(
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f0b16"/><stop offset=".55" stop-color="#1c050c"/><stop offset="1" stop-color="#080205"/></linearGradient>
<radialGradient id="halo"><stop offset=".35" stop-color="#ff4d4d" stop-opacity=".45"/><stop offset="1" stop-color="#ff4d4d" stop-opacity="0"/></radialGradient>
<radialGradient id="moon" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="#ffb09a"/><stop offset=".45" stop-color="#e0434a"/><stop offset="1" stop-color="#7a1018"/></radialGradient>
<clipPath id="mc"><circle cx="318" cy="64" r="44"/></clipPath></defs>
<rect width="400" height="160" fill="url(#sky)"/>` +
      stars(12, 50, [0, 0, 400, 90], 0.55, "#ffd6d0") +
      `<circle cx="318" cy="64" r="96" fill="url(#halo)"/><circle cx="318" cy="64" r="44" fill="url(#moon)"/><g clip-path="url(#mc)">${craters}</g>` +
      `<circle cx="318" cy="64" r="44" fill="none" stroke="#ffcfc0" stroke-opacity=".5" stroke-width="1"/>` +
      bats +
      `<path d="M150,160 L176,140 L204,146 L238,128 L262,132 L282,118 L330,120 L352,128 L378,122 L400,130 L400,160Z" fill="#14040a"/>` +
      `<path d="M0,160 L0,146 L40,150 L90,140 L130,152 L170,148 L200,160Z" fill="#14040a"/>` +
      `<path d="M210,160 L236,146 L262,150 L298,138 L340,144 L372,138 L400,146 L400,160Z" fill="#070103"/>` +
      wolf(304, 120, 40, "#070103") +
      `<path d="M238,128 L262,132 L282,118" fill="none" stroke="#ff6b6b" stroke-opacity=".25" stroke-width=".8"/>`,
  );
  files["card-bloodmoon-clouds"] = scene(
    `<defs>${blur("b", 2.4)}</defs><g filter="url(#b)" fill="#1a0409">` +
      `<ellipse cx="300" cy="80" rx="70" ry="5" opacity=".85"/><ellipse cx="340" cy="90" rx="48" ry="4" opacity=".7"/><ellipse cx="270" cy="52" rx="38" ry="3" opacity=".6"/><ellipse cx="120" cy="40" rx="60" ry="4" opacity=".5"/>` +
      `</g><g fill="none" stroke="#ff6b6b" stroke-opacity=".22" stroke-width=".6"><path d="M236,77 Q300,72 366,79"/><path d="M296,87 Q340,84 386,89"/></g>`,
  );
}

// --- pines: moonlit forest in three ridges, mist, eyes in the dark ---------
{
  files["card-pines"] = scene(
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a3a6e"/><stop offset=".7" stop-color="#121a36"/><stop offset="1" stop-color="#070a16"/></linearGradient>
<radialGradient id="halo"><stop offset=".2" stop-color="${INK}" stop-opacity=".5"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/></radialGradient>
<linearGradient id="mist" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c8d4ff" stop-opacity="0"/><stop offset=".5" stop-color="#c8d4ff" stop-opacity=".18"/><stop offset="1" stop-color="#c8d4ff" stop-opacity="0"/></linearGradient></defs>
<rect width="400" height="160" fill="url(#sky)"/>` +
      stars(21, 70, [0, 0, 400, 90], 0.6) +
      `<circle cx="326" cy="38" r="48" fill="url(#halo)"/><circle cx="326" cy="38" r="15" fill="${INK}"/><circle cx="321" cy="34" r="3" fill="#d8c9a0" opacity=".6"/><circle cx="331" cy="43" r="2" fill="#d8c9a0" opacity=".6"/>` +
      pineRow(1, -10, 410, 112, 22, 40, "#34426f", 11) +
      `<rect y="96" width="400" height="30" fill="url(#mist)"/>` +
      pineRow(2, -10, 410, 134, 30, 52, "#1c2442", 13) +
      `<rect y="120" width="400" height="26" fill="url(#mist)" opacity=".8"/>` +
      pineRow(3, 150, 420, 166, 52, 92, "#05070f", 17) +
      pineRow(4, -20, 120, 166, 40, 70, "#05070f", 18),
  );
  const eye = (x, y) => `<ellipse cx="${x}" cy="${y}" rx="1.9" ry="1.2" fill="#ffd54a"/><ellipse cx="${x + 6}" cy="${y}" rx="1.9" ry="1.2" fill="#ffd54a"/>`;
  files["card-pines-eyes"] = scene(`<defs>${glow("g", 1.4)}</defs><g filter="url(#g)">${eye(262, 144)}${eye(372, 136)}</g>`);
  {
    const r = rng(31);
    files["card-pines-fireflies"] = scene(
      `<defs>${glow("g", 1.6)}</defs><g filter="url(#g)" fill="#f6ff9a">` +
        Array.from({ length: 12 }, () => `<circle cx="${f(160 + r() * 240)}" cy="${f(96 + r() * 56)}" r="${f(0.8 + r() * 0.8)}" opacity="${f(0.5 + r() * 0.5)}"/>`).join("") +
        `</g>`,
    );
  }
}

// --- tarot: a sun and moon emblem with turning rays, ornate corners --------
{
  // Square box laid over the right of the card (see .pc-tarot::before/::after).
  const C = 50;
  const rays = Array.from({ length: 32 }, (_, i) => {
    const a = (i * 360) / 32;
    const long = i % 2 === 0;
    const r1 = 21;
    const r2 = long ? 46 : 36;
    const w = long ? 2.4 : 1.4;
    const rad = (d) => (d * Math.PI) / 180;
    const p = (r, d) => `${f(C + r * Math.sin(rad(d)))},${f(C - r * Math.cos(rad(d)))}`;
    return `<path d="M${p(r1, a - w)} L${p(r2, a)} L${p(r1, a + w)}Z"/>`;
  }).join("");
  files["card-tarot-rays"] = svg(100, 100, `<g fill="${INK}" opacity=".22">${rays}</g><circle cx="50" cy="50" r="47" fill="none" stroke="${INK}" stroke-opacity=".18" stroke-width=".5" stroke-dasharray="1 2"/>`);
  const face = `<circle cx="50" cy="50" r="18" fill="#17121f" stroke="${INK}" stroke-width="1.2"/><circle cx="50" cy="50" r="15" fill="none" stroke="${GOLD}" stroke-width=".6" stroke-dasharray="1.2 1.2"/>`;
  const crescent = `<path d="M44,38 A13,13 0 1 0 44,62 A10,10 0 1 1 44,38Z" fill="${INK}"/>`;
  const eye = `<path d="M50,44 Q57,50 50,56 Q43,50 50,44Z" fill="none" stroke="${GOLD}" stroke-width=".8"/><circle cx="51" cy="50" r="1.8" fill="${GOLD}"/>`;
  files["card-tarot-emblem"] = svg(
    100,
    100,
    `<defs>${glow("g", 1)}</defs>${face}<g filter="url(#g)">${crescent}${eye}</g>` +
      [
        [26, 22, 2.4],
        [76, 26, 1.8],
        [80, 74, 2.4],
        [22, 76, 1.6],
        [50, 14, 1.6],
        [50, 86, 1.6],
      ]
        .map(([x, y, s]) => sparkle(x, y, s, INK))
        .join(""),
  );
  // Corners: a quarter flourish drawn for the top-left, mirrored for the rest.
  const corner = (color, sw) =>
    `<g fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"><path d="M2,30 L2,2 L30,2"/><path d="M6,22 Q6,6 22,6"/><path d="M2,14 Q10,14 10,6 Q10,2 14,2"/><circle cx="12" cy="12" r="2.4" fill="${color}"/><path d="M16,16 Q22,12 26,14 M16,16 Q12,22 14,26"/></g>`;
  const mirror = (name, body) => {
    files[`${name}-tl`] = svg(32, 32, body);
    files[`${name}-tr`] = svg(32, 32, `<g transform="translate(32 0) scale(-1 1)">${body}</g>`);
    files[`${name}-bl`] = svg(32, 32, `<g transform="translate(0 32) scale(1 -1)">${body}</g>`);
    files[`${name}-br`] = svg(32, 32, `<g transform="translate(32 32) scale(-1 -1)">${body}</g>`);
  };
  mirror("card-tarot-corner", corner(INK, 1.1));
  // Gold card corners: heavier filigree with a gem.
  mirror(
    "card-gold-corner",
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="${GOLD}"/><stop offset="1" stop-color="#8a5e14"/></linearGradient></defs>` +
      `<g fill="none" stroke="url(#g)" stroke-linecap="round"><path d="M2,31 L2,2 L31,2" stroke-width="2"/><path d="M6,26 Q6,6 26,6" stroke-width="1.1"/><path d="M2,18 Q12,18 12,8 Q12,2 18,2" stroke-width="1.3"/><path d="M14,14 Q22,10 28,13 Q24,15 22,12 M14,14 Q10,22 13,28 Q15,24 12,22" stroke-width="1"/></g>` +
      `<circle cx="9" cy="9" r="3.2" fill="#3a2404"/><circle cx="9" cy="9" r="2.4" fill="#c8323b"/><circle cx="8.2" cy="8.2" r=".8" fill="#fff" opacity=".8"/>`,
  );
}

// --- gold: damask pattern and a sweeping glint (corners above) -------------
files["card-gold-damask"] = svg(
  40,
  40,
  `<g fill="none" stroke="${GOLD}" stroke-opacity=".13" stroke-width=".8"><path d="M20,4 Q28,12 20,20 Q12,12 20,4Z"/><path d="M20,20 Q28,28 20,36 Q12,28 20,20Z"/><path d="M4,20 Q12,12 20,20 Q12,28 4,20Z"/><path d="M20,20 Q28,12 36,20 Q28,28 20,20Z"/><circle cx="20" cy="20" r="2"/><circle cx="0" cy="0" r="3"/><circle cx="40" cy="0" r="3"/><circle cx="0" cy="40" r="3"/><circle cx="40" cy="40" r="3"/></g>`,
);

// --- mist: a graveyard in fog under a pale moon ----------------------------
{
  const stone = (x, y, w, h, fill) => `<path d="M${x},${y} L${x},${y - h + w / 2} A${w / 2},${w / 2} 0 0 1 ${x + w},${y - h + w / 2} L${x + w},${y}Z" fill="${fill}"/>`;
  const cross = (x, y, h, fill) => `<path d="M${x - 1.4},${y} L${x - 1.4},${y - h * 0.62} L${x - 5},${y - h * 0.62} L${x - 5},${y - h * 0.78} L${x - 1.4},${y - h * 0.78} L${x - 1.4},${y - h} L${x + 1.4},${y - h} L${x + 1.4},${y - h * 0.78} L${x + 5},${y - h * 0.78} L${x + 5},${y - h * 0.62} L${x + 1.4},${y - h * 0.62} L${x + 1.4},${y}Z" fill="${fill}"/>`;
  // A bare tree: trunk and forked branches.
  const tree =
    `<g fill="none" stroke="#0a0812" stroke-linecap="round">` +
    `<path d="M352,160 C350,130 356,110 348,86" stroke-width="7"/>` +
    `<path d="M349,100 C336,88 326,86 312,70" stroke-width="3.4"/><path d="M326,84 C320,74 322,66 316,56" stroke-width="2"/>` +
    `<path d="M349,92 C360,80 372,76 384,60" stroke-width="3"/><path d="M372,74 C380,72 390,74 398,68" stroke-width="1.8"/>` +
    `<path d="M348,86 C346,70 352,60 346,44" stroke-width="2.4"/><path d="M347,56 C338,50 334,44 330,36" stroke-width="1.4"/>` +
    `<path d="M312,70 C306,68 300,62 296,56" stroke-width="1.4"/><path d="M384,60 C388,52 386,46 390,40" stroke-width="1.2"/></g>`;
  files["card-mist"] = scene(
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2e2a48"/><stop offset=".7" stop-color="#181528"/><stop offset="1" stop-color="#0c0a14"/></linearGradient>
<radialGradient id="halo"><stop offset=".25" stop-color="#e8e4ff" stop-opacity=".35"/><stop offset="1" stop-color="#e8e4ff" stop-opacity="0"/></radialGradient></defs>
<rect width="400" height="160" fill="url(#sky)"/>` +
      stars(41, 30, [0, 0, 400, 70], 0.5, "#d8d4f0") +
      `<circle cx="282" cy="40" r="44" fill="url(#halo)"/><circle cx="282" cy="40" r="13" fill="#e8e4ff" opacity=".85"/>` +
      `<path d="M0,160 L0,132 Q60,124 120,134 Q200,126 260,132 Q330,124 400,130 L400,160Z" fill="#14111f"/>` +
      `<g fill="none" stroke="#0a0812" stroke-width="1.2">${Array.from({ length: 14 }, (_, i) => `<path d="M${166 + i * 9},140 L${166 + i * 9},${124 + (i % 2) * 2} L${168 + i * 9},${120 + (i % 2) * 2}"/>`).join("")}<path d="M164,128 L292,126 M164,135 L292,133"/></g>` +
      stone(206, 146, 12, 20, "#0f0d18") +
      cross(240, 146, 26, "#0f0d18") +
      stone(262, 148, 14, 16, "#0f0d18") +
      cross(300, 150, 20, "#0a0812") +
      stone(318, 152, 16, 24, "#0a0812") +
      tree +
      `<path d="M0,160 L0,148 Q80,142 160,150 Q260,144 400,150 L400,160Z" fill="#07060c"/>`,
  );
  const fog = (seed, y0, op) => {
    const r = rng(seed);
    return (
      `<defs>${blur("b", 5)}</defs><g filter="url(#b)" fill="#dcd8f0">` +
      Array.from({ length: 9 }, () => `<ellipse cx="${f(r() * 400)}" cy="${f(y0 + r() * 34)}" rx="${f(40 + r() * 60)}" ry="${f(5 + r() * 7)}" opacity="${f(op * (0.5 + r() * 0.5))}"/>`).join("") +
      `</g>`
    );
  };
  files["card-mist-fog-a"] = scene(fog(5, 118, 0.17));
  files["card-mist-fog-b"] = scene(fog(6, 128, 0.14));
}

// --- village (new): a sleeping village with lit windows and chimney smoke --
{
  const houses = [
    // x, width, wall height, roof height
    [176, 30, 22, 14],
    [212, 24, 18, 12],
    [292, 34, 26, 16],
    [334, 26, 20, 13],
    [366, 32, 24, 15],
  ];
  const base = 146;
  let body = "";
  let lights = "";
  const windows = [];
  for (const [x, w, h, rh] of houses) {
    body += `<path d="M${x},${base} L${x},${base - h} L${x + w / 2},${base - h - rh} L${x + w},${base - h} L${x + w},${base}Z" fill="#0b0d1a"/>`;
    body += `<path d="M${x - 2},${base - h + 1} L${x + w / 2},${base - h - rh - 1} L${x + w + 2},${base - h + 1}" fill="none" stroke="#2a3050" stroke-width="1.2"/>`;
    body += `<rect x="${x + w * 0.68}" y="${base - h - rh * 0.9}" width="3.4" height="${f(rh * 0.6)}" fill="#0b0d1a"/>`;
    windows.push([x + w * 0.22, base - h * 0.62], [x + w * 0.6, base - h * 0.62]);
  }
  // Church with a steeple.
  body +=
    `<path d="M246,${base} L246,${base - 34} L258,${base - 44} L270,${base - 34} L270,${base}Z" fill="#0b0d1a"/>` +
    `<path d="M252,${base - 44} L258,${base - 72} L264,${base - 44}Z" fill="#0b0d1a"/><path d="M258,${base - 80} L258,${base - 70} M255,${base - 76} L261,${base - 76}" stroke="#0b0d1a" stroke-width="1.4"/>` +
    `<path d="M254,${base} L254,${base - 14} A4,4 0 0 1 262,${base - 14} L262,${base}Z" fill="#1c1a10"/>`;
  windows.push([255.5, base - 26]);
  for (const [x, y] of windows) {
    body += `<rect x="${f(x)}" y="${f(y)}" width="5" height="6" fill="#1c1a10"/>`;
    lights += `<rect x="${f(x)}" y="${f(y)}" width="5" height="6" fill="#ffc35a"/><path d="M${f(x + 2.5)},${f(y)} L${f(x + 2.5)},${f(y + 6)} M${f(x)},${f(y + 3)} L${f(x + 5)},${f(y + 3)}" stroke="#5a3a10" stroke-width=".6"/>`;
  }
  files["card-village"] = scene(
    `<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2552"/><stop offset=".7" stop-color="#0f1430"/><stop offset="1" stop-color="#080a18"/></linearGradient>
<radialGradient id="halo"><stop offset=".2" stop-color="${INK}" stop-opacity=".45"/><stop offset="1" stop-color="${INK}" stop-opacity="0"/></radialGradient></defs>
<rect width="400" height="160" fill="url(#sky)"/>` +
      stars(51, 80, [0, 0, 400, 100], 0.6) +
      `<circle cx="214" cy="40" r="50" fill="url(#halo)"/><circle cx="214" cy="40" r="17" fill="${INK}"/><circle cx="208" cy="36" r="3.4" fill="#d8c9a0" opacity=".6"/><circle cx="219" cy="46" r="2.4" fill="#d8c9a0" opacity=".6"/>` +
      `<path d="M120,160 Q200,126 280,134 Q340,128 400,136 L400,160Z" fill="#141a34"/>` +
      pineRow(8, 120, 180, 146, 24, 40, "#0b0d1a", 9) +
      body +
      `<path d="M0,160 L0,150 Q120,140 240,148 Q320,142 400,148 L400,160Z" fill="#05060d"/>`,
  );
  files["card-village-lights"] = scene(`<defs>${glow("g", 2)}</defs><g filter="url(#g)">${lights}</g>`);
  const smoke = houses
    .filter((_, i) => i % 2 === 0)
    .map(([x, w, h, rh]) => {
      const cx = x + w * 0.68 + 1.7;
      const cy = base - h - rh * 0.95;
      return [0, 1, 2].map((k) => `<circle cx="${f(cx + k * 3)}" cy="${f(cy - 5 - k * 7)}" r="${f(2.4 + k * 1.4)}" opacity="${f(0.4 - k * 0.1)}"/>`).join("");
    })
    .join("");
  files["card-village-smoke"] = scene(`<defs>${blur("b", 1.6)}</defs><g fill="#b8c0e0" filter="url(#b)">${smoke}</g>`);
}

// ===================================================================== chat

{
  const r = rng(61);
  files["chat-stars"] = svg(
    54,
    28,
    Array.from({ length: 7 }, () => `<circle cx="${f(r() * 54)}" cy="${f(r() * 28)}" r="${f(0.35 + r() * 0.55)}" fill="#fff" opacity="${f(0.45 + r() * 0.5)}"/>`).join("") + sparkle(40, 8, 2.2, "#fff", `opacity=".85"`),
  );
  files["chat-stars-twinkle"] = svg(54, 28, sparkle(12, 20, 2.4, "#fff") + sparkle(30, 6, 1.6, "#fff") + `<circle cx="48" cy="22" r=".9" fill="#fff"/>`);
}
files["chat-sparkle"] = svg(16, 16, `<defs>${glow("g", 0.9)}</defs><g filter="url(#g)">${sparkle(8, 8, 6, "#fff")}${sparkle(8, 8, 2.6, "#fffbe0")}</g>`);
files["chat-moon"] = svg(
  28,
  28,
  `<defs>${glow("g", 1.4)}<radialGradient id="m" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#fffbe8"/><stop offset="1" stop-color="#e8d9a0"/></radialGradient><mask id="c"><rect width="28" height="28" fill="#fff"/><circle cx="10" cy="11" r="8" fill="#000"/></mask></defs>` +
    `<g filter="url(#g)"><circle cx="15" cy="14" r="9" fill="url(#m)" mask="url(#c)"/></g><g mask="url(#c)" fill="#cbb978" opacity=".7"><circle cx="20" cy="12" r="1.2"/><circle cx="19" cy="18" r=".8"/></g>` +
    sparkle(5, 22, 2, "#fff") +
    `<circle cx="24" cy="4" r=".8" fill="#fff"/>`,
);
// Blood: a dripping edge for the top of the bubble and a drop that falls off.
files["chat-blood-edge"] = svg(
  42,
  12,
  `<defs><linearGradient id="d" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5c060b"/><stop offset="1" stop-color="#c8161e"/></linearGradient></defs>` +
    `<path d="M0,0 H42 V2.6 Q37,3.4 35,3 L35,6 A1.6,1.6 0 0 1 31.8,6 L31.8,3.2 Q26,4 20,3.4 L20,9 A2,2 0 0 1 16,9 L16,3.2 Q10,3.8 7,3.2 L7,5 A1.4,1.4 0 0 1 4.2,5 L4.2,3 Q1.6,3 0,2.6Z" fill="url(#d)"/>` +
    `<ellipse cx="17.3" cy="8.4" rx=".45" ry="1" fill="#ff9a9c" opacity=".8"/><path d="M0,1 H42" stroke="#ff6b6e" stroke-opacity=".5" stroke-width=".5"/>`,
);
files["chat-blood-drop"] = svg(8, 12, `<path d="M4,1 C6.6,5 7,7.4 7,8.4 A3,3 0 0 1 1,8.4 C1,7.4 1.4,5 4,1Z" fill="#c8161e" stroke="#3a0306" stroke-width=".6"/><ellipse cx="3" cy="8" rx=".6" ry="1" fill="#ff9a9c" opacity=".8"/>`);
// Frost: icicles under the bubble, rime in the corners.
files["chat-frost-icicles"] = svg(
  30,
  9,
  `<defs><linearGradient id="i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4fdff"/><stop offset="1" stop-color="#8fd3f4" stop-opacity=".6"/></linearGradient></defs>` +
    `<path d="M0,0 H30 V1.2 L27,1.4 L25.5,6 L24,1.4 L19,1.6 L17.4,8.6 L15.8,1.6 L11,1.4 L9.8,4.4 L8.6,1.4 L4,1.4 L2.8,6.4 L1.6,1.2 L0,1.2Z" fill="url(#i)"/><path d="M17.4,2 L17.4,7" stroke="#fff" stroke-width=".4"/>`,
);
files["chat-frost-rime"] = svg(
  20,
  20,
  `<g stroke="#f4fdff" stroke-linecap="round" fill="none" opacity=".9"><path d="M1,1 L12,12" stroke-width="1"/><path d="M4,4 L4,0.5 M4,4 L0.5,4 M7.5,7.5 L7.5,3 M7.5,7.5 L3,7.5 M10.5,10.5 L10.5,7.5 M10.5,10.5 L7.5,10.5" stroke-width=".7"/><path d="M1,1 L18,3 M1,1 L3,18" stroke-width=".5" opacity=".6"/></g>`,
);
// Ember: sparks that rise and a row of flame tongues along the bottom.
{
  const r = rng(71);
  files["chat-ember-sparks"] = svg(
    44,
    44,
    `<defs>${glow("g", 0.8)}</defs><g filter="url(#g)">` +
      Array.from({ length: 6 }, () => `<circle cx="${f(r() * 44)}" cy="${f(r() * 44)}" r="${f(0.5 + r() * 0.8)}" fill="${r() > 0.5 ? "#ffd166" : "#ff7a1a"}"/>`).join("") +
      `</g>`,
  );
}
files["chat-ember-flames"] = svg(
  24,
  9,
  `<defs><linearGradient id="fl" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff5a00" stop-opacity=".95"/><stop offset=".6" stop-color="#ffb020" stop-opacity=".7"/><stop offset="1" stop-color="#ffe08a" stop-opacity="0"/></linearGradient></defs>` +
    `<path d="M0,9 Q2,5 3,7 Q4,1 7,5 Q9,7 9,4 Q11,0 13,6 Q15,3 16,5 Q18,1 20,6 Q22,4 24,7 L24,9Z" fill="url(#fl)"/>`,
);
// Gold: filigree corners (mirrored) for the bubble.
{
  const body =
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".5" stop-color="${GOLD}"/><stop offset="1" stop-color="#8a5e14"/></linearGradient></defs>` +
    `<g fill="none" stroke="url(#g)" stroke-linecap="round"><path d="M1.2,13 L1.2,1.2 L13,1.2" stroke-width="1.4"/><path d="M1.2,8 Q6,8 6,3.4 Q6,1.2 8.4,1.2" stroke-width=".9"/></g><circle cx="4.4" cy="4.4" r="1.6" fill="url(#g)"/>`;
  files["chat-gold-tl"] = svg(14, 14, body);
  files["chat-gold-tr"] = svg(14, 14, `<g transform="translate(14 0) scale(-1 1)">${body}</g>`);
  files["chat-gold-bl"] = svg(14, 14, `<g transform="translate(0 14) scale(1 -1)">${body}</g>`);
  files["chat-gold-br"] = svg(14, 14, `<g transform="translate(14 14) scale(-1 -1)">${body}</g>`);
}
// Paws (new): a trail of wolf prints, and claw marks on the right edge.
{
  const paw = (x, y, rot, s = 1) =>
    `<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})" fill="#fff"><ellipse cx="0" cy="2.2" rx="2.6" ry="2.2"/><ellipse cx="-2.8" cy="-1.4" rx="1" ry="1.3"/><ellipse cx="-1" cy="-3" rx="1" ry="1.3"/><ellipse cx="1" cy="-3" rx="1" ry="1.3"/><ellipse cx="2.8" cy="-1.4" rx="1" ry="1.3"/></g>`;
  files["chat-paws"] = svg(60, 30, `<g opacity=".16">${paw(10, 21, 75)}${paw(26, 11, 95)}${paw(42, 22, 80)}${paw(56, 9, 100, 0.9)}</g>`);
  files["chat-claws"] = svg(
    14,
    22,
    `<g fill="none" stroke-linecap="round"><path d="M3,2 Q6,11 4,20" stroke="#1a0204" stroke-width="2.2"/><path d="M7,1 Q10,10 8,21" stroke="#1a0204" stroke-width="2.2"/><path d="M11,3 Q13.4,11 11.4,19" stroke="#1a0204" stroke-width="2"/>` +
      `<path d="M3,2 Q6,11 4,20" stroke="#ff8f92" stroke-width=".7"/><path d="M7,1 Q10,10 8,21" stroke="#ff8f92" stroke-width=".7"/><path d="M11,3 Q13.4,11 11.4,19" stroke="#ff8f92" stroke-width=".6"/></g>`,
  );
}

mkdirSync(OUT, { recursive: true });
for (const [name, body] of Object.entries(files)) writeFileSync(join(OUT, `${name}.svg`), body);
console.log(`wrote ${Object.keys(files).length} files to ${OUT}`);
