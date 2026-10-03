import { Voice } from '@/audio/ambient';

/** Loudness at full level, and the bed's share at a dead calm. */
const PEAK = 0.12;
const CALM = 0.25;

/**
 * The wind over the roofs: a broad whoosh of noise that swells and drops with the weather's wind,
 * whistling a little round the chimney pots in a gale. Generated, no samples. `wind` is read each tick.
 */
export class RoofWind extends Voice {
  private band: BiquadFilterNode | null = null;
  private gust: GainNode | null = null;

  constructor(private readonly wind: () => number) {
    super(PEAK);
  }

  protected build(ctx: AudioContext, out: GainNode): void {
    const source = this.loop(ctx, this.noise(ctx, 3));
    this.band = ctx.createBiquadFilter();
    this.band.type = 'bandpass';
    this.band.frequency.value = 500;
    this.band.Q.value = 0.7;
    this.gust = ctx.createGain();
    this.gust.gain.value = CALM;
    source.connect(this.band).connect(this.gust).connect(out);
  }

  protected tick(ctx: AudioContext): void {
    if (!this.band || !this.gust) return;
    const w = Math.max(0, Math.min(1, this.wind()));
    this.gust.gain.setTargetAtTime(CALM + (1 - CALM) * w, ctx.currentTime, 0.8);
    this.band.frequency.setTargetAtTime(380 + 900 * w, ctx.currentTime, 0.8);
  }
}
