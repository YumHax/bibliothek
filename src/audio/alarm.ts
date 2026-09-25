import { audioBus, startedAudioContext } from './audioContext';

/** Pitch of the beep (Hz): the thin, piercing note of a cheap alarm. */
const BEEP_HZ = 2100;
const BEEP_S = 0.07;
/** Four beeps a group, three groups. */
const PATTERN = { beeps: 4, gap: 0.05, groups: 3, pause: 0.45 };

/**
 * A clock's alarm going off: groups of four short square-wave beeps, like a travel alarm. Rings
 * when the game's clock reaches the time set, which nobody clicked for at that moment: it only
 * plays if an earlier gesture already started the audio (setting the alarm was one).
 */
export function playAlarm(level = 0.06): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  const out = ctx.createGain();
  out.gain.value = level;
  out.connect(audioBus(ctx, 'world'));
  let t = ctx.currentTime + 0.02;
  for (let g = 0; g < PATTERN.groups; g++) {
    for (let b = 0; b < PATTERN.beeps; b++) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = BEEP_HZ;
      const env = ctx.createGain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(1, t + 0.004);
      env.gain.setValueAtTime(1, t + BEEP_S - 0.008);
      env.gain.linearRampToValueAtTime(0, t + BEEP_S);
      osc.connect(env).connect(out);
      osc.start(t);
      osc.stop(t + BEEP_S + 0.01);
      t += BEEP_S + PATTERN.gap;
    }
    t += PATTERN.pause;
  }
  window.setTimeout(() => out.disconnect(), (t - ctx.currentTime + 0.3) * 1000);
}
