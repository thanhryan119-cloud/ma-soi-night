"use client";

// Optional background ambience for the Host screen, synthesised with WebAudio
// (no audio files needed): a low drone + soft wind at night, warmer pad by day,
// and a bell chime on phase changes.

type Mood = "night" | "day";

export class Ambient {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private nodes: AudioNode[] = [];
  private oscs: OscillatorNode[] = [];
  private filter: BiquadFilterNode | null = null;
  mood: Mood = "day";

  start(mood: Mood) {
    if (this.ctx) return this.setMood(mood);
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    this.filter = ctx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 600;
    this.filter.connect(this.master);

    // Drone chord
    for (const [freq, detune] of [[55, 0], [82.4, 4], [110, -6], [164.8, 3]] as const) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = 0.05;
      o.connect(g).connect(this.filter);
      o.start();
      this.oscs.push(o);
      this.nodes.push(g);
    }
    // Wind: filtered noise with a slow LFO
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 400;
    bp.Q.value = 0.8;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.04;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 250;
    lfo.connect(lfoGain).connect(bp.frequency);
    noise.connect(bp).connect(windGain).connect(this.master);
    noise.start();
    lfo.start();
    this.nodes.push(noise, bp, windGain, lfo, lfoGain);
    this.setMood(mood);
  }

  setMood(mood: Mood) {
    this.mood = mood;
    if (!this.ctx || !this.master || !this.filter) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.linearRampToValueAtTime(mood === "night" ? 0.55 : 0.25, now + 2);
    this.filter.frequency.linearRampToValueAtTime(mood === "night" ? 380 : 1200, now + 2);
  }

  chime() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    for (const [f, delay] of [[880, 0], [1318.5, 0.12]] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now + delay);
      g.gain.linearRampToValueAtTime(0.25, now + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + delay + 1.6);
      o.connect(g).connect(ctx.destination);
      o.start(now + delay);
      o.stop(now + delay + 1.7);
    }
  }

  stop() {
    this.oscs.forEach((o) => o.stop());
    this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.filter = null;
    this.nodes = [];
    this.oscs = [];
  }
}
