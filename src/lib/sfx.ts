"use client";

// Game sound effects, all synthesised with WebAudio (no audio files to load).
// One shared AudioContext, unlocked on the first tap (browsers keep audio
// silent until the page gets a user gesture). Players can mute it, and the
// choice is remembered on the device.

import { useSyncExternalStore } from "react";

export type SfxName =
  | "click"
  | "select"
  | "vote"
  | "voteOther"
  | "turn"
  | "reveal"
  | "night"
  | "dawn"
  | "death"
  | "safe"
  | "bell"
  | "gavel"
  | "drum"
  | "hang"
  | "spared"
  | "gunshot"
  | "tick"
  | "timeUp"
  | "win"
  | "lose"
  | "join"
  | "leave";

const KEY = "msn:sfx";
const listeners = new Set<() => void>();
let enabled: boolean | null = null;

function readEnabled(): boolean {
  if (enabled !== null) return enabled;
  try {
    enabled = localStorage.getItem(KEY) !== "0";
  } catch {
    enabled = true;
  }
  return enabled;
}

export function sfxEnabled() {
  return typeof window !== "undefined" && readEnabled();
}

export function setSfxEnabled(on: boolean) {
  enabled = on;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* private mode: remember for this page only */
  }
  listeners.forEach((l) => l());
  if (on) play("click");
}

/** React hook: whether effects are on, kept in sync across components. */
export function useSfxEnabled() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => readEnabled(),
    () => true,
  );
}

// ---------------------------------------------------------------------------
// Audio graph

let ctx: AudioContext | null = null;
let out: GainNode | null = null;
let room: ConvolverNode | null = null;
let noiseBuf: AudioBuffer | null = null;
const lastPlayed: Partial<Record<SfxName, number>> = {};

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  try {
    ctx = new Ctx();
  } catch {
    return null;
  }
  out = ctx.createGain();
  out.gain.value = 0.55;
  // Gentle limiter so stacked effects never clip.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 6;
  out.connect(comp).connect(ctx.destination);
  room = ctx.createConvolver();
  room.buffer = impulse(ctx, 2.2, 3);
  const wet = ctx.createGain();
  wet.gain.value = 0.35;
  room.connect(wet).connect(out);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

/** Call from a user gesture: creates/resumes the context so later sounds can play. */
export function unlockSfx() {
  const c = audio();
  if (c && c.state === "suspended") c.resume().catch(() => {});
}

// Sounds that come from what this one player does. At night they would tell
// the table whose phone is busy (the seer checking, the witch pouring, the
// wolves biting), so a player's phone keeps them silent until morning.
const PRIVATE = new Set<SfxName>(["click", "select", "vote", "turn", "reveal"]);
let quiet = false;

/** Silences the private sounds while a player's phone is in the night. */
export function setSfxQuiet(on: boolean) {
  quiet = on;
}

/** Plays one effect (does nothing when muted or before the page was ever tapped). */
export function play(name: SfxName, delay = 0) {
  if (!sfxEnabled()) return;
  if (quiet && PRIVATE.has(name)) return;
  const c = audio();
  if (!c || !out) return;
  if (c.state === "suspended") c.resume().catch(() => {});
  // Ignore bursts of the same sound (several state updates in a row).
  const at = performance.now() + delay * 1000;
  const gap = name === "click" || name === "voteOther" || name === "tick" ? 60 : 400;
  if (Math.abs(at - (lastPlayed[name] ?? -1e9)) < gap) return;
  lastPlayed[name] = at;
  try {
    SOUNDS[name](c, c.currentTime + 0.01 + delay);
  } catch (e) {
    // An old browser missing some node type: stay silent.
    if (process.env.NODE_ENV !== "production") console.warn(`sfx ${name} failed`, e);
  }
}

// ---------------------------------------------------------------------------
// Building blocks

type Wave = OscillatorType;

function env(c: AudioContext, t: number, peak: number, attack: number, decay: number, dest: AudioNode = out!) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(dest);
  return g;
}

