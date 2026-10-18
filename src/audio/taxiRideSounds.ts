import { brownNoise, whiteNoise } from './noise';
import { oneShot } from './oneShot';
import { noiseBurst, rand, tone } from './synth';

/*
 * THE TAXI RIDE'S SOUND (`ui/taxiRide`): a petrol engine under the bonnet, smoother and higher than the bus's diesel,
 * rising with the speed; the road's hiss; the indicator ticking as it pulls out and again as it pulls in; the meter's
 * click each time its figure goes up; the door shut at the end. On the foreground bus, like the bus ride's.
 */

/** The ride as the sound follows it. */
interface TaxiScore {
  seconds: number;
  speed(t: number): number;
  /** When the meter's figure goes up (s from the start). */
  ticks: readonly number[];
  /** When the indicator runs (pulling out, pulling in): start and end (s). */
  indicators: readonly (readonly [number, number])[];
  /** When the door shuts (s). */
  doorAt: number;
}

const ENGINE = { idle: 48, full: 96 } as const;
const LEVEL = 0.42;

/** What the caller holds: the ride's sound, faded out on a skip. */
export interface TaxiSound {
  stop(): void;
}

/** Plays the taxi ride's sound along `score`; null when there is no audio yet. */
export function playTaxiRide(score: TaxiScore): TaxiSound | null {
  const o = oneShot(LEVEL, score.seconds + 0.6, { channel: 'foreground' });
  if (!o) return null;
  const { ctx, out, t } = o;
  const end = t + score.seconds;

  // The engine: two sawtooth oscillators a hair apart (a four-cylinder's beat) under a lowpass, on the speed.
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 1.4;
  const engineGain = ctx.createGain();
  filter.connect(engineGain).connect(out);
  const engines = [1, 1.012].map((detune) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.connect(filter);
    osc.frequency.setValueAtTime(ENGINE.idle * detune, t);
    return { osc, detune };
  });
  // The road: brown noise, brighter at speed.
  const road = ctx.createBufferSource();
  road.buffer = brownNoise(ctx, 3);
  road.loop = true;
  const roadFilter = ctx.createBiquadFilter();
  roadFilter.type = 'lowpass';
  const roadGain = ctx.createGain();
  road.connect(roadFilter).connect(roadGain).connect(out);

  filter.frequency.setValueAtTime(220, t);
  engineGain.gain.setValueAtTime(0, t);
  roadFilter.frequency.setValueAtTime(180, t);
  roadGain.gain.setValueAtTime(0, t);
  for (let s = 0.1; s <= score.seconds; s += 0.1) {
    const v = score.speed(s);
    const at = t + s;
    // A change up halfway through pulling away: the pitch dips and climbs again.
    const gear = s > 1.3 && s < 1.6 ? 0.85 : 1;
    for (const { osc, detune } of engines) osc.frequency.linearRampToValueAtTime((ENGINE.idle + (ENGINE.full - ENGINE.idle) * Math.min(1, v * 1.15)) * detune * gear, at);
    filter.frequency.linearRampToValueAtTime(220 + 420 * v, at);
    engineGain.gain.linearRampToValueAtTime(0.16 + 0.14 * v, at);
    roadFilter.frequency.linearRampToValueAtTime(180 + 620 * v, at);
    roadGain.gain.linearRampToValueAtTime(0.04 + 0.4 * v, at);
  }
  engineGain.gain.linearRampToValueAtTime(0, end + 0.3);
  roadGain.gain.linearRampToValueAtTime(0, end + 0.3);
  for (const { osc } of engines) {
    osc.start(t);
    osc.stop(end + 0.4);
  }
  road.start(t, rand(0, 2));
  road.stop(end + 0.4);

  // The indicator: a dry tick and its tock, twice a second.
  for (const [from, to] of score.indicators) {
    for (let s = from; s < to; s += 0.5) {
      noiseBurst(ctx, out, t + s, { band: 2400, q: 6, level: 0.16, length: 0.012, noise: whiteNoise(ctx, 0.2) });
      noiseBurst(ctx, out, t + s + 0.25, { band: 1700, q: 6, level: 0.12, length: 0.012, noise: whiteNoise(ctx, 0.2) });
    }
  }
  // The meter going up: a small relay's click and the faintest beep.
  for (const s of score.ticks) {
    noiseBurst(ctx, out, t + s, { band: 3200, q: 4, level: 0.12, length: 0.01, noise: whiteNoise(ctx, 0.2) });
    tone(ctx, out, t + s + 0.005, { frequency: 2600, level: 0.035, length: 0.04, type: 'square' });
  }
  // The door at the end: the latch, then the thud of the panel.
  noiseBurst(ctx, out, t + score.doorAt, { band: 900, q: 1.5, level: 0.22, length: 0.05, noise: whiteNoise(ctx, 0.3) });
  noiseBurst(ctx, out, t + score.doorAt + 0.04, { band: 140, q: 1.2, level: 0.5, length: 0.18, noise: whiteNoise(ctx, 0.5) });

  return {
    stop: () => {
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + 0.25);
    },
  };
}
