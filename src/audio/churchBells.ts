/*
 * A church bell, synthesised: a bell's partials are not harmonic (hum, prime, tierce, quint,
 * nominal...), each ringing out at its own rate, the low ones longest. `strikeBell` plays one
 * strike into `out`; `ringTheHour` the last quarter's four-note chime and then the hour's strokes.
 */

/** Partials of a tuned church bell: ratio to the strike note, level, seconds to die away. */
const PARTIALS: readonly [ratio: number, level: number, decay: number][] = [
  [0.5, 0.55, 7],
  [1, 0.8, 5],
  [1.19, 0.45, 3.5],
  [1.5, 0.3, 2.8],
  [2, 0.6, 2.2],
  [2.5, 0.22, 1.5],
  [2.66, 0.15, 1.2],
  [3.01, 0.12, 0.9],
];

/** The last quarter of the Westminster chime, a fourth down the scale from the strike note's octave: E G# F# B. */
const CHIME = [659.3, 830.6, 740, 493.9];
/** Seconds between the chime's notes, and between two strokes of the hour. */
const CHIME_STEP = 0.75;
const STROKE_STEP = 1.7;
const HOUR_BELL = 196;

/** One strike of a bell tuned to `note` (Hz) at `time`, `level` loud, into `out`. */
export function strikeBell(ctx: BaseAudioContext, out: AudioNode, time: number, note: number, level: number): void {
  for (const [ratio, partLevel, decay] of PARTIALS) {
    const osc = ctx.createOscillator();
    osc.frequency.value = note * ratio * (1 + (Math.random() - 0.5) * 0.002);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(level * partLevel, time + 0.008);
    env.gain.exponentialRampToValueAtTime(0.00005, time + decay);
    osc.connect(env).connect(out);
    osc.start(time);
    osc.stop(time + decay + 0.05);
  }
}

/**
 * The full hour from the church tower, starting at `time`: the quarter chime, a pause, then the
 * hour's strokes on the big bell (`hour` 0..23, twelve-hour count). Returns when it will be done.
 */
export function ringTheHour(ctx: BaseAudioContext, out: AudioNode, time: number, hour: number, level: number): number {
  CHIME.forEach((note, i) => strikeBell(ctx, out, time + i * CHIME_STEP, note, level * 0.55));
  const strokes = hour % 12 || 12;
  const first = time + CHIME.length * CHIME_STEP + 1.4;
  for (let i = 0; i < strokes; i++) strikeBell(ctx, out, first + i * STROKE_STEP, HOUR_BELL, level);
  return first + strokes * STROKE_STEP;
}
