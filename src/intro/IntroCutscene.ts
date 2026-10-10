import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Look } from '@/graphics';
import type { PhotoLens } from '@/graphics/PostFx';
import { duckScene } from '@/audio/audioContext';
import { IntroScore } from '@/audio/introScore';
import { isAction } from '@/input/actions';
import { clamp, lerp, ramp, smooth, triangle } from '@/math/scalar';
import { reduceMotion } from '@/settings/motion';
import { IntroScreen } from '@/ui/intro/IntroScreen';
import { DreamFlat, type DreamFlatDeps } from './DreamFlat';
import { DREAM_LOOK, SALE_LOOK } from './introLooks';
import { BEATS, CUT_DIP, LINES, MORNING, SHOTS, TITLE, type IntroShot } from './introPlan';

/** How the player was asking to come in (`PointerLockFlow`'s modes): the film ends by entering the same way. */
type EntryMode = 'pointer' | 'gamepad' | 'touch' | undefined;

/** The player as the film parks and places it (`FirstPersonController` fits). */
interface IntroPlayer {
  readonly isSeated: boolean;
  sit(eyePosition: THREE.Vector3, yaw: number, instant?: boolean): void;
  stand(instant?: boolean): void;
  setPosition(x: number, z: number, feet?: number): void;
  setLook(yaw: number, pitch: number): void;
  lookAt(target: THREE.Vector3): void;
}

interface IntroDeps extends Omit<DreamFlatDeps, 'onGoing'> {
  camera: THREE.PerspectiveCamera;
  player: IntroPlayer;
  container: HTMLElement;
  /** The frame's grade (`graphics.setLook`) and lens (`postFx.setLens`, null on `low`). */
  setLook(look: Look, snap?: boolean): void;
  /** The zone's own look back, at once (the film ends where the player is). */
  zoneLook(): void;
  lens: { setLens(lens: PhotoLens | null): void } | null;
  /** The bed's wake-up poses (`furnishBedroom`'s `wakeUp`). */
  bed: { eyePose(): { position: THREE.Vector3; yaw: number }; approachPoint(out: THREE.Vector3): THREE.Vector3 };
  /** Presses, as `Input` gives them (Esc, Space, Enter, the pad's buttons skip or get up). */
  input: { onPress(handler: (code: string) => void): () => void };
  /** The menu kept down while the film plays (`Overlay.setModal`). */
  overlay: { setModal(modal: boolean): void };
  /** Ticks the film. */
  engine: { addUpdatable(u: Updatable): void; removeUpdatable(u: Updatable): void };
  /** The film is over: into the room, the way the player asked (`PointerLockFlow.enter`). */
  enter(mode: EntryMode): Promise<void>;
  /** The film was seen (persisted: it plays once). */
  seen(): void;
}

/** The camera's drift while a shot holds (m, and its pace in radians a second): a hand-held breath, not a shake. */
const DRIFT = { amount: 0.012, pace: 0.45 } as const;
/** Pad and keys that skip the film, or press "Get up" once it shows (Esc skips only: it is no gesture a mouse lock takes). */
const SKIP_CODES = ['Space', 'Enter', 'NumpadEnter', 'GamepadA', 'GamepadB', 'GamepadStart'];
/** A key skips the film only when pressed twice this close together (ms): a stray press does not cost the story. */
const SKIP_ARM_MS = 2500;
/** The narration's last line: what the film is about, put on the title's line when the film was skipped. */
const HOOK = LINES[LINES.length - 1]!.text;
/** At least this black, the screen hides a hitch: the dream's covers are uploaded then. */
const BLACK_ENOUGH = 0.85;

/**
 * THE OPENING (docs/story.md "The opening"): a minute of film before the first step in the flat. Uncle Félix's flat
 * as he had it (`DreamFlat`), filmed in four shots; the sale empties it; the black; the morning on the mattress, the
 * title, "Get up". The player is parked like photo mode and the camera is written every frame from `introPlan`. The
 * film's clock is the music's (the audio clock) whenever there is sound, so a stalled frame never leaves the picture
 * behind the score; without sound it runs on the frames. An `Updatable` while it plays.
 */
export class IntroCutscene implements Updatable {
  /** The film's clock (s), and what is added to the music's clock to get it (a skip moves it on). */
  private t = 0;
  private jump = 0;
  private mode: EntryMode;
  private screen: IntroScreen | null = null;
  private readonly score = new IntroScore();
  private dream: DreamFlat | null = null;
  private shot: IntroShot | null = null;
  private saleStarted = false;
  private titled = false;
  private askedUp = false;
  private gettingUp = false;
  private finished = false;
  /** When a key last asked to skip (ms, `performance.now`); the button skips at once. */
  private skipArmedAt = -Infinity;
  private fov = 0;
  private drift: number = DRIFT.amount;
  private unsubscribe: (() => void) | null = null;
  private readonly look = new THREE.Vector3();
  private readonly at = new THREE.Vector3();

  constructor(private readonly deps: IntroDeps) {}

