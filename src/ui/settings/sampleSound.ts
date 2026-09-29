import { audioBus, audioContext } from '@/audio/audioContext';
import type { VolumeChannel } from '@/settings';

/** Each bus's sample: a short phrase in the channel's own voice, so a volume is heard as it is set. */
const SAMPLES: Record<VolumeChannel, { type: OscillatorType; notes: number[] }> = {
  master: { type: 'triangle', notes: [523, 659, 784] },
  screens: { type: 'sawtooth', notes: [392, 494] },
  arcade: { type: 'square', notes: [880, 1175, 1568] },
  world: { type: 'sine', notes: [330, 262] },
  ui: { type: 'square', notes: [1320, 1760] },
};

let last = 0;

/** Plays `channel`'s sample on its bus (the master's through the menu bus: it reaches every bus's output). */
export function playVolumeSample(channel: VolumeChannel): void {
  const now = performance.now();
  if (now - last < 120) return; // a D-pad held on the slider is not a buzz
  last = now;
  const ctx = audioContext(); // the release of a slider is a gesture: the audio may start here
  const out = audioBus(ctx, channel === 'master' ? 'ui' : channel);
  const { type, notes } = SAMPLES[channel];
  notes.forEach((f, i) => {
    const t = ctx.currentTime + i * 0.09;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = f;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2400;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.08, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(filter).connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + 0.2);
  });
}