function tone(
  c: AudioContext,
  t: number,
  freq: number,
  { type = "sine" as Wave, peak = 0.3, attack = 0.005, decay = 0.3, to, reverb = 0 }: { type?: Wave; peak?: number; attack?: number; decay?: number; to?: number; reverb?: number } = {},
) {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  const g = env(c, t, peak, attack, decay);
  if (reverb && room) {
    const r = c.createGain();
    r.gain.value = reverb;
    g.connect(r).connect(room);
  }
  o.connect(g);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
  return o;
}

function noise(
  c: AudioContext,
  t: number,
  { peak = 0.3, attack = 0.002, decay = 0.1, type = "bandpass" as BiquadFilterType, freq = 1000, q = 1, to, reverb = 0 }: { peak?: number; attack?: number; decay?: number; type?: BiquadFilterType; freq?: number; q?: number; to?: number; reverb?: number } = {},
) {
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (to) f.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
  f.Q.value = q;
  const g = env(c, t, peak, attack, decay);
  if (reverb && room) {
    const r = c.createGain();
    r.gain.value = reverb;
    g.connect(r).connect(room);
  }
  s.connect(f).connect(g);
  s.start(t, Math.random());
  s.stop(t + attack + decay + 0.05);
}

/** A struck bell: inharmonic partials with long tails. */
function bell(c: AudioContext, t: number, f: number, peak = 0.2, decay = 2.5) {
  for (const [ratio, gain] of [[1, 1], [2.01, 0.5], [2.76, 0.35], [5.4, 0.15]] as const)
    tone(c, t, f * ratio, { peak: peak * gain, attack: 0.003, decay: decay / ratio ** 0.5, reverb: 0.8 });
}

/** A wolf howl close by: rising, a wavering hold, then a long fall. */
function howl(c: AudioContext, t: number, base: number, level: number, pan: number, hold = 1.3) {
  const peakF = base * 1.6;
  const end = t + 0.6 + hold + 1.3;
  const voice = c.createGain();
  voice.gain.setValueAtTime(0.0001, t);
  voice.gain.linearRampToValueAtTime(level, t + 0.5);
  voice.gain.setValueAtTime(level, t + 0.6 + hold);
  voice.gain.linearRampToValueAtTime(0.0001, end);
  const panner = c.createStereoPanner();
  panner.pan.value = pan;
  const lp = c.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2600;
  voice.connect(lp).connect(panner);
  panner.connect(out!);
  if (room) panner.connect(room);

  const oscs: OscillatorNode[] = [];
  for (const [type, gain] of [["sawtooth", 0.25], ["sine", 1]] as const) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(base, t);
    o.frequency.exponentialRampToValueAtTime(peakF, t + 0.6);
    o.frequency.setValueAtTime(peakF, t + 0.6 + hold);
    o.frequency.exponentialRampToValueAtTime(base * 0.75, end);
    const g = c.createGain();
    g.gain.value = gain;
    if (type === "sawtooth") {
      for (const [ff, q] of [[800, 6], [1300, 8]] as const) {
        const bp = c.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = ff;
        bp.Q.value = q;
        o.connect(bp).connect(g);
      }
    } else o.connect(g);
    g.connect(voice);
    oscs.push(o);
  }
  const vib = c.createOscillator();
  vib.frequency.value = 5;
  const depth = c.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(peakF * 0.025, t + 0.6 + hold);
  vib.connect(depth);
  oscs.forEach((o) => depth.connect(o.frequency));
  for (const o of [...oscs, vib]) {
    o.start(t);
    o.stop(end + 0.1);
  }
}

/** A short human cry: a buzzy voice through vowel formants, pitch leaping then falling. */
function scream(c: AudioContext, t: number) {
  const dur = 1.1;
  const voice = c.createGain();
  voice.gain.setValueAtTime(0.0001, t);
  voice.gain.linearRampToValueAtTime(0.32, t + 0.06);
  voice.gain.setValueAtTime(0.3, t + 0.35);
  voice.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  voice.connect(out!);
  if (room) voice.connect(room);
  const o = c.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(520, t);
  o.frequency.exponentialRampToValueAtTime(880, t + 0.12);
  o.frequency.exponentialRampToValueAtTime(760, t + 0.4);
  o.frequency.exponentialRampToValueAtTime(300, t + dur);
  const vib = c.createOscillator();
  vib.frequency.value = 9;
  const depth = c.createGain();
  depth.gain.value = 22;
  vib.connect(depth).connect(o.frequency);
  // "Aaah": formants of an open vowel.
  for (const [f, q, g] of [[900, 6, 1], [1400, 8, 0.6], [2700, 10, 0.3]] as const) {
    const bp = c.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f;
    bp.Q.value = q;
    const gg = c.createGain();
    gg.gain.value = g;
    o.connect(bp).connect(gg).connect(voice);
  }
  noise(c, t, { peak: 0.06, decay: dur * 0.8, freq: 2500, q: 0.8 });
  for (const s of [o, vib]) {
    s.start(t);
    s.stop(t + dur + 0.05);
  }
}

