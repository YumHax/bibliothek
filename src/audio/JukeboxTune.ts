import { audioContext } from './audioContext';

/** Loudness at volume 1, right next to the jukebox (linear). */
const MASTER = 0.2;
/** How far ahead notes are put on the audio clock (s); `update` must run more often than that. */
const LOOKAHEAD = 0.3;
const BARS_PER_SONG = 16;

/** A station: its name on the jukebox, its tempo range, its chords and how each instrument plays a sixteenth. */
interface Style {
  name: string;
  bpm: [number, number];
  /** Chord progressions as semitones above the key's root, one chord per bar. */
  progressions: number[][][];
  /** Scale for the lead's notes. */
  scale: number[];
  /** Root note range (MIDI). */
  root: [number, number];
  lead: OscillatorType;
  pad: OscillatorType | null;
  /** Which sixteenths (0..15) the kick, snare, closed hat, open hat and bass play on. */
  kick: number[];
  snare: number[];
  hat: number[];
  openHat: number[];
  bass: number[];
  /** The bass jumps an octave on these sixteenths (disco's octave bass). */
  bassOctave: number[];
  /** Chance a sixteenth has a lead note, and whether the lead arpeggiates the chord instead of walking the scale. */
  leadDensity: number;
  arpeggio: boolean;
  /** Echo mix (a feedback delay a dotted eighth long). */
  echo: number;
}

const MINOR_PENTA = [0, 3, 5, 7, 10, 12, 15, 17];
const MAJOR_PENTA = [0, 2, 4, 7, 9, 12, 14, 16];
const DORIAN = [0, 2, 3, 5, 7, 9, 10, 12, 14];

export const STYLES: readonly Style[] = [
  {
    name: 'SYNTHWAVE',
    bpm: [96, 112],
    progressions: [[[0, 3, 7], [-4, 0, 3], [-9, -5, -2], [-2, 2, 5]], [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]]],
    scale: MINOR_PENTA,
    root: [50, 56],
    lead: 'sawtooth',
    pad: 'sawtooth',
    kick: [0, 8],
    snare: [4, 12],
    hat: [2, 6, 10, 14],
    openHat: [],
    bass: [0, 2, 4, 6, 8, 10, 12, 14],
    bassOctave: [],
    leadDensity: 0.55,
    arpeggio: true,
    echo: 0.35,
  },
  {
    name: 'CHIPTUNE',
    bpm: [138, 160],
    progressions: [[[0, 4, 7], [5, 9, 12], [7, 11, 14], [0, 4, 7]], [[9, 12, 16], [5, 9, 12], [0, 4, 7], [7, 11, 14]]],
    scale: MAJOR_PENTA,
    root: [60, 67],
    lead: 'square',
    pad: null,
    kick: [0, 6, 8],
    snare: [4, 12],
    hat: [0, 2, 4, 6, 8, 10, 12, 14],
    openHat: [],
    bass: [0, 3, 6, 8, 11, 14],
    bassOctave: [3, 11],
    leadDensity: 0.8,
    arpeggio: false,
    echo: 0.12,
  },
  {
    name: 'FUNK',
    bpm: [98, 110],
    progressions: [[[0, 3, 7, 10], [0, 3, 7, 10], [5, 9, 12, 15], [5, 9, 12, 15]], [[0, 4, 7, 10], [5, 9, 12, 15], [0, 4, 7, 10], [7, 11, 14, 17]]],
    scale: DORIAN,
    root: [48, 53],
    lead: 'square',
    pad: 'square',
    kick: [0, 7, 10],
    snare: [4, 12],
    hat: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    openHat: [14],
    bass: [0, 3, 7, 10, 11, 13],
    bassOctave: [7, 13],
    leadDensity: 0.3,
    arpeggio: false,
    echo: 0.15,
  },
  {
    name: 'ITALO DISCO',
    bpm: [116, 124],
    progressions: [[[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-2, 2, 5]], [[0, 3, 7], [5, 8, 12], [3, 7, 10], [-2, 2, 5]]],
    scale: MINOR_PENTA,
    root: [52, 57],
    lead: 'sawtooth',
    pad: 'triangle',
    kick: [0, 4, 8, 12],
    snare: [4, 12],
    hat: [],
    openHat: [2, 6, 10, 14],
    bass: [0, 2, 4, 6, 8, 10, 12, 14],
    bassOctave: [2, 6, 10, 14],
    leadDensity: 0.45,
    arpeggio: true,
    echo: 0.28,
  },
];

const WORDS_A = ['NEON', 'MIDNIGHT', 'CHROME', 'LASER', 'VELVET', 'TURBO', 'CRYSTAL', 'ELECTRIC', 'PIXEL', 'SATURDAY', 'COSMIC', 'GOLDEN'];
const WORDS_B = ['HIGHWAY', 'HEART', 'DREAMS', 'CITY', 'LOVER', 'RUNNER', 'NIGHTS', 'FEVER', 'PARADISE', 'SIGNAL', 'KINGDOM', 'SUMMER'];

/**
 * The jukebox's music: four stations of generated tunes (synthwave, chiptune, funk, italo disco),
 * each a drum machine, a bass, chords and a lead playing a new made-up song (key, tempo,
 * progression, a title) every sixteen bars, through a full-range speaker with a little echo. The
 * owner picks the station (`setStation`, null for off), sets `setVolume` from the listener's
 * distance and calls `update` every frame to keep the notes coming.
 */
export class JukeboxTune {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private echoSend: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private style: Style | null = null;
  private volume = 0;
  private next = 0;
  private step = 0;
  private song = { root: 52, sixteenth: 0.14, progression: [[0, 3, 7]], bars: 0, title: '' };
  private note = 3;

