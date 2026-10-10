import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import { PersonModel } from '../people/PersonModel';
import type { PersonLook } from '../people/looks';
import { SpeechBubble } from '../people/SpeechBubble';
import { Attention, type AttentionRange } from '../people/attention';
import type { SocialHook } from '../people/socialHook';
import type { FaceKey, GestureName } from '../people/motion/gestures';
import type { Reaction } from '../people/performer';
import type { HandheldModel } from './handheldModel';
import { random } from '@/random';

interface YardKidOptions {
  /** Whose gaze to meet: the camera. */
  viewer: THREE.Object3D;
  look: PersonLook;
  seed: number;
  /** Their name over what they say, once met (`socialHook.metName`). */
  speaker: () => string | undefined;
  /** Sat on something this high (the bench, the sandpit's edge), or standing. */
  seat: number | null;
  /** Their own handheld, held up to their eyes; none: they look over someone's shoulder (`watch`), leaning in. */
  handheld: HandheldModel | null;
  /** Where to look when they have no handheld of their own: the one they share (world point, asked each frame). */
  watch?: (out: THREE.Vector3) => THREE.Vector3 | null;
  lean?: number;
  /** A click: their lines when there is no social layer. */
  lines: readonly string[];
  social?: SocialHook;
}

/** They notice the player this near, round their front. */
const NOTICE: AttentionRange = { range: 4, cone: 1.4 };
/** Seconds they keep their eyes on the player after a line. */
const LINE_ATTENTION = 3;
/** Seconds between two moments of their game (a jump made, a life lost), drawn in this range. */
const MOMENTS: [number, number] = [5, 14];
/** How each moment of the game shows on them, most often a small one. */
const GAME_MOMENTS: readonly Reaction[] = ['good', 'good', 'near', 'fail', 'great', 'good', 'fail'];

/**
 * One of the courtyard's kids (`YardKids`): a child sat on the bench or the sandpit's edge with a handheld held up
 * to their face, eyes on its screen, thumbs on its buttons (the arms solved to its grips), the little moments of the
 * game on their face and in their shoulders; or standing beside someone, leaning in to watch theirs. They look up
 * when the player comes near and while talking to them. Clicked, the conversation (docs/social.md). Origin on the
 * floor (seated: at the seat's back edge), facing +z.
 */
export class YardKid extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly model: PersonModel;
  private readonly bubble = new SpeechBubble();
  private readonly attention: Attention;
  private readonly device: THREE.Group | null;
  private readonly grips: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly screen = new THREE.Vector3();
  /** The handheld's grips and screen in its own frame. */
  private readonly gripsLocal: readonly [THREE.Vector3, THREE.Vector3];
  private readonly screenLocal: THREE.Vector3;
  private readonly viewerPos = new THREE.Vector3();
  private readonly watched = new THREE.Vector3();
  private moment: number;
  private nextLine = 0;
  /** Whether they are watching their screen (else the player). */
  private onScreen = true;

  constructor(private readonly options: YardKidOptions) {
    super();
    this.name = 'YardKid';
    const { look, seed, seat, handheld } = options;
    this.model = new PersonModel(look, options.viewer, seed);
    this.add(this.model);
    this.model.groundShadow();
    this.hitboxes = [this.model.hitbox];
    const h = look.height;
    if (seat !== null) this.model.sit(seat);
    this.model.setPose(handheld ? 'play' : seat !== null ? 'lap' : 'hips');
    if (options.lean) this.model.lean(options.lean);
    // Their handheld, held up below the face and tipped towards it (top away, screen up at the eyes).
    this.device = handheld?.object ?? null;
    if (this.device && handheld) {
      this.device.position.set(0, seat !== null ? seat + 0.25 * h : 0.6 * h, seat !== null ? 0.3 : 0.26);
      this.device.rotation.set(-0.64, Math.PI, 0, 'YXZ');
      this.add(this.device);
      this.device.updateMatrixWorld(true);
    }
    this.bubble.position.y = (seat !== null ? seat + 0.52 * h : h) + 0.32;
    this.bubble.userData.faceLift = (): number => this.model.eyesAbove(this.bubble);
    this.add(this.bubble);
    this.attention = new Attention(seed + 700);
    this.moment = MOMENTS[0] + random() * (MOMENTS[1] - MOMENTS[0]);
    this.gripsLocal = handheld?.grips ?? [new THREE.Vector3(), new THREE.Vector3()];
    this.screenLocal = handheld?.screen ?? new THREE.Vector3();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-0.22, 0, -0.15), new THREE.Vector3(0.22, 1.4, 0.35));
  }

  /** Where their screen is now (world): the others lean in to it. */
  screenAt(out: THREE.Vector3): THREE.Vector3 | null {
    return this.device ? out.copy(this.screen) : null;
  }

  update(dt: number): void {
    const looking = this.attention.update(dt, this, this.options.viewer, NOTICE, this.viewerPos);
    if (this.attention.takeNotice()) this.model.nod();
    this.onScreen = !looking;
    if (this.device) {
      this.device.updateMatrixWorld(true);
      const [l, r] = this.gripsLocal;
      this.model.reach([this.device.localToWorld(this.grips[0].copy(l)), this.device.localToWorld(this.grips[1].copy(r))]);
      this.device.localToWorld(this.screen.copy(this.screenLocal));
    }
    if (looking) {
      this.model.eyesOn(null);
      this.model.gaze(this.viewerPos);
    } else {
      const target = this.device ? this.screen : this.options.watch?.(this.watched);
      this.model.eyesOn(target ?? null);
      this.model.gaze(target ?? null);
    }
    // The game's little moments, while they are on it.
    this.moment -= dt;
    if (this.moment <= 0) {
      this.moment = MOMENTS[0] + random() * (MOMENTS[1] - MOMENTS[0]);
      if (this.onScreen && !this.attention.inConversation) this.model.react(GAME_MOMENTS[Math.floor(random() * GAME_MOMENTS.length)]!);
    }
    this.model.update(dt);
  }

  dispose(): void {
    this.options.handheld?.dispose();
  }

  setHovered(): void {
    // A person does not glow; the caption says it all.
  }

  label(): string {
    return this.options.social?.caption() ?? 'Kid · chat';
  }

  activate(session: SessionActions): void {
    if (this.options.social?.open(session)) {
      this.attention.engage(12);
      this.model.nod();
      return;
    }
    const { lines } = this.options;
    if (lines.length) this.speak(lines[this.nextLine++ % lines.length]!);
  }

  /** A word in a bubble over their head (a cheer, the news shouted across the yard). */
  say(text: string, seconds?: number): void {
    this.bubble.say(text, seconds, () => this.model.talk(lineSeconds(text)));
  }

  /** A line to the player, their name on it once met; eyes on the player. */
  speak(text: string): void {
    this.bubble.speak(text, this.options.speaker(), () => {
      this.model.talk(lineSeconds(text));
      this.attention.engage(lineSeconds(text) + LINE_ATTENTION);
    });
  }

  /** The point over their head their words come from. */
  get speechAnchor(): THREE.Object3D {
    return this.bubble;
  }

  /** A moment of a game shown (theirs, or someone else's they watch). */
  react(reaction: Reaction): void {
    this.model.react(reaction);
  }

  gesture(name: GestureName): void {
    this.model.gesture(name);
  }

  feel(face: FaceKey, seconds: number): void {
    this.model.feel(face, seconds);
  }

  nod(): void {
    this.model.nod();
  }

}

/** About how long `text` takes to say (s). */
function lineSeconds(text: string): number {
  return Math.min(3.5, 0.5 + text.length * 0.045);
}
