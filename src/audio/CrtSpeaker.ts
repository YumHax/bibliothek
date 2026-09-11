import type { Updatable } from '@/core/Engine';
import { audioContext } from './audioContext';

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
 * anchored to the set.
 */
export class CrtSpeaker implements Updatable {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private crackle: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private crackleLevel = 0;
  private running = false;
  private loudness = 0;

  /** Powers the speaker up (with its thump) or lets the bed fade out. */
  setOn(on: boolean): void {
    if (on === this.running) return;
    this.running = on;
    if (on) {
      const ctx = this.build();
      this.playPowerOnThump(ctx);
    }
    this.follow();
  }

  /** 0..1, the same loudness as the video so the bed comes from the same speaker. */
  setLoudness(loudness: number): void {
    this.loudness = Math.min(1, Math.max(0, loudness));
    this.follow();
  }

  update(dt: number): void {
    if (!this.running || !this.crackle || !this.ctx) return;
    if (Math.random() < dt * CRACKLE.perSecond) this.crackleLevel = CRACKLE.level * (0.3 + 0.7 * Math.random());
    this.crackleLevel *= Math.exp(-CRACKLE.decayPerSecond * dt);
    this.crackle.gain.setTargetAtTime(this.crackleLevel, this.ctx.currentTime, 0.004);
  }

  private follow(): void {
    if (!this.ctx || !this.master) return;
    const target = this.running ? this.loudness * BED_LEVEL : 0;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, this.running ? FOLLOW : 0.25);
  }

  /** Builds the graph once; the bed runs forever and is only ever faded by `master`. */
  private build(): AudioContext {
    if (this.ctx && this.master) return this.ctx;
    const ctx = audioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    // A small speaker in a plastic cabinet: no bass, no sparkle.
    const cabinet = ctx.createBiquadFilter();
    cabinet.type = 'highpass';
    cabinet.frequency.value = 90;
    const cone = ctx.createBiquadFilter();
    cone.type = 'lowpass';
    cone.frequency.value = 9000;
    this.master.connect(cabinet).connect(cone).connect(ctx.destination);

    for (const [frequency, level] of HUM_PARTIALS) this.tone(ctx, frequency, level).connect(this.master);
    this.tone(ctx, LINE_WHISTLE.frequency, LINE_WHISTLE.level).connect(this.master);

    this.noise = this.noiseBuffer(ctx);
    const hiss = ctx.createBiquadFilter();
    hiss.type = 'bandpass';
    hiss.frequency.value = HISS.frequency;
    hiss.Q.value = HISS.q;
    const hissGain = ctx.createGain();
    hissGain.gain.value = HISS.level;
    this.noiseSource(ctx).connect(hiss).connect(hissGain).connect(this.master);

    this.crackle = ctx.createGain();
    this.crackle.gain.value = 0;
    const crackleTone = ctx.createBiquadFilter();
    crackleTone.type = 'highpass';
    crackleTone.frequency.value = 1500;
    this.noiseSource(ctx).connect(crackleTone).connect(this.crackle).connect(this.master);
    return ctx;
  }

  private tone(ctx: AudioContext, frequency: number, level: number): GainNode {
    const osc = ctx.createOscillator();
    osc.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.value = level;
    osc.connect(gain);
    osc.start();
    return gain;
  }

  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  private noiseSource(ctx: AudioContext): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    source.start();
    return source;
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
    thump.connect(thumpGain).connect(ctx.destination);
    thump.start(now);
    thump.stop(now + 0.5);

    const click = this.noiseSource(ctx);
    const clickTone = ctx.createBiquadFilter();
    clickTone.type = 'bandpass';
    clickTone.frequency.value = 2500;
    clickTone.Q.value = 1.2;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.12 * Math.max(0.25, this.loudness), now);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    click.connect(clickTone).connect(clickGain).connect(ctx.destination);
    click.stop(now + 0.06);
  }
}
