import type { Updatable } from '@/core/Engine';
import { Voice } from './ambient';
import { audioBus, audioContext } from './audioContext';
import { whiteNoise } from './noise';

/** Level of the whole bed at full loudness (linear, relative to full scale). */
const BED_LEVEL = 0.45;
/** Mains buzz: 50 Hz mains through a tiny speaker is heard as its harmonics. */
const HUM_PARTIALS: [frequency: number, level: number][] = [
  [100, 0.038],
  [150, 0.008],
  [200, 0.016],
  [300, 0.006],
];
/** Horizontal deflection whistle of a PAL/NTSC tube. Faint; many listeners will not hear it. */
const LINE_WHISTLE = { frequency: 15625, level: 0.004 };
const HISS = { frequency: 3800, q: 0.6, level: 0.075 };
const CRACKLE = { perSecond: 1.8, level: 0.45, decayPerSecond: 40 };
/** Time constant (s) of the loudness following. */
const FOLLOW = 0.08;

/**
 * What an old television's speaker adds around the picture's sound: mains hum, a bed of hiss,
 * sporadic crackles, the scan whistle, and a soft thump when the set is switched on. The video
 * itself comes from a cross-origin iframe and cannot be filtered, so this bed is the only way
 * to make the TV sound like a TV; its loudness follows the video's proximity volume so it stays
 * anchored to the set. The bed is built while the set is on and heard, and let go (its
 * oscillators and noise stopped) once it has gone unheard a while (see `Voice`).
 */
export class CrtSpeaker extends Voice implements Updatable {
  private crackle: GainNode | null = null;
  private crackleLevel = 0;
  private running = false;
  private loudness = 0;

  constructor() {
    super(BED_LEVEL, { bus: 'screens', follow: FOLLOW, watch: false });
  }

  /** Powers the speaker up (with its thump) or lets the bed fade out. */
  setOn(on: boolean): void {
    if (on === this.running) return;
    this.running = on;
    if (on) this.playPowerOnThump(audioContext());
    this.follow = on ? FOLLOW : 0.25;
    this.setLevel(on ? this.loudness : 0);
  }

  /** 0..1, the same loudness as the video so the bed comes from the same speaker. */
  setLoudness(loudness: number): void {
    this.loudness = Math.min(1, Math.max(0, loudness));
    if (this.running) this.setLevel(this.loudness);
  }

  protected tick(ctx: AudioContext, dt: number): void {
    if (!this.crackle) return;
    if (Math.random() < dt * CRACKLE.perSecond) this.crackleLevel = CRACKLE.level * (0.3 + 0.7 * Math.random());
    this.crackleLevel *= Math.exp(-CRACKLE.decayPerSecond * dt);
    this.crackle.gain.setTargetAtTime(this.crackleLevel, ctx.currentTime, 0.004);
  }

  /** The bed, into `out` (the loudness): it runs until the voice is let go, only ever faded. */
  protected build(ctx: AudioContext, out: GainNode): void {
    // A small speaker in a plastic cabinet: no bass, no sparkle.
    const cabinet = ctx.createBiquadFilter();
    cabinet.type = 'highpass';
    cabinet.frequency.value = 90;
    const cone = ctx.createBiquadFilter();
    cone.type = 'lowpass';
    cone.frequency.value = 9000;
    cabinet.connect(cone).connect(out);

    for (const [frequency, level] of HUM_PARTIALS) this.tone(ctx, frequency, level).connect(cabinet);
    this.tone(ctx, LINE_WHISTLE.frequency, LINE_WHISTLE.level).connect(cabinet);

    const noise = whiteNoise(ctx, 2);
    const hiss = ctx.createBiquadFilter();
    hiss.type = 'bandpass';
    hiss.frequency.value = HISS.frequency;
    hiss.Q.value = HISS.q;
    const hissGain = ctx.createGain();
    hissGain.gain.value = HISS.level;
    this.loop(ctx, noise).connect(hiss).connect(hissGain).connect(cabinet);

    this.crackle = ctx.createGain();
    this.crackle.gain.value = 0;
    this.crackleLevel = 0;
    const crackleTone = ctx.createBiquadFilter();
    crackleTone.type = 'highpass';
    crackleTone.frequency.value = 1500;
    this.loop(ctx, noise).connect(crackleTone).connect(this.crackle).connect(cabinet);
  }

  private tone(ctx: AudioContext, frequency: number, level: number): GainNode {
    const osc = ctx.createOscillator();
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.value = level;
    osc.connect(gain);
    this.keep(osc);
    return gain;
  }

  /** The degaussing "thoom" and relay click of a tube coming to life. Bypasses the loudness so it is heard even from afar. */
  private playPowerOnThump(ctx: AudioContext): void {
    const now = ctx.currentTime;
    const thump = ctx.createOscillator();
    thump.frequency.setValueAtTime(70, now);
    thump.frequency.exponentialRampToValueAtTime(38, now + 0.35);
    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.35 * Math.max(0.25, this.loudness), now + 0.015);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    thump.connect(thumpGain).connect(audioBus(ctx, 'screens'));
    thump.start(now);
    thump.stop(now + 0.5);

    const click = ctx.createBufferSource();
    click.buffer = whiteNoise(ctx, 2);
    const clickTone = ctx.createBiquadFilter();
    clickTone.type = 'bandpass';
    clickTone.frequency.value = 2500;
    clickTone.Q.value = 1.2;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.12 * Math.max(0.25, this.loudness), now);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    click.connect(clickTone).connect(clickGain).connect(audioBus(ctx, 'screens'));
    click.start(now);
    click.stop(now + 0.06);
  }
}
