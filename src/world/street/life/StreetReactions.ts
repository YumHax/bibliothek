import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { Walker } from '../../people/Walker';
import type { CarVoice } from '../traffic/carVoices';
import type { SirenVehicle } from '../traffic/StreetTraffic';
import { pick, random } from '@/random';

interface StreetReactionsOptions {
  /** Everyone in the street (a live list, zone-local positions). */
  walkers: readonly Walker[];
  /** The road users as the sound hears them (a live list: their horns are counters). */
  voices: readonly CarVoice[];
  /** The emergency vehicles out (siren on while they are). */
  sirens: ReadonlySet<SirenVehicle>;
  /** The dogs' barks (counters) and where the last one was. */
  barkers: readonly { readonly barks: number; readonly position: THREE.Vector3 }[];
  /** The player's eye. */
  viewer: THREE.Object3D;
}

/** Who hears what: a horn this close makes people jump, a bark turns heads this close, a siren this far. */
const HORN_REACH = 11;
const BARK_REACH = 6;
const SIREN_REACH = 30;
/** Seconds a head stays turned to a horn or a bark. */
const LOOK_FOR = 1.3;
/** The player in someone's way (`Walker.blockedFor`, seconds): this long, they say a word; this long, a sharper one; then quiet this long. */
const BLOCK = { pardon: 0.9, sharp: 4.5, again: 25 };
const PARDON = ['Pardon.', 'Excuse me.', 'Sorry, just squeezing past.', 'Mind if I…?'];
const SHARP = ['Excuse me!', 'Do you mind?', 'Some of us have places to be!'];
/** A look back over the shoulder at someone who blocked the way, once past. */
const LOOK_BACK = 1.1;
/** At most this often (s) one person gasps or shakes their head at a horn. */
const GASP_EVERY = 4;

interface Watch {
  /** Seconds the player has stood in their way. */
  blocked: number;
  /** What was said: 0 nothing, 1 a pardon, 2 a sharp word; seconds before they would say anything again. */
  said: number;
  quiet: number;
  /** Seconds left of a turned head (towards `at`), and of a look back at the player. */
  look: number;
  at: THREE.Vector3;
  back: number;
  /** Where their eyes are sent (world): their own point, since a walker keeps the one it is given. */
  world: THREE.Vector3;
}

/**
 * How the street's people take what happens round them: a horn close by makes them start (eyebrows up, a turn of the
 * head towards it, now and then a shake of the head), a dog barking near turns heads, a siren going past draws every
 * eye along the pavement for as long as it is in reach. And the player standing in someone's way: once they have had
 * to stop for them a moment they say "Pardon", a sharper word if it goes on (and a frown), then a look back over the
 * shoulder once past. Heads turn only while walking (someone standing looks where they were looking); the faces
 * work either way. One pass a frame over the walkers drawn.
 */
