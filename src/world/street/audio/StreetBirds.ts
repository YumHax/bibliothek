import * as THREE from 'three';
import { birdNote } from '@/audio/street/streetVoices';
import type { SeasonName } from '@/time/season';
import type { SoundGraph } from './soundGraph';
import type { TreesNear } from './treesNear';
import { random } from '@/random';

/** What the birds go by: the hour, how light it is, the weather, what lies on the ground. */
interface BirdWeather {
  readonly hours: number;
  readonly daylight: number;
  readonly rain: number;
  readonly snow: number;
  readonly snowCover: number;
}

/** Each kind's share of the phrases by season (sparrows, blackbirds, tits, robins, swifts, crows), loosely a European city's. */
const MIX: Record<SeasonName, Record<Kind, number>> = {
  spring: { sparrow: 0.4, blackbird: 0.3, tit: 0.2, robin: 0.05, swift: 0, crow: 0.05 },
  summer: { sparrow: 0.45, blackbird: 0.15, tit: 0.1, robin: 0, swift: 0.25, crow: 0.05 },
  autumn: { sparrow: 0.5, blackbird: 0.1, tit: 0.15, robin: 0.15, swift: 0, crow: 0.1 },
  winter: { sparrow: 0.35, blackbird: 0.05, tit: 0.15, robin: 0.25, swift: 0, crow: 0.2 },
};
/** How much singing there is at all by season (spring is the loudest, winter thin). */
const SEASON_SONG: Record<SeasonName, number> = { spring: 1.4, summer: 1, autumn: 0.6, winter: 0.35 };
/** More birds where the trees are: the song's share with no tree near, and what each unit of leafage adds (`TreesNear`). */
const LEAFY = { bare: 0.5, per: 0.3, most: 1.6 };
/** The tawny owl at night: game hours it calls between, real seconds between two calls (autumn and winter: more often). */
const OWL = { from: 21.5, to: 5.5, every: [35, 110] as const, lean: 0.5 };

type Kind = 'sparrow' | 'blackbird' | 'tit' | 'robin' | 'swift' | 'crow';

/**
 * The street's birds, synthesised (after `StreetAmbience`'s through the windows): sparrows
 * chirping in the trees all day, blackbirds fluting, tits' two-note calls, a robin's thin song in
 * autumn and winter, screaming swifts over the roofs on summer evenings, a crow now and then; a
 * dawn chorus round sunrise (spring loudest), fewer in the cold, none in the rain or at night,
 * and over settled snow only the hardy ones. Each phrase comes from a tree round the listener (more
 * birds where there are more trees: the park is livelier than the street's far end), the swifts from
 * over the roofs. At night a tawny owl calls from the trees, more in autumn and winter.
 */
export class StreetBirds {
  private clock = 2;
  private owlClock = 20;

  constructor(private readonly season: () => SeasonName) {}

  /**
   * Plays the next phrase when it is due, from a crown round the listener (`trees.perch()`) or, with none near, from a
   * gutter: `out` gives an input placed there (null: somewhere round the listener). By night, the owl.
   */
  update(dt: number, g: SoundGraph, sky: BirdWeather, trees: TreesNear, out: (perch: THREE.Vector3 | null, seconds: number) => AudioNode): void {
    const season = this.season();
    const day = THREE.MathUtils.smoothstep(sky.daylight, 0.15, 0.45);
    const dawn = Math.max(0, 1 - Math.abs(sky.hours - 6.3) / 1.4);
    const dusk = Math.max(0, 1 - Math.abs(sky.hours - 20) / 1.2);
    const weather = (1 - Math.min(1, sky.rain * 3)) * (1 - sky.snow * 0.7);
    const leafy = Math.min(LEAFY.most, LEAFY.bare + LEAFY.per * trees.leafy);
    const song = day * weather * SEASON_SONG[season] * (0.45 + 1.4 * dawn) * leafy;
    this.owl(dt, g, sky, season, weather, trees, out);
    this.clock -= dt;
    if (this.clock > 0) return;
    // Phrases come quicker the more there is to sing: every 1.5 s in a spring dawn, every 10 s on a grey winter noon.
    this.clock = (1.2 + random() * 4) / Math.max(0.15, song);
    if (song < 0.05 && !(season === 'summer' && dusk > 0.2 && weather > 0.5)) return;
    const kind = pick(MIX[season], sky.snowCover > 0.4, season === 'summer' ? dusk : 0);
    // Swifts scream over the roofs, the rest sing from the trees.
    phrase(g, out(kind === 'swift' ? null : trees.perch(), 3), kind, Math.min(1.2, 0.6 + song * 0.5));
  }

  /** The tawny owl from the park's and the street's trees at night, more in autumn and winter, never in the rain. */
  private owl(dt: number, g: SoundGraph, sky: BirdWeather, season: SeasonName, weather: number, trees: TreesNear, out: (perch: THREE.Vector3 | null, seconds: number) => AudioNode): void {
    const night = sky.hours >= OWL.from || sky.hours < OWL.to;
    if (!night || weather < 0.6) return;
    this.owlClock -= dt;
    if (this.owlClock > 0) return;
    const keen = season === 'autumn' || season === 'winter' ? 1 : OWL.lean;
    this.owlClock = (OWL.every[0] + random() * (OWL.every[1] - OWL.every[0])) / keen;
    const strength = 0.4 + 0.6 * Math.min(1, trees.leafy / 2);
    hoot(g, out(trees.perch(), 6), strength, random() < 0.35);
  }
}

/**
 * The tawny owl: the male's long hoot, a pause, then the quavering trill and a last long hoot; or the female's sharp
 * "ke-wick". A pure, breathy tone low in the voice's range.
 */
