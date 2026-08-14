import type { EmoteKind } from "../control/commands";

/**
 * BB-8's film voice is a liquid, warbly synth "droid speak": soft sine
 * whistles with fast portamento slides, question-like rising tails,
 * trills when excited, and watery "plink" drops. Each phrase is built
 * from randomized syllables so it never sounds exactly the same twice.
 */
interface Syllable {
  f0: number;
  f1: number;
  dur: number;
  /** Vibrato depth as a ratio of pitch (trill feel). */
  vib?: number;
  vibRate?: number;
  /** Relative loudness 0..1. */
  vol?: number;
  /** Water-drop shape: fast pitch fall with a plucky envelope. */
  drop?: boolean;
  /** Pause after the syllable, seconds. */
  gap?: number;
  /** Carrier waveform; BB-8 speaks in sines, DuDu in reedy triangles. */
  wave?: OscillatorType;
}

export type VoiceId = "bb8" | "dudu";

function phraseChirp(): Syllable[] {
  const base = 880 + Math.random() * 260;
  const sylls: Syllable[] = [
    { f0: base, f1: base * 1.55, dur: 0.1, vib: 0.015 },
    { f0: base * 1.4, f1: base * 1.05, dur: 0.08 },
  ];
  if (Math.random() < 0.45) {
    sylls.push({ f0: 1500, f1: 430, dur: 0.09, drop: true, vol: 0.8 });
  }
  return sylls;
}

function phraseCurious(): Syllable[] {
  const base = 540 + Math.random() * 140;
  return [
    { f0: base * 1.2, f1: base, dur: 0.14, vib: 0.012, gap: 0.03 },
    // Rising tail reads as a question, like the film droid.
    { f0: base * 1.05, f1: base * 2.2, dur: 0.22, vib: 0.03, vibRate: 24 },
  ];
}

function phraseExcited(): Syllable[] {
  const count = 5 + Math.floor(Math.random() * 3);
  const sylls: Syllable[] = [];
  for (let i = 0; i < count; i += 1) {
    const f = 950 + Math.random() * 900;
    sylls.push({
      f0: f,
      f1: f * (0.85 + Math.random() * 0.55),
      dur: 0.05 + Math.random() * 0.035,
      vib: 0.045,
      vibRate: 30,
      vol: 0.85,
      gap: 0.012,
    });
  }
  sylls.push({ f0: 1700, f1: 480, dur: 0.12, drop: true });
  return sylls;
}

function phraseYes(): Syllable[] {
  // Two rising affirmative blips, like an eager "uh-huh".
  const base = 850 + Math.random() * 150;
  return [
    { f0: base, f1: base * 1.4, dur: 0.08, gap: 0.05 },
    { f0: base * 1.1, f1: base * 1.65, dur: 0.1 },
  ];
}

function phraseNo(): Syllable[] {
  // Two falling "wah-wah" tones, disappointed refusal.
  const base = 660 + Math.random() * 90;
  return [
    { f0: base, f1: base * 0.78, dur: 0.13, vib: 0.02, gap: 0.05 },
    { f0: base * 0.85, f1: base * 0.58, dur: 0.18, vib: 0.025 },
  ];
}

function phraseScared(): Syllable[] {
  // Sharp upward shriek, then a tumbling drop.
  return [
    { f0: 620, f1: 2000, dur: 0.12, vol: 1 },
    { f0: 1700, f1: 380, dur: 0.16, drop: true, vol: 0.9 },
  ];
}

/**
 * DuDu's voice: reedy triangle-wave squeaks, nervous stutters, and long
 * wobbly question tails. Deliberately nothing like BB-8's liquid whistles.
 */
function duduChirp(): Syllable[] {
  // Nervous stutter: three little meeps on a slightly falling pitch.
  const f = 1250 + Math.random() * 200;
  return [0, 1, 2].map((i) => ({
    f0: f * (1 - i * 0.05),
    f1: f * (1 - i * 0.05) * 0.92,
    dur: 0.055,
    wave: "triangle" as OscillatorType,
    vib: 0.05,
    vibRate: 34,
    gap: 0.045,
    vol: 0.9,
  }));
}

function duduCurious(): Syllable[] {
  // A hesitant grace note, then a long wobbly rising "wheee?".
  const f = 900 + Math.random() * 150;
  return [
    { f0: f, f1: f * 1.06, dur: 0.09, wave: "triangle", gap: 0.06 },
    { f0: f * 1.1, f1: f * 1.95, dur: 0.3, wave: "triangle", vib: 0.06, vibRate: 17 },
  ];
}

function duduExcited(): Syllable[] {
  // Rapid two-pitch giggle, like a happy dial-up modem.
  const base = 1300 + Math.random() * 250;
  const sylls: Syllable[] = [];
  for (let i = 0; i < 8; i += 1) {
    const hi = i % 2 === 0;
    sylls.push({
      f0: base * (hi ? 1.25 : 0.95),
      f1: base * (hi ? 1.15 : 0.9),
      dur: 0.04,
      wave: "triangle",
      gap: 0.02,
      vol: 0.85,
    });
  }
  return sylls;
}

function duduYes(): Syllable[] {
  // Timid low "mm" then a bright upward "kay!".
  const f = 1000 + Math.random() * 150;
  return [
    { f0: f * 0.8, f1: f * 0.82, dur: 0.07, wave: "triangle", gap: 0.05 },
    { f0: f, f1: f * 1.5, dur: 0.12, wave: "triangle" },
  ];
}