  get station(): string | null {
    return this.style?.name ?? null;
  }

  /** The song playing now, as the jukebox's card shows it. */
  get title(): string {
    return this.song.title;
  }

  setStation(index: number | null): void {
    this.style = index === null ? null : (STYLES[index % STYLES.length] ?? null);
    if (this.style) {
      const ctx = this.build();
      this.newSong();
      this.next = ctx.currentTime + 0.08;
      this.step = 0;
      if (this.echoSend) this.echoSend.gain.value = this.style.echo;
    }
    this.follow();
  }

  /** 0..1, from the listener's distance. */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.follow();
  }

  update(): void {
    const ctx = this.ctx;
    const style = this.style;
    if (!ctx || !style || !this.out) return;
    if (this.next < ctx.currentTime) this.next = ctx.currentTime + 0.02; // the tab was asleep
    while (this.next < ctx.currentTime + LOOKAHEAD) {
      this.playStep(ctx, this.out, style, this.next);
      this.next += this.song.sixteenth;
      this.step++;
      if (this.step % 16 === 0 && ++this.song.bars >= BARS_PER_SONG) this.newSong();
    }
  }

  dispose(): void {
    this.style = null;
    this.out?.disconnect();
    this.out = null;
    this.ctx = null;
  }

  private follow(): void {
    if (!this.ctx || !this.out) return;
    this.out.gain.setTargetAtTime(this.style ? this.volume * MASTER : 0, this.ctx.currentTime, 0.15);
  }

  private newSong(): void {
    const style = this.style;
    if (!style) return;
    const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
    const bpm = style.bpm[0] + Math.random() * (style.bpm[1] - style.bpm[0]);
    this.song = {
      root: style.root[0] + Math.floor(Math.random() * (style.root[1] - style.root[0] + 1)),
      sixteenth: 60 / bpm / 4,
      progression: pick(style.progressions),
      bars: 0,
      title: `${pick(WORDS_A)} ${pick(WORDS_B)}`,
    };
    this.step = 0;
  }

  /** One sixteenth: drums, bass, a chord on the bar's first beat, the lead. */
  private playStep(ctx: AudioContext, out: AudioNode, style: Style, t: number): void {
    const s = this.step % 16;
    const chord = this.song.progression[Math.floor(this.step / 16) % this.song.progression.length]!;
    const { root, sixteenth } = this.song;
    if (style.kick.includes(s)) this.kick(ctx, out, t);
    if (style.snare.includes(s)) this.noiseHit(ctx, out, t, 1900, 0.16, 0.45, 'bandpass');
    if (style.hat.includes(s)) this.noiseHit(ctx, out, t, 8000, 0.03, s % 4 === 2 ? 0.14 : 0.08, 'highpass');
    if (style.openHat.includes(s)) this.noiseHit(ctx, out, t, 7000, 0.12, 0.12, 'highpass');
    if (style.bass.includes(s)) {
      const octave = style.bassOctave.includes(s) ? 12 : 0;
      this.tone(ctx, out, style.name === 'CHIPTUNE' ? 'triangle' : 'sawtooth', midi(root - 24 + chord[0]! + octave), t, sixteenth * 1.6, 0.34, 700);
    }
    if (style.pad && s === 0) for (const n of chord) this.tone(ctx, out, style.pad, midi(root + n), t, sixteenth * 15, 0.045, 2200);
    if (Math.random() < style.leadDensity) {
      let pitch: number;
      if (style.arpeggio) {
        pitch = chord[s % chord.length]! + (s % 8 >= 4 ? 12 : 0);
      } else {
        this.note = Math.max(0, Math.min(style.scale.length - 1, this.note + Math.round((Math.random() - 0.5) * 3)));
        pitch = style.scale[this.note]!;
        if (s % 4 === 0) pitch = chord.reduce((best, c) => (Math.abs(c - pitch) < Math.abs(best - pitch) ? c : best), chord[0]!);
      }
      this.tone(ctx, out, style.lead, midi(root + 12 + pitch), t, sixteenth * (Math.random() < 0.25 ? 2.8 : 0.9), style.arpeggio ? 0.07 : 0.09, 3500);
    }
  }

  private tone(ctx: AudioContext, out: AudioNode, type: OscillatorType, frequency: number, t: number, length: number, level: number, cutoff: number): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + 0.008);
    env.gain.setTargetAtTime(0, t + length * 0.6, length * 0.25);
    osc.connect(filter).connect(env).connect(out);
    osc.start(t);
    osc.stop(t + length * 1.8);
    osc.onended = () => env.disconnect();
  }

  private kick(ctx: AudioContext, out: AudioNode, t: number): void {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.95, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + 0.24);
    osc.onended = () => env.disconnect();
  }

  private noiseHit(ctx: AudioContext, out: AudioNode, t: number, frequency: number, length: number, level: number, type: BiquadFilterType): void {
    if (!this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 0.8;
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + length);
    source.connect(filter).connect(env).connect(out);
    source.start(t, Math.random() * 0.5);
    source.stop(t + length + 0.02);
    source.onended = () => env.disconnect();
  }

  private build(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = audioContext();
    this.ctx = ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    // A jukebox's cabinet: no sub-bass, a soft top, a little echo off the hall's walls.
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 55;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 7500;
    out.connect(high).connect(low).connect(ctx.destination);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.33;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.3;
    const send = ctx.createGain();
    send.gain.value = 0.2;
    low.connect(send).connect(delay).connect(feedback).connect(delay);
    delay.connect(ctx.destination);
    this.out = out;
    this.echoSend = send;
    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }
}

function midi(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}
