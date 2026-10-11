import { STYLES } from '@/audio/JukeboxTune';
import type { SoundGraph } from './soundGraph';
import { unitOf } from '@/random';

type Style = (typeof STYLES)[number];

const LOOKAHEAD = 0.2;
/** Seconds of a song, and the gap between two (the jukebox changing record, the band tuning up). */
const SONG = [120, 200] as const;
const GAP = [3, 7] as const;

interface BarMusicOptions {
  /** The whole band (hats, the lead) as heard close in the open; else only what comes through a door (kick, snare, bass, a pad). */
  full?: boolean;
  /** Which of the jukebox's stations it plays (`JukeboxTune.STYLES` names); all of them by default. */
  styles?: readonly string[];
}

/**
 * Music in the street, synthesised from the arcade jukebox's own stations (`JukeboxTune.STYLES`: their tempos,
 * progressions, drum and bass patterns, lead and pad): a bar's jukebox through its door in the evening (only the
 * kick, the snare, the bass walking the chords and a pad come through; the owner low-passes it) or, `full`, a band
 * heard in the open (a gig, the bandstand: hats and a lead too). A song is a station, a key, a tempo and a
 * progression drawn from the seed and the song's number; between two, a few seconds' silence (`betweenSongs`, the
 * moment a crowd claps). `update` schedules a moment ahead into `out` while `level` is above nothing.
 */
export class BarMusic {
  private song = 0;
  private style: Style = STYLES[0]!;
  private sixteenth = 0.14;
  private root = 45;
  private progression: readonly (readonly number[])[] = [[0, 3, 7]];
  private step = 0;
  private nextTime = 0;
  private songLeft = 0;
  private gapLeft = 0;
  private draws = 0;
  private lead = 3;
  private hats: { g: SoundGraph; out: AudioNode; band: BiquadFilterNode } | null = null;
  private readonly styles: readonly Style[];

  constructor(private readonly seed: number, private readonly options: BarMusicOptions = {}) {
    const named = options.styles ? STYLES.filter((s) => options.styles!.includes(s.name)) : STYLES;
    this.styles = named.length > 0 ? named : STYLES;
    this.pickSong();
  }

  /** True in the pause between two songs (and for the first frame of one): when listeners clap. */
  get betweenSongs(): boolean {
    return this.gapLeft > 0;
  }

  update(dt: number, g: SoundGraph, out: AudioNode, level: number): void {
    const now = g.now;
    if (level < 0.005) {
      this.nextTime = now + 0.05;
      return;
    }
    if (this.gapLeft > 0) {
      this.gapLeft -= dt;
      if (this.gapLeft <= 0) this.pickSong();
      this.nextTime = now + 0.05;
      return;
    }
    this.songLeft -= dt;
    if (this.songLeft <= 0) {
      this.gapLeft = GAP[0] + this.random() * (GAP[1] - GAP[0]);
      return;
    }
    if (this.nextTime < now) this.nextTime = now + 0.02;
    while (this.nextTime < now + LOOKAHEAD) {
      this.tick(g, out, this.nextTime);
      this.nextTime += this.sixteenth;
    }
  }

  private pickSong(): void {
    this.song++;
    const style = this.styles[Math.floor(this.random() * this.styles.length)]!;
    this.style = style;
    const bpm = style.bpm[0] + this.random() * (style.bpm[1] - style.bpm[0]);
    this.sixteenth = 60 / bpm / 4;
    this.root = style.root[0] + Math.floor(this.random() * (style.root[1] - style.root[0] + 1));
    this.progression = style.progressions[Math.floor(this.random() * style.progressions.length)]!;
    this.songLeft = SONG[0] + this.random() * (SONG[1] - SONG[0]);
    this.step = 0;
  }

  /** One sixteenth of the station's patterns: drums, the bass on the chord's root, a pad at each bar, the lead (full). */
  private tick(g: SoundGraph, out: AudioNode, time: number): void {
    const style = this.style;
    const s = this.step % 16;
    const chord = this.progression[Math.floor(this.step / 16) % this.progression.length]!;
    const full = this.options.full === true;
    if (style.kick.includes(s)) this.kick(g, out, time);
    if (style.snare.includes(s)) g.burst(out, time, 0.06, full ? 0.12 : 0.08);
    if (full && style.hat.includes(s)) g.burst(this.hatBand(g, out), time, 0.025, 0.05);
    if (style.bass.includes(s)) {
      const octave = style.bassOctave.includes(s) ? 12 : 0;
      this.note(g, out, style.name === 'CHIPTUNE' ? 'triangle' : 'sawtooth', midi(this.root - 24 + chord[0]! + octave), time, this.sixteenth * 1.6, 0.3);
    }
    if (style.pad && s === 0) for (const n of chord) this.note(g, out, style.pad, midi(this.root + n), time, this.sixteenth * 15, full ? 0.035 : 0.03);
    if (full && this.random() < style.leadDensity) {
      let pitch: number;
      if (style.arpeggio) pitch = chord[s % chord.length]! + (s % 8 >= 4 ? 12 : 0);
      else {
        this.lead = Math.max(0, Math.min(style.scale.length - 1, this.lead + Math.round((this.random() - 0.5) * 3)));
        pitch = style.scale[this.lead]!;
      }
      this.note(g, out, style.lead, midi(this.root + 12 + pitch), time, this.sixteenth * (this.random() < 0.25 ? 2.8 : 0.9), 0.06);
    }
    this.step = (this.step + 1) % (16 * this.progression.length);
  }

  /** The hats' band into `out`, made once per graph and output. */
  private hatBand(g: SoundGraph, out: AudioNode): BiquadFilterNode {
    if (this.hats?.g !== g || this.hats.out !== out) {
      const band = g.filter('highpass', 7000, 0.8);
      band.connect(out);
      this.hats = { g, out, band };
    }
    return this.hats.band;
  }

  private kick(g: SoundGraph, out: AudioNode, time: number): void {
    const osc = g.ctx.createOscillator();
    osc.frequency.setValueAtTime(120, time);
    osc.frequency.exponentialRampToValueAtTime(42, time + 0.12);
    const env = g.gain();
    env.gain.setValueAtTime(0.7, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.25);
    osc.connect(env).connect(out);
    osc.start(time);
    osc.stop(time + 0.27);
  }

  private note(g: SoundGraph, out: AudioNode, type: OscillatorType, frequency: number, time: number, length: number, level: number): void {
    const osc = g.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = frequency;
    const env = g.gain();
    env.gain.setValueAtTime(0, time);
    env.gain.linearRampToValueAtTime(level, time + 0.01);
    env.gain.setTargetAtTime(0, time + length, 0.04);
    osc.connect(env).connect(out);
    osc.start(time);
    osc.stop(time + length + 0.25);
  }

  /** The music's own draws, song after song. */
  private random(): number {
    return unitOf(this.seed, this.song, ++this.draws);
  }
}

function midi(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}
