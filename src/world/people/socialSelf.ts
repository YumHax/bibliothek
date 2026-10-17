import * as THREE from 'three';
import { presentNear, registerPresence, type PresentBody } from '@/social/presence';
import type { Fit } from '@/social/types';
import type { FaceKey, GestureName } from './motion/gestures';
import type { Greeting, Mien, SocialHook } from './socialHook';

/*
 * A known person's body as the social interface (docs/social.md "Bodies"), shared by `Walker` and `Vendor`:
 * - aimed at, they look up with the face of how they stand with the player, and let it go a second after;
 * - in a conversation they stay, eyes on the player (`converse`), and show what they think of a row of the menu before
 *   it is chosen (`anticipate`: leaning in, a half smile, a look away, a wince);
 * - passing the player within `GREET_AT`, they greet by their tier, once a pass (a look away from the hostile, a nod,
 *   a wave, a friend's name called out), and beckon when they have a word for them;
 * - they are present to the social layer (`registerPresence`): a witness of what the player does in public turns to
 *   look, then has a word in a neighbour's ear (`notice`).
 */

/** What the owner (a `Walker`, a `Vendor`) lends its social self. */
interface SocialOwner {
  /** The person's group: where they stand, in the scene or not. */
  readonly root: THREE.Object3D;
  /** The body's asks (`PersonModel`). */
  readonly body: {
    feel(face: FaceKey, seconds: number, fade?: number): void;
    attitude(lean: number, aside: number, seconds?: number): void;
    gesture(name: GestureName): void;
    nod(): void;
    readonly gesturing: GestureName | null;
    readonly expressiveness: number;
  };
  /** Eyes on the player for `seconds` (`Attention.engage`). */
  attend(seconds: number): void;
  /** A word over their head (no name). */
  say(text: string): void;
  /** Whether they are there to be seen (present, not faded out). */
  shown(): boolean;
  /** A friend slows as they pass, a close one stops and turns to the player (a walker; a vendor stays put). */
  greetMove?(greeting: Greeting): void;
}

/** Within this of the player (m, on the floor), passing, they greet; further than `PASS_RESET`, a new pass. */
const GREET_AT = 8;
const PASS_RESET = 14;
/** Seconds between two looks at whether the player is passing. */
const PASS_CHECK = 0.2;
/** Seconds between two greetings at the least, and from a conversation's end to the next. */
const GREET_GAP = 45;
/** The widest angle off their forward (radians) at which they greet the player (not someone behind them). */
const GREET_CONE = 1.5;
/** Seconds the face of the aim stays once the aim has left. */
const HOVER_LINGER = 1;
/**
 * How they would take a balloon of the player's, shown before it is said: the face, a lean (rad), a look aside (rad).
 * Strong enough to read at conversation distance (2-3 m, the face a few dozen pixels high): a whole smile with the brows
 * up and a lean in for what they love, a look away for "meh", a wince and a lean back for what they would not like.
 */
const ANTICIPATION: Record<Fit, { face: FaceKey; lean: number; aside: number }> = {
  loves: { face: { smile: 1, browsUp: 0.95, wide: 0.3 }, lean: 0.17, aside: 0 },
  likes: { face: { smile: 0.75, smirk: 0.3, browsUp: 0.35 }, lean: 0.08, aside: 0 },
  meh: { face: { smirk: 0.3, press: 0.25 }, lean: -0.02, aside: 0.5 },
  dislikes: { face: { press: 0.85, frown: 0.8, squint: 0.45, sad: 0.2 }, lean: -0.11, aside: 0.26 },
};
/** What the cold do with their head passing (a look away, rad) and their face. */
/** At least this long (s) between two curious head tilts. */
const TILT_GAP_S = 2.5;

const SHUN = { aside: 0.55, face: { frown: 0.4, press: 0.4 } as FaceKey };
const AVOID = { aside: 0.35, face: { press: 0.35 } as FaceKey };
/** A witness: seconds looking at what happened, then whispering to a neighbour within this (m). */
const NOTICE_LOOK = 1.3;
const WHISPER_LOOK = 1.8;
const NEIGHBOUR_WITHIN = 2.5;
/** About where a standing person's head is over their feet (m), for a look at them. */
const HEAD_HEIGHT = 1.55;

const BLANK: FaceKey = {};

export class SocialSelf {
  private hovered = false;
  private hoverLeft = 0;
  private hoverFelt = false;
  private anticipating = false;
  /** Seconds since their head last tilted at something they love (`anticipate`). */
  private sinceTilt = Infinity;
  /** Which way a look aside goes (+1, -1): changed each time, nobody turns away the same way twice. */
  private asideSide = 1;
  private conversing = false;
  private passing = false;
  private sinceGreet = Infinity;
  private passCheckIn = 0;
  private beckonIn = 0;
  private readonly gazePoint = new THREE.Vector3();
  private gazeLeft = 0;
  private whisperIn = 0;
  /** Their entry in the social layer's register, while they are on it (shared with `self`, which takes it off). */
  private readonly presence: { off: (() => void) | null } = { off: null };
  private readonly here = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly at = new THREE.Vector3();
  private readonly self: PresentBody;
  /** Who they are to the social layer and how they look at the player (null: not someone it knows). */
  private readonly person: { person: string; mien(): Mien } | null;

