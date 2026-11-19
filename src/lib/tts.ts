"use client";

// Host voice-over: reads the narration aloud with the browser's built-in
// speech synthesis (Web Speech API). No server or API key needed.

import { useEffect, useState } from "react";
import type { Locale } from "@shared/types";

export const ttsSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

/** Same as ttsSupported() but safe for server rendering (false until mounted). */
export function useTtsSupported() {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(ttsSupported()), []);
  return ok;
}

function pickVoice(locale: Locale): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const lang = locale === "vi" ? "vi" : "en";
  const matches = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
  // Prefer natural/online voices when available.
  return (
    matches.find((v) => /natural|online|google/i.test(v.name)) ??
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

export function speak(lines: string[], locale: Locale, rate = 0.95) {
  if (!ttsSupported()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const voice = pickVoice(locale);
  for (const line of lines) {
    // Skip stage directions in parentheses.
    const text = line.replace(/\([^)]*\)/g, "").replace(/…/g, ", ").trim();
    if (!text) continue;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = locale === "vi" ? "vi-VN" : "en-US";
    if (voice) u.voice = voice;
    u.rate = rate;
    u.pitch = 0.9;
    synth.speak(u);
  }
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}
