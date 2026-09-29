import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Collisions } from '@/core/Collider';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { ActivityAware, Furniture } from '../Furniture';
import type { Seat } from '../Seat';
import { CAT_EARSHOT, type CatBedLike, type CatBody, type CatClock, type CatPlayerView, type CatSettings, type CatToyLike, type CatVoiceLike, type FoodBowlLike, type ScratcherLike, type WaterBowlLike } from './types';
import { rearOf, stereoPan } from '@/audio/spatial';
import { CatNav } from './CatNav';
import { CatMotion } from './CatMotion';
import { CatBrain, type CatScreen } from './CatBrain';
import type { CatPerch, WindowLookout } from './spots';
import { blobShadow } from '../zone/ContactShadows';
import { CatFly } from './CatFly';

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
  /** Water bowls elsewhere in the flat (the kitchen's). */
  waters?: WaterBowlLike[];
  bed?: CatBedLike;
  scratcher?: ScratcherLike;
  toy?: CatToyLike;
  /** The room windows (`RoomWindow` fits): lookouts and sun patches. */
  windows?: WindowLookout[];
  /** The TV: `watchingSpot` is a floor point on the rug in front of it. */
  tv?: CatScreen;
  voice?: CatVoiceLike;
  /** The flat's rooms (world XZ, each grown to reach over its doorways): the cat walks all of them when the doors are open. */
  roam?: THREE.Box2[];
  /** Floor points in the other rooms it goes to look at. */
  visits?: THREE.Vector3[];
  /** Places to nap elsewhere in the flat (the bedroom's bed, the empty bath, a radiator's cradle). */
  perches?: CatPerch[];
  /** The ears (the camera): its heading places the voice left or right. Without it the voice is centred. */
  listener?: THREE.Object3D;
  /** Walls between the listener and the cat muffle its voice (`SoundOcclusion` fits). */
  acoustics?: { wallsBetween(listener: THREE.Vector3, source: THREE.Vector3): number };
}

/** The cat's blob shadow: size (m) and how light it is; mid-hop it shrinks and fades with the height. */
const BLOB = { size: 0.34, opacity: 0.95, shrink: 2.5 };
/** The player's crosshair resting on an awake cat this long (s) earns a slow blink; then not again for a while. */
const GAZE_BLINK = { after: 1.5, again: { min: 6, max: 10 } };
/** Walls between the listener and the cat are counted this often (a raycast against the loaded walls). */
const WALLS_EVERY_S = 0.3;
/** The walls heard ease to the counted ones at this rate (1/s): a door shutting dims the purr over a moment. */
const WALLS_EASE = 5;
/** How far (share) one cat's voice sits above or below another's, from its name. */
const PITCH_SPREAD = 0.08;
/** The voice comes from about the cat's head. */
const VOICE_HEIGHT = 0.2;

/** How the player called: by name (C), with the feather wand, or with the treat jar (which always works on an awake cat). */
export type CatCallHow = 'voice' | 'feathers' | 'treats';

/**
 * The cat: a procedural body (`CatBody`) driven by a behaviour (`CatBrain`) that walks it around
 * the room (`CatNav` + `CatMotion`). Furniture with an empty footprint (it never blocks the
 * player), clickable (a click is a stroke), ticked by the engine through `zone.place()`.
 * Local +z is the cat's forward; the origin sits on the floor under its body.
 */
export class Cat extends THREE.Group implements Furniture, Interactable, Updatable, ActivityAware {
  /** It walks: it carries its own blob instead (see the constructor). */
  readonly contactShadow = false;
  /**
   * It walks out of its zone into the rest of the flat: drawn even when the collection room is
   * culled from view (a few draw calls, frustum-culled like anything else).
   */
  readonly seenFromNextDoor = true;
  private readonly blob: THREE.Mesh | null;
  private readonly blobY: number;
  private readonly fly = new CatFly();
  readonly hitboxes: THREE.Object3D[];
  readonly settings: CatSettings;
  /** Whether it lives in the flat yet (adopted at the pet shop): till then it waits staged, unseen (`furnishCat`'s placers). */
  adopted = true;