  constructor(
    private readonly owner: SocialOwner,
    hook: SocialHook | null,
    private readonly viewer: THREE.Object3D,
  ) {
    this.person = hook?.person && hook.mien ? { person: hook.person, mien: () => hook.mien!() } : null;
    // The registry holds this weakly: a body whose zone went (and was not disposed) is not kept alive by it. Asked
    // where it is when it is out of the scene (or gone), it takes itself off the register (`update` puts it back on).
    const ref = new WeakRef(this);
    const presence = this.presence;
    this.self = {
      where: () => {
        const at = ref.deref()?.where() ?? null;
        if (!at && presence.off) {
          presence.off();
          presence.off = null;
        }
        return at;
      },
      notice: (at, whisper) => ref.deref()?.notice(at, whisper),
    };
  }

  /** In a conversation: they talk with the player (eyes on them, staying); false: free again. */
  get inConversation(): boolean {
    return this.conversing;
  }

  /** The crosshair is on them (or not): eyes up, the face of how they stand with the player; gone a second after. */
  hover(on: boolean): void {
    this.hovered = on;
    if (!on) {
      this.hoverLeft = HOVER_LINGER;
      return;
    }
    if (!this.person || this.conversing) return;
    this.owner.attend(1.5);
    this.owner.body.feel(this.scaled(this.person.mien().face), 60, 0.6);
    this.hoverFelt = true;
  }

  /** A row of the menu hovered (`fit`: how they would take it), or none (null). */
  anticipate(fit: Fit | null): void {
    const body = this.owner.body;
    this.owner.attend(2);
    if (!fit) {
      body.attitude(0, 0);
      if (this.anticipating) body.feel(BLANK, 0, 0.5);
      this.anticipating = false;
      return;
    }
    const a = ANTICIPATION[fit];
    // Quicker in than out: the face answers the pointer at once, and eases back.
    body.feel(this.scaled(a.face), 30, 0.25);
    if (!this.anticipating) this.asideSide = -this.asideSide;
    body.attitude(a.lean, a.aside * this.asideSide);
    // Something they love: the head tilts, curious, once (not again for every balloon pointed at).
    if (fit === 'loves' && this.sinceTilt > TILT_GAP_S && !body.gesturing) {
      body.gesture('listenTilt');
      this.sinceTilt = 0;
    }
    this.anticipating = true;
  }

  /** They took something said (a reaction plays): what the face was showing before gives way to it. */
  reacted(): void {
    this.anticipating = false;
    this.hoverFelt = false;
  }

  /** Kept in a conversation (`true`), or let go (`false`). */
  converse(on: boolean): void {
    this.conversing = on;
    if (on) {
      this.owner.attend(2);
      return;
    }
    this.owner.body.attitude(0, 0);
    // What their face was showing for a row of the menu, or for the aim, goes with the conversation.
    if (this.anticipating) this.owner.body.feel(BLANK, 0, 0.5);
    this.anticipating = false;
    if (this.hoverFelt && !this.hovered) this.hoverLeft = HOVER_LINGER;
    this.sinceGreet = 0;
  }

  /** A point a witness's eyes are on now (what they saw, a neighbour whispered to), else null. */
  gazeTarget(): THREE.Vector3 | null {
    return this.gazeLeft > 0 ? this.gazePoint : null;
  }

  /** A frame: the aim's face let go, the conversation's eyes kept, a greeting when passing, a witness's look. */
  update(dt: number): void {
    if (this.person && !this.presence.off) this.presence.off = registerPresence(this.person.person, this.self);
    this.sinceGreet += dt;
    this.sinceTilt += dt;
    if (!this.hovered && this.hoverLeft > 0) {
      this.hoverLeft -= dt;
      if (this.hoverLeft <= 0 && this.hoverFelt && !this.conversing && !this.anticipating) {
        this.owner.body.feel(BLANK, 0, 0.6);
        this.hoverFelt = false;
      }
    }
    if (this.conversing) this.owner.attend(0.5);
    if (this.gazeLeft > 0) this.gazeLeft -= dt;
    if (this.whisperIn > 0) {
      this.whisperIn -= dt;
      if (this.whisperIn <= 0) this.whisper();
    }
    if (this.beckonIn > 0) {
      this.beckonIn -= dt;
      if (this.beckonIn <= 0 && !this.owner.body.gesturing && !this.conversing) this.owner.body.gesture('beckon');
    }
    if (this.person && !this.conversing) this.watchPass(dt);
  }

  /**
   * A known face passing the player: within `GREET_AT` and turned towards them, once a pass, they greet them by how
   * they stand (`Mien.greeting`). Returns whether they greeted now (the street's crowd counts it once a trip).
   */
  greetIfNear(): boolean {
    if (!this.person || this.conversing || this.passing || this.sinceGreet < GREET_GAP || !this.owner.shown()) return false;
    const distance = this.distanceToPlayer();
    if (distance > GREET_AT || !this.facingPlayer(distance)) return false;
    this.passing = true;
    const mien = this.person.mien();
    if (!mien.greeting) return false;
    this.sinceGreet = 0;
    this.greet(mien.greeting, mien.hello);
    if (mien.beckon && mien.greeting !== 'shun' && mien.greeting !== 'avoid') this.beckonIn = 1.8;
    return true;
  }

