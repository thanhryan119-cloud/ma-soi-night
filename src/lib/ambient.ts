"use client";

// Optional background ambience for the Host screen, synthesised with WebAudio
// (no audio files needed). Night: a deep dissonant drone, a glassy whisper of
// high tones, cold wind, and wolves howling far away in a big reverb — now and
// then one wolf answers another. Day: the same world, quieter and less dark,
// with only the odd distant howl. Phase changes ring a low, ominous bell.

type Mood = "night" | "day";

export class Ambient {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private wet: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private glassGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private sources: (OscillatorNode | AudioBufferSourceNode)[] = [];
  private howlTimer: ReturnType<typeof setTimeout> | null = null;
  mood: Mood = "day";

  start(mood: Mood) {
    if (this.ctx) return this.setMood(mood);
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.mood = mood;

    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // A big, dark hall reverb so everything sounds far away.
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(4.5, 2.6);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.9;
    this.reverb.connect(this.wet).connect(this.master);

    // Drone: low D with a tritone and a minor second rubbing against it.
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = "lowpass";
    this.droneFilter.frequency.value = 260;
    this.droneFilter.Q.value = 4;
    this.droneFilter.connect(this.master);
    this.droneFilter.connect(this.reverb);
    for (const [freq, type, gain] of [
      [36.7, "sawtooth", 0.06],
      [36.9, "sawtooth", 0.05],
      [51.9, "triangle", 0.05],
      [77.8, "sine", 0.035],
      [73.4, "sine", 0.03],
    ] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = gain;
      o.connect(g).connect(this.droneFilter);
      o.start();
      this.sources.push(o);
    }
    // Slow "breathing" of the drone filter.
    this.lfo(0.05, 120, this.droneFilter.frequency);

    // Glass: faint high cluster with a slow tremolo, mostly reverb.
    this.glassGain = ctx.createGain();
    this.glassGain.gain.value = 0;
    this.glassGain.connect(this.reverb);
    for (const f of [1174.7, 1244.5, 1661.2]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.012;
      this.lfo(0.11 + Math.random() * 0.1, 0.012, g.gain);
      o.connect(g).connect(this.glassGain);
      o.start();
      this.sources.push(o);
    }

    // Wind: two bands of filtered noise, gusting.
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    this.windGain.connect(this.master);
    this.windGain.connect(this.reverb);
    for (const [center, q, rate] of [[350, 0.7, 0.07], [900, 1.4, 0.13]] as const) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noise(3);
      noise.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = center;
      bp.Q.value = q;
      this.lfo(rate, center * 0.6, bp.frequency);
      noise.connect(bp).connect(this.windGain);
      noise.start();
      this.sources.push(noise);
    }

