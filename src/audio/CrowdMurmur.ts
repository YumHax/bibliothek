import { Voice } from './ambient';
import { whiteNoise } from './noise';

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

interface Talker {
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
 * generated. `setLevel` follows how many people are about (0 silent .. 1 a busy day; eased in and
 * out, set only when it changes); `update` drives the chatter.
 */
export class CrowdMurmur extends Voice {
  private talkers: Talker[] = [];

  constructor() {
    super(MASTER, { follow: SMOOTH, watch: false });
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    const noise = whiteNoise(ctx, 3);

    const bed = this.loop(ctx, noise);
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = BED.frequency;
    const bedGain = ctx.createGain();
    bedGain.gain.value = BED.level;
    bed.connect(low).connect(bedGain).connect(out);

    this.talkers = [];
    for (const { frequency, q } of VOICES) {
      const source = this.loop(ctx, noise);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = frequency * (0.9 + Math.random() * 0.2);
      band.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(band).connect(gain).connect(out);
      this.talkers.push({ gain, talking: false, phrase: Math.random() * 2, syllable: 0 });
    }
  }

  protected tick(ctx: AudioContext, dt: number): void {
    for (const talker of this.talkers) {
      talker.phrase -= dt;
      if (talker.phrase <= 0) {
        talker.talking = !talker.talking;
        talker.phrase = talker.talking ? 0.8 + Math.random() * 2.5 : 0.4 + Math.random() * 2.5 / Math.max(0.3, this.level);
        if (!talker.talking) talker.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      }
      if (!talker.talking) continue;
      talker.syllable -= dt;
      if (talker.syllable <= 0) {
        talker.syllable = 0.1 + Math.random() * 0.16;
        talker.gain.gain.setTargetAtTime(0.25 + Math.random() * 0.75, ctx.currentTime, 0.03);
      }
    }
  }
}
