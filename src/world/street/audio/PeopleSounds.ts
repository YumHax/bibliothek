import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { playFootfall } from '@/audio/footfall';
import type { FootSurface } from '@/audio/footSurface';
import type { SpatialOut } from '@/audio/spatial';
import type { Furniture, OccupancyAware } from '../../Furniture';
import type { ActivityAware } from '../../zone/lifecycle';
import type { DayNight } from '../../props/DayNight';
import type { Walker } from '../../people/Walker';
import { SoundGraph } from './soundGraph';
import { StreetEar } from './streetEar';

export interface PeopleSoundsOptions {
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
const FORMANTS = [480, 690, 900, 1150];

interface Gait {
  last: THREE.Vector3;
  walked: number;
  stride: number;
}

/**
 * The people of the street heard as well as seen: the footsteps of whoever walks by close
 * (`playFootfall`, on the paving, the asphalt or the grass where they are, wet or snowy as the
 * ground is; heels and soles a little different from one walker to the next), and a soft murmur
 * of voices that swells with how many people are about. Only while the player is in the street;
 * let go while the zone is dormant.
 */
export class PeopleSounds extends THREE.Group implements Furniture, Updatable, OccupancyAware, ActivityAware {
  readonly contactShadow = false;
  private graph: SoundGraph | null = null;
  private murmur: { gain: GainNode; leg: SpatialOut; voices: { gain: GainNode; phrase: number; talking: boolean }[] } | null = null;
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
    this.ear = new StreetEar(options.listener);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.graph?.setLevel(occupied ? MASTER : 0, 0.4);
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
      const force = 0.5 * Math.min(1, 1.6 / (1 + (d / 3.2) ** 2));
      if (force < 0.02) continue;
      playFootfall(g.ctx, g.shot(this.ear.spatial(this.world), 0.8), this.options.surfaceAt(walker.position), { force, wetness: s.wetness, snowCover: s.snowCover });
    }
    this.updateMurmur(g, dt, crowd);
  }

  private gaitOf(walker: Walker): Gait {
    let gait = this.gaits.get(walker);
    if (!gait) {
      // Long legs and short: a stride of their own.
      gait = { last: walker.position.clone(), walked: Math.random() * STRIDE, stride: STRIDE * (0.88 + Math.random() * 0.24) };
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
      m.leg.set(side.pan * 0.5, 0, false, side.rear ?? 0);
    }
    if (level < 0.002) return;
    for (const voice of m.voices) {
      voice.phrase -= dt;
      if (voice.phrase > 0) continue;
      voice.talking = !voice.talking && Math.random() < 0.3 + crowd / MURMUR_FULL;
      voice.phrase = voice.talking ? 0.6 + Math.random() * 2 : 0.8 + Math.random() * 3;
      voice.gain.gain.setTargetAtTime(voice.talking ? 0.4 + Math.random() * 0.6 : 0, g.now, 0.12);
    }
  }

  private build(): SoundGraph | null {
    const g = SoundGraph.create(this.occupied ? MASTER : 0);
    if (!g) return null;
    this.graph = g;
    const leg = g.leg();
    const gain = g.gain();
    gain.connect(g.filter('lowpass', 1600, 0.6)).connect(leg.input);
    const voices = FORMANTS.map((f) => {
      const v = g.gain();
      g.loop().connect(g.filter('bandpass', f * (0.92 + Math.random() * 0.16), 3.5)).connect(v).connect(gain);
      return { gain: v, phrase: Math.random() * 2, talking: false };
    });
    this.murmur = { gain, leg, voices };
    return g;
  }
}
