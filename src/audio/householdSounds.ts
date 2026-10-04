import { whiteNoise } from './noise';
import { burst, oneShot, ping, rand } from './oneShot';

/*
 * The one-shot sounds of the flat's household uses (docs/household.md): the hair dryer, the
 * cleaning kit, the cake (whisk, oven), the alarm clock's button, the wardrobe's hangers, the bath,
 * the treat jar, the cleaning kit taken off its shelf. Each is played by a click (so the context may start here), synthesised on the
 * spot and gone after; the player stands at the thing, so no distance model, only a level.
 */

/** The pastimes' own sounds (cleaning, the dryer, the cake, the bath) go on the UI bus: the room is ducked under their fade. */
const JOB = 'ui';

/** A steady band of noise swelling in and out over `seconds` (air, water). */
function bed(ctx: AudioContext, out: AudioNode, t: number, seconds: number, band: number, q: number, level: number, fade = 0.25): BiquadFilterNode {
  const source = ctx.createBufferSource();
  source.buffer = whiteNoise(ctx, 2);
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = band;
  filter.Q.value = q;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(level, t + fade);
  env.gain.setValueAtTime(level, t + Math.max(fade, seconds - fade));
  env.gain.linearRampToValueAtTime(0, t + seconds);
  source.connect(filter).connect(env).connect(out);
  source.start(t, Math.random());
  source.stop(t + seconds + 0.05);
  return filter;
}

/** The hair dryer: the motor spinning up to a whine under a rush of warm air, `seconds` long, and spinning down. */
export function playHairDryer(seconds = 2.4, level = 0.22): void {
  const o = oneShot(level, seconds + 0.6, JOB);
  if (!o) return;
  const { ctx, out, t } = o;
  const motor = ctx.createOscillator();
  motor.type = 'sawtooth';
  motor.frequency.setValueAtTime(90, t);
  motor.frequency.exponentialRampToValueAtTime(310, t + 0.35);
  motor.frequency.setValueAtTime(310, t + seconds - 0.1);
  motor.frequency.exponentialRampToValueAtTime(80, t + seconds + 0.5);
  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 1400;
  const hum = ctx.createGain();
  hum.gain.setValueAtTime(0, t);
  hum.gain.linearRampToValueAtTime(0.12, t + 0.2);
  hum.gain.setValueAtTime(0.12, t + seconds);
  hum.gain.linearRampToValueAtTime(0, t + seconds + 0.5);
  motor.connect(tone).connect(hum).connect(out);
  motor.start(t);
  motor.stop(t + seconds + 0.55);
  bed(ctx, out, t, seconds + 0.3, 1800, 0.5, 0.7, 0.3);
}

/** The cleaning kit at work: a soft cloth rubbing in strokes, a cotton bud squeaking in the corners, the isopropyl's cap. */
export function playCleaning(seconds = 2.6, level = 0.3): void {
  const o = oneShot(level, seconds, JOB);
  if (!o) return;
  const { ctx, out, t } = o;
  ping(ctx, out, t, 2300, 0.15, 0.03, 'square'); // the cap
  let at = t + 0.25;
  while (at < t + seconds * 0.6) {
    burst(ctx, out, at, rand(1800, 2600), 0.9, 0.5, rand(0.16, 0.24));
    at += rand(0.22, 0.3);
  }
  while (at < t + seconds) {
    // A cotton bud's squeak: a short rising chirp.
    const osc = ctx.createOscillator();
    const f = rand(2600, 3400);
    osc.frequency.setValueAtTime(f, at);
    osc.frequency.linearRampToValueAtTime(f * 1.15, at + 0.08);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.05, at + 0.01);
    env.gain.exponentialRampToValueAtTime(0.0005, at + 0.09);
    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + 0.1);
    burst(ctx, out, at, 3800, 2, 0.12, 0.07);
    at += rand(0.14, 0.24);
  }
}

/** A whisk beating in a mixing bowl: quick metal ticks against the side, a clink of the bowl now and then. */
export function playWhisk(seconds = 2.2, level = 0.28): void {
  const o = oneShot(level, seconds, JOB);
  if (!o) return;
  const { ctx, out, t } = o;
  for (let at = t; at < t + seconds; at += rand(0.09, 0.12)) {
    burst(ctx, out, at, rand(4500, 6000), 3, 0.35, 0.03);
    if (Math.random() < 0.12) {
      ping(ctx, out, at, 1850, 0.12, 0.35);
      ping(ctx, out, at, 2790, 0.05, 0.25);
    }
  }
}

