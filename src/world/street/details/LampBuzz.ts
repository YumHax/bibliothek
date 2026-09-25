import { audioBus, startedAudioContext } from '@/audio/audioContext';

/** How loud the hum is right under the lamp, and the crackle's loudest burst. */
const HUM = 0.05;
const CRACKLE = 0.09;

/**
 * The failing street lamp's voice: a thin mains hum (100 Hz and its harmonics through a band
 * filter) and a crackle of filtered noise when the tube stutters. Synthesised, on the `world`
 * bus; the caller sets how loud (distance, whether it is lit) and to which side. Nothing is built
 * before a gesture has started the audio (`startedAudioContext`).
 */
export class LampBuzz {
  private ctx: AudioContext | null = null;
  private hum: GainNode | null = null;
  private crackle: GainNode | null = null;
  private pan: StereoPannerNode | null = null;
  private tone: OscillatorNode | null = null;
  private noise: AudioBufferSourceNode | null = null;

  /** `level` 0..1 (distance and occupancy already in it), `pan` -1..1, `stutter` true while the tube drops out. */
  set(level: number, pan: number, stutter: boolean): void {
    const ctx = this.ctx ?? this.build();
    if (!ctx || !this.hum || !this.crackle || !this.pan) return;
    const now = ctx.currentTime;
    this.hum.gain.setTargetAtTime(HUM * level * (stutter ? 0.3 : 1), now, 0.05);
    this.crackle.gain.setTargetAtTime(stutter ? CRACKLE * level : 0, now, 0.01);
    this.pan.pan.setTargetAtTime(pan, now, 0.1);
  }

  dispose(): void {
    this.tone?.stop();
    this.noise?.stop();
    this.pan?.disconnect();
    this.ctx = null;
  }

  private build(): AudioContext | null {
    const ctx = startedAudioContext();
    if (!ctx) return null;
    this.ctx = ctx;
    this.pan = ctx.createStereoPanner();
    this.pan.connect(audioBus(ctx, 'world'));
    this.hum = ctx.createGain();
    this.hum.gain.value = 0;
    this.tone = ctx.createOscillator();
    this.tone.type = 'sawtooth';
    this.tone.frequency.value = 100;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 400;
    band.Q.value = 1.2;
    this.tone.connect(band).connect(this.hum).connect(this.pan);
    this.tone.start();

    const length = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Sparse clicks rather than a hiss: a discharge crackling.
    for (let i = 0; i < length; i++) data[i] = Math.random() < 0.02 ? Math.random() * 2 - 1 : (Math.random() * 2 - 1) * 0.05;
    this.noise = ctx.createBufferSource();
    this.noise.buffer = buffer;
    this.noise.loop = true;
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 1800;
    this.crackle = ctx.createGain();
    this.crackle.gain.value = 0;
    this.noise.connect(high).connect(this.crackle).connect(this.pan);
    this.noise.start();
    return ctx;
  }
}
