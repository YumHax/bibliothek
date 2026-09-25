import { audioContext } from './audioContext';

/** Loudness of the whole murmur at level 1 (linear). */
const MASTER = 0.07;
/** Voices talking over each other: each a band of noise at a speech formant, gated into phrases and syllables. */
const VOICES = [
  { frequency: 420, q: 2.5 },
  { frequency: 560, q: 3 },
  { frequency: 700, q: 2.8 },
  { frequency: 880, q: 3.2 },
  { frequency: 1100, q: 3.5 },
  { frequency: 1350, q: 4 },
];
/** The room tone under them: shuffling, distant traffic of feet, lowpassed noise. */
const BED = { frequency: 320, level: 0.35 };
const SMOOTH = 0.6;

interface Voice {
  gain: GainNode;
  talking: boolean;
  /** Seconds left in the current phrase or pause. */
  phrase: number;
  /** Seconds left in the current syllable. */
  syllable: number;
}

/**
 * The hum of a market hall: a handful of unintelligible voices (noise through speech-band filters,
 * switched on in phrases and wobbled syllable by syllable) over a low bed. No samples, all
 * generated. `setLevel` follows how many people are about; `update` drives the chatter.
 */
export class CrowdMurmur {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private voices: Voice[] = [];
  private level = 0;

  /** 0 silent .. 1 a busy day; eased in and out. Builds the graph on the first non-zero level. */
  setLevel(level: number): void {
    this.level = Math.max(0, Math.min(1, level));
    if (this.level > 0) this.build();
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.level * MASTER, this.ctx.currentTime, SMOOTH);
  }

  update(dt: number): void {
    const ctx = this.ctx;
    if (!ctx || this.level === 0) return;
    for (const voice of this.voices) {
      voice.phrase -= dt;
      if (voice.phrase <= 0) {
        voice.talking = !voice.talking;
        voice.phrase = voice.talking ? 0.8 + Math.random() * 2.5 : 0.4 + Math.random() * 2.5 / Math.max(0.3, this.level);
        if (!voice.talking) voice.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      }
      if (!voice.talking) continue;
      voice.syllable -= dt;
      if (voice.syllable <= 0) {
        voice.syllable = 0.1 + Math.random() * 0.16;
        voice.gain.gain.setTargetAtTime(0.25 + Math.random() * 0.75, ctx.currentTime, 0.03);
      }
    }
  }

  /** Stops every source for good. */
  dispose(): void {
    for (const source of this.sources) source.stop();
    this.sources = [];
    this.master?.disconnect();
    this.master = null;
    this.voices = [];
    this.ctx = null;
  }

  private build(): void {
    if (this.ctx) return;
    const ctx = audioContext();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;
    const noise = noiseBuffer(ctx);

    const bed = this.loop(ctx, noise);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = BED.frequency;
    const bedGain = ctx.createGain();
    bedGain.gain.value = BED.level;
    bed.connect(low).connect(bedGain).connect(master);

    for (const { frequency, q } of VOICES) {
      const source = this.loop(ctx, noise);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = frequency * (0.9 + Math.random() * 0.2);
      band.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(band).connect(gain).connect(master);
      this.voices.push({ gain, talking: false, phrase: Math.random() * 2, syllable: 0 });
    }
  }

  /** A looping noise source started at a random point, so no two voices line up. */
  private loop(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.start(0, Math.random() * buffer.duration);
    this.sources.push(source);
    return source;
  }
}

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
