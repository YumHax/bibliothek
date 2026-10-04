import { oneShot, type OneShotOptions } from './oneShot';
import { bed, noiseBurst, rand, tone } from './synth';
import { random } from '@/random';

/*
 * The one-shot sounds of the flat's household uses (docs/household.md): the hair dryer, the
 * cleaning kit, the cake (whisk, oven), the alarm clock's button, the wardrobe's hangers, the bath,
 * the treat jar, the cleaning kit taken off its shelf. Each is played by a click (so the context may start here), synthesised on the
 * spot and gone after; the player stands at the thing, so no distance model, only a level.
 */

/** The pastimes' own sounds (cleaning, the dryer, the cake, the bath) are the player's doing: heard over the fade that ducks the room. */
const JOB: OneShotOptions = { channel: 'foreground' };

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
  const whine = ctx.createBiquadFilter();
  whine.type = 'lowpass';
  whine.frequency.value = 1400;
  const hum = ctx.createGain();
  hum.gain.setValueAtTime(0, t);
  hum.gain.linearRampToValueAtTime(0.12, t + 0.2);
  hum.gain.setValueAtTime(0.12, t + seconds);
  hum.gain.linearRampToValueAtTime(0, t + seconds + 0.5);
  motor.connect(whine).connect(hum).connect(out);
  motor.start(t);
  motor.stop(t + seconds + 0.55);
  bed(ctx, out, t, { seconds: seconds + 0.3, band: 1800, q: 0.5, level: 0.7, fade: 0.3 });
}

/** The cleaning kit at work: a soft cloth rubbing in strokes, a cotton bud squeaking in the corners, the isopropyl's cap. */
export function playCleaning(seconds = 2.6, level = 0.3): void {
  const o = oneShot(level, seconds, JOB);
  if (!o) return;
  const { ctx, out, t } = o;
  tone(ctx, out, t, { frequency: 2300, level: 0.15, length: 0.03, type: 'square' }); // the cap
  let at = t + 0.25;
  while (at < t + seconds * 0.6) {
    noiseBurst(ctx, out, at, { band: rand(1800, 2600), q: 0.9, level: 0.5, length: rand(0.16, 0.24) });
    at += rand(0.22, 0.3);
  }
  while (at < t + seconds) {
    // A cotton bud's squeak: a short rising chirp.
    const f = rand(2600, 3400);
    tone(ctx, out, at, { frequency: f, to: f * 1.15, glide: 0.08, glideCurve: 'linear', level: 0.05, length: 0.09, attack: 0.01, tail: 0.01 });
    noiseBurst(ctx, out, at, { band: 3800, q: 2, level: 0.12, length: 0.07 });
    at += rand(0.14, 0.24);
  }
}

/** A whisk beating in a mixing bowl: quick metal ticks against the side, a clink of the bowl now and then. */
export function playWhisk(seconds = 2.2, level = 0.28): void {
  const o = oneShot(level, seconds, JOB);
  if (!o) return;
  const { ctx, out, t } = o;
  for (let at = t; at < t + seconds; at += rand(0.09, 0.12)) {
    noiseBurst(ctx, out, at, { band: rand(4500, 6000), q: 3, level: 0.35, length: 0.03 });
    if (random() < 0.12) {
      tone(ctx, out, at, { frequency: 1850, level: 0.12, length: 0.35 });
      tone(ctx, out, at, { frequency: 2790, level: 0.05, length: 0.25 });
    }
  }
}

/** The oven: its door let down, the tray slid in and the door shut (a thud); `ding` its timer instead. */
export function playOven(ding = false, level = 0.3): void {
  const o = oneShot(level, 2, JOB);
  if (!o) return;
  const { ctx, out, t } = o;
  if (ding) {
    tone(ctx, out, t, { frequency: 1760, level: 0.4, length: 1.4 });
    tone(ctx, out, t, { frequency: 1760 * 2.76, level: 0.1, length: 0.5 });
    return;
  }
  noiseBurst(ctx, out, t, { band: 900, q: 1, level: 0.3, length: 0.18 }); // the hinge
  noiseBurst(ctx, out, t + 0.45, { band: 3200, q: 1.5, level: 0.25, length: 0.25 }); // the tray on its runners
  tone(ctx, out, t + 0.9, { frequency: 130, to: 55, glide: 0.1, level: 0.7, length: 0.2, attack: 0, floor: 0.001, tail: 0.05 }); // the door's thud
  tone(ctx, out, t + 0.9, { frequency: 1300, level: 0.08, length: 0.2 });
}

