import type { SoundGraph } from './soundGraph';
import { random } from '@/random';

/*
 * One-off sounds of the park, synthesised: each plays into `out` (a positioned shot of the graph) at `level` (0..1, the
 * distance already in it). The ducks on the pond, the playground's swing and slide, something dropped in the water.
 */

/** A mallard's quack or a run of them: a nasal buzz through a duck's bill, falling, each a little shorter. */
export function quack(g: SoundGraph, out: AudioNode, level: number): void {
  const calls = random() < 0.5 ? 1 : 2 + Math.floor(random() * 4);
  const base = 330 + random() * 90;
  let at = g.now + 0.02;
  for (let i = 0; i < calls; i++) {
    const length = 0.16 - i * 0.015 + random() * 0.04;
    const osc = g.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(base * 1.05, at);
    osc.frequency.linearRampToValueAtTime(base * 0.82, at + length);
    // The bill: two nasal bands, the higher one a rasp.
    const bill = g.filter('bandpass', 1150, 3.5);
    const rasp = g.filter('bandpass', 2700, 5);
    const env = g.gain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(0.16 * level * (1 - i * 0.12), at + 0.015);
    env.gain.exponentialRampToValueAtTime(0.001, at + length);
    osc.connect(bill).connect(env);
    osc.connect(rasp).connect(env);
    env.connect(out);
    osc.start(at);
    osc.stop(at + length + 0.02);
    window.setTimeout(() => { // convention-ok: audio
      bill.disconnect();
      rasp.disconnect();
    }, (at - g.now + length + 1) * 1000);
    at += length + 0.05 + random() * 0.06;
  }
}

/** A swing's chains creaking at the top of its arc: a rusty squeak up and back down, twice. */
export function swingCreak(g: SoundGraph, out: AudioNode, level: number): void {
  const t = g.now + 0.02;
  for (const [i, delay] of [0, 0.32].entries()) {
    const osc = g.ctx.createOscillator();
    osc.type = 'triangle';
    const f = 820 + random() * 160 - i * 90;
    osc.frequency.setValueAtTime(f, t + delay);
    osc.frequency.linearRampToValueAtTime(f * 1.25, t + delay + 0.14);
    osc.frequency.linearRampToValueAtTime(f * 1.05, t + delay + 0.24);
    const rub = g.ctx.createOscillator();
    rub.frequency.value = 38;
    const depth = g.gain(f * 0.05);
    rub.connect(depth).connect(osc.frequency);
    const env = g.gain();
    env.gain.setValueAtTime(0, t + delay);
    env.gain.linearRampToValueAtTime(0.025 * level, t + delay + 0.05);
    env.gain.linearRampToValueAtTime(0, t + delay + 0.25);
    osc.connect(env).connect(out);
    for (const node of [osc, rub]) {
      node.start(t + delay);
      node.stop(t + delay + 0.27);
    }
  }
}

/** Someone down the slide: a long squeaky whoosh on the metal, a thump in the bark at the bottom. */
export function slideWhoosh(g: SoundGraph, out: AudioNode, level: number): void {
  const t = g.now + 0.02;
  const band = g.filter('bandpass', 1400, 1.2);
  band.frequency.setValueAtTime(900, t);
  band.frequency.linearRampToValueAtTime(2000, t + 1.1);
  band.connect(out);
  g.shaped(band, t, [[0.15, 0.18 * level], [1, 0.22 * level], [1.15, 0]]);
  const thump = g.filter('lowpass', 220);
  thump.connect(out);
  g.burst(thump, t + 1.18, 0.12, 0.4 * level);
  window.setTimeout(() => { // convention-ok: audio
    band.disconnect();
    thump.disconnect();
  }, 3000);
}

/** Something dropped in the water (a coin in the fountain, a crust thrown to the ducks): a plop and its rings. */
export function plop(g: SoundGraph, out: AudioNode, level: number): void {
  const t = g.now + 0.02;
  const osc = g.ctx.createOscillator();
  const f = 600 + random() * 500;
  osc.frequency.setValueAtTime(f, t);
  osc.frequency.exponentialRampToValueAtTime(f * 2.6, t + 0.05);
  const env = g.gain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.14 * level, t + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + 0.1);
  const splash = g.filter('bandpass', 2500, 0.8);
  splash.connect(out);
  g.shaped(splash, t, [[0.01, 0.12 * level], [0.18, 0]]);
  window.setTimeout(() => splash.disconnect(), 1000); // convention-ok: audio
}