function duduNo(): Syllable[] {
  // Two droopy wobbling moans.
  const f = 620 + Math.random() * 60;
  return [
    { f0: f, f1: f * 0.72, dur: 0.16, wave: "triangle", vib: 0.05, vibRate: 12, gap: 0.06 },
    { f0: f * 0.8, f1: f * 0.55, dur: 0.22, wave: "triangle", vib: 0.05, vibRate: 12 },
  ];
}

function duduScared(): Syllable[] {
  // Sharp squeal up, then a quivering tumble down.
  return [
    { f0: 900, f1: 2400, dur: 0.09, wave: "triangle", vol: 1 },
    { f0: 2200, f1: 700, dur: 0.2, wave: "triangle", vib: 0.12, vibRate: 26, vol: 0.9 },
  ];
}

const PHRASES: Record<VoiceId, Record<EmoteKind, () => Syllable[]>> = {
  bb8: {
    chirp: phraseChirp,
    excited: phraseExcited,
    curious: phraseCurious,
    yes: phraseYes,
    no: phraseNo,
    scared: phraseScared,
  },
  dudu: {
    chirp: duduChirp,
    excited: duduExcited,
    curious: duduCurious,
    yes: duduYes,
    no: duduNo,
    scared: duduScared,
  },
};

export class Chirps {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private rollGain: GainNode | null = null;
  private rollFilter: BiquadFilterNode | null = null;
  private lastPlay = 0;

  unlock(): void {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === "suspended") {
      void ctx.resume();
    }
  }

  play(kind: EmoteKind, gain = 0.09, pitchScale = 1, voice: VoiceId = "bb8"): void {
    const now = performance.now();
    if (now - this.lastPlay < 220) {
      return;
    }
    this.lastPlay = now;

    const ctx = this.ensureContext();
    if (!ctx || !this.master) {
      return;
    }
    if (ctx.state === "suspended") {
      void ctx.resume();
    }

    // Sine whistles are much quieter than the old square beeps.
    const peak = gain * 2.4;
    let t = ctx.currentTime + 0.01;
    for (const syllable of PHRASES[voice][kind]()) {
      syllable.f0 *= pitchScale;
      syllable.f1 *= pitchScale;
      t = this.syllable(ctx, this.master, syllable, t, peak);
    }
  }

  /** Low rolling rumble while the ball moves; call every frame with speed. */
  updateRoll(speed: number): void {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || !this.master) {
      return;
    }
    if (!this.rollGain || !this.rollFilter) {
      const noise = ctx.createBufferSource();
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
      noise.buffer = buffer;
      noise.loop = true;

      this.rollFilter = ctx.createBiquadFilter();
      this.rollFilter.type = "lowpass";
      this.rollFilter.frequency.value = 220;
      this.rollFilter.Q.value = 0.6;

      this.rollGain = ctx.createGain();
      this.rollGain.gain.value = 0;

      noise.connect(this.rollFilter);
      this.rollFilter.connect(this.rollGain);
      this.rollGain.connect(this.master);
      noise.start();
    }
    const level = Math.min(1, speed / 3.6);
    const now = ctx.currentTime;
    this.rollGain.gain.setTargetAtTime(level * 0.045, now, 0.12);
    this.rollFilter.frequency.setTargetAtTime(180 + level * 620, now, 0.15);
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) {
      return this.ctx;
    }
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) {
      return null;
    }
    this.ctx = new Ctor();

    const compressor = this.ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 6;
    compressor.connect(this.ctx.destination);

    this.master = this.ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(compressor);
    return this.ctx;
  }

  /** Renders one syllable, returns the start time for the next one. */
  private syllable(
    ctx: AudioContext,
    dest: AudioNode,
    s: Syllable,
    start: number,
    peak: number,
  ): number {
    const end = start + s.dur;
    const volume = Math.max(0.0002, peak * (s.vol ?? 1));

    const osc = ctx.createOscillator();
    osc.type = s.wave ?? "sine";
    osc.frequency.setValueAtTime(s.f0, start);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(80, s.f1),
      s.drop ? start + s.dur * 0.8 : end,
    );

    // Quiet octave-up partial gives the whistle its airy shimmer.
    const shimmer = ctx.createOscillator();
    shimmer.type = "sine";
    shimmer.frequency.setValueAtTime(s.f0 * 2, start);
    shimmer.frequency.exponentialRampToValueAtTime(Math.max(160, s.f1 * 2), end);
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.16;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 2.6;
    const mid = Math.sqrt(s.f0 * s.f1);
    filter.frequency.setValueAtTime(s.f0 * 1.2, start);
    filter.frequency.exponentialRampToValueAtTime(mid * 1.2, end);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    if (s.drop) {
      // Plucky water-drop: instant attack, fast ring-down.
      env.gain.exponentialRampToValueAtTime(volume, start + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, end);
    } else {
      env.gain.exponentialRampToValueAtTime(volume, start + 0.014);
      env.gain.setValueAtTime(volume, Math.max(start + 0.014, end - 0.04));
      env.gain.exponentialRampToValueAtTime(0.0001, end);
    }

    let lfo: OscillatorNode | null = null;
    if (s.vib && !s.drop) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = s.vibRate ?? 18;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = s.f0 * s.vib;
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      lfo.start(start);
      lfo.stop(end + 0.02);
    }

    osc.connect(filter);
    shimmer.connect(shimmerGain);
    shimmerGain.connect(filter);
    filter.connect(env);
    env.connect(dest);

    osc.start(start);
    osc.stop(end + 0.02);
    shimmer.start(start);
    shimmer.stop(end + 0.02);

    return end + (s.gap ?? s.dur * 0.22);
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
