import { audioBus, startedAudioContext } from '@/audio/audioContext';

/**
 * The shutter: a dry mechanical click (a burst of filtered noise, then the mirror's lower slap), on
 * the `ui` bus. Silent until a gesture started the audio (a photo is always taken with one).
 */
export function playShutter(): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  const out = audioBus(ctx, 'ui');
  const t = ctx.currentTime;
  const burst = (at: number, ms: number, hz: number, level: number) => {
    const length = Math.ceil((ctx.sampleRate * ms) / 1000);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = hz;
    filter.Q.value = 1.2;
    const gain = ctx.createGain();
    gain.gain.value = level;
    source.connect(filter).connect(gain).connect(out);
    source.start(t + at);
  };
  burst(0, 18, 3800, 0.22);
  burst(0.055, 30, 1400, 0.16);
}
