import { brownNoise, whiteNoise } from './noise';
import { oneShot } from './oneShot';
import { noiseBurst, partials, rand } from './synth';

/*
 * THE BUS RIDE'S SOUND (docs/story.md "Mémé", `ui/busRide`): the diesel under the floor rising with the speed, the
 * road's rumble, the windows rattling at the bumps, the stop bell when someone asks for the stop, the doors' hiss at
 * the end. On the foreground bus (the world's volume, past the duck the travel curtain pulls over the room).
 */

/** The ride as the sound follows it: its length, how fast at each moment (0..1), the bell and the doors (s from the start). */
interface RideScore {
  seconds: number;
  speed(t: number): number;
  bellAt: number;
  doorsAt: number;
}

/** The engine's idle and full pitch (Hz), the rumble's cutoff at a stand and at speed, the overall level. */
const ENGINE = { idle: 34, full: 62 } as const;
const RUMBLE = { still: 140, moving: 520 } as const;
const LEVEL = 0.5;

/** The stop bell: the "ding" every bus in town makes, a strike and its overtones. */
const BELL = [
  [1180, 1, 1.1],
  [2950, 0.35, 0.6],
  [4720, 0.12, 0.35],
] as const;

/** What the caller holds: the ride's sound, cut short on a skip. */
export interface RideSound {
  stop(): void;
}

/** Plays the ride's sound along `score`; null when there is no audio yet. */
export function playBusRide(score: RideScore): RideSound | null {
  const o = oneShot(LEVEL, score.seconds + 0.5, { channel: 'foreground' });
  if (!o) return null;
  const { ctx, out, t } = o;
  const end = t + score.seconds;
  const step = 0.1;

  // The diesel: a sawtooth low under a lowpass, its pitch and its loudness on the speed.
  const engine = ctx.createOscillator();
  engine.type = 'sawtooth';
  const engineFilter = ctx.createBiquadFilter();
  engineFilter.type = 'lowpass';
  engineFilter.Q.value = 2;
  const engineGain = ctx.createGain();
  engine.connect(engineFilter).connect(engineGain).connect(out);
  // The road under the tyres: brown noise, brighter and louder as it goes.
  const road = ctx.createBufferSource();
  road.buffer = brownNoise(ctx, 3);
  road.loop = true;
  const roadFilter = ctx.createBiquadFilter();
  roadFilter.type = 'lowpass';
  const roadGain = ctx.createGain();
  road.connect(roadFilter).connect(roadGain).connect(out);

  engine.frequency.setValueAtTime(ENGINE.idle, t);
  engineFilter.frequency.setValueAtTime(160, t);
  engineGain.gain.setValueAtTime(0, t);
  roadFilter.frequency.setValueAtTime(RUMBLE.still, t);
  roadGain.gain.setValueAtTime(0, t);
  for (let s = step; s <= score.seconds; s += step) {
    const v = score.speed(s);
    // A gear change about two seconds in: the pitch falls back and climbs again.
    const gear = s > 2 && s < 2.4 ? 0.82 : 1;
    const at = t + s;
    engine.frequency.linearRampToValueAtTime((ENGINE.idle + (ENGINE.full - ENGINE.idle) * Math.min(1, v * 1.2)) * gear, at);
    engineFilter.frequency.linearRampToValueAtTime(160 + 260 * v, at);
    engineGain.gain.linearRampToValueAtTime(0.22 + 0.2 * v, at);
    roadFilter.frequency.linearRampToValueAtTime(RUMBLE.still + (RUMBLE.moving - RUMBLE.still) * v, at);
    roadGain.gain.linearRampToValueAtTime(0.05 + 0.5 * v, at);
  }
  engineGain.gain.linearRampToValueAtTime(0, end + 0.3);
  roadGain.gain.linearRampToValueAtTime(0, end + 0.3);
  engine.start(t);
  road.start(t, rand(0, 2));
  engine.stop(end + 0.4);
  road.stop(end + 0.4);

  // The windows rattling over the bumps while it moves.
  for (let s = 0.8; s < score.seconds - 1; s += rand(0.6, 1.4)) {
    const v = score.speed(s);
    if (v < 0.3) continue;
    noiseBurst(ctx, out, t + s, { band: rand(2600, 3600), q: 5, level: 0.06 * v, length: 0.09, noise: whiteNoise(ctx, 0.3), offset: 'random' });
  }
  // Someone asks for the stop: the bell.
  partials(ctx, out, t + score.bellAt, BELL, { level: 0.22, length: 1, attack: 0.002, curve: 'exponential', floor: 0.0001 });
  // The doors at the stop: the air let out, then the leaves knocking open.
  noiseBurst(ctx, out, t + score.doorsAt, { band: 3200, filter: 'highpass', level: 0.18, length: 0.7, attack: 0.03, noise: whiteNoise(ctx, 1) });
  noiseBurst(ctx, out, t + score.doorsAt + 0.45, { band: 260, q: 2, level: 0.22, length: 0.12, noise: whiteNoise(ctx, 0.3) });

  return {
    stop: () => {
      const now = ctx.currentTime;
      out.gain.cancelScheduledValues(now);
      out.gain.setValueAtTime(out.gain.value, now);
      out.gain.linearRampToValueAtTime(0, now + 0.25);
    },
  };
}
