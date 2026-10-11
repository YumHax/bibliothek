import type { SoundGraph } from './soundGraph';
import { random } from '@/random';

/*
 * One-off sounds of the street's new things, synthesised: each plays into `out` (a positioned shot of the graph) at
 * `level` (0..1, the distance already in it). The post box, the phone box, a bar's pinball and darts, a crowd's applause
 * and cheer (the busker's listeners, a quiz, a gig, the bandstand).
 */

/** A letter posted: the flap pushed open, the envelope sliding in, dropping on the others, the flap clanking back. */
export function letterDrop(g: SoundGraph, out: AudioNode, level: number): void {
  const t = g.now + 0.02;
  const scrape = band(g, out, 'bandpass', 3200, 1.2);
  g.shaped(scrape, t, [[0.03, 0.08 * level], [0.25, 0.05 * level], [0.3, 0]]);
  g.burst(band(g, out, 'bandpass', 900, 1.5), t + 0.45, 0.06, 0.18 * level);
  // The cast-iron flap falling shut: a dull clank with a ring in it.
  g.burst(band(g, out, 'lowpass', 500), t + 0.6, 0.08, 0.35 * level);
  for (const [f, part] of [[1180, 1], [2650, 0.4]] as const) ring(g, out, t + 0.6, f, 0.03 * part * level, 0.35);
}

/** The phone box's bell: an old electric ringer's double ring (call it again for the next). */
export function phoneRing(g: SoundGraph, out: AudioNode, level: number): void {
  const t = g.now + 0.02;
  for (const start of [0, 0.6]) {
    // The clapper hammering two bells 25 times a second.
    for (let k = 0; k < 10; k++) {
      const at = t + start + k * 0.04;
      ring(g, out, at, 1950 + (k % 2) * 140, 0.035 * level, 0.08);
      ring(g, out, at, 3900, 0.012 * level, 0.05);
    }
  }
}

/** Coins into a slot (the phone box, a pinball, the fountain's edge): the drop, a rattle down the chute, the clunk. */
export function coinSlot(g: SoundGraph, out: AudioNode, level: number): void {
  const t = g.now + 0.02;
  ring(g, out, t, 3400 + random() * 400, 0.04 * level, 0.15);
  for (let i = 0; i < 4; i++) g.burst(band(g, out, 'bandpass', 2600, 3), t + 0.05 + i * 0.035, 0.012, 0.12 * level);
  g.burst(band(g, out, 'lowpass', 600), t + 0.25, 0.05, 0.2 * level);
}

/** Hands clapping, `people` of them, for `seconds`: each pair of hands its own pace, thinning out at the end. */
export function applause(g: SoundGraph, out: AudioNode, level: number, people: number, seconds = 2.5): void {
  const t = g.now + 0.02;
  const hands = Math.max(1, Math.min(14, Math.round(people)));
  const clap = band(g, out, 'bandpass', 1500, 0.9);
  for (let h = 0; h < hands; h++) {
    const every = 0.17 + random() * 0.12;
    const stop = seconds * (0.7 + random() * 0.3);
    for (let at = random() * 0.2; at < stop; at += every * (0.9 + random() * 0.2)) {
      g.burst(clap, t + at, 0.025, (0.16 / Math.sqrt(hands)) * level * (1 - (0.5 * at) / seconds));
    }
  }
}

/** A room or a crowd cheering (a right answer at the quiz, the end of a song): a swell of voiced noise and a whoop. */
export function cheer(g: SoundGraph, out: AudioNode, level: number): void {
  const t = g.now + 0.02;
  for (const [f, part] of [[520, 1], [900, 0.8], [1400, 0.5], [2300, 0.3]] as const) {
    g.shaped(band(g, out, 'bandpass', f * (0.9 + random() * 0.2), 2.5), t, [[0.15, 0.18 * part * level], [0.9, 0.12 * part * level], [1.6, 0]]);
  }
  const whoop = g.ctx.createOscillator();
  whoop.type = 'sawtooth';
  whoop.frequency.setValueAtTime(380, t + 0.1);
  whoop.frequency.linearRampToValueAtTime(720, t + 0.45);
  const mouth = band(g, out, 'bandpass', 1200, 3);
  const env = g.gain();
  env.gain.setValueAtTime(0, t + 0.1);
  env.gain.linearRampToValueAtTime(0.05 * level, t + 0.2);
  env.gain.linearRampToValueAtTime(0, t + 0.5);
  whoop.connect(env).connect(mouth);
  whoop.start(t + 0.1);
  whoop.stop(t + 0.55);
}

/** A pinball table: the flippers' thwack, the ball off a bumper, a bell or two for the score. */
export function pinball(g: SoundGraph, out: AudioNode, level: number): void {
  const t = g.now + 0.02;
  g.burst(band(g, out, 'bandpass', 700, 2), t, 0.04, 0.3 * level);
  const bumps = 1 + Math.floor(random() * 3);
  for (let i = 0; i < bumps; i++) {
    const at = t + 0.2 + i * (0.12 + random() * 0.2);
    g.burst(band(g, out, 'bandpass', 1800, 4), at, 0.02, 0.25 * level);
    ring(g, out, at, 1320 * (i % 2 ? 1.5 : 1), 0.04 * level, 0.4);
  }
}

/** A dart into the board: a short whistle in the air, the dull knock into the sisal. */
export function dart(g: SoundGraph, out: AudioNode, level: number): void {
  const t = g.now + 0.02;
  g.shaped(band(g, out, 'highpass', 4000, 0.7), t, [[0.05, 0.03 * level], [0.18, 0]]);
  g.burst(band(g, out, 'bandpass', 500, 2), t + 0.2, 0.05, 0.4 * level);
}

/** A struck ringing partial into `out`. */
function ring(g: SoundGraph, out: AudioNode, at: number, frequency: number, level: number, decay: number): void {
  const osc = g.ctx.createOscillator();
  osc.frequency.value = frequency;
  const env = g.gain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(level, at + 0.003);
  env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + decay + 0.05);
}

/** A filter into `out`, let go a few seconds later. */
function band(g: SoundGraph, out: AudioNode, type: BiquadFilterType, frequency: number, q = 1): BiquadFilterNode {
  const f = g.filter(type, frequency, q);
  f.connect(out);
  window.setTimeout(() => f.disconnect(), 5000); // convention-ok: audio
  return f;
}
