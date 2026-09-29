import { audioBus, audioContext } from './audioContext';
import { whiteNoise } from './noise';
import { SpatialOut } from './spatial';

/** Loudness at volume 1, right next to the set (linear). */
const MASTER = 0.13;
/** How far ahead notes are put on the audio clock (s); `update` must run more often than that. */
const LOOKAHEAD = 0.3;

/** A chord: its bass (semitones above the key's root) and a rootless four-note voicing above it (a jazz pianist's left hand). */
interface Chord {
  bass: number;
  notes: number[];
}
const I: Chord = { bass: 0, notes: [4, 7, 11, 14] }; // maj9
const II: Chord = { bass: 2, notes: [5, 9, 12, 16] }; // m9
const III: Chord = { bass: 4, notes: [2, 7, 11, 14] }; // m7
const IV: Chord = { bass: 5, notes: [4, 7, 9, 12] }; // maj9
const V: Chord = { bass: 7, notes: [5, 9, 11, 16] }; // 13
const VI: Chord = { bass: 9, notes: [7, 11, 12, 16] }; // m9
/** Progressions, one chord per bar, each leading back to its start. */
const PROGRESSIONS: Chord[][] = [
  [I, VI, II, V],
  [II, V, I, VI],
  [IV, III, II, V],
  [I, IV, III, VI],
  [VI, II, V, I],
  [IV, V, III, VI],
];
/** The major scale over an octave and a half, for the vibraphone's tune. */
const SCALE = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19];
const BARS_PER_SONG = 16;
/** Tempo range (bpm) of the station: easy listening, never a dance floor. */
const BPM = { min: 78, max: 100 };
/** How late the offbeat eighths fall (share of an eighth): a light swing. */
const SWING = 0.16;
/** Between two songs: the last one fades over its final quarter bar, then half a bar of hiss only (eighth notes). */
const GAP_STEPS = 4;
/** Each song's hook: a two-bar phrase (eighth notes), played on the first two bars of every four; the other two breathe. */
const MOTIF_STEPS = 16;
/** Share of the hook's eighths that carry a note. */
const NOTE_CHANCE = 0.42;
/** The vibraphone's tremolo: its rate (Hz) and depth (share of the level). */
const TREMOLO = { hz: 5.2, depth: 0.28 };

/** One eighth of the tune: a scale degree held short or long, or a rest (null). */
type TuneNote = { degree: number; long: boolean } | null;
/** A small speaker: not much low end, no highs. */
const BAND = { low: 200, high: 3600 };
const HISS = 0.012;
/** How far the music dips under the announcer (dB), and how fast it goes down and comes back (s). */
const DUCK_DB = 8;
const DUCK_FALL = 0.25;
const DUCK_RISE = 0.8;
/** The station's jingle: a rising arpeggio of bells (MIDI notes), then the announcer's tone bed. */
const JINGLE = [72, 76, 79, 84];
const JINGLE_STEP = 0.14;

/**
 * A cheap transistor radio on an easy-listening station: a lounge combo of electric piano chords
 * (jazzy, rootless voicings), a walking bass, brushes on a snare and a vibraphone tune, all
 * generated and heard through a small speaker with a little hiss. A new "song" (key, tempo,
 * progression, a two-bar hook it keeps coming back to) every sixteen bars, with a short fade and
 * half a bar of hiss between two. The owner sets `setVolume` from the listener's distance and
 * calls `update` every frame to keep the notes coming.
 */
export class RadioTune {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  /** The music's own gain under the announcer (`duck`), and the jingle's way in, past it. */
  private music: GainNode | null = null;
  private voiceIn: GainNode | null = null;
  /** The vibraphone's way into the song, through its tremolo. */
  private vibes: GainNode | null = null;
  private tremolo: OscillatorNode | null = null;
  private spatialOut: SpatialOut | null = null;
  private readonly spatial = { pan: 0, walls: 0 };
  private hiss: AudioBufferSourceNode | null = null;
  private noise: AudioBuffer | null = null;
  private on = false;
  private volume = 0;
  private next = 0;
  private step = 0;
  private song = { root: 53, step: 60 / 88 / 2, progression: PROGRESSIONS[0]!, bars: 0, motif: makeMotif() };
  /** The song's own gain, ahead of `music`: faded out at a song's end, back up after the gap. */
  private songGain: GainNode | null = null;
  /** Eighth notes of silence left before the next song starts. */
  private gap = 0;

  get isOn(): boolean {
    return this.on;
  }

  setOn(on: boolean): void {
    this.on = on;
    if (on) {
      const ctx = this.build();
      this.next = ctx.currentTime + 0.05;
      this.step = 0;
      this.gap = 0;
      this.songGain?.gain.cancelScheduledValues(ctx.currentTime);
      this.songGain?.gain.setValueAtTime(1, ctx.currentTime);
    }
    this.follow();
  }