  private readonly nav: CatNav;
  private readonly motion: CatMotion;
  private readonly brain: CatBrain;
  private readonly voice: CatVoiceLike | undefined;
  private readonly player: CatPlayerView;
  private readonly listener: THREE.Object3D | undefined;
  private readonly acoustics: CatOptions['acoustics'];
  private readonly eye = new THREE.Vector3();
  private readonly here = new THREE.Vector3();
  private readonly thing = new THREE.Vector3();
  private walls = 0;
  private heardWalls = NaN;
  private wallsIn = 0;
  private hovered = false;
  private hoveredFor = 0;
  private gazeBlinkIn = 0;

  constructor(
    private readonly body: CatBody,
    options: CatOptions,
  ) {
    super();
    this.name = 'Cat';
    this.settings = { ...options.settings };
    this.voice = options.voice;
    this.voice?.setPitch?.(voicePitch(this.settings.name));
    this.player = options.player;
    this.listener = options.listener;
    this.acoustics = options.acoustics;
    this.hitboxes = [body.hitbox];
    body.position.set(0, 0, 0);
    body.setCoat(this.settings.coat);
    this.add(body);
    // Its own contact shadow, following it; mid-hop it stays on the ground below, smaller and fainter.
    // (Not quite opaque, so it has a material of its own to fade.)
    this.blob = blobShadow(BLOB.size, BLOB.size, BLOB.opacity);
    this.blobY = this.blob?.position.y ?? 0;
    if (this.blob) this.add(this.blob);
    this.add(this.fly);

    const roam = options.roam?.length ? options.roam : null;
    const navBounds = roam ? roam.reduce((all, room) => all.union(room), new THREE.Box2().makeEmpty()) : options.bounds;
    this.nav = new CatNav(options.collisions, navBounds, roam ?? undefined);
    this.motion = new CatMotion(this, body, this.nav);
    this.motion.onLand = (strength) => this.voice?.noise('thud', strength);
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
      waters: options.waters,
      bed: options.bed,
      scratcher: options.scratcher,
      toy: options.toy,
      windows: options.windows,
      tv: options.tv,
      voice: options.voice,
      visits: options.visits,
      perches: options.perches,
    });
    if (options.toy) this.hearBounces(options.toy);
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
    this.hovered = hovered;
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
        session.react(`${name} purrs`);
        break;
      case 'woke':
        session.react(`${name} wakes up and stretches`);
        break;
      case 'annoyed':
        // Not a buzzer: the cat says it itself (ears back, a grumble), the line only names it.
        session.react(`${name} has had enough`);
        break;
      case 'busy':
        break;
    }
  }

  // --- for the session / UI ---------------------------------------------------------------------

  /** The player calls the cat: it comes and sits in front of them (or ignores them, cat-style; never the treat jar). */
  call(how: CatCallHow = 'voice'): 'coming' | 'ignored' | 'asleep' {
    return this.brain.call(how === 'treats');
  }

  /** Something bought for it after it moved in (the scratching post, the ball): from now on it may go to it. */
  provide(things: { scratcher?: ScratcherLike; toy?: CatToyLike }): void {
    this.brain.provide(things);
    if (things.toy) this.hearBounces(things.toy);
  }

  /** The ball knocking into things ticks where it is (placed for the listener like the cat's voice). */
  private hearBounces(toy: CatToyLike): void {
    toy.onBounce = (strength) => {
      const voice = this.voice;
      if (!voice?.noiseAt) return;
      this.player.getEyePosition(this.eye);
      toy.getWorldPosition(this.thing);
      const distance = this.eye.distanceTo(this.thing);
      if (distance >= CAT_EARSHOT) return;
      const walls = this.acoustics?.wallsBetween(this.eye, this.thing) ?? 0;
      voice.noiseAt('tick', strength, distance, this.listener ? stereoPan(this.listener, this.thing) : 0, walls);
    };
  }

  /** Which armchair the player sits in; null when standing. */
  setPlayerSeat(seat: Seat | null): void {
    this.brain.setPlayerSeat(seat);
  }

  applySettings(settings: CatSettings): void {
    this.settings.name = settings.name;
    this.voice?.setPitch?.(voicePitch(settings.name));
    if (this.settings.coat !== settings.coat) {
      this.settings.coat = settings.coat;
      this.body.setCoat(settings.coat);
    }
  }

  /** A dormant zone is not ticked: silence the purr now, `update` sets the distance again on return. */
  setZoneActive(active: boolean): void {
    if (!active) this.voice?.setDistance(Infinity);
  }

  // --- Updatable ------------------------------------------------------------------------------

  update(dt: number): void {
    this.nav.tick(dt);
    this.brain.update(dt);
    this.motion.update(dt);
    this.body.update(dt);
    this.fly.update(dt, this.brain.fly, this);
    this.voice?.setBuzzing?.(this.fly.visible);
    this.updateBlob();
    this.updateGazeBlink(dt);
    if (this.voice) this.placeVoice(dt, this.voice);
  }

  /** Mid-hop the blob stays on the ground under the cat, shrinking and fading as it rises. */
  private updateBlob(): void {
    const blob = this.blob;
    if (!blob) return;
    const lift = this.motion.lift;
    const fade = 1 / (1 + lift * BLOB.shrink);
    blob.position.y = this.blobY - lift;
    blob.scale.set(BLOB.size * fade, 1, BLOB.size * fade);
    const material = blob.material as THREE.MeshBasicMaterial;
    if (!blob.userData.sharedResources) {
      blob.userData.baseOpacity ??= material.opacity;
      material.opacity = (blob.userData.baseOpacity as number) * fade;
    }
  }

  /** The player looking at the cat a while: it blinks slowly back. */
  private updateGazeBlink(dt: number): void {
    this.gazeBlinkIn -= dt;
    this.hoveredFor = this.hovered && !this.brain.isAsleep ? this.hoveredFor + dt : 0;
    if (this.hoveredFor < GAZE_BLINK.after || this.gazeBlinkIn > 0) return;
    this.body.slowBlink();
    this.gazeBlinkIn = THREE.MathUtils.randFloat(GAZE_BLINK.again.min, GAZE_BLINK.again.max);
  }

  /** Distance, side and walls from the listener to the cat's head. */
  private placeVoice(dt: number, voice: CatVoiceLike): void {
    this.player.getEyePosition(this.eye);
    this.getWorldPosition(this.here);
    this.here.y += VOICE_HEIGHT;
    const distance = this.eye.distanceTo(this.here);
    // The side it is heard from and the walls between: the flat's shared rule (`audio/spatial.ts`).
    const pan = this.listener ? stereoPan(this.listener, this.here) : 0;
    this.wallsIn -= dt;
    if (this.wallsIn <= 0 && this.acoustics) {
      this.wallsIn = WALLS_EVERY_S;
      this.walls = distance < CAT_EARSHOT ? this.acoustics.wallsBetween(this.eye, this.here) : 0;
    }
    this.heardWalls = Number.isNaN(this.heardWalls) ? this.walls : this.heardWalls + (this.walls - this.heardWalls) * Math.min(1, dt * WALLS_EASE);
    voice.setDistance(distance, pan, this.heardWalls, this.listener ? rearOf(this.listener, this.here) : 0);
    voice.update(dt);
  }
}

/** A voice of its own from the cat's name (1 ± `PITCH_SPREAD`): renamed, it sounds like another cat. */
function voicePitch(name: string): number {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) hash = Math.imul(hash ^ name.charCodeAt(i), 16777619);
  return 1 + (((hash >>> 0) % 1000) / 999 - 0.5) * 2 * PITCH_SPREAD;
}