/** The alarm clock's button: a plastic click and the short beep it answers with. */
export function playAlarmButton(level = 0.1): void {
  const o = oneShot(level, 0.4);
  if (!o) return;
  const { ctx, out, t } = o;
  noiseBurst(ctx, out, t, { band: 3000, q: 2, level: 0.6, length: 0.02 });
  tone(ctx, out, t + 0.04, { frequency: 2400, level: 0.5, length: 0.08, type: 'square' });
}

/** The cleaning kit lifted off the cabinet's shelf: the little bottle's glass clink, the bag of cotton buds rustling. */
export function playKitTake(level = 0.2): void {
  const o = oneShot(level, 0.8);
  if (!o) return;
  const { ctx, out, t } = o;
  tone(ctx, out, t, { frequency: 3300, level: 0.12, length: 0.18 });
  tone(ctx, out, t + 0.06, { frequency: 4850, level: 0.05, length: 0.12 });
  for (let i = 0; i < 5; i++) noiseBurst(ctx, out, t + 0.1 + i * rand(0.05, 0.09), { band: rand(4000, 7000), q: 1.2, level: rand(0.12, 0.25), length: rand(0.04, 0.08) });
}

/** A paper booklet picked up (the manual the cat brought): a few dry rustles of its pages. */
export function playPaperRustle(level = 0.16): void {
  const o = oneShot(level, 0.6);
  if (!o) return;
  const { ctx, out, t } = o;
  for (let i = 0; i < 4; i++) noiseBurst(ctx, out, t + i * rand(0.05, 0.1), { band: rand(2500, 5000), q: 0.9, level: rand(0.3, 0.6), length: rand(0.05, 0.1) });
}

/** Hangers on the wardrobe's rail: a rattle of wire and wood as the clothes are pushed along. */
export function playHangers(level = 0.2): void {
  const o = oneShot(level, 1);
  if (!o) return;
  const { ctx, out, t } = o;
  noiseBurst(ctx, out, t, { band: 2200, q: 0.8, level: 0.25, length: 0.4 }); // the slide
  for (let i = 0; i < 6; i++) {
    const at = t + rand(0, 0.5);
    const f = rand(2800, 5200);
    tone(ctx, out, at, { frequency: f, level: 0.12, length: rand(0.12, 0.25) });
    tone(ctx, out, at, { frequency: f * 1.47, level: 0.05, length: 0.1 });
  }
}

/** Getting into the bath: a heavy splash, then drops falling back. */
export function playBathSplash(level = 0.35): void {
  const o = oneShot(level, 1.5, JOB);
  if (!o) return;
  const { ctx, out, t } = o;
  const splash = bed(ctx, out, t, { seconds: 0.7, band: 700, q: 0.8, level: 0.9, fade: 0.03 });
  splash.frequency.setValueAtTime(600, t);
  splash.frequency.exponentialRampToValueAtTime(2600, t + 0.2);
  splash.frequency.exponentialRampToValueAtTime(900, t + 0.7);
  for (let i = 0; i < 10; i++) {
    const f = rand(900, 2200);
    tone(ctx, out, t + 0.2 + rand(0, 0.9), { frequency: f, to: f * 1.8, glide: 0.04, level: 0.12, length: 0.05, attack: 0, tail: 0.01 });
  }
}

/** Water running and lapping, `seconds` long: the hot tap topped up, the water moving round a body. */
export function playRunningWater(seconds = 2.5, level = 0.18): void {
  const o = oneShot(level, seconds, JOB);
  if (!o) return;
  const { ctx, out, t } = o;
  bed(ctx, out, t, { seconds, band: 1300, q: 0.6, level: 0.8, fade: 0.5 });
  for (let at = t + 0.3; at < t + seconds - 0.3; at += rand(0.25, 0.5)) noiseBurst(ctx, out, at, { band: rand(500, 900), q: 1.5, level: 0.3, length: rand(0.1, 0.2) });
}

/** The treat jar shaken: three shakes of dry biscuits against the plastic. */
export function playJarRattle(level = 0.28): void {
  const o = oneShot(level, 1);
  if (!o) return;
  const { ctx, out, t } = o;
  for (let shake = 0; shake < 3; shake++) {
    const start = t + shake * 0.2;
    for (let i = 0; i < 9; i++) noiseBurst(ctx, out, start + rand(0, 0.09), { band: rand(3000, 6000), q: 2.5, level: rand(0.2, 0.45), length: 0.018 });
    noiseBurst(ctx, out, start, { band: 700, q: 1, level: 0.2, length: 0.05 }); // the jar's body
  }
}