    this.setMood(mood);
    this.scheduleHowl(4000);
  }

  setMood(mood: Mood) {
    this.mood = mood;
    if (!this.ctx || !this.master || !this.droneFilter || !this.glassGain || !this.windGain) return;
    const now = this.ctx.currentTime;
    const night = mood === "night";
    for (const [param, value] of [
      [this.master.gain, night ? 0.75 : 0.35],
      [this.droneFilter.frequency, night ? 220 : 520],
      [this.glassGain.gain, night ? 1 : 0.35],
      [this.windGain.gain, night ? 0.07 : 0.03],
    ] as const) {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.linearRampToValueAtTime(value, now + 3);
    }
  }

  /** A low, slightly out-of-tune bell on phase changes. */
  chime() {
    if (!this.ctx || !this.master || !this.reverb) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    for (const [f, gain] of [[110, 0.22], [261.6, 0.08], [311.1, 0.06], [440.9, 0.04]] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(gain, now + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 4);
      o.connect(g);
      g.connect(this.master);
      g.connect(this.reverb);
      o.start(now);
      o.stop(now + 4.1);
    }
  }

  stop() {
    if (this.howlTimer) clearTimeout(this.howlTimer);
    this.howlTimer = null;
    this.sources.forEach((s) => {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    });
    this.ctx?.close();
    this.ctx = null;
    this.master = null;
    this.reverb = null;
    this.wet = null;
    this.droneFilter = null;
    this.glassGain = null;
    this.windGain = null;
    this.sources = [];
  }

  // ---------------------------------------------------------------------------

  /** Wolves somewhere out there: often at night, rarely by day. */
  private scheduleHowl(delay: number) {
    this.howlTimer = setTimeout(() => {
      if (!this.ctx) return;
      const night = this.mood === "night";
      if (night || Math.random() < 0.35) {
        const pan = Math.random() * 1.6 - 0.8;
        this.howl(pan, night ? 1 : 0.55, 0);
        // Sometimes another wolf answers from elsewhere.
        if (Math.random() < (night ? 0.55 : 0.2)) this.howl(-pan * 0.8, night ? 0.75 : 0.4, 1.4 + Math.random() * 2);
      }
      this.scheduleHowl(night ? 11000 + Math.random() * 16000 : 30000 + Math.random() * 40000);
    }, delay);
  }

  /** One synthesised wolf howl, far away: rising, a wavering hold, then a long fall. */
  private howl(pan: number, level: number, after: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.reverb) return;
    const t = ctx.currentTime + after;
    const base = 330 + Math.random() * 110;
    const peak = base * (1.55 + Math.random() * 0.2);
    const hold = 1.4 + Math.random() * 1.4;
    const end = t + 0.7 + hold + 1.6;

    const voice = ctx.createGain();
    voice.gain.setValueAtTime(0, t);
    voice.gain.linearRampToValueAtTime(0.09 * level, t + 0.6);
    voice.gain.setValueAtTime(0.09 * level, t + 0.7 + hold);
    voice.gain.linearRampToValueAtTime(0, end);

    // Throat: a buzzy source through two vowel formants, plus a pure tone on top.
    const formants = [
      [800, 7],
      [1250, 9],
    ] as const;
    const tones: OscillatorNode[] = [];
    for (const [type, gain] of [["sawtooth", 0.35], ["sine", 1]] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(peak, t + 0.7);
      o.frequency.setValueAtTime(peak, t + 0.7 + hold);
      o.frequency.exponentialRampToValueAtTime(base * 0.8, end);
      const g = ctx.createGain();
      g.gain.value = gain;
      if (type === "sawtooth") {
        for (const [f, q] of formants) {
          const bp = ctx.createBiquadFilter();
          bp.type = "bandpass";
          bp.frequency.value = f;
          bp.Q.value = q;
          o.connect(bp).connect(g);
        }
      } else o.connect(g);
      g.connect(voice);
      tones.push(o);
    }
    // Vibrato that grows during the hold.
    const vib = ctx.createOscillator();
    vib.frequency.value = 4.5 + Math.random() * 1.5;
    const vibDepth = ctx.createGain();
    vibDepth.gain.setValueAtTime(0, t);
    vibDepth.gain.linearRampToValueAtTime(peak * 0.02, t + 0.7 + hold);
    vib.connect(vibDepth);
    tones.forEach((o) => vibDepth.connect(o.frequency));

    // Distance: muffled, panned, mostly reverb.
    const far = ctx.createBiquadFilter();
    far.type = "lowpass";
    far.frequency.value = 1700;
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    const dry = ctx.createGain();
    dry.gain.value = 0.18;
    voice.connect(far).connect(panner);
    panner.connect(dry).connect(this.master);
    panner.connect(this.reverb);

    for (const o of [...tones, vib]) {
      o.start(t);
      o.stop(end + 0.1);
    }
  }

  private lfo(rate: number, depth: number, target: AudioParam) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.value = rate;
    const g = ctx.createGain();
    g.gain.value = depth;
    o.connect(g).connect(target);
    o.start();
    this.sources.push(o);
  }

  private noise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  /** Stereo impulse response: decaying noise, darker as it fades. */
  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const env = Math.pow(1 - i / len, decay);
        last = last * 0.6 + (Math.random() * 2 - 1) * 0.4; // gentle low-pass
        d[i] = last * env;
      }
    }
    return buf;
  }
}
