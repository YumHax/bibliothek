import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { SpatialOut } from '@/audio/spatial';
import type { Furniture, OccupancyAware } from '../../Furniture';
import type { ActivityAware } from '../../zone/lifecycle';
import type { Vec2 } from '../streetPlan';
import { BarMusic } from './BarMusic';
import { SoundGraph } from './soundGraph';
import { StreetEar, falloff } from './streetEar';
import { applause } from './townCues';

interface LiveMusicOptions {
  /** The ears (the camera). */
  listener: THREE.Object3D;
  /** Where the band plays (zone-local floor point): a bar's door for a gig inside, the bandstand's middle. */
  at: Vec2;
  /** How much it plays now, 0 (not on) .. 1 (in full swing): the owner's schedule (Thursday's gig, Sunday's concert). */
  playing: () => number;
  /** Heard through a door (a gig inside a bar: the lows and a murmur of the rest), else in the open. */
  throughDoor?: boolean;
  /** The jukebox stations the band plays (`JukeboxTune.STYLES` names): FUNK for a pub band, ITALO DISCO for a dance… */
  styles?: readonly string[];
  /** How many clap between songs (0: nobody). */
  audience?: () => number;
  /** Its draws (songs, keys): a number of its own. */
  seed: number;
  /** Half its level at this many metres. Default 14 in the open, 7 through a door. */
  halfAt?: number;
}

const MASTER = 0.6;
/** A band in the open is louder than a jukebox: its level at the source. */
const LEVEL = { open: 0.75, door: 0.55 };

/**
 * A band playing live in the street (synthesised from the jukebox's stations, `BarMusic` full): a gig inside a bar
 * heard through its door (the bass and the kick, the rest a muffled murmur) or a concert at the bandstand in the open,
 * whenever its owner says it plays (`playing`), with its audience clapping between songs (`audience`). Positional
 * through the street's ear (round a corner it is a thud). Only while the player is in the street; let go while the
 * zone is dormant. Placed by whoever schedules the music (the bar's gig, the park's concerts).
 */
export class LiveMusic extends THREE.Group implements Furniture, Updatable, OccupancyAware, ActivityAware {
  readonly contactShadow = false;
  private graph: SoundGraph | null = null;
  private out: { gain: GainNode; leg: SpatialOut } | null = null;
  private occupied = false;
  private active = true;
  private wasBetween = false;
  private readonly music: BarMusic;
  private readonly ear: StreetEar;
  private readonly at: THREE.Vector3;
  private readonly world = new THREE.Vector3();

  constructor(private readonly options: LiveMusicOptions) {
    super();
    this.name = 'LiveMusic';
    this.ear = new StreetEar(options.listener, this);
    this.music = new BarMusic(options.seed, { full: true, styles: options.styles });
    this.at = new THREE.Vector3(options.at[0], 1.5, options.at[1]);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.graph?.setLevel(occupied ? MASTER : 0, 0.5);
  }

  setZoneActive(active: boolean): void {
    this.active = active;
    if (!active) this.teardown();
  }

  dispose(): void {
    this.teardown();
  }

  update(dt: number): void {
    if (!this.active || !this.occupied) return;
    const g = this.graph ?? this.build();
    const out = this.out;
    if (!g || !out) return;
    this.ear.update();
    this.localToWorld(this.world.copy(this.at));
    const d = this.ear.distance(this.world);
    const door = this.options.throughDoor === true;
    const near = falloff(d, this.options.halfAt ?? (door ? 7 : 14));
    const playing = Math.max(0, Math.min(1, this.options.playing()));
    const level = playing * near * (door ? LEVEL.door : LEVEL.open);
    out.gain.gain.setTargetAtTime(level, g.now, 0.6);
    const side = this.ear.spatial(this.world);
    out.leg.set(side.pan, side.walls + (door ? 0.9 : 0), false, side.rear ?? 0);
    this.music.update(dt, g, out.gain, level);
    // The audience between songs.
    const between = this.music.betweenSongs;
    if (between && !this.wasBetween && playing > 0.2) {
      const people = this.options.audience?.() ?? 0;
      if (people > 0 && near > 0.02) applause(g, g.shot(side, 4), near * (door ? 0.5 : 1), people);
    }
    this.wasBetween = between;
  }

  private teardown(): void {
    this.graph?.stop();
    this.graph = null;
    this.out = null;
  }

  private build(): SoundGraph | null {
    const g = SoundGraph.create(this.occupied ? MASTER : 0);
    if (!g) return null;
    this.graph = g;
    const leg = g.leg();
    const gain = g.gain();
    gain.connect(leg.input);
    this.out = { gain, leg };
    return g;
  }
}