  /** Starts the film (from the click that asked to enter the room, `mode` its way in). */
  play(mode: EntryMode): void {
    const { deps } = this;
    this.mode = mode;
    this.fov = deps.camera.fov;
    this.drift = reduceMotion() ? 0 : DRIFT.amount;
    deps.overlay.setModal(true);
    const screen = new IntroScreen(deps.container, { onSkip: () => this.skip(), onGetUp: () => void this.getUp() }, TITLE);
    this.screen = screen;
    screen.show(true);
    screen.setBlack(1);
    screen.setBars(0);
    screen.setSkippable(true);
    // Parked like photo mode: the walk stops, the camera is the film's.
    if (!deps.player.isSeated) deps.player.sit(deps.camera.position.clone(), 0, true);
    this.unsubscribe = deps.input.onPress((code) => this.onPress(code));
    // The room goes quiet: the music plays on the foreground bus, past the duck.
    duckScene(0, 1.2);
    this.score.start({ dreamIn: BEATS.dreamIn, saleIn: SHOTS[SHOTS.length - 1]!.from, silenceAt: BEATS.dreamOut });
    // Shown under the black: whatever it compiles or uploads now, nobody sees the hitch.
    this.dream = new DreamFlat({ ...deps, onGoing: () => this.score.vanish() });
    deps.setLook(DREAM_LOOK, true);
    deps.engine.addUpdatable(this);
    this.update(0);
  }

  update(dt: number): void {
    if (this.finished) return;
    const before = this.t;
    const music = this.score.elapsed();
    this.t = Math.max(before, music === null ? before + dt : music + this.jump);
    const t = this.t;
    const screen = this.screen!;

    // The bars close over the first black and open again as the player sits up.
    screen.setBars(t < BEATS.morningIn ? ramp(t, BEATS.bars, BEATS.bars + 1.8) : 1 - ramp(t, BEATS.sitUpFrom + 0.4, BEATS.sitUpTo + 0.8));
    const black = this.blackAt(t);
    screen.setBlack(black);
    screen.say(LINES.find((line) => t >= line.at && t < line.at + line.seconds)?.text ?? null);
    if (this.skipArmedAt > -Infinity && performance.now() - this.skipArmedAt > SKIP_ARM_MS) {
      this.skipArmedAt = -Infinity;
      screen.armSkip(false);
    }
    if (black >= BLACK_ENOUGH) this.dream?.flushCovers();

    if (t < BEATS.dreamOut) {
      if (t >= BEATS.saleFrom && !this.saleStarted) this.startSale();
      this.film(t);
      this.dream?.update(t);
    } else {
      this.putDreamAway();
      this.morning(t, before);
    }
    if (t >= BEATS.title && !this.titled) {
      this.titled = true;
      screen.setSkippable(false);
      screen.showTitle(true);
      this.score.title();
    }
    if (t >= BEATS.getUp && !this.askedUp) {
      this.askedUp = true;
      screen.showTitle(true, true);
    }
  }

  // --- The dream ---------------------------------------------------------------------------------

  /** The film's four shots, the camera eased along each, a breath of drift, the focus pulled where a shot says. */
  private film(t: number): void {
    const { camera, player, lens } = this.deps;
    const shot = SHOTS.find((s) => t < s.to) ?? SHOTS[SHOTS.length - 1]!;
    if (shot !== this.shot) {
      this.shot = shot;
      camera.fov = shot.fov;
      camera.updateProjectionMatrix();
    }
    // Half linear, half eased: the dolly never stops dead, nor starts with a jerk.
    const u = clamp((t - shot.from) / (shot.to - shot.from), 0, 1);
    const k = lerp(u, smooth(u), 0.6);
    const c = shot.camera;
    this.at.set(lerp(c.from[0], c.to[0], k), lerp(c.from[1], c.to[1], k), lerp(c.from[2], c.to[2], k));
    this.at.x += Math.sin(t * DRIFT.pace) * this.drift;
    this.at.y += Math.sin(t * DRIFT.pace * 1.3 + 1) * this.drift * 0.6;
    this.look.set(lerp(c.lookFrom[0], c.lookTo[0], k), lerp(c.lookFrom[1], c.lookTo[1], k), lerp(c.lookFrom[2], c.lookTo[2], k));
    camera.position.copy(this.at);
    player.lookAt(this.look);
    const focus = shot.lens.focusTo === undefined ? shot.lens.focus : lerp(shot.lens.focus, shot.lens.focusTo, smooth(u));
    lens?.setLens({ focus, blur: shot.lens.blur, exposure: 0 });
  }

  /** The black: over the first lines, a dip at every cut, down after the sale, up again on the morning. */
  private blackAt(t: number): number {
    if (t < BEATS.dreamIn) return 1;
    if (t < BEATS.dreamOut) {
      const fadeIn = 1 - ramp(t, BEATS.dreamIn, BEATS.dreamIn + 1.6);
      const cuts = Math.max(0, ...SHOTS.slice(1).map((s) => triangle(t, s.from, CUT_DIP)));
      const fadeOut = ramp(t, BEATS.dreamOut - 1.8, BEATS.dreamOut);
      return Math.max(fadeIn, cuts, fadeOut);
    }
    if (t < BEATS.morningIn) return 1;
    // The eyes open: slowly, with a blink half-way.
    const open = 1 - ramp(t, BEATS.morningIn, BEATS.morningIn + 2.4);
    const blink = 0.55 * triangle(t, BEATS.morningIn + 2.9, 0.18);
    return Math.max(open, blink);
  }