  /** They saw something the player did at `at` (world): a look; with `whisper`, then a word to whoever is beside them. */
  notice(at: { x: number; y: number; z: number }, whisper: boolean): void {
    if (this.conversing) return;
    this.gazePoint.set(at.x, at.y, at.z);
    this.gazeLeft = NOTICE_LOOK;
    this.owner.body.feel(this.scaled({ browsUp: 0.35, frown: 0.15, wide: 0.15 }), NOTICE_LOOK, 0.6);
    if (whisper) this.whisperIn = NOTICE_LOOK;
  }

  /** Off the social layer's register (their zone unloads). */
  dispose(): void {
    this.presence.off?.();
    this.presence.off = null;
  }

  /** Where they stand (world), while in the scene and to be seen. */
  private where(): { x: number; y: number; z: number } | null {
    if (!this.owner.shown() || !inScene(this.owner.root)) return null;
    return this.owner.root.getWorldPosition(this.at);
  }

  private watchPass(dt: number): void {
    // A few looks a second is plenty to notice someone coming by.
    this.passCheckIn -= dt;
    if (this.passCheckIn > 0) return;
    this.passCheckIn = PASS_CHECK;
    if (this.passing) {
      if (this.distanceToPlayer() > PASS_RESET) this.passing = false;
      return;
    }
    this.greetIfNear();
  }

  private greet(greeting: Greeting, hello: string | null): void {
    const body = this.owner.body;
    switch (greeting) {
      case 'shun':
        body.attitude(0, SHUN.aside, 2.5);
        body.feel(this.scaled(SHUN.face), 2, 0.8);
        break;
      case 'avoid':
        body.attitude(0, AVOID.aside, 2);
        body.feel(this.scaled(AVOID.face), 1.6, 0.8);
        break;
      case 'glance':
        this.owner.attend(0.8);
        body.feel(this.scaled({ smirk: 0.15 }), 1, 0.6);
        break;
      case 'nod':
        this.owner.attend(1.2);
        body.nod();
        body.feel(this.scaled({ smile: 0.3, smirk: 0.2 }), 1.2, 0.8);
        break;
      case 'wave':
        this.owner.attend(1.5);
        if (!body.gesturing) body.gesture('wave');
        body.feel(this.scaled({ smile: 0.7 }), 1.6, 0.8);
        break;
      case 'waveWarm':
      case 'callOut':
        this.owner.attend(greeting === 'callOut' ? 2.5 : 2);
        if (!body.gesturing) body.gesture('wave');
        body.feel(this.scaled({ smile: 0.9, browsUp: 0.35 }), 2, 0.9);
        break;
    }
    this.owner.greetMove?.(greeting);
    if (hello) this.owner.say(hello);
  }

  /** The witness's word in a neighbour's ear: the nearest other present body, a look at them and the gesture. */
  private whisper(): void {
    const me = this.where();
    if (!me) return;
    const near = presentNear(me, NEIGHBOUR_WITHIN).find((p) => p.body !== this.self);
    if (!near) return;
    const at = near.body.where();
    if (!at) return;
    this.gazePoint.set(at.x, at.y + HEAD_HEIGHT, at.z);
    this.gazeLeft = WHISPER_LOOK;
    if (!this.owner.body.gesturing) this.owner.body.gesture('whisper');
  }

  private distanceToPlayer(): number {
    this.viewer.getWorldPosition(this.eye);
    this.owner.root.getWorldPosition(this.here);
    return Math.hypot(this.eye.x - this.here.x, this.eye.z - this.here.z);
  }

  /** Whether the player is within `GREET_CONE` of their forward (positions as `distanceToPlayer` left them). */
  private facingPlayer(distance: number): boolean {
    if (distance < 0.5) return true;
    this.owner.root.getWorldDirection(this.forward);
    const dx = this.eye.x - this.here.x;
    const dz = this.eye.z - this.here.z;
    const cos = (this.forward.x * dx + this.forward.z * dz) / (Math.hypot(this.forward.x, this.forward.z) * distance + 1e-6);
    return Math.acos(THREE.MathUtils.clamp(cos, -1, 1)) < GREET_CONE;
  }

  /** A face in their own measure: the reserved show less of it. */
  private scaled(face: FaceKey): FaceKey {
    const amp = 0.7 + 0.4 * this.owner.body.expressiveness;
    const out: FaceKey = {};
    for (const [k, v] of Object.entries(face) as [keyof FaceKey, number][]) out[k] = Math.min(1, v * amp);
    return out;
  }
}

/** Whether `object` hangs in a scene now (its zone loaded and attached). */
function inScene(object: THREE.Object3D): boolean {
  let o: THREE.Object3D | null = object;
  while (o) {
    if ((o as THREE.Scene).isScene) return true;
    o = o.parent;
  }
  return false;
}