function hoot(g: SoundGraph, out: AudioNode, strength: number, female: boolean): void {
  const t = g.now + 0.05;
  const note = (at: number, from: number, to: number, length: number, level: number, quaver = 0): void => {
    const osc = g.ctx.createOscillator();
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.linearRampToValueAtTime(to, at + length);
    if (quaver > 0) {
      const lfo = g.ctx.createOscillator();
      lfo.frequency.value = quaver;
      const depth = g.gain(from * 0.04);
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(at);
      lfo.stop(at + length + 0.05);
    }
    const env = g.gain();
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(level, at + length * 0.25);
    env.gain.setValueAtTime(level, at + length * 0.6);
    env.gain.linearRampToValueAtTime(0, at + length);
    osc.connect(env).connect(out);
    osc.start(at);
    osc.stop(at + length + 0.05);
    // The breath in it.
    const breath = g.filter('bandpass', from * 2, 1.5);
    breath.connect(out);
    g.shaped(breath, at, [[length * 0.3, level * 0.25], [length, 0]]);
    window.setTimeout(() => breath.disconnect(), (at - g.now + length + 1) * 1000); // convention-ok: audio
  };
  const level = 0.05 * strength;
  if (female) {
    note(t, 1500, 1900, 0.12, level);
    note(t + 0.14, 1900, 1300, 0.25, level * 0.8);
    return;
  }
  note(t, 390, 370, 0.9, level);
  let at = t + 0.9 + 2.2 + random() * 0.8;
  for (let i = 0; i < 3; i++, at += 0.2) note(at, 360, 350, 0.14, level * 0.6);
  note(at + 0.05, 380, 355, 1.3, level, 7);
}

/** A kind drawn from `mix`; over snow only sparrows, robins and crows; swifts more at a summer dusk. */
function pick(mix: Record<Kind, number>, snowy: boolean, dusk: number): Kind {
  const weights = { ...mix };
  if (snowy) weights.blackbird = weights.tit = weights.swift = 0;
  weights.swift *= 1 + dusk * 4;
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  let r = random() * total;
  for (const [kind, w] of Object.entries(weights) as [Kind, number][]) {
    r -= w;
    if (r <= 0) return kind;
  }
  return 'sparrow';
}

/** One phrase of `kind` into `out`, at `strength`. */
function phrase(g: SoundGraph, out: AudioNode, kind: Kind, strength: number): void {
  let t = g.now + 0.02 + random() * 0.2;
  const note = (from: number, to: number, length: number, level: number): void => {
    birdNote(g.ctx, out, { at: t, from, to, sweep: length, attack: length * 0.2, length, level: level * strength });
  };
  if (kind === 'sparrow') {
    const notes = 2 + Math.floor(random() * 4);
    for (let i = 0; i < notes; i++) {
      const f = 3600 + random() * 1500;
      note(f, f * 0.7, 0.07, 0.05);
      t += 0.09 + random() * 0.06;
    }
  } else if (kind === 'blackbird') {
    const notes = 3 + Math.floor(random() * 4);
    const base = 1400 + random() * 800;
    for (let i = 0; i < notes; i++) {
      const length = 0.12 + random() * 0.18;
      const f0 = base * (0.85 + random() * 0.3);
      note(f0, f0 * (random() < 0.5 ? 1.35 : 0.75), length, 0.04);
      t += length + 0.05 + random() * 0.12;
    }
  } else if (kind === 'tit') {
    // "Teacher, teacher": a high and a low note, three or four times.
    const high = 5200 + random() * 600;
    for (let i = 0; i < 3 + Math.floor(random() * 2); i++) {
      note(high, high * 0.97, 0.08, 0.035);
      t += 0.1;
      note(high * 0.72, high * 0.7, 0.1, 0.035);
      t += 0.16;
    }
  } else if (kind === 'robin') {
    // A thin, wistful trickle of high notes going up and down.
    for (let i = 0; i < 6 + Math.floor(random() * 5); i++) {
      const f = 3000 + random() * 3500;
      note(f, f * (0.8 + random() * 0.45), 0.06 + random() * 0.08, 0.025);
      t += 0.08 + random() * 0.07;
    }
  } else if (kind === 'swift') {
    // A party screaming past over the roofs: a long buzzy shriek, three or four birds overlapping.
    for (let b = 0; b < 2 + Math.floor(random() * 3); b++) {
      const start = t + b * (0.08 + random() * 0.15);
      for (let i = 0; i < 14; i++) {
        const f = 6200 + random() * 900;
        birdNote(g.ctx, out, { at: start + i * 0.035, from: f, to: f * 0.9, sweep: 0.03, attack: 0.005, length: 0.03, level: 0.03 * strength * (1 - i / 18) });
      }
    }
  } else {
    // A crow: two or three hoarse caws.
    for (let i = 0; i < 2 + Math.floor(random() * 2); i++) {
      caw(g, out, t, 0.12 * strength);
      t += 0.45 + random() * 0.2;
    }
  }
}

/** A hoarse caw: a buzzing sawtooth through a nasal band, falling a little. */
function caw(g: SoundGraph, out: AudioNode, at: number, level: number): void {
  const osc = g.ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(620, at);
  osc.frequency.linearRampToValueAtTime(520, at + 0.3);
  const band = g.filter('bandpass', 1300, 2.2);
  const env = g.gain();
  env.gain.setValueAtTime(0, at);
  env.gain.linearRampToValueAtTime(level, at + 0.03);
  env.gain.setValueAtTime(level, at + 0.22);
  env.gain.linearRampToValueAtTime(0, at + 0.32);
  osc.connect(band).connect(env).connect(out);
  osc.start(at);
  osc.stop(at + 0.34);
  window.setTimeout(() => band.disconnect(), 1500); // convention-ok: audio
}