/** A low hit: sine drop plus a thud of noise. */
function boom(c: AudioContext, t: number, peak = 0.6) {
  tone(c, t, 110, { peak, decay: 1.2, to: 32, reverb: 0.6 });
  noise(c, t, { peak: peak * 0.5, decay: 0.35, type: "lowpass", freq: 600, to: 80, reverb: 0.4 });
}

function knock(c: AudioContext, t: number, peak = 0.45) {
  tone(c, t, 260, { peak, decay: 0.09, to: 140, type: "triangle" });
  noise(c, t, { peak: peak * 0.5, decay: 0.05, freq: 1800, q: 2 });
}

function arp(c: AudioContext, t: number, freqs: number[], step: number, opts: Parameters<typeof tone>[3] = {}) {
  freqs.forEach((f, i) => tone(c, t + i * step, f, opts));
}

const N = (semis: number) => 440 * 2 ** (semis / 12); // semitones from A4

// ---------------------------------------------------------------------------
// The effects

const SOUNDS: Record<SfxName, (c: AudioContext, t: number) => void> = {
  click(c, t) {
    tone(c, t, 1400, { peak: 0.12, decay: 0.045, to: 700, type: "triangle" });
    noise(c, t, { peak: 0.05, decay: 0.02, freq: 4000, q: 1.5 });
  },
  select(c, t) {
    tone(c, t, 660, { peak: 0.16, decay: 0.08, type: "triangle" });
    tone(c, t + 0.06, 990, { peak: 0.14, decay: 0.14, type: "triangle" });
  },
  vote(c, t) {
    // A rubber stamp on paper.
    tone(c, t, 180, { peak: 0.55, decay: 0.18, to: 60 });
    noise(c, t, { peak: 0.35, decay: 0.08, type: "lowpass", freq: 2200 });
    noise(c, t + 0.01, { peak: 0.08, decay: 0.15, freq: 5000, q: 0.7 });
  },
  voteOther(c, t) {
    tone(c, t, 900 + Math.random() * 200, { peak: 0.1, decay: 0.06, to: 500, type: "triangle" });
  },
  turn(c, t) {
    tone(c, t, N(3), { peak: 0.2, decay: 0.5, reverb: 0.5 });
    tone(c, t + 0.14, N(10), { peak: 0.2, decay: 0.8, reverb: 0.5 });
  },
  reveal(c, t) {
    arp(c, t, [N(-9), N(-5), N(-2), N(3), N(7), N(10)], 0.07, { peak: 0.12, decay: 1.2, reverb: 0.9 });
    noise(c, t, { peak: 0.05, attack: 0.3, decay: 1, freq: 6000, q: 0.5, reverb: 0.8 });
  },
  night(c, t) {
    bell(c, t, 82, 0.25, 4);
    howl(c, t + 0.4, 360, 0.16, -0.3, 1.6);
    howl(c, t + 1.9, 300, 0.11, 0.5, 1.2);
  },
  dawn(c, t) {
    // Morning bell, then birds.
    bell(c, t, 392, 0.12, 2.5);
    for (let i = 0; i < 6; i++) {
      const s = t + 0.5 + i * 0.16 + Math.random() * 0.1;
      const f = 2600 + Math.random() * 1400;
      tone(c, s, f, { peak: 0.05, attack: 0.01, decay: 0.07, to: f * 1.35, reverb: 0.5 });
    }
  },
  death(c, t) {
    boom(c, t, 0.55);
    // A dissonant stab: minor second clash.
    for (const f of [N(-21), N(-20), N(-14)]) tone(c, t, f, { type: "sawtooth", peak: 0.07, attack: 0.01, decay: 1.6, reverb: 0.7 });
    scream(c, t + 0.15);
  },
  safe(c, t) {
    arp(c, t, [N(-9), N(-5), N(-2), N(3)], 0.1, { peak: 0.12, attack: 0.02, decay: 1.6, reverb: 0.8 });
  },
  bell(c, t) {
    bell(c, t, 523, 0.13, 2);
  },
  gavel(c, t) {
    knock(c, t, 0.5);
    knock(c, t + 0.22, 0.55);
  },
  drum(c, t) {
    for (let i = 0; i < 14; i++) noise(c, t + i * 0.055, { peak: 0.04 + i * 0.012, decay: 0.06, freq: 300, q: 1.2 });
    boom(c, t + 0.8, 0.4);
  },
  hang(c, t) {
    // Drum roll, the trapdoor, a rope creak and the crowd's gasp.
    SOUNDS.drum(c, t);
    knock(c, t + 0.95, 0.6);
    tone(c, t + 1.0, 70, { peak: 0.5, decay: 0.8, to: 40 });
    tone(c, t + 1.2, 420, { type: "sawtooth", peak: 0.03, attack: 0.1, decay: 0.6, to: 360 });
    noise(c, t + 1.05, { peak: 0.12, attack: 0.15, decay: 0.8, freq: 900, q: 0.6, reverb: 0.6 });
    for (const f of [N(-21), N(-18), N(-14)]) tone(c, t + 1, f, { type: "sawtooth", peak: 0.05, attack: 0.02, decay: 1.8, reverb: 0.7 });
  },
  spared(c, t) {
    arp(c, t, [N(-9), N(-5), N(-2), N(3), N(7)], 0.08, { type: "triangle", peak: 0.12, decay: 1, reverb: 0.6 });
  },
  gunshot(c, t) {
    noise(c, t, { peak: 0.9, attack: 0.001, decay: 0.25, type: "lowpass", freq: 6000, to: 300, reverb: 0.9 });
    tone(c, t, 150, { peak: 0.6, decay: 0.3, to: 40 });
  },
  tick(c, t) {
    tone(c, t, 2000, { peak: 0.12, decay: 0.03, type: "square" });
    noise(c, t, { peak: 0.08, decay: 0.02, freq: 3500, q: 3 });
  },
  timeUp(c, t) {
    bell(c, t, 659, 0.14, 1.8);
    bell(c, t + 0.25, 523, 0.14, 2.2);
  },
  win(c, t) {
    arp(c, t, [N(-9), N(-5), N(-2), N(3)], 0.12, { type: "triangle", peak: 0.16, decay: 0.5, reverb: 0.5 });
    for (const f of [N(3), N(7), N(10), N(15)]) tone(c, t + 0.5, f, { type: "triangle", peak: 0.1, attack: 0.02, decay: 2, reverb: 0.7 });
    bell(c, t + 0.5, N(15), 0.06, 2);
  },
  lose(c, t) {
    arp(c, t, [N(-2), N(-5), N(-6), N(-9)], 0.28, { type: "triangle", peak: 0.14, decay: 0.8, reverb: 0.6 });
    for (const f of [N(-21), N(-18), N(-14)]) tone(c, t + 1.1, f, { type: "sawtooth", peak: 0.04, attack: 0.1, decay: 2.2, reverb: 0.8 });
    howl(c, t + 1.2, 300, 0.1, 0.4, 1.2);
  },
  join(c, t) {
    tone(c, t, 520, { peak: 0.14, decay: 0.08, to: 1040, type: "triangle" });
    tone(c, t + 0.08, 1040, { peak: 0.1, decay: 0.15, type: "sine" });
  },
  leave(c, t) {
    tone(c, t, 700, { peak: 0.12, decay: 0.2, to: 300, type: "triangle" });
  },
};

function impulse(c: AudioContext, seconds: number, decay: number): AudioBuffer {
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = last * 0.55 + (Math.random() * 2 - 1) * 0.45;
      d[i] = last * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}
