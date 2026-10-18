import { audioBus, startedAudioContext } from './audioContext';
import { spatialInput, type Spatial } from './spatial';
import { shot, type OneShotOptions } from './oneShot';
import { noiseBurst, tone } from './synth';

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

/** The line in the player's ear (`ui/household/PhonePanel`): heard over the room's duck, like any sound of their own. */
const EARPIECE: OneShotOptions = { channel: 'foreground' };
/** The European ringing tone: 425 Hz, a burr this long, then a pause. */
const RINGBACK_HZ = 425;
const RINGBACK_S = 1;

/** The far end ringing: one burr of the ringing tone, small in the earpiece (a ring placed from the phone's panel). */
export function playRingback(level = 0.05): void {
  shot(level, RINGBACK_S + 0.1, EARPIECE, ({ ctx, out, t }) => {
    tone(ctx, out, t, { frequency: RINGBACK_HZ, level: 1, length: RINGBACK_S, attack: 0.02, hold: RINGBACK_S - 0.08 });
    // The line's hiss under it, as faint as a mobile's.
    noiseBurst(ctx, out, t, { band: 2400, q: 0.4, level: 0.08, length: RINGBACK_S, attack: 0.05, hold: RINGBACK_S - 0.15 });
  });
}

/** Someone picks up: the click of the line opening and a breath of room on it. */
export function playPickUp(level = 0.08): void {
  shot(level, 0.3, EARPIECE, ({ ctx, out, t }) => {
    noiseBurst(ctx, out, t, { band: 1800, q: 1.2, level: 1, length: 0.04, attack: 0 });
    noiseBurst(ctx, out, t + 0.04, { band: 900, q: 0.5, level: 0.15, length: 0.25, attack: 0.03 });
  });
}

/** The call ends: the three short falling pips a mobile plays when the line drops. */
export function playHangUp(level = 0.05): void {
  shot(level, 0.6, EARPIECE, ({ ctx, out, t }) => {
    [0, 1, 2].forEach((i) => tone(ctx, out, t + i * 0.16, { frequency: 620 - i * 60, level: 1, length: 0.11, attack: 0.005, hold: 0.06 }));
  });
}
