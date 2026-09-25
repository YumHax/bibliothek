import { audioContext } from './audioContext';

/** Loudness of a downpour at level 1 (linear). */
const MASTER = 0.09;
/** The roar: noise through a broad band, the drumming on the roof light higher up. */
const ROAR = { frequency: 900, q: 0.6 };
const PATTER = { frequency: 3200, q: 1.2, level: 0.45 };
/** Drops: short clicks on the glass, this many a second at level 1. */
const DROPS_PER_SECOND = 14;
const SMOOTH = 1.5;

/**
 * Rain on a big roof, heard from inside a hall: a broad band of noise (the roar), a brighter one
 * (the patter on the roof light) and single drops ticking on the glass. Generated, no samples.
 * `setLevel` follows how hard it rains; `update` places the drops.
 */
export class RainOnRoof {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dropBus: GainNode | null = null;
  private sources: AudioBufferSourceNode[] = [];
  private level = 0;
  private nextDrop = 0;

  /** 0 dry .. 1 a downpour; eased. Builds the graph on the first non-zero level. */
  setLevel(level: number): void {
    this.level = Math.max(0, Math.min(1, level));
    if (this.level > 0) this.build();
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.level * MASTER, this.ctx.currentTime, SMOOTH);
  }

  update(dt: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.dropBus || this.level < 0.05) return;
    this.nextDrop -= dt;
    while (this.nextDrop <= 0) {
      this.nextDrop += (0.3 + Math.random() * 1.4) / (DROPS_PER_SECOND * this.level);
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = 1800 + Math.random() * 2600;
      const env = ctx.createGain();
      const t = ctx.currentTime + Math.random() * 0.05;
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.1 + Math.random() * 0.25, t + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0005, t + 0.04);
      osc.connect(env).connect(this.dropBus);
      osc.start(t);
      osc.stop(t + 0.06);
    }
  }

  /** Stops every source for good. */
  dispose(): void {
    for (const source of this.sources) source.stop();
    this.sources = [];
    this.master?.disconnect();
    this.master = null;
    this.dropBus = null;
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
    const noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    for (const { frequency, q, level } of [{ ...ROAR, level: 1 }, PATTER]) {
      const source = ctx.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      source.start(0, Math.random() * noise.duration);
      this.sources.push(source);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = frequency;
      band.Q.value = q;
      const gain = ctx.createGain();
      gain.gain.value = level;
      source.connect(band).connect(gain).connect(master);
    }
    const drops = ctx.createGain();
    drops.gain.value = 0.6;
    drops.connect(master);
    this.dropBus = drops;
  }
}