export class StreetReactions extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly watched = new Map<Walker, Watch>();
  private readonly honks = new Map<CarVoice, number>();
  private readonly barks: number[];
  private readonly eye = new THREE.Vector3();
  private gasp = 0;

  constructor(private readonly options: StreetReactionsOptions) {
    super();
    this.name = 'StreetReactions';
    this.barks = options.barkers.map((b) => b.barks);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    this.gasp = Math.max(0, this.gasp - dt);
    this.options.viewer.getWorldPosition(this.eye);
    if (this.parent) this.parent.worldToLocal(this.eye);
    for (const voice of this.options.voices) {
      const seen = this.honks.get(voice);
      this.honks.set(voice, voice.honks);
      if (seen !== undefined && voice.honks > seen && voice.active) this.startle(voice.position, HORN_REACH, true);
    }
    this.options.barkers.forEach((b, i) => {
      if (b.barks > (this.barks[i] ?? 0)) this.startle(b.position, BARK_REACH, false);
      this.barks[i] = b.barks;
    });
    for (const siren of this.options.sirens) if (siren.active && siren.sirenOn) this.watchSiren(siren.position);
    for (const walker of this.options.walkers) this.tend(walker, dt);
  }

  private watch(walker: Walker): Watch {
    let w = this.watched.get(walker);
    if (!w) {
      w = { blocked: 0, said: 0, quiet: 0, look: 0, at: new THREE.Vector3(), back: 0, world: new THREE.Vector3() };
      this.watched.set(walker, w);
    }
    return w;
  }

  /** A horn (or a bark) at `at`: those in reach start, and turn their heads to it a moment. */
  private startle(at: THREE.Vector3, reach: number, horn: boolean): void {
    for (const walker of this.options.walkers) {
      if (!walker.isPresent || !walker.drawn) continue;
      const d = Math.hypot(walker.position.x - at.x, walker.position.z - at.z);
      if (d > reach) continue;
      const w = this.watch(walker);
      w.look = LOOK_FOR * (0.7 + random() * 0.6);
      w.at.set(at.x, 1.1, at.z);
      if (horn) {
        walker.feel({ browsUp: 0.9, jaw: 0.25 }, 0.9);
        if (this.gasp <= 0 && d < reach * 0.6 && random() < 0.4) {
          this.gasp = GASP_EVERY;
          walker.gesture(random() < 0.5 ? 'headShake' : 'coverMouth');
        }
      } else walker.feel({ browsUp: 0.4 }, 0.6);
    }
  }

  /** A siren going past: everyone near enough watches it go by. */
  private watchSiren(at: THREE.Vector3): void {
    for (const walker of this.options.walkers) {
      if (!walker.isPresent || !walker.drawn) continue;
      if (Math.hypot(walker.position.x - at.x, walker.position.z - at.z) > SIREN_REACH) continue;
      const w = this.watch(walker);
      if (w.look <= 0) walker.feel({ browsUp: 0.5 }, 1.2);
      w.look = 0.4;
      w.at.set(at.x, 1.4, at.z);
    }
  }

  /** One walker's frame: a turned head held or let go; the player in their way. */
  private tend(walker: Walker, dt: number): void {
    const w = this.watched.get(walker);
    if (!walker.isPresent || !walker.drawn) {
      if (w) this.watched.delete(walker);
      return;
    }
    this.blocking(walker);
    if (!w) return;
    w.quiet = Math.max(0, w.quiet - dt);
    if (w.look > 0) {
      w.look -= dt;
      // Only someone on the move turns their head (one standing keeps their eyes where they were).
      if (walker.isWalking) walker.setFocus(w.look > 0 ? this.toWorld(w.at, w.world) : null);
    } else if (w.back > 0) {
      w.back -= dt;
      if (walker.isWalking) walker.setFocus(w.back > 0 ? 'viewer' : null);
    }
  }

  /** The player standing in someone's way: a pardon, then a sharper word; a look back once past them. */
  private blocking(walker: Walker): void {
    const p = walker.position;
    const d = Math.hypot(this.eye.x - p.x, this.eye.z - p.z);
    // How long the player has stood in their way: the walker's own making way counts it.
    const blocked = walker.blockedFor;
    let w = this.watched.get(walker);
    if (blocked <= 0) {
      if (w && w.blocked > BLOCK.pardon && d < 3) w.back = LOOK_BACK;
      if (w) {
        w.blocked = 0;
        if (w.quiet <= 0) w.said = 0;
      }
      return;
    }
    w ??= this.watch(walker);
    w.blocked = blocked;
    if (w.quiet > 0) return;
    if (w.said < 1 && w.blocked > BLOCK.pardon) {
      w.said = 1;
      walker.say(pick(random, PARDON), 1.6);
    } else if (w.said < 2 && w.blocked > BLOCK.sharp) {
      w.said = 2;
      w.quiet = BLOCK.again;
      walker.say(pick(random, SHARP), 1.8);
      walker.feel({ frown: 0.8, squint: 0.3 }, 2);
    }
  }

  private toWorld(local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    out.copy(local);
    return this.parent ? this.parent.localToWorld(out) : out;
  }
}