/** The oven: its door let down, the tray slid in and the door shut (a thud); `ding` its timer instead. */
export function playOven(ding = false, level = 0.3): void {
  const o = oneShot(level, 2, JOB);
  if (!o) return;
  const { ctx, out, t } = o;
  if (ding) {
    ping(ctx, out, t, 1760, 0.4, 1.4);
    ping(ctx, out, t, 1760 * 2.76, 0.1, 0.5);
    return;
  }
  burst(ctx, out, t, 900, 1, 0.3, 0.18); // the hinge
  burst(ctx, out, t + 0.45, 3200, 1.5, 0.25, 0.25); // the tray on its runners
  const thud = ctx.createOscillator();
  thud.frequency.setValueAtTime(130, t + 0.9);
  thud.frequency.exponentialRampToValueAtTime(55, t + 1.0);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.7, t + 0.9);
  env.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
  thud.connect(env).connect(out);
  thud.start(t + 0.9);
  thud.stop(t + 1.15);
  ping(ctx, out, t + 0.9, 1300, 0.08, 0.2);
}

/** The alarm clock's button: a plastic click and the short beep it answers with. */
export function playAlarmButton(level = 0.1): void {
  const o = oneShot(level, 0.4);
  if (!o) return;
  const { ctx, out, t } = o;
  burst(ctx, out, t, 3000, 2, 0.6, 0.02);
  ping(ctx, out, t + 0.04, 2400, 0.5, 0.08, 'square');
}

/** The cleaning kit lifted off the cabinet's shelf: the little bottle's glass clink, the bag of cotton buds rustling. */
export function playKitTake(level = 0.2): void {
  const o = oneShot(level, 0.8);
  if (!o) return;
  const { ctx, out, t } = o;
  ping(ctx, out, t, 3300, 0.12, 0.18);
  ping(ctx, out, t + 0.06, 4850, 0.05, 0.12);
  for (let i = 0; i < 5; i++) burst(ctx, out, t + 0.1 + i * rand(0.05, 0.09), rand(4000, 7000), 1.2, rand(0.12, 0.25), rand(0.04, 0.08));
}

/** A paper booklet picked up (the manual the cat brought): a few dry rustles of its pages. */
export function playPaperRustle(level = 0.16): void {
  const o = oneShot(level, 0.6);
  if (!o) return;
  const { ctx, out, t } = o;
  for (let i = 0; i < 4; i++) burst(ctx, out, t + i * rand(0.05, 0.1), rand(2500, 5000), 0.9, rand(0.3, 0.6), rand(0.05, 0.1));
}

/** Hangers on the wardrobe's rail: a rattle of wire and wood as the clothes are pushed along. */
export function playHangers(level = 0.2): void {
  const o = oneShot(level, 1);
  if (!o) return;
  const { ctx, out, t } = o;
  burst(ctx, out, t, 2200, 0.8, 0.25, 0.4); // the slide
  for (let i = 0; i < 6; i++) {
    const at = t + rand(0, 0.5);
    const f = rand(2800, 5200);
    ping(ctx, out, at, f, 0.12, rand(0.12, 0.25));
    ping(ctx, out, at, f * 1.47, 0.05, 0.1);
  }
}

/** Getting into the bath: a heavy splash, then drops falling back. */
export function playBathSplash(level = 0.35): void {
  const o = oneShot(level, 1.5, JOB);
  if (!o) return;
  const { ctx, out, t } = o;
  const splash = bed(ctx, out, t, 0.7, 700, 0.8, 0.9, 0.03);
  splash.frequency.setValueAtTime(600, t);
  splash.frequency.exponentialRampToValueAtTime(2600, t + 0.2);
  splash.frequency.exponentialRampToValueAtTime(900, t + 0.7);
  for (let i = 0; i < 10; i++) {
    const at = t + 0.2 + rand(0, 0.9);
    const osc = ctx.createOscillator();
    const f = rand(900, 2200);
    osc.frequency.setValueAtTime(f, at);
    osc.frequency.exponentialRampToValueAtTime(f * 1.8, at + 0.04);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.12, at);
    env.gain.exponentialRampToValueAtTime(0.0005, at + 0.05);
    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + 0.06);
  }
}

/** Water running and lapping, `seconds` long: the hot tap topped up, the water moving round a body. */
export function playRunningWater(seconds = 2.5, level = 0.18): void {
  const o = oneShot(level, seconds, JOB);
  if (!o) return;
  const { ctx, out, t } = o;
  bed(ctx, out, t, seconds, 1300, 0.6, 0.8, 0.5);
  for (let at = t + 0.3; at < t + seconds - 0.3; at += rand(0.25, 0.5)) burst(ctx, out, at, rand(500, 900), 1.5, 0.3, rand(0.1, 0.2));
}

/** The treat jar shaken: three shakes of dry biscuits against the plastic. */
export function playJarRattle(level = 0.28): void {
  const o = oneShot(level, 1);
  if (!o) return;
  const { ctx, out, t } = o;
  for (let shake = 0; shake < 3; shake++) {
    const start = t + shake * 0.2;
    for (let i = 0; i < 9; i++) burst(ctx, out, start + rand(0, 0.09), rand(3000, 6000), 2.5, rand(0.2, 0.45), 0.018);
    burst(ctx, out, start, 700, 1, 0.2, 0.05); // the jar's body
  }
}
