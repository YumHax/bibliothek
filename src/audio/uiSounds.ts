import { audioBus, startedAudioContext } from './audioContext';

/**
 * The menus' little sounds, on the mixer's `ui` bus: a soft tick when the focus moves, a brighter
 * blip on a pick, a lower one going back. A short square wave through a low-pass, like a cassette
 * deck's buttons. Silent until a gesture started the audio.
 */
type UiSound = 'move' | 'pick' | 'back';

const TONES: Record<UiSound, { from: number; to: number; ms: number; level: number }> = {
  move: { from: 1320, to: 1180, ms: 28, level: 0.05 },
  pick: { from: 880, to: 1760, ms: 70, level: 0.07 },
  back: { from: 660, to: 330, ms: 80, level: 0.06 },
};

let last = 0;

export function playUiSound(kind: UiSound): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  // Holding the D-pad must not turn into a buzz.
  const now = performance.now();
  if (kind === 'move' && now - last < 40) return;
  last = now;
  const tone = TONES[kind];
  const t = ctx.currentTime;
  const end = t + tone.ms / 1000;
  const osc = ctx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(tone.from, t);
  osc.frequency.exponentialRampToValueAtTime(tone.to, end);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2600;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(tone.level, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(filter).connect(gain).connect(audioBus(ctx, 'ui'));
  osc.start(t);
  osc.stop(end + 0.02);
}
