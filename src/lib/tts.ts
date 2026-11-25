"use client";

// Host voice-over: reads the narration aloud with the browser's built-in
// speech synthesis (Web Speech API). No server or API key needed.

import { useEffect, useState } from "react";
import type { Locale } from "@shared/types";

export const ttsSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

/**
 * Phones (iOS Safari above all) only let a page speak once a tap has started
 * speech. Call this inside a tap: it speaks a silent word, after which the
 * narration can be read aloud on its own.
 */
export function unlockTts() {
  if (!ttsSupported()) return;
  try {
    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
  } catch {}
}

/** Same as ttsSupported() but safe for server rendering (false until mounted). */
export function useTtsSupported() {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(ttsSupported()), []);
  return ok;
}

// Male voices we know of (Edge/Windows/Chrome/macOS). Female ones are skipped when a male one exists.
const MALE = /(male|nam ?minh|namminh|an|david|guy|mark|george|daniel|ryan|christopher|eric|brian|andrew|davis|tony|james|thomas|alex|fred|rishi|aaron|arthur)/i;
const FEMALE = /(female|hoai ?my|hoaimy|linh|zira|aria|jenny|samantha|susan|hazel|libby|sonia|michelle|emma|ava|karen|moira|tessa|victoria)/i;

function pickVoice(locale: Locale): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const lang = locale === "vi" ? "vi" : "en";
  const matches = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
  const natural = (v: SpeechSynthesisVoice) => /natural|online|neural/i.test(v.name);
  const male = (v: SpeechSynthesisVoice) => MALE.test(v.name) && !FEMALE.test(v.name);
  // Prefer a natural male voice, then any male voice, then a natural voice, then anything.
  return (
    matches.find((v) => male(v) && natural(v)) ??
    matches.find(male) ??
    matches.find(natural) ??
    matches.find((v) => v.localService) ??
    matches[0] ??
    null
  );
}

/** True when this device has a voice for the language. */
export function hasVoiceFor(locale: Locale): boolean {
  if (!ttsSupported()) return false;
  return !!pickVoice(locale);
}

/** Voices load asynchronously in some browsers. */
export function whenVoicesReady(): Promise<void> {
  if (!ttsSupported()) return Promise.resolve();
  if (window.speechSynthesis.getVoices().length) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1500);
  });
}

interface Phrase {
  text: string;
  /** Silence after this phrase, in ms. */
  pause: number;
  rate: number;
}

// Words worth dwelling on: the narrator slows down and lets them land.
const DRAMATIC = /(nhắm mắt|mở mắt|thức dậy|đi ngủ|chết|bị giết|treo cổ|sói|đêm|bình minh|close your eyes|open your eyes|wake up|sleep|died|killed|hang|wolves|werewolf|night|dawn)/i;

/** Splits narration into phrases at punctuation and gives each a pace and a pause, like a storyteller. */
function phrasing(lines: string[]): Phrase[] {
  const out: Phrase[] = [];
  let i = 0;
  for (const raw of lines) {
    // Skip stage directions in parentheses.
    const line = raw.replace(/\([^)]*\)/g, "").trim();
    if (!line) continue;
    const parts = line.match(/[^,.;:!?…—]+[,.;:!?…—]*/g) ?? [line];
    parts.forEach((part, j) => {
      const text = part.replace(/[—…]+$/, "").trim();
      if (!text) return;
      const end = part.trim().slice(-1);
      const lastOfLine = j === parts.length - 1;
      let pause = end === "," ? 260 : end === "…" || end === "—" ? 850 : /[.!?;:]/.test(end) ? 600 : 180;
      if (lastOfLine) pause += 350;
      // Gentle wave in tempo so it never sounds like a metronome.
      let rate = 0.9 + Math.sin(i * 1.7) * 0.06;
      if (DRAMATIC.test(text)) {
        rate -= 0.1;
        pause += 250;
      }
      if (text.split(/\s+/).length <= 3) rate -= 0.04;
      out.push({ text, pause, rate: Math.max(0.72, Math.min(1.02, rate)) });
      i++;
    });
  }
  return out;
}

let session = 0;
let heard = false;

/** True once this page has actually started speaking (the browser let it). */
export const ttsHeard = () => heard;

/**
 * Reads the narration in a deep, warm male voice: phrase by phrase, with the
 * tempo rising and falling and natural pauses at commas, full stops and
 * ellipses. A new call (or stopSpeaking) cuts off the previous one.
 */
export function speak(lines: string[], locale: Locale, rate = 1, onDone?: () => void) {
  if (!ttsSupported()) {
    onDone?.();
    return;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const my = ++session;
  const voice = pickVoice(locale);
  const deep = voice && MALE.test(voice.name) ? 0.82 : 0.68; // lower still if we only have a female voice
  const phrases = phrasing(lines);
  const next = (k: number) => {
    if (my !== session) return;
    if (k >= phrases.length) {
      onDone?.();
      return;
    }
    const p = phrases[k];
    const u = new SpeechSynthesisUtterance(p.text);
    u.lang = locale === "vi" ? "vi-VN" : "en-US";
    if (voice) u.voice = voice;
    u.rate = Math.min(2, p.rate * rate);
    u.pitch = deep + Math.sin(k * 2.3) * 0.04;
    u.volume = 1;
    let moved = false;
    const go = () => {
      if (moved) return;
      moved = true;
      setTimeout(() => next(k + 1), p.pause / Math.max(0.5, rate));
    };
    u.onstart = () => {
      heard = true;
    };
    u.onend = go;
    u.onerror = go;
    synth.speak(u);
  };
  next(0);
}

export function stopSpeaking() {
  session++;
  if (ttsSupported()) window.speechSynthesis.cancel();
}
