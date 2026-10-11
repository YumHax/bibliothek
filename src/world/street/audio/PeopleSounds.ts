import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { playFootfall } from '@/audio/footfall';
import type { FootSurface } from '@/audio/footSurface';
import { playMurmur } from '@/audio/murmur';
import { onLineShown } from '@/notices';
import type { SpatialOut } from '@/audio/spatial';
import type { Furniture, OccupancyAware } from '../../Furniture';
import type { ActivityAware } from '../../zone/lifecycle';
import type { DayNight } from '../../props/DayNight';
import type { Walker } from '../../people/Walker';
import { SoundGraph } from './soundGraph';
import { StreetEar, falloff } from './streetEar';
import { random } from '@/random';
import { loudness } from '@/audio/hearing';

interface PeopleSoundsOptions {
  listener: THREE.Object3D;
  /** Everyone walking the street (a live list: the builders add to it as they place people), zone-local. */
  walkers: readonly Walker[];
  /** What is underfoot at a zone-local point (`streetSurfaceAt`). */
  surfaceAt: (local: THREE.Vector3) => FootSurface;
}

const MASTER = 0.55;
/** Footsteps are heard from this close (m), the nearest few at most. */
const STEPS_WITHIN = 11;
const MAX_STEPPERS = 5;
/** A stride (m) is a footfall; a jump longer than this is someone put somewhere, not a step. */
const STRIDE = 0.72;
const JUMP = 1.5;
/** The murmur: people within this (m) count, and its level when there are this many or more. */
const MURMUR_WITHIN = 14;
const MURMUR_FULL = 5;
/** Voices in the murmur: each a voiced throat (its own pitch, Hz) through two formants hopping from vowel to vowel. */
const BABBLE = { voices: 6, pitch: [95, 250] as const, syllable: [0.09, 0.22] as const };
/** Vowels' first and second formants (Hz): a, e, i, o, u, and the schwa. */
const VOWELS: readonly (readonly [number, number])[] = [[730, 1090], [530, 1840], [300, 2250], [570, 840], [320, 900], [500, 1500]];
/** A line said over someone's head in the street is heard as a murmur this loud at the mouth, half at `halfAt` m. */
const SPEECH = { level: 0.35, halfAt: 3.5, within: 22 };

interface BabbleVoice {
  gain: GainNode;
  throat: OscillatorNode;
  f1: BiquadFilterNode;
  f2: BiquadFilterNode;
  pitch: number;
  phrase: number;
  syllable: number;
  talking: boolean;
}

interface Gait {
  last: THREE.Vector3;
  walked: number;
  stride: number;
}

/**
 * The people of the street heard as well as seen: the footsteps of whoever walks by close
 * (`playFootfall`, on the paving, the asphalt or the grass where they are, wet or snowy as the
 * ground is; heels and soles a little different from one walker to the next), a soft murmur
 * of voices that swells with how many people are about (voiced babble: each voice its own pitch,
 * syllables hopping from vowel to vowel), and each line said over someone's head as it shows
 * (`notices.onLineShown`), murmured in their own voice from where they stand. Only while the player is in the street;
 * let go while the zone is dormant.
 */
export class PeopleSounds extends THREE.Group implements Furniture, Updatable, OccupancyAware, ActivityAware {
  readonly contactShadow = false;
  private graph: SoundGraph | null = null;
  private murmur: { gain: GainNode; leg: SpatialOut; voices: BabbleVoice[] } | null = null;
  private stopListening: (() => void) | null = null;
  private readonly pitches = new WeakMap<Walker, number>();
  private occupied = false;
  private active = true;
  private readonly ear: StreetEar;
  private readonly gaits = new WeakMap<Walker, Gait>();
  private readonly world = new THREE.Vector3();
  private readonly centre = new THREE.Vector3();
  private readonly near: { walker: Walker; d: number }[] = [];

  constructor(private readonly dayNight: DayNight, private readonly options: PeopleSoundsOptions) {
    super();
    this.name = 'PeopleSounds';
    this.ear = new StreetEar(options.listener, this);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.graph?.setLevel(occupied ? MASTER : 0, 0.4);
    if (occupied && !this.stopListening) this.stopListening = onLineShown((anchor, text) => this.voice(anchor, text));
    else if (!occupied) {
      this.stopListening?.();
      this.stopListening = null;
    }
  }

  setZoneActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.graph?.stop();
      this.graph = null;
      this.murmur = null;
    }
  }

  dispose(): void {
    this.setZoneActive(false);
    this.stopListening?.();
    this.stopListening = null;
  }

  /** A line just shown over the head of someone of the street: their murmur, from where they stand. */
  private voice(anchor: THREE.Object3D, text: string): void {
    const g = this.graph;
    if (!g || !this.occupied || !this.active) return;
    const walker = this.options.walkers.find((w) => w.speechAnchor === anchor);
    if (!walker || !walker.visible) return;
    this.ear.update();
    this.localToWorld(this.world.copy(walker.position));
    this.world.y += 1.6;
    const d = this.ear.distance(this.world);
    if (d > SPEECH.within) return;
    playMurmur(text, SPEECH.level * falloff(d, SPEECH.halfAt), this.ear.spatial(this.world), this.pitchOf(walker), g.master);
  }

  /** A walker's voice: deep to light, their own for as long as they walk the street. */
  private pitchOf(walker: Walker): number {
    let pitch = this.pitches.get(walker);
    if (pitch === undefined) {
      pitch = 0.1 + random() * 0.8;
      this.pitches.set(walker, pitch);
    }
    return pitch;
  }

  update(dt: number): void {
    if (!this.active || !this.occupied) return;
    const g = this.graph ?? this.build();
    if (!g) return;
    this.ear.update();
    const s = this.dayNight.state;
    this.near.length = 0;
    let crowd = 0;
    this.centre.set(0, 0, 0);
    for (const walker of this.options.walkers) {
      const gait = this.gaitOf(walker);
      // Only those drawn: someone the people budget (or a door) faded out is not heard either.
      if (!walker.drawn || !walker.visible) {
        gait.last.copy(walker.position);
        continue;
      }
      this.localToWorld(this.world.copy(walker.position));
      const d = this.ear.distance(this.world);
      if (d < MURMUR_WITHIN) {
        // Weighted like `crowd`, so the centre divided by it is the weighted mean of where they are.
        const weight = 1 - d / MURMUR_WITHIN;
        crowd += weight;
        this.centre.addScaledVector(this.world, weight);
      }
      const moved = gait.last.distanceTo(walker.position);
      gait.last.copy(walker.position);
      if (moved > JUMP || !walker.isWalking) continue;
      gait.walked += moved;
      if (d < STEPS_WITHIN) this.near.push({ walker, d });
      else gait.walked %= gait.stride;
    }
    // Footfalls of the nearest walkers, each on their own stride.
    this.near.sort((a, b) => a.d - b.d);
    for (const [i, { walker, d }] of this.near.entries()) {
      const gait = this.gaitOf(walker);
      if (gait.walked < gait.stride) continue;
      gait.walked -= gait.stride;
      if (i >= MAX_STEPPERS) continue;
      this.localToWorld(this.world.copy(walker.position));
      const force = 0.5 * loudness(d, { shape: 'inverseSquare', referenceDistance: 3.2, boost: 1.6, maxDistance: Infinity });
      if (force < 0.02) continue;
      playFootfall(g.ctx, g.shot(this.ear.spatial(this.world), 0.8), this.options.surfaceAt(walker.position), { force, wetness: s.wetness, snowCover: s.snowCover });
    }
    this.updateMurmur(g, dt, crowd);
  }

  private gaitOf(walker: Walker): Gait {
    let gait = this.gaits.get(walker);
    if (!gait) {
      // Long legs and short: a stride of their own.
      gait = { last: walker.position.clone(), walked: random() * STRIDE, stride: STRIDE * (0.88 + random() * 0.24) };
      this.gaits.set(walker, gait);
    }
    return gait;
  }

  /** The voices about: louder with more people near, from where most of them are. */
  private updateMurmur(g: SoundGraph, dt: number, crowd: number): void {
    const m = this.murmur;
    if (!m) return;
    const level = 0.05 * Math.min(1, crowd / MURMUR_FULL);
    m.gain.gain.setTargetAtTime(level, g.now, 0.8);
    if (crowd > 0) {
      const side = this.ear.spatial(this.centre.divideScalar(crowd));
      m.leg.set(side.pan * 0.5, side.walls, false, side.rear ?? 0);
    }
    if (level < 0.002) return;
    const now = g.now;
    for (const voice of m.voices) {
      voice.phrase -= dt;
      if (voice.phrase <= 0) {
        voice.talking = !voice.talking && random() < 0.3 + crowd / MURMUR_FULL;
        voice.phrase = voice.talking ? 0.6 + random() * 2.2 : 0.8 + random() * 3;
        if (!voice.talking) voice.gain.gain.setTargetAtTime(0, now, 0.08);
      }
      if (!voice.talking) continue;
      voice.syllable -= dt;
      if (voice.syllable > 0) continue;
      // A syllable: a vowel's formants, the voice's pitch lilting, a little stress now and then.
      voice.syllable = BABBLE.syllable[0] + random() * (BABBLE.syllable[1] - BABBLE.syllable[0]);
      const [f1, f2] = VOWELS[Math.floor(random() * VOWELS.length)]!;
      voice.f1.frequency.setTargetAtTime(f1, now, 0.025);
      voice.f2.frequency.setTargetAtTime(f2, now, 0.025);
      voice.throat.frequency.setTargetAtTime(voice.pitch * (0.9 + random() * 0.25), now, 0.05);
      const stress = random() < 0.25 ? 1 : 0.55 + random() * 0.3;
      voice.gain.gain.setTargetAtTime(stress, now, 0.02);
      voice.gain.gain.setTargetAtTime(stress * 0.35, now + voice.syllable * 0.6, 0.03);
    }
  }

  private build(): SoundGraph | null {
    const g = SoundGraph.create(this.occupied ? MASTER : 0);
    if (!g) return null;
    this.graph = g;
    const leg = g.leg();
    const gain = g.gain();
    gain.connect(g.filter('lowpass', 1600, 0.6)).connect(leg.input);
    const voices = Array.from({ length: BABBLE.voices }, (): BabbleVoice => {
      const pitch = BABBLE.pitch[0] + random() * (BABBLE.pitch[1] - BABBLE.pitch[0]);
      const throat = g.oscillator('sawtooth', pitch);
      const f1 = g.filter('bandpass', 600, 6);
      const f2 = g.filter('bandpass', 1400, 8);
      const v = g.gain();
      throat.connect(f1).connect(v);
      throat.connect(f2).connect(g.gain(0.6)).connect(v);
      // Breath and consonants over the voice.
      g.loop().connect(g.filter('bandpass', 2600 + random() * 1600, 2)).connect(g.gain(0.12)).connect(v);
      v.connect(gain);
      return { gain: v, throat, f1, f2, pitch, phrase: random() * 2, syllable: 0, talking: false };
    });
    this.murmur = { gain, leg, voices };
    return g;
  }
}
