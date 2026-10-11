import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { RunningWater } from '@/audio/water';
import { currentSeason, type SeasonName } from '@/time/season';
import { inHours } from '@/time/clock';
import type { Furniture, OccupancyAware } from '../../Furniture';
import type { ActivityAware } from '../../zone/lifecycle';
import type { DayNight } from '../../props/DayNight';
import { FOUNTAIN, POND } from '@/world/city/park';
import { FLAT_IN_STREET } from '@/world/measures/street';
import { quack } from './parkCues';
import { SoundGraph } from './soundGraph';
import { StreetEar, falloff } from './streetEar';
import { TreesAround } from './treesNear';
import { random } from '@/random';

interface ParkSoundsOptions {
  /** The ears (the camera). */
  listener: THREE.Object3D;
}

const MASTER = 0.55;
/** The fountain plays in these game hours (and never with the pond frozen), heard at half its level this far (m). */
const FOUNTAIN_PLAY = { from: 8, to: 21, halfAt: 9, peak: 0.55 };
/** The ducks on the pond: a call every so many real seconds by day, heard from this far at half. */
const DUCKS = { every: [6, 22] as const, halfAt: 12, within: 110 };
/** The wind in the leaves: trees within this reach count, a gust's slow swell (s) and how deep it goes. */
const RUSTLE = { reach: 16, level: 0.16, gust: 7, depth: 0.5, refresh: 0.25 };
/** How much each season's crowns rustle (bare in winter: a thin hiss in the twigs), and the band they rustle in (Hz). */
const LEAFAGE: Record<SeasonName, { level: number; band: number }> = {
  spring: { level: 0.9, band: 3400 },
  summer: { level: 1, band: 3000 },
  autumn: { level: 0.85, band: 4200 },
  winter: { level: 0.3, band: 5600 },
};

/** A point of the park (`city/park`, the flat's frame) in the street's (zone-local). */
function inStreet(x: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x + FLAT_IN_STREET.x, 0.4, z + FLAT_IN_STREET.z);
}

/**
 * The park and the trees heard (synthesised): the fountain in the pond splashing in its hours (`audio/water`'s running
 * water, deep and wide; silent with the pond frozen), the ducks quacking on the water by day, and everywhere the wind
 * in the trees round the listener (`treesNear`: a rush of leaves swelling with the gusts, crisper in autumn, a thin
 * hiss in the bare winter twigs), louder under more trees and with more wind. Only while the player is in the street;
 * let go while the zone is dormant.
 */
export class ParkSounds extends THREE.Group implements Furniture, Updatable, OccupancyAware, ActivityAware {
  readonly contactShadow = false;
  private graph: SoundGraph | null = null;
  private rustle: { gain: GainNode; band: BiquadFilterNode; leg: ReturnType<SoundGraph['leg']> } | null = null;
  private occupied = false;
  private active = true;
  private readonly fountain = new RunningWater({ peak: FOUNTAIN_PLAY.peak });
  private readonly fountainAt = inStreet(FOUNTAIN.x, FOUNTAIN.z);
  private readonly pondAt = inStreet(POND.x, POND.z);
  private readonly trees = new TreesAround(RUSTLE.reach);
  private readonly ear: StreetEar;
  private readonly world = new THREE.Vector3();
  private duckClock = 4;
  private treesClock = 0;
  private gustPhase = random() * 10;

  constructor(private readonly dayNight: DayNight, options: ParkSoundsOptions) {
    super();
    this.name = 'ParkSounds';
    this.ear = new StreetEar(options.listener, this);
    this.fountain.setRunning(true);
    this.fountain.setDepth(1);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.graph?.setLevel(occupied ? MASTER : 0, 0.4);
    if (!occupied) this.fountain.setLevel(0);
  }

  setZoneActive(active: boolean): void {
    this.active = active;
    this.fountain.setZoneActive(active);
    if (!active) this.teardown();
  }

  dispose(): void {
    this.teardown();
    this.fountain.dispose();
  }

  update(dt: number): void {
    if (!this.active || !this.occupied) return;
    const g = this.graph ?? this.build();
    if (!g) return;
    this.ear.update();
    const s = this.dayNight.state;
    const season = currentSeason();
    const frozen = season.name === 'winter' && season.depth > 0.5;

    // The fountain.
    this.localToWorld(this.world.copy(this.fountainAt));
    const playing = !frozen && inHours(s.hours, FOUNTAIN_PLAY);
    const fountain = this.ear.spatial(this.world);
    this.fountain.setSpatial(fountain.pan, fountain.walls, fountain.rear ?? 0);
    this.fountain.setLevel(playing ? falloff(this.ear.distance(this.world), FOUNTAIN_PLAY.halfAt) : 0);
    this.fountain.update(dt);

    // The ducks.
    this.duckClock -= dt;
    if (this.duckClock <= 0) {
      this.duckClock = DUCKS.every[0] + random() * (DUCKS.every[1] - DUCKS.every[0]);
      const a = random() * Math.PI * 2;
      this.localToWorld(this.world.set(this.pondAt.x + Math.cos(a) * (POND.rx - 4) * random(), 0.3, this.pondAt.z + Math.sin(a) * (POND.rz - 4) * random()));
      const d = this.ear.distance(this.world);
      if (!frozen && s.daylight > 0.2 && d < DUCKS.within) quack(g, g.shot(this.ear.spatial(this.world), 2), falloff(d, DUCKS.halfAt));
    }

    this.updateRustle(g, dt, s.wind, season.name);
  }

  /** The leaves round the listener in the wind: their level from the trees near and the gusts, from where the crowns are. */
  private updateRustle(g: SoundGraph, dt: number, wind: number, season: SeasonName): void {
    const r = this.rustle;
    if (!r) return;
    this.treesClock -= dt;
    if (this.treesClock <= 0) {
      this.treesClock = RUSTLE.refresh;
      this.trees.update(this.ear.local);
    }
    this.gustPhase += dt / RUSTLE.gust;
    const gust = 1 - RUSTLE.depth + RUSTLE.depth * (0.5 + 0.5 * Math.sin(this.gustPhase * 2.1) * Math.sin(this.gustPhase * 0.77 + 1));
    const leafage = LEAFAGE[season];
    const level = RUSTLE.level * leafage.level * Math.min(1, this.trees.leafy / 2) * Math.pow(Math.max(0, wind), 1.4) * gust;
    r.gain.gain.setTargetAtTime(level, g.now, 0.5);
    r.band.frequency.setTargetAtTime(leafage.band * (0.85 + 0.3 * gust), g.now, 0.8);
    if (this.trees.leafy > 0) {
      const side = this.ear.spatial(this.localToWorld(this.world.copy(this.trees.centre)));
      r.leg.set(side.pan * 0.6, side.walls, false, side.rear ?? 0);
    }
  }

  private teardown(): void {
    this.graph?.stop();
    this.graph = null;
    this.rustle = null;
  }

  private build(): SoundGraph | null {
    const g = SoundGraph.create(this.occupied ? MASTER : 0);
    if (!g) return null;
    this.graph = g;
    const leg = g.leg();
    const gain = g.gain();
    const band = g.filter('bandpass', 3000, 0.45);
    g.loop().connect(band).connect(gain).connect(leg.input);
    // The body of it: a lower, softer band of the same rush.
    g.loop().connect(g.filter('bandpass', 900, 0.6)).connect(g.gain(0.35)).connect(gain);
    this.rustle = { gain, band, leg };
    return g;
  }
}
