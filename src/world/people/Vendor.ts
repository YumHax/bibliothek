import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import { PersonModel } from './PersonModel';
import { randomLook, type PersonLook } from './looks';
import type { Pose } from './poses';
import { blobShadow } from '../zone/ContactShadows';
import { SpeechBubble } from './SpeechBubble';
import { Attention, type AttentionRange } from './attention';
import type { SocialHook } from './socialHook';
import type { FaceKey, GestureName } from './motion/gestures';
import { random } from '@/random';

interface VendorOptions {
  /** Whose gaze to meet: the camera. */
  viewer: THREE.Object3D;
  /** What they say when clicked, one line at a time, round and round; a function is asked afresh at every click (a stallholder talking about their table). */
  lines: readonly string[] | (() => readonly string[]);
  /** Fixes the look (and the order of the lines). */
  seed?: number;
  look?: PersonLook;
  /** The caption when hovered. Default a stallholder's. */
  label?: string;
  /** Where they look when nobody is about, in their own frame (x, y, z): the wares on a table by default; a screen, a claw, a coin bowl. */
  focus?: [x: number, y: number, z: number];
  /** Short cries now and then when the player comes by (a speech bubble): "All tested!". None by default. */
  callOuts?: readonly string[];
  /** The name on what they say to the player. Default "Stallholder". */
  speaker?: string;
  /** Someone the player can talk to (docs/social.md): the social caption, and a click opens the conversation instead of a line. */
  social?: SocialHook;
}

/** A player nearer than this, in front of the stall, is noticed (and called out to). */
const NOTICE_RANGE = 4.5;
/** Who they notice: anyone within `NOTICE_RANGE` round the front of the stall. */
const ATTENTION: AttentionRange = { range: NOTICE_RANGE, cone: 1.3 };
/** Seconds they keep their eyes on the player after a line said to them, beyond its own length; after a word or a cry. */
const LINE_ATTENTION = 3;
const WORD_ATTENTION = 1.5;
/** Where the stall's wares are, from where the vendor stands: a little ahead and down, for the idle glance at the table. */
const TABLE_POINT = new THREE.Vector3(0, 0.85, 0.8);
/** The speech bubble's height over the floor. */
const BUBBLE_Y = 2.05;
/** Seconds between two cries at a player hanging about, drawn in this range. */
const CALL_OUT_EVERY: [number, number] = [18, 40];
/** How a stallholder stands while waiting; they change their mind every so often. */
const STANCES: Pose[] = ['stand', 'crossed', 'hips', 'pockets', 'crossed'];

/**
 * The stallholder: stands behind the table facing the aisle, shifts their weight, looks over
 * their wares, folds their arms or puts their hands on their hips for a while, and looks up at the
 * player coming to the stall (a nod sometimes, unfolding their arms), then now and then
 * (`Attention`), and mostly at them while talking to them. Clicking them gets a line, said over their head
 * (`speak`). Origin on the floor, faces local +z like the stall. Collides (a
 * standing person is not walked through), but never moves.
 */
export class Vendor extends THREE.Group implements Furniture, Interactable, Updatable {
  /** They shift about: they carry their own blob instead. */
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly model: PersonModel;
  private readonly viewer: THREE.Object3D;
  private readonly lines: () => readonly string[];
  private readonly caption: string;
  private readonly social: SocialHook | null;
  private readonly speaker: string;
  private readonly focus: THREE.Vector3;
  private nextLine: number;
  private glanceTimer = 0;
  private stanceTimer = 0;
  private glance = new THREE.Vector3();
  private readonly bubble = new SpeechBubble();
  private readonly callOuts: readonly string[];
  private callOutTimer: number;
  private readonly viewerPos = new THREE.Vector3();
  private readonly local = new THREE.Vector3();
  private readonly attention: Attention;
  private stance: Pose;

