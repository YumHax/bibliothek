import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Collisions } from '@/core/Collider';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import type { Seat } from '../Seat';
import type { CatBedLike, CatBody, CatClock, CatPlayerView, CatSettings, CatToyLike, CatVoiceLike, FoodBowlLike, ScratcherLike, WaterBowlLike } from './types';
import { CatNav } from './CatNav';
import { CatMotion } from './CatMotion';
import { CatBrain, type CatScreen } from './CatBrain';
import type { WindowLookout } from './spots';

export interface CatOptions {
  settings: CatSettings;
  collisions: Collisions;
  /** Room interior, XZ. */
  bounds: THREE.Box2;
  player: CatPlayerView;
  clock: CatClock;
  seats: Seat[];
  bowl: FoodBowlLike;
  water?: WaterBowlLike;
  bed?: CatBedLike;
  scratcher?: ScratcherLike;
  toy?: CatToyLike;
  /** The room windows (`RoomWindow` fits): lookouts and sun patches. */
  windows?: WindowLookout[];
  /** The TV: `watchingSpot` is a floor point on the rug in front of it. */
  tv?: CatScreen;
  voice?: CatVoiceLike;
}

/**
 * The cat: a procedural body (`CatBody`) driven by a behaviour (`CatBrain`) that walks it around
 * the room (`CatNav` + `CatMotion`). Furniture with an empty footprint (it never blocks the
 * player), clickable (a click is a stroke), ticked by the engine through `zone.place()`.
 * Local +z is the cat's forward; the origin sits on the floor under its body.
 */
export class Cat extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly hitboxes: THREE.Object3D[];
  readonly settings: CatSettings;

  private readonly nav: CatNav;
  private readonly motion: CatMotion;
  private readonly brain: CatBrain;
  private readonly voice: CatVoiceLike | undefined;
  private readonly player: CatPlayerView;
  private readonly eye = new THREE.Vector3();
  private readonly here = new THREE.Vector3();

  constructor(
    private readonly body: CatBody,
    options: CatOptions,
  ) {
    super();
    this.name = 'Cat';
    this.settings = { ...options.settings };
    this.voice = options.voice;
    this.player = options.player;
    this.hitboxes = [body.hitbox];
    body.position.set(0, 0, 0);
    body.setCoat(this.settings.coat);
    this.add(body);

    this.nav = new CatNav(options.collisions, options.bounds);
    this.motion = new CatMotion(this, body, this.nav);
    this.brain = new CatBrain({
      cat: this,
      body,
      nav: this.nav,
      motion: this.motion,
      bounds: options.bounds,
      player: options.player,
      clock: options.clock,
      seats: options.seats,
      bowl: options.bowl,
      water: options.water,
      bed: options.bed,
      scratcher: options.scratcher,
      toy: options.toy,
      windows: options.windows,
      tv: options.tv,
      voice: options.voice,
    });
  }

  /** Never a collider: the player walks past (and through) the cat. */
  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** What the cat is up to, for the UI. */
  get isAsleep(): boolean {
    return this.brain.isAsleep;
  }

  // --- Interactable ---------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    this.body.setHovered(hovered);
  }

  label(): string {
    return `${this.settings.name} ${this.brain.describe()}`;
  }

  /** A click strokes the cat. */
  activate(session: SessionActions): void {
    const name = this.settings.name;
    switch (this.brain.pet()) {
      case 'purr':
        session.hint(`${name} purrs`);
        break;
      case 'woke':
        session.hint(`${name} wakes up and stretches`);
        break;
      case 'annoyed':
        session.hint(`${name} has had enough`);
        break;
      case 'busy':
        break;
    }
  }

  // --- for the session / UI ---------------------------------------------------------------------

  /** The player calls the cat: it comes and sits in front of them (or ignores them, cat-style). */
  call(): 'coming' | 'ignored' | 'asleep' {
    return this.brain.call();
  }

  /** Which armchair the player sits in; null when standing. */
  setPlayerSeat(seat: Seat | null): void {
    this.brain.setPlayerSeat(seat);
  }

  applySettings(settings: CatSettings): void {
    this.settings.name = settings.name;
    if (this.settings.coat !== settings.coat) {
      this.settings.coat = settings.coat;
      this.body.setCoat(settings.coat);
    }
  }

  // --- Updatable ------------------------------------------------------------------------------

  update(dt: number): void {
    this.nav.tick(dt);
    this.brain.update(dt);
    this.motion.update(dt);
    this.body.update(dt);
    if (this.voice) {
      this.player.getEyePosition(this.eye);
      this.getWorldPosition(this.here);
      this.voice.setDistance(this.eye.distanceTo(this.here));
      this.voice.update(dt);
    }
  }
}
