import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { audioBus, setRoomAir, startedAudioContext, type RoomAir } from './audioContext';
import { OUTDOOR_SURFACES, type FootSurface } from './footSurface';
import { playFootfall } from './footfall';
import { playFloorCreak } from './furnitureSounds';

/** What the footsteps need to know of the player (the `FirstPersonController`, read-only). */
export interface Walking {
  readonly isLocked: boolean;
  readonly movementEnabled: boolean;
  readonly isSeated: boolean;
  readonly isCrouching: boolean;
  readonly isSprinting: boolean;
  /** Where the feet stand (world y): on a flight of stairs, one step a tread. */
  readonly feetHeight?: number;
  /** Riding a moving floor (the lift's car): the feet rise with it, no stair under them. */
  readonly isRiding?: boolean;
}

export interface FootstepsOptions {
  /** The camera: its horizontal movement is the walking. */
  camera: THREE.Object3D;
  player: Walking;
  /** What is underfoot at a world point. */
  surfaceAt: (world: THREE.Vector3) => FootSurface;
  /** How wet and how snowed-on the ground is (0..1 each), for the outdoor surfaces. */
  ground: () => { wetness: number; snowCover: number };
  /** True while the player is being moved rather than walking (a travel, a sleep): no steps. */
  suspended?: () => boolean;
}

/**
 * Metres walked between two steps. Walking and sprinting: the head bob's own step (half of
 * `FirstPersonController`'s 1.5 m stride), so each footfall lands at the bottom of a bob; crouching
 * (no bob), short ones.
 */
const STRIDE = { walk: 0.75, sprint: 0.75, crouch: 0.5 };
/** The feet rising or sinking this much (m) while walking is a tread of a flight (a step is ~17 cm): one footfall each. */
const TREAD_RISE = 0.14;
/** A foot's weight on a stair: heavier coming down, lighter going up. */
const STAIR_FORCE = { down: 1.2, up: 0.9 };
/** Stopping after a walk: the feet come together in a half step this soft. */
const SETTLE_FORCE = 0.35;
/** Now and then a floorboard gives under a step on parquet. */
const CREAK_CHANCE = 0.04;
const CREAK_LEVEL = 0.018;
/** How often (s) the room's air follows what is underfoot (`setRoomAir`). */
const AIR_EVERY_S = 0.5;

/** The air of the space a surface is the floor of: the street's paving and grass are the open air. */
function airOf(surface: FootSurface): RoomAir {
  return OUTDOOR_SURFACES.has(surface) ? 'outdoors' : surface === 'wood' || surface === 'carpet' || surface === 'tiles' || surface === 'concrete' ? surface : 'outdoors';
}
/** A jump further than this in one frame is a teleport (a travel, sitting down), never a step. */
const TELEPORT = 1.2;
/** Slower than this (m/s) is standing still, whatever the drift. */
const MIN_SPEED = 0.25;
const MASTER = 0.55;

/**
 * The player's own footsteps, everywhere (and the room's air, `setRoomAir`, from what is underfoot): watches the camera's horizontal movement (the
 * controller is not touched) and plays a step every stride, heel then toe, a little to the left
 * then to the right, sprinting harder and crouching softer. The sound is synthesised from what is
 * underfoot (`surfaceAt`: parquet, carpet, tiles, concrete, paving, asphalt, grass); outdoors a wet
 * ground adds a splash and snow a crunch. Silent while seated, frozen, out of the room (menu open)
 * or `suspended` (travelling), and before the page's first gesture started the audio.
 */
export class Footsteps implements Updatable {
  private readonly last = new THREE.Vector3(NaN, 0, 0);
  private readonly here = new THREE.Vector3();
  private walked = 0;
  private side: 1 | -1 = 1;
  private out: GainNode | null = null;
  private lastFeet = NaN;
  /** How far the feet climbed or sank since the last footfall on a flight (signed, m). */
  private climbed = 0;
  /** Steps since setting off: stopping after one or more brings the feet together (`SETTLE_FORCE`). */
  private steps = 0;
  private airIn = 0;

  constructor(private readonly options: FootstepsOptions) {}

  update(dt: number): void {
    const { camera, player, suspended } = this.options;
    camera.getWorldPosition(this.here);
    // The room's air (its ring) follows the player from room to room, walking or not.
    this.airIn -= dt;
    if (this.airIn <= 0) {
      this.airIn = AIR_EVERY_S;
      setRoomAir(airOf(this.options.surfaceAt(this.here)));
    }
    const moved = Number.isNaN(this.last.x) ? 0 : Math.hypot(this.here.x - this.last.x, this.here.z - this.last.z);
    this.last.copy(this.here);
    const feet = player.feetHeight;
    const rose = feet === undefined || Number.isNaN(this.lastFeet) ? 0 : feet - this.lastFeet;
    this.lastFeet = feet ?? NaN;
    const walking = player.isLocked && player.movementEnabled && !player.isSeated && !suspended?.();
    if (!walking || moved > TELEPORT || dt <= 0 || moved / dt < MIN_SPEED) {
      // Stopping after a walk: a soft half step as the feet come together.
      // (Not right on the heels of a full step: that one already brought them together.)
      if (walking && moved <= TELEPORT && this.steps > 0 && this.walked > this.strideNow() * 0.35) this.step(SETTLE_FORCE);
      this.steps = 0;
      this.climbed = 0;
      // Standing still: the next step comes half a stride after setting off again.
      if (!walking || moved > TELEPORT) this.walked = 0;
      this.walked = Math.min(this.walked, this.strideNow() * 0.5);
      return;
    }
    // On a flight, one footfall a tread: the height is what counts, not the metres walked.
    this.climbed += Math.abs(rose) < TELEPORT && !player.isRiding ? rose : 0;
    if (Math.abs(this.climbed) >= TREAD_RISE) {
      this.step(this.climbed < 0 ? STAIR_FORCE.down : STAIR_FORCE.up);
      this.climbed = 0;
      this.walked = 0;
      return;
    }
    this.walked += moved;
    const stride = this.strideNow();
    if (this.walked < stride) return;
    this.walked -= stride;
    // Walking along the level (a landing): what was climbed so far is forgotten.
    this.climbed = 0;
    this.step();
  }

  private strideNow(): number {
    const { player } = this.options;
    return player.isCrouching ? STRIDE.crouch : player.isSprinting ? STRIDE.sprint : STRIDE.walk;
  }

  /** One footfall; `weight` scales the walking force (a stair, the settling half step). */
  private step(weight = 1): void {
    const ctx = startedAudioContext();
    if (!ctx) return;
    this.steps++;
    const { player } = this.options;
    const surface = this.options.surfaceAt(this.here);
    this.side = this.side === 1 ? -1 : 1;
    const outdoor = OUTDOOR_SURFACES.has(surface);
    const ground = outdoor ? this.options.ground() : { wetness: 0, snowCover: 0 };
    const force = (player.isCrouching ? 0.45 : player.isSprinting ? 1.35 : 1) * weight;
    playFootfall(ctx, this.output(ctx), surface, { force, pan: this.side * 0.12, ...ground });
    if (surface === 'wood' && weight >= 1 && Math.random() < CREAK_CHANCE) playFloorCreak(CREAK_LEVEL * force);
  }

  private output(ctx: AudioContext): GainNode {
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = MASTER;
      this.out.connect(audioBus(ctx, 'world'));
    }
    return this.out;
  }
}