  constructor(options: VendorOptions) {
    super();
    this.name = 'Vendor';
    this.viewer = options.viewer;
    const lines = options.lines;
    this.lines = typeof lines === 'function' ? lines : () => lines;
    this.caption = options.label ?? 'Stallholder · chat';
    this.social = options.social ?? null;
    this.speaker = options.speaker ?? 'Stallholder';
    this.focus = options.focus ? new THREE.Vector3(...options.focus) : TABLE_POINT.clone();
    const seed = options.seed ?? 1;
    this.nextLine = seed;
    this.model = new PersonModel(options.look ?? randomLook(seed, 'vendor'), this.viewer, seed);
    this.add(this.model);
    const blob = blobShadow(0.55, 0.5);
    if (blob) this.add(blob);
    this.hitboxes = [this.model.hitbox];
    this.bubble.position.y = BUBBLE_Y;
    this.add(this.bubble);
    this.callOuts = options.callOuts ?? [];
    this.callOutTimer = CALL_OUT_EVERY[0] * (0.3 + (seed % 5) * 0.2);
    this.pickGlance();
    this.attention = new Attention(seed + 500);
    this.stance = STANCES[seed % STANCES.length]!;
    this.model.setPose(this.stance);
    this.stanceTimer = 8 + (seed % 7) * 3;
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-0.25, 0, -0.2), new THREE.Vector3(0.25, 1.8, 0.2));
  }

  update(dt: number): void {
    const looking = this.attention.update(dt, this, this.viewer, ATTENTION, this.viewerPos);
    // Noticing the player: a nod sometimes, and folded arms come undone.
    if (this.attention.takeNotice()) {
      this.model.nod();
      this.unfold();
    }
    this.local.copy(this.viewerPos);
    this.worldToLocal(this.local);
    const near = this.local.z > 0.3 && Math.hypot(this.local.x, this.local.z) < NOTICE_RANGE;
    if (near && this.callOuts.length) {
      this.callOutTimer -= dt;
      if (this.callOutTimer <= 0) {
        this.callOutTimer = THREE.MathUtils.lerp(CALL_OUT_EVERY[0], CALL_OUT_EVERY[1], random());
        this.say(this.callOuts[Math.floor(random() * this.callOuts.length)]!);
      }
    }
    if (looking) {
      this.model.gaze(this.viewerPos);
    } else {
      this.glanceTimer -= dt;
      if (this.glanceTimer <= 0) this.pickGlance();
      this.model.gaze(this.localToWorld(this.local.copy(this.glance)));
    }
    this.stanceTimer -= dt;
    if (this.stanceTimer <= 0) {
      this.stanceTimer = 12 + random() * 25;
      // Talking with the player, nobody folds their arms.
      const stances = this.attention.inConversation ? STANCES.filter((pose) => pose !== 'crossed') : STANCES;
      this.stance = stances[Math.floor(random() * stances.length)]!;
      this.model.setPose(this.stance);
    }
    this.model.update(dt);
  }

  /** A word or two in a bubble over their head ("Sold!", "Good eye!"). */
  say(text: string, seconds?: number): void {
    this.bubble.say(text, seconds, () => {
      this.model.talk(lineSeconds(text));
      this.attention.engage(WORD_ATTENTION);
    });
  }

  /** A line to the player, over their head with their name (`name`: someone met, by their own) (or in the subtitles, out of view): they talk it, eyes on the player. */
  speak(text: string, name = this.speaker): void {
    this.bubble.speak(text, name, () => {
      this.model.talk(lineSeconds(text));
      this.attention.engage(lineSeconds(text) + LINE_ATTENTION);
      this.unfold();
    });
  }

  /** Strikes a pose for a moment (a shrug, a wave), then goes back to waiting. */
  gesture(pose: Pose, seconds = 2.5): void {
    this.model.setPose(pose);
    this.stanceTimer = seconds;
  }

  /** A gesture now (a shrug, a laugh behind the hand). */
  gestureNow(name: GestureName): void {
    this.model.gesture(name);
  }

  /** A feeling on the face for `seconds`. */
  feel(face: FaceKey, seconds: number): void {
    this.model.feel(face, seconds);
  }

  /** A nod. */
  nod(): void {
    this.model.nod();
  }

  /** Arms folded come down (to the sides, the talking hands free). */
  private unfold(): void {
    if (this.stance !== 'crossed') return;
    this.stance = 'stand';
    this.model.setPose('stand');
    this.stanceTimer = Math.max(this.stanceTimer, 10);
  }

  setHovered(): void {
    // A person does not glow; the caption says it all.
  }

  label(): string {
    return this.social ? this.social.caption() : this.caption;
  }

  activate(session: SessionActions): void {
    if (this.social?.open(session)) {
      this.attention.engage(12);
      this.unfold();
      this.model.nod();
      return;
    }
    const lines = this.lines();
    if (!lines.length) return;
    this.speak(lines[this.nextLine % lines.length]!);
    this.nextLine++;
  }

  /** Now the focus (the table), now the aisle, now the far wall, each for a few seconds. */
  private pickGlance(): void {
    this.glanceTimer = 3 + random() * 6;
    const roll = random();
    if (roll < 0.5) this.glance.copy(this.focus).x += (random() - 0.5) * 0.6;
    else if (roll < 0.85) this.glance.set((random() - 0.5) * 6, 1.6, 3 + random() * 3);
    else this.glance.set((random() - 0.5) * 3, 1.5, -2);
  }
}

/** About how long `text` takes to say (s). */
function lineSeconds(text: string): number {
  return Math.min(3.5, 0.5 + text.length * 0.045);
}
