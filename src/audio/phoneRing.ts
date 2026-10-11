import { audioBus, startedAudioContext } from './audioContext';
import { spatialInput, type Spatial } from './spatial';

/** The ringtone's notes (Hz): a soft rising four-note figure, played twice a ring, like a phone's default marimba. */
const NOTES = [784, 988, 1175, 988];
const NOTE_S = 0.14;
/** A struck bar's partials (multiples of the note) and how loud each starts. */
const PARTIALS: readonly [number, number][] = [[1, 1], [4, 0.18]];

/**
 * One ring of the bedroom's phone (`world/bedroom/memeRing`): the figure twice over, struck sine partials decaying
 * fast. Rung by a caller, not a click: it only plays once a gesture started the audio. `level` and `spatial` are the
 * caller's (`hear` of the phone). Returns how long it sounds (s, 0 when silent).
 */
export function playPhoneRing(level = 0.08, spatial?: Spatial): number {
  const ctx = startedAudioContext();
  if (!ctx || level <= 0.001) return 0;
  const out = ctx.createGain();
  out.gain.value = level;
  const length = 2 * NOTES.length * NOTE_S + 0.2;
  out.connect(spatialInput(ctx, audioBus(ctx, 'world'), spatial, length + 0.6));
  let t = ctx.currentTime + 0.02;
  for (let round = 0; round < 2; round++) {
    for (const note of NOTES) {
      for (const [ratio, peak] of PARTIALS) {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = note * ratio;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, t);
        env.gain.linearRampToValueAtTime(peak, t + 0.005);
        env.gain.exponentialRampToValueAtTime(0.0005, t + 0.35 / ratio);
        osc.connect(env).connect(out);
        osc.start(t);
        osc.stop(t + 0.4);
      }
      t += NOTE_S;
    }
    t += 0.2;
  }
  window.setTimeout(() => out.disconnect(), (t - ctx.currentTime + 0.6) * 1000);
  return t - ctx.currentTime;
}