  /** 0..1, from the listener's distance. */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    this.follow();
  }

  /** Where the set is heard from (`spatial.ts`): the side and the walls in between. */
  setSpatial(pan: number, walls: number): void {
    this.spatial.pan = pan;
    this.spatial.walls = walls;
    this.spatialOut?.set(pan, walls);
  }

  /** The music dips `DUCK_DB` under the announcer (true), or comes back up (false). */
  duck(down: boolean): void {
    if (!this.ctx || !this.music) return;
    const gain = down ? Math.pow(10, -DUCK_DB / 20) : 1;
    this.music.gain.setTargetAtTime(gain, this.ctx.currentTime, down ? DUCK_FALL / 3 : DUCK_RISE / 3);
  }

  /** The station's jingle over the music (a few bells, then the announcer's hum), through the same little speaker. */
  jingle(): void {
    const ctx = this.ctx;
    const into = this.voiceIn;
    if (!ctx || !into || !this.on) return;
    let t = ctx.currentTime + 0.05;
    for (const note of JINGLE) {
      this.tone(ctx, into, 'triangle', midi(note), t, JINGLE_STEP * 2.2, 0.45);
      this.tone(ctx, into, 'sine', midi(note + 12), t, JINGLE_STEP * 1.4, 0.18);
      t += JINGLE_STEP;
    }
    // The announcer taking the mike: a warm, wobbling hum in a voice's range, under the card.
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.setValueAtTime(140, t);
    const wobble = ctx.createOscillator();
    wobble.frequency.value = 4.5;
    const depth = ctx.createGain();
    depth.gain.value = 18;
    wobble.connect(depth).connect(hum.frequency);
    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.frequency.value = 800;
    formant.Q.value = 2;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.12, t + 0.08);
    env.gain.setValueAtTime(0.12, t + 1.2);
    env.gain.linearRampToValueAtTime(0, t + 1.6);
    hum.connect(formant).connect(env).connect(into);
    hum.start(t);
    wobble.start(t);
    hum.stop(t + 1.7);
    wobble.stop(t + 1.7);
  }

  update(): void {
    const ctx = this.ctx;
    if (!ctx || !this.on || !this.out) return;
    if (this.next < ctx.currentTime) this.next = ctx.currentTime + 0.02; // the tab was asleep
    while (this.next < ctx.currentTime + LOOKAHEAD) {
      if (this.gap > 0) {
        // Between two songs: only the hiss; the new one comes in on the gap's last beat.
        this.next += this.song.step;
        if (--this.gap === 0) this.songGain?.gain.setTargetAtTime(1, this.next - 0.02, 0.008);
        continue;
      }
      this.playStep(ctx, this.songGain ?? this.music ?? this.out, this.next);
      this.next += this.song.step;
      this.step++;
      if (this.step % 8 === 0 && ++this.song.bars >= BARS_PER_SONG) {
        // The song fades over its last quarter bar, then half a bar of hiss.
        this.songGain?.gain.setTargetAtTime(0, this.next - this.song.step * 2, this.song.step * 0.5);
        this.newSong();
        this.gap = GAP_STEPS;
      }
    }
  }

  dispose(): void {
    this.on = false;
    this.hiss?.stop();
    this.hiss = null;
    this.tremolo?.stop();
    this.tremolo = null;
    this.vibes = null;
    this.out?.disconnect();
    this.out = null;
    this.music = null;
    this.songGain = null;
    this.voiceIn = null;
    this.spatialOut?.disconnect();
    this.spatialOut = null;
    this.ctx = null;
  }

  private follow(): void {
    if (!this.ctx || !this.out) return;
    this.out.gain.setTargetAtTime(this.on ? this.volume * MASTER : 0, this.ctx.currentTime, 0.1);
  }

  private newSong(): void {
    this.song = {
      root: 50 + Math.floor(Math.random() * 8),
      step: 60 / (BPM.min + Math.random() * (BPM.max - BPM.min)) / 2,
      progression: PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)]!,
      bars: 0,
      motif: makeMotif(),
    };
    this.step = 0;
  }

  /**
   * One eighth note (the offbeats a touch late): brushes on every eighth, a soft kick, a rim click,
   * the bass walking the chord, the piano on the bar's first beat and pushed before the third, the
   * vibraphone's hook on the first two bars of every four.
   */
  private playStep(ctx: AudioContext, out: AudioNode, t0: number): void {
    const inBar = this.step % 8;
    const bar = Math.floor(this.step / 8);
    const { root, step, progression } = this.song;
    const chord = progression[bar % progression.length]!;
    const nextChord = progression[(bar + 1) % progression.length]!;
    const t = inBar % 2 ? t0 + step * SWING : t0;

    // Brushes: a swish on each eighth, leaned on the backbeat; a soft kick and a rim click.
    const backbeat = inBar === 2 || inBar === 6;
    this.noiseHit(ctx, out, t, 4200, backbeat ? 0.2 : 0.09, backbeat ? 0.09 : inBar % 2 ? 0.035 : 0.05, 0.012);
    if (inBar === 0 || inBar === 3) this.kick(ctx, out, t, inBar === 0 ? 0.32 : 0.2);
    if (inBar === 6 && Math.random() < 0.6) this.noiseHit(ctx, out, t, 1900, 0.025, 0.07, 0);

    // The bass: the root, the fifth on the third beat, sometimes a step into the next chord.
    const bassNote = root - 12;
    if (inBar === 0) this.pluck(ctx, out, 'triangle', midi(bassNote + chord.bass), t, step * 3.2, 0.34);
    else if (inBar === 4) this.pluck(ctx, out, 'triangle', midi(bassNote + chord.bass + (Math.random() < 0.7 ? 7 : 12)), t, step * 2.6, 0.28);
    else if (inBar === 7 && Math.random() < 0.45) this.pluck(ctx, out, 'triangle', midi(bassNote + nextChord.bass - 1), t, step * 0.9, 0.22);

    // The piano: the chord on one, pushed again on the and of two now and then.
    if (inBar === 0) for (const n of chord.notes) this.electricPiano(ctx, out, midi(root + n), t + Math.random() * 0.012, step * 5, 0.05);
    else if (inBar === 3 && Math.random() < 0.5) for (const n of chord.notes) this.electricPiano(ctx, out, midi(root + n), t + Math.random() * 0.01, step * 2, 0.032);

    // The vibraphone: the hook on the first two bars of every four, the others left to the piano.
    const vibes = this.vibes;
    if (!vibes || this.song.bars % 4 >= 2) return;
    const note = this.song.motif[(this.song.bars % 2) * 8 + inBar] ?? null;
    if (!note) return;
    let pitch = SCALE[note.degree]! + 12;
    // Pulled to the chord on the beat, so the hook still fits when the chord under it changes.
    if (inBar % 2 === 0) pitch = nearestChordTone(pitch, chord);
    this.vibraphone(ctx, vibes, midi(root + pitch), t, step * (note.long ? 4 : 2), 0.13);
  }

  /** A sustained tone (the jingle's bells): up in 10 ms, held, let go. */
  private tone(ctx: AudioContext, out: AudioNode, type: OscillatorType, frequency: number, t: number, length: number, level: number): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + 0.01);
    env.gain.setTargetAtTime(0, t + length * 0.7, length * 0.2);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + length * 1.6);
  }

  /** A plucked note (the bass): a quick attack, then a fall over `length`. */
  private pluck(ctx: AudioContext, out: AudioNode, type: OscillatorType, frequency: number, t: number, length: number, level: number): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + 0.012);
    env.gain.setTargetAtTime(0, t + 0.012, length * 0.35);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + length * 1.5);
  }

  /** An electric piano's note: a sine frequency-modulated by its own pitch, bright on the strike and mellowing as it rings. */
  private electricPiano(ctx: AudioContext, out: AudioNode, frequency: number, t: number, length: number, level: number): void {
    const carrier = ctx.createOscillator();
    carrier.frequency.value = frequency;
    const modulator = ctx.createOscillator();
    modulator.frequency.value = frequency;
    const index = ctx.createGain();
    index.gain.setValueAtTime(frequency * 1.4, t);
    index.gain.setTargetAtTime(frequency * 0.15, t, 0.12);
    modulator.connect(index).connect(carrier.frequency);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + 0.006);
    env.gain.setTargetAtTime(level * 0.45, t + 0.006, 0.25);
    env.gain.setTargetAtTime(0, t + length * 0.8, length * 0.15);
    carrier.connect(env).connect(out);
    const stop = t + length * 1.4;
    carrier.start(t);
    modulator.start(t);
    carrier.stop(stop);
    modulator.stop(stop);
  }

  /** A vibraphone's bar: a pure tone with a faint fourth partial that dies first, ringing out long. */
  private vibraphone(ctx: AudioContext, out: AudioNode, frequency: number, t: number, length: number, level: number): void {
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(level, t + 0.004);
    env.gain.setTargetAtTime(0, t + 0.004, length * 0.4);
    env.connect(out);
    const stop = t + length * 1.8;
    const body = ctx.createOscillator();
    body.frequency.value = frequency;
    body.connect(env);
    body.start(t);
    body.stop(stop);
    const partial = ctx.createOscillator();
    partial.frequency.value = frequency * 4;
    const partialGain = ctx.createGain();
    partialGain.gain.setValueAtTime(0.25, t);
    partialGain.gain.setTargetAtTime(0, t, 0.05);
    partial.connect(partialGain).connect(env);
    partial.start(t);
    partial.stop(t + 0.4);
  }

  private kick(ctx: AudioContext, out: AudioNode, t: number, level: number): void {
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.1);
    const env = ctx.createGain();
    env.gain.setValueAtTime(level, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(env).connect(out);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  /** A burst of band-passed noise: a brush's swish (with an `attack`, s) or a rim's click (none). */
  private noiseHit(ctx: AudioContext, out: AudioNode, t: number, frequency: number, length: number, level: number, attack: number): void {
    if (!this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = frequency;
    band.Q.value = attack > 0 ? 0.7 : 5;
    const env = ctx.createGain();
    if (attack > 0) {
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(level, t + attack);
    } else env.gain.setValueAtTime(level, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + attack + length);
    source.connect(band).connect(env).connect(out);
    source.start(t, Math.random() * 0.5);
    source.stop(t + attack + length + 0.02);
  }

  private build(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = audioContext();
    this.ctx = ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    // The speaker: band-limited and barely driven.
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = BAND.low;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = BAND.high;
    const drive = ctx.createWaveShaper();
    drive.curve = softClip();
    // The loudness (`out`) is ahead of everything; the music's own dip (`music`) is ahead of the speaker,
    // and the jingle joins behind it, so ducking never takes the announcer down with the song.
    const music = ctx.createGain();
    const songGain = ctx.createGain();
    songGain.connect(music);
    this.songGain = songGain;
    const voiceIn = ctx.createGain();
    this.spatialOut = new SpatialOut(ctx, audioBus(ctx, 'screens'), this.spatial);
    out.connect(high).connect(low).connect(drive).connect(this.spatialOut.input);
    music.connect(out);
    voiceIn.connect(out);
    this.out = out;
    this.music = music;
    this.voiceIn = voiceIn;

    // The vibraphone's tremolo: its gain wobbled around 1 by a slow sine.
    const vibes = ctx.createGain();
    vibes.gain.value = 1 - TREMOLO.depth / 2;
    const tremolo = ctx.createOscillator();
    tremolo.frequency.value = TREMOLO.hz;
    const depth = ctx.createGain();
    depth.gain.value = TREMOLO.depth / 2;
    tremolo.connect(depth).connect(vibes.gain);
    tremolo.start();
    vibes.connect(songGain);
    this.vibes = vibes;
    this.tremolo = tremolo;

    this.noise = whiteNoise(ctx, 1);
    const hiss = ctx.createBufferSource();
    hiss.buffer = this.noise;
    hiss.loop = true;
    const hissGain = ctx.createGain();
    hissGain.gain.value = HISS;
    hiss.connect(hissGain).connect(music);
    hiss.start(0, Math.random() * this.noise.duration);
    this.hiss = hiss;
    return ctx;
  }
}

/** One step of the tune's random walk on the scale: mostly a step, sometimes a leap, never off the ends. */
function walk(degree: number): number {
  const move = Math.random() < 0.75 ? (Math.random() < 0.5 ? -1 : 1) : Math.round((Math.random() - 0.5) * 6);
  return Math.max(0, Math.min(SCALE.length - 1, degree + move));
}

/** A song's two-bar hook: a phrase that starts on the beat, walks the scale and ends on a long note. */
function makeMotif(): TuneNote[] {
  const motif: TuneNote[] = [];
  let degree = 2 + Math.floor(Math.random() * 5);
  for (let i = 0; i < MOTIF_STEPS; i++) {
    degree = walk(degree);
    const sounded = i === 0 || (i < MOTIF_STEPS - 4 && Math.random() < NOTE_CHANCE);
    motif.push(sounded ? { degree, long: Math.random() < 0.35 } : null);
  }
  // The phrase comes to rest on the second bar's third beat, held.
  motif[MOTIF_STEPS - 4] = { degree: [0, 2, 4, 7][Math.floor(Math.random() * 4)]!, long: true };
  return motif;
}

/** The note of `chord` (its voicing or its bass, in any octave) nearest to `pitch` (semitones above the root). */
function nearestChordTone(pitch: number, chord: Chord): number {
  let best = pitch;
  let distance = Infinity;
  for (const tone of [chord.bass, ...chord.notes]) {
    const pc = tone % 12;
    const candidate = pc + 12 * Math.round((pitch - pc) / 12);
    const d = Math.abs(candidate - pitch);
    if (d < distance) {
      distance = d;
      best = candidate;
    }
  }
  return best;
}

function midi(note: number): number {
  return 440 * 2 ** ((note - 69) / 12);
}

function softClip(): Float32Array<ArrayBuffer> {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(1.3 * x) / Math.tanh(1.3);
  }
  return curve;
}
