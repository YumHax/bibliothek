import type { Updatable } from '@/core/Engine';
import { audioBus, startedAudioContext } from '@/audio/audioContext';
import { CrowdMurmur } from '@/audio/CrowdMurmur';
import type { OccupancyAware } from '../Furniture';
import { Prop } from '../props/Prop';

/**
 * Murmur level while the player is in the hall (the market's is louder: this is a quieter crowd): silent with nobody
 * in, then up quickly with the first regulars (a square root), to `full` with all of them in.
 */
const MURMUR = { full: 0.5 };
/** The machines' power supplies and the neon ballasts: a low mains hum, linear level. */
const HUM: [frequency: number, level: number][] = [
  [100, 0.012],
  [200, 0.005],
  [300, 0.002],
];

/**
 * The sound of the hall under the machines' own: a few people talking over each other
 * (`CrowdMurmur`, kept low) and the hum of forty power supplies and a lot of neon. Runs only while
 * the player is in the arcade (`setOccupied`), and only once a gesture has started the page's
 * audio (it never starts it). The murmur follows how busy the hall is (`busy`, 0..1: the evening
 * crowd is louder than the morning's, an empty hall only hums). An empty `Prop`; place anywhere in the zone.
 */
export class ArcadeAmbience extends Prop implements Updatable, OccupancyAware {
  private readonly murmur = new CrowdMurmur();
  private hum: { gain: GainNode; oscillators: OscillatorNode[] } | null = null;
  private occupied = false;
  private level = -1;

  constructor(private readonly busy: () => number = () => 0.5) {
    super();
    this.name = 'ArcadeAmbience';
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.apply();
  }

  update(dt: number): void {
    if (this.occupied && !this.hum) this.apply();
    if (this.occupied && Math.abs(this.murmurLevel() - this.level) > 0.02) this.apply();
    this.murmur.update(dt);
  }

  private murmurLevel(): number {
    const busy = this.busy();
    return Number.isFinite(busy) ? MURMUR.full * Math.sqrt(Math.min(1, Math.max(0, busy))) : 0;
  }

  dispose(): void {
    this.murmur.dispose();
    if (this.hum) {
      for (const osc of this.hum.oscillators) osc.stop();
      this.hum.gain.disconnect();
      this.hum = null;
    }
  }

  private apply(): void {
    const ctx = startedAudioContext();
    if (!ctx) return;
    this.level = this.occupied ? this.murmurLevel() : 0;
    this.murmur.setLevel(this.level);
    if (!this.hum && this.occupied) {
      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(audioBus(ctx, 'arcade'));
      const oscillators = HUM.map(([frequency, level]) => {
        const osc = ctx.createOscillator();
        osc.frequency.value = frequency;
        const g = ctx.createGain();
        g.gain.value = level;
        osc.connect(g).connect(gain);
        osc.start();
        return osc;
      });
      this.hum = { gain, oscillators };
    }
    this.hum?.gain.gain.setTargetAtTime(this.occupied ? 1 : 0, ctx.currentTime, 0.4);
  }
}