  /** The sale: the light drains, everything the dream showed goes, the farthest from the camera first. */
  private startSale(): void {
    this.saleStarted = true;
    this.deps.setLook(SALE_LOOK);
    this.dream?.sell(new THREE.Vector3(...SHOTS[SHOTS.length - 1]!.camera.from), BEATS.saleFrom, BEATS.saleTo);
  }

  /** In the black: the flat bare again, the zone's own look back. Once. */
  private putDreamAway(): void {
    if (!this.dream) return;
    this.dream.putAway();
    this.dream = null;
    this.deps.zoneLook();
  }

  // --- The morning -------------------------------------------------------------------------------

  /** On the mattress: lying, looking up; the eyes open, the player sits up and looks at the bare room. */
  private morning(t: number, before: number): void {
    const { camera, player, bed, lens } = this.deps;
    const { position, yaw } = bed.eyePose();
    const k = ramp(t, BEATS.sitUpFrom, BEATS.sitUpTo);
    // Lying: lower, and back towards the head of the bed (the eye pose looks at the foot, along -sin, -cos of the yaw).
    const back = (1 - k) * MORNING.lyingBack;
    camera.position.set(position.x + Math.sin(yaw) * back, position.y - (1 - k) * MORNING.lyingDrop, position.z + Math.cos(yaw) * back);
    player.setLook(yaw + MORNING.sittingTurn * k, lerp(MORNING.lyingPitch, MORNING.sittingPitch, k));
    if (this.shot) {
      this.shot = null;
      camera.fov = MORNING.fov;
      camera.updateProjectionMatrix();
    }
    const clear = ramp(t, BEATS.morningIn + 0.6, BEATS.sitUpFrom + 1.4);
    const { blurred, clear: sharp } = MORNING.lens;
    lens?.setLens({ focus: lerp(blurred.focus, sharp.focus, clear), blur: Math.round(lerp(blurred.blur, sharp.blur, clear)), exposure: 0 });
    // The room's sounds come back as the eyes open.
    if (before < BEATS.morningIn + 0.5 && t >= BEATS.morningIn + 0.5) duckScene(1, 3);
  }

  // --- Skipping and getting up -------------------------------------------------------------------

  private onPress(code: string): void {
    if (this.gettingUp || this.finished) return;
    if (this.askedUp) {
      if (SKIP_CODES.includes(code)) {
        if (code.startsWith('Gamepad')) this.mode = 'gamepad';
        this.screen?.pressGetUp();
      }
      return;
    }
    if (!isAction(code, 'close') && !SKIP_CODES.includes(code)) return;
    // A key asks first ("Again to skip" on the button), the second press skips: a stray key never costs the film.
    const now = performance.now();
    if (now - this.skipArmedAt <= SKIP_ARM_MS) this.skip();
    else {
      this.skipArmedAt = now;
      this.screen?.armSkip(true);
    }
  }

  /**
   * Straight to the morning, sat up, the title and "Get up" ready (the dream put away under the black), the
   * narration's last line kept under the title so the skipper still knows what the flat is about.
   */
  private skip(): void {
    if (this.t >= BEATS.getUp) return;
    this.skipArmedAt = -Infinity;
    this.screen?.armSkip(false);
    if (this.t < BEATS.morningIn) {
      this.score.stop();
      this.putDreamAway();
    }
    this.screen?.say(null);
    // The bars are open by then (the line has nowhere to show): the hook goes on the title's line instead.
    this.screen?.setTagline(`${HOOK} ${TITLE.line}`);
    this.jump += BEATS.getUp - this.t;
    this.t = BEATS.getUp;
  }

  /** "Get up": standing at the foot of the bed, the film's screen gone, into the room. */
  private async getUp(): Promise<void> {
    if (this.gettingUp || this.finished) return;
    this.gettingUp = true;
    const { deps } = this;
    const { yaw } = deps.bed.eyePose();
    const foot = deps.bed.approachPoint(new THREE.Vector3());
    deps.player.stand(true);
    deps.player.setPosition(foot.x, foot.z);
    deps.player.setLook(yaw + MORNING.sittingTurn, 0);
    deps.camera.fov = this.fov;
    deps.camera.updateProjectionMatrix();
    deps.lens?.setLens(null);
    this.finish();
    deps.seen();
    await deps.enter(this.mode);
    deps.overlay.setModal(false);
  }

  /** Stops ticking and takes the screen down. */
  private finish(): void {
    this.finished = true;
    this.deps.engine.removeUpdatable(this);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.screen?.dispose();
    this.screen = null;
  }
}
