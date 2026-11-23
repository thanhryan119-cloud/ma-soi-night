// Each bot gets a personality for the whole game, so the table feels like real
// people: some talk a lot and some barely speak, some are hot-headed or joke
// around, and each writes in its own way (proper sentences, casual, or teen
// slang with the odd typo). The personality also sets how fast the bot types.

import type { Locale, Room } from "./types";

export type Rnd = () => number;

export interface Persona {
  /** 0..1: how much the bot talks (lines per day, how quickly it jumps in). */
  talk: number;
  /** How it writes. */
  style: "proper" | "casual" | "teen";
  /** How it reacts. */
  temper: "calm" | "hot" | "joker";
  /** Chance of one typo in a line. */
  typo: number;
  /** Typing speed, characters per second. */
  cps: number;
}

/** Stable 0..1 number from a string (so a bot's traits don't change mid-game). */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export function personaOf(room: Pick<Room, "code" | "createdAt">, botId: string): Persona {
  const k = (trait: string) => hash01(`${room.code}:${room.createdAt}:${botId}:${trait}`);
  const s = k("style");
  const t = k("temper");
  return {
    talk: 0.2 + k("talk") * 0.8,
    style: s < 0.3 ? "proper" : s < 0.7 ? "casual" : "teen",
    temper: t < 0.5 ? "calm" : t < 0.8 ? "hot" : "joker",
    typo: s < 0.3 ? 0.02 : s < 0.7 ? 0.08 : 0.18,
    cps: 3.2 + k("speed") * 3.6,
  };
}

/** Lines a bot says in one discussion: quiet ones 1, chatty ones up to 5. */
export const linesPerDay = (p: Persona) => 1 + Math.round(p.talk * 4);

/**
 * How long the bot "types" a line (ms): a moment to think, then the text at its
 * own speed. Real time, not sped up by the room's bot speed.
 */
export function typingMs(text: string, p: Persona, rnd: Rnd = Math.random): number {
  const think = 700 + rnd() * 1600;
  return Math.round(Math.min(14_000, Math.max(1_400, think + (text.length / p.cps) * 1000)));
}

// Vietnamese chat shortcuts. Words used to read claims and accusations
// ("mình", "là", "sói", "tiên tri", "vote", "treo") are left alone on purpose.
/** A whole word, Vietnamese letters included (`\b` only knows ASCII). */
const word = (w: string) => new RegExp(String.raw`(?<![\p{L}\p{N}])${w}(?![\p{L}\p{N}])`, "giu");
const VI_TEEN: [RegExp, string][] = [
  [word("không"), "ko"],
  [word("được"), "đc"],
  [word("gì"), "j"],
  [word("vậy"), "v"],
  [word("thôi"), "thui"],
  [word("biết"), "bít"],
  [word("quá"), "wá"],
  [word("nhé"), "nha"],
  [word("chứ"), "chớ"],
  [word("rồi"), "r"],
];
const EN_TEEN: [RegExp, string][] = [
  [/\byou\b/gi, "u"],
  [/\bare\b/gi, "r"],
  [/\bbecause\b/gi, "cuz"],
  [/\bplease\b/gi, "pls"],
  [/\bdon't\b/gi, "dont"],
  [/\bI'm\b/g, "im"],
];

/** Words other bots read for claims and accusations: never mistyped. */
const KEEP = new Set(["mình", "tiên", "sói", "treo", "vote", "nghi", "phải", "không", "soi", "dân", "làng", "bảo", "thủy", "săn", "seer", "wolf", "werewolf", "hang", "vouch", "trust"]);

/** Swaps two letters inside one word that isn't a player's name or a key word. */
function typo(text: string, names: string[], rnd: Rnd): string {
  const lower = names.map((n) => n.toLowerCase());
  const words = text.split(" ");
  const ok = words.map((w, i) => ({ w, i })).filter(({ w }) => w.length > 3 && /^\p{L}+$/u.test(w) && !KEEP.has(w.toLowerCase()) && !lower.some((n) => n.includes(w.toLowerCase())));
  if (!ok.length) return text;
  const { w, i } = ok[Math.floor(rnd() * ok.length)];
  const at = 1 + Math.floor(rnd() * (w.length - 2));
  words[i] = w.slice(0, at) + w[at + 1] + w[at] + w.slice(at + 2);
  return words.join(" ");
}

/**
 * Rewrites a line in the bot's own voice: casual ones drop the full stop and
 * capitals, teens use chat shortcuts, jokers laugh, hot heads shout, and now
 * and then a typo slips in. Player names are never changed, so other bots
 * still read who is being accused.
 */
export function voice(text: string, p: Persona, locale: Locale, names: string[], rnd: Rnd = Math.random): string {
  let s = text;
  if (p.style !== "proper") {
    s = s.replace(/[.]+$/, "");
    // Lower-case the first letter unless the line starts with a name.
    if (!names.some((n) => s.startsWith(n)) && rnd() < 0.7) s = s.charAt(0).toLocaleLowerCase(locale) + s.slice(1);
  }
  // A tail word ("á", "nha", "lol"), unless the line already ends with it ("đúng đó" + "đó").
  const tail = (t: string) => {
    if (!s.toLowerCase().replace(/[!?.,]+$/, "").endsWith(t.trim().toLowerCase())) s += t;
  };
  if (p.style === "teen") {
    for (const [re, to] of locale === "vi" ? VI_TEEN : EN_TEEN) if (rnd() < 0.8) s = s.replace(re, to);
    if (rnd() < 0.35) tail(locale === "vi" ? pickFrom(rnd, [" á", " nha", " =))", " :v", " luôn á"]) : pickFrom(rnd, [" lol", " tbh", " fr", " =))"]));
  } else if (p.style === "casual" && rnd() < 0.25) {
    tail(locale === "vi" ? pickFrom(rnd, [" nhé", " đó", " á", " thật"]) : pickFrom(rnd, [" honestly", " tho", " imo"]));
  }
  if (p.temper === "hot" && rnd() < 0.4) s = s.replace(/[!?.]*$/, (m) => (m.includes("?") ? "??" : "!!"));
  if (p.temper === "joker" && rnd() < 0.35 && !/(=\)\)|:\)\)|😂|🤣|:v)$/.test(s)) s += pickFrom(rnd, [" 😂", " =))", " :))", " 🤣"]);
  if (rnd() < p.typo) s = typo(s, names, rnd);
  return s;
}

/** Short reactions people throw in between real messages. */
export function filler(p: Persona, locale: Locale, rnd: Rnd = Math.random): string {
  const vi = p.style === "teen" ? ["ủa?", "hmm", "khoan đã", "ờ", "căng v", "=))", "thật hả"] : ["Hmm.", "Ừ.", "Khoan đã.", "Thật à?", "Căng nhỉ."];
  const en = p.style === "teen" ? ["wait what", "hmm", "ok", "lol", "fr?", "sus"] : ["Hmm.", "Okay.", "Wait.", "Really?", "Tough one."];
  return pickFrom(rnd, locale === "vi" ? vi : en);
}

export const pickFrom = <T,>(rnd: Rnd, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
