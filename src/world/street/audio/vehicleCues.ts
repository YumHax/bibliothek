import type { SoundGraph } from './soundGraph';

/*
 * One-off sounds of the street's vehicles, synthesised (the bus's, the bin lorry's and the van's
 * after `StreetAmbience`'s through the windows, here heard where they happen): each plays into
 * `out` (a positioned shot of the graph) at `level` (0..1, the distance already in it).
 */

/** The bus pulling up: a brake squeal, then the air brakes' long hiss. */
export function airBrakes(g: SoundGraph, out: AudioNode, level: number): void {
  const t = g.now + 0.02;
  const osc = g.ctx.createOscillator();
  osc.frequency.setValueAtTime(2600, t);
  osc.frequency.linearRampToValueAtTime(2350, t + 0.7);
  const vibrato = g.ctx.createOscillator();
  vibrato.frequency.value = 23;
  const depth = g.gain(30);
  vibrato.connect(depth).connect(osc.frequency);
  const env = g.gain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.05 * level, t + 0.15);
  env.gain.linearRampToValueAtTime(0, t + 0.8);
  osc.connect(env).connect(out);
  for (const node of [osc, vibrato]) {
    node.start(t);
    node.stop(t + 0.85);
  }
  g.shaped(filtered(g, out, 'highpass', 3200), t + 0.9, [[0.04, 0.4 * level], [0.5, 0.18 * level], [1.2, 0]]);
}

/** Doors folding open or shut: a sharp pneumatic psst and the leaves' thump. */
export function doorPsst(g: SoundGraph, out: AudioNode, level: number): void {
  const t = g.now + 0.02;
  g.shaped(filtered(g, out, 'highpass', 2800), t, [[0.02, 0.3 * level], [0.28, 0]]);
  g.burst(filtered(g, out, 'lowpass', 260), t + 0.55, 0.12, 0.35 * level);
}

/** Pulling away: the brakes released with a short psst (the engine's own voice revs on). */
export function brakesOff(g: SoundGraph, out: AudioNode, level: number): void {
  g.shaped(filtered(g, out, 'highpass', 3000), g.now + 0.02, [[0.015, 0.22 * level], [0.2, 0]]);
}

/** A wheelie bin tipped into the lorry's back: a hollow plastic clatter and the lid slapping. */
export function binClatter(g: SoundGraph, out: AudioNode, level: number): void {
  const t = g.now + 0.02;
  g.shaped(filtered(g, out, 'bandpass', 500 + Math.random() * 900, 1.2), t, [[0.01, 0.24 * level], [0.12, 0.07 * level], [0.3, 0]]);
  g.burst(filtered(g, out, 'bandpass', 320, 2), t + 0.25 + Math.random() * 0.2, 0.1, 0.25 * level);
}

/** A van's back doors: the latch's click, then the door swung to with a heavy metal clunk. */
export function vanDoor(g: SoundGraph, out: AudioNode, level: number): void {
  const t = g.now + 0.02;
  g.burst(filtered(g, out, 'bandpass', 2400, 3), t, 0.03, 0.15 * level);
  g.burst(filtered(g, out, 'lowpass', 340), t + 0.12, 0.2, 0.45 * level);
  g.burst(filtered(g, out, 'bandpass', 900, 1.5), t + 0.12, 0.08, 0.15 * level);
}

/** A crate of bottles or bread set down: a woody knock and, now and then, the bottles' chink. */
export function crate(g: SoundGraph, out: AudioNode, level: number): void {
  const t = g.now + 0.02;
  g.burst(filtered(g, out, 'bandpass', 420, 1.6), t, 0.09, 0.3 * level);
  if (Math.random() < 0.5) {
    for (let i = 0; i < 3; i++) ping(g, out, t + 0.03 + i * 0.04 + Math.random() * 0.03, 3000 + Math.random() * 1500, 0.04 * level);
  }
}

/** A bicycle's bell: two quick strikes of a little dome ringing out. */
export function bikeBell(g: SoundGraph, out: AudioNode, level: number): void {
  const t = g.now + 0.02;
  const strikes = Math.random() < 0.6 ? 2 : 1;
  for (let i = 0; i < strikes; i++) {
    const at = t + i * 0.14;
    for (const [f, part, decay] of [[3950, 1, 0.55], [6170, 0.4, 0.3], [2140, 0.3, 0.4]] as const) {
      const osc = g.ctx.createOscillator();
      osc.frequency.value = f * (1 + (Math.random() - 0.5) * 0.004);
      const env = g.gain();
      env.gain.setValueAtTime(0, at);
      env.gain.linearRampToValueAtTime(0.09 * part * level, at + 0.003);
      env.gain.exponentialRampToValueAtTime(0.0001, at + decay);
      osc.connect(env).connect(out);
      osc.start(at);
      osc.stop(at + decay + 0.05);
    }
  }
}

/** One click of a freewheel's pawls (a coasting bike ticks them off fast). */
export function freewheelTick(g: SoundGraph, out: AudioNode, at: number, level: number): void {
  g.burst(out, at, 0.008, 0.12 * level);
}

/** A tyre through a puddle: a wet swish. */
export function splash(g: SoundGraph, out: AudioNode, level: number): void {
  g.shaped(filtered(g, out, 'bandpass', 1800 + Math.random() * 1200, 0.7), g.now + 0.02, [[0.05, 0.25 * level], [0.35, 0.06 * level], [0.6, 0]]);
}

/** A filter into `out`, for a burst to play through. */
function filtered(g: SoundGraph, out: AudioNode, type: BiquadFilterType, frequency: number, q = 1): BiquadFilterNode {
  const f = g.filter(type, frequency, q);
  f.connect(out);
  window.setTimeout(() => f.disconnect(), 3000);
  return f;
}

/** A short glassy ping. */
function ping(g: SoundGraph, out: AudioNode, at: number, frequency: number, level: number): void {
  const osc = g.ctx.createOscillator();
  osc.frequency.value = frequency;
  const env = g.gain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(level, at + 0.002);
  env.gain.exponentialRampToValueAtTime(0.0001, at + 0.15);
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + 0.17);
}
