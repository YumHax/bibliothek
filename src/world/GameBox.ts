import * as THREE from 'three';
import type { BoxDimensions, Game, GameStatus } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { boxDimensionsOf, caseOf, mediaOf, type CaseKind, type MediaSpec } from '@/catalog/media';
import type { BoxArt, BoxArtLoader, BoxArtOptions, BoxDetails } from '@/covers/BoxArtLoader';
import { imageSourceOf } from '@/covers/generated/canvasUtils';
import { createBackTexture } from '@/covers/generated/BackTexture';
import { createCartridgeLabelTexture } from '@/covers/generated/CartridgeLabel';
import { createDiscPrintTexture } from '@/covers/generated/DiscPrint';
import { createManualCoverTexture } from '@/covers/generated/ManualCover';
import { createCartridgeBackTexture } from '@/covers/generated/CartridgeBack';
import type { Interactable } from '@/interaction/Interactable';
import type { Carriable } from '@/interaction/Carriable';
import type { SessionActions } from '@/game/SessionActions';
import { BoxShell, SHELL_MATERIAL_ORDER, type ShellMaterials } from './box/BoxShell';
import { ClosedBox } from './box/ClosedBox';
import { LentTag } from './box/LentTag';
import { LidMotion } from './box/LidMotion';
import { Manual } from './box/Manual';
import { computeShellLayout, mediaSlab, type ShellLayout } from './box/shellLayout';
import { slabSize, type Slab } from './box/slabs';
import { papersOf, type Paper } from './box/papers/paperContents';
import { paperStack, paperStackDepth } from './box/papers/paperStack';
import type { PageLook } from './box/papers/pageArt';
import type { PapersBox } from './box/papers/PaperReader';
import { createMediaModel } from './media/createMediaModel';
import type { MediaModel } from './media/MediaModel';
import { paint } from './materials/palette';
import { WishCard } from './box/WishCard';
import { FilmPeel } from './box/FilmPeel';
import { loanOf } from '@/collection/loans';
import { dentGeometry, dentObject, dentRoom, dentedCorner, setWrapped } from './box/copyLook';
import { plastic } from './materials/finishes';
import { printGlow } from './materials/printGlow';
import { SHARED_SHADOW_LAYER } from './zone/Zone';
import { playBoxClack, playWrapTear } from '@/audio/boxClack';
import { playPlasticClick, playSoftThud } from '@/audio/furnitureSounds';
import { damp, dampFactor } from '@/math/damp';
import { fnv1a, unit01 } from '@/random';
import { easeInOutQuad } from '@/math/easing';

/** How far a hovered box slides out of its row, how long it takes (s), and the faint lift of its cover's print. */
/**
 * The cartridge lifted out to be read: how long the way takes (s); when it is out of the box (0..1 of the way), then
 * in front of it; how far clear of the box it comes before turning (m).
 */
const LIFT_SECONDS = 0.55;
const LIFT_OUT = 0.35;
const LIFT_FORWARD = 0.65;
const LIFT_CLEARANCE = 0.004;
/** The cartridge lifted out and turned in the hand (`turnLifted`): a quarter turn at a key eases at this rate (1/s). */
const MEDIA_TURN_RATE = 12;
const HOVER_POP_OUT = 0.02;
const HOVER_SECONDS = 0.08;
const HOVER_GLOW = 0.16;
/** The reading light's colour (`setReading`): a warm bulb's. */
const READING_TINT = new THREE.Color(1, 0.94, 0.84);
/** Tipped out of its row to be looked at (`setTipped`): pulled this far out, its top this far towards the eye (radians), over this long (s). */
const TIP_OUT = 0.035;
const TIP_ANGLE = THREE.MathUtils.degToRad(24);
const TIP_SECONDS = 0.22;
/** How fast a box parts along its row to show where the box in hand would go (1/s), and when it is there (m). */
const PART_RATE = 16;
const PART_DONE = 1e-4;
/** Off a stall (no shelf to clear): how far the box slides out along its front before it flies to the hand (m). */
const SLIDE_OUT = 0.05;
/** A box moving to another spot on the shelves (the sort changed) takes this long (s). */
const SLIDE_SECONDS = 0.4;
/** A move to another row or bookcase goes out of the row, across in front of the boards and back in: it takes longer (s). */
const ROUND_SLIDE_SECONDS = 0.75;
const OPEN_ANGLE = (160 * Math.PI) / 180;
const OPEN_SECONDS = 0.4;
/** A wishlist game's parts, seen in hand: a see-through ghost (on the shelf it is a `WishCard` in the gap). */
const WISHLIST_OPACITY = 0.35;
/** A worn second-hand box: its printed faces are dulled to this tint instead of pure white. */
const WORN_TINT = 0xb8afa2;
/** Index of the invisible hit-volume material in `material`, after the seven shell materials. */
const HITBOX_INDEX = SHELL_MATERIAL_ORDER.length;

/** The openable box: built the first time the box is taken in hand, kept (off the GPU) afterwards. */
interface OpenableParts {
  shell: BoxShell;
  /** The cartridge or the disc, at real size. */
  media: MediaModel;
  /** The booklet, when the case has one of its own and the copy still has it. */
  manual: Manual | null;
  /** A jewel case's hub, the disc's rosette. */
  hub: THREE.Mesh | null;
}

/** The inside of a case: raw grey card, a clamshell's black plastic, a jewel case's black tray. */
const INTERIOR: Record<CaseKind, number> = { cardboard: 0x8e8576, clamshell: 0x151517, jewel: 0x0f0f11 };
/** The edges of a plastic case (a cardboard box's flaps are printed in the cover's accent instead). */
const PLASTIC_EDGE: Record<Exclude<CaseKind, 'cardboard'>, number> = { clamshell: 0x161618, jewel: 0x1c1d20 };
/** How the print looks: a satin varnish on card, a sleeve under a clamshell's clear plastic, a booklet under a jewel case's. */
const GLOSS: Record<CaseKind, { roughness: number; clearcoat: number }> = {
  cardboard: { roughness: 0.55, clearcoat: 0.25 },
  clamshell: { roughness: 0.5, clearcoat: 0.75 },
  jewel: { roughness: 0.45, clearcoat: 1 },
};
/** Contents rising out of an opened cardboard box start once the flap is this far open (0..1). */
const RISE_FROM = 0.3;

/**
 * A physical game box at its real size (`catalog/media`, by platform and region) that opens as the
 * real one does: a cardboard box by its top flap, its cartridge and manual rising out of it; a
 * Mega Drive clamshell or a jewel case like a book, the cartridge (or the disc on its hub) in the
 * tray and the manual under the lid's tabs.
 *
 * The mesh itself is only the hit volume of the closed box (it draws nothing); the visible parts
 * are children. Wherever it rests (a shelf, a stall) it is a `ClosedBox`, one mesh and one atlas;
 * `setInHand(true)` (the Inspector) swaps in the openable shell, and draws the back, the cartridge
 * label and the manual cover, which nobody sees otherwise. `material` lists the shell materials in
 * BoxGeometry order `[right (+x), left (-x), top, bottom, front, back]`, then the interior paint,
 * the hit-volume material and the closed box's, so code tinting "the box's materials" keeps working.
 *
 * Boxes are not registered with the engine: whoever carries one calls `tick(dt)` to animate the lid.
 */
export class GameBox extends THREE.Mesh<THREE.BoxGeometry, THREE.Material[]> implements Interactable, Carriable, PapersBox {
  readonly game: Game;
  readonly hitboxes: THREE.Object3D[] = [this];
  /** Where the box sits when at rest on its shelf (local to the shelf). */
  readonly restPosition = new THREE.Vector3();
  readonly restQuaternion = new THREE.Quaternion();
  /** Set by the shelf it stands on: out of the row far enough to clear the board's front edge (see `Carriable`). */
  slideOut = SLIDE_OUT;
  /**
   * Set by the shelving before its shelf lays the box out: it stands turned a quarter, its left spine out and its
   * cover to the right, taking its thickness of the row instead of its width (`Shelf.placeRow`). Off a shelf: false.
   */
  spineOut = false;
  onDisposed: (() => void) | null = null;
  /** The shelf it belongs on now (set by `Shelf.placeRow`, even while it is in hand): where the Inspector brings it back. */
  home: THREE.Object3D | null = null;

  private readonly dims: BoxDimensions;
  private readonly kind: CaseKind;
  private readonly mediaSpec: MediaSpec;
  private readonly art: BoxArtLoader;
  private readonly artOptions: BoxArtOptions;
  private readonly faces: ShellMaterials;
  private readonly layout: ShellLayout;
  private readonly closed: ClosedBox;
  private parts: OpenableParts | null = null;
  /** A plastic case's snap, or the soft knock of a card flap, as the lid swings to (`this.kind` is set in the constructor, before any swing). */
  private readonly lid = new LidMotion(OPEN_ANGLE, OPEN_SECONDS, (open) => (this.kind === 'cardboard' ? playSoftThud(open ? 0.03 : 0.05) : playPlasticClick(!open)));
  private hovered = false;
  /** How far out of the row the hover has brought it, 0..1 (eased by `settle`). */
  private pop = 0;
  /** How far it is tipped out of its row, 0..1, and whether it is asked to be (`setTipped`). */
  private tip = 0;
  private tipped = false;
  /** How far along its row the box stands aside (m, shelf-local x) for the box in hand, and how far it is going (`setParted`). */
  private part = 0;
  private partTarget = 0;
  /** A move to a new rest pose under way: where it started, how far along (0..1), the wait before it sets off. */
  private slide: { from: THREE.Vector3; fromQuaternion: THREE.Quaternion; t: number; delay: number; around: boolean } | null = null;
  /**
   * Set by the shelf the box stands on: called when the box starts moving (a hover, a slide), so the
   * shelf ticks `settle` until it rests. Without one (a market stall), the pose is set at once.
   */
  restless: ((box: GameBox) => void) | null = null;
  /** In the gap of a wishlist game on the shelf, instead of the box. */
  private wishCard: WishCard | null = null;
  private status: GameStatus = 'owned';
  private lentTag: LentTag | null = null;
  private anisotropy = 1; // convention-ok: until the art arrives, then the art set's own (the loader's GPU maximum)
  /** A `worn` copy keeps a dulled cover (see `BoxCondition`). */
  private readonly worn: boolean;
  /** False for a copy sold without its booklet (or a worn one). */
  private readonly hasManual: boolean;
  /** Still in its shrink-wrap (`unseal` takes it off in hand, the copy's seal broken). */
  private sealed = false;
  /** The wrap just torn off (`unseal`): the sheet peeling away, then the scrap it left in the box. */
  private film: FilmPeel | null = null;
  /** Its cartridge (or disc) lifted out of the open box towards the eye, to read the label (`liftMedia`), and how far it is now. */
  private lifted = false;
  private liftShown = 0;
  private inHand = false;
  /** The reading light on the faces now (`setReading`, linear radiance). */
  private reading = 0;
  /** The cartridge (or disc) lifted out, turned in the hand (`turnLifted`): its turn in the box's frame, and where a key is easing it to. */
  private readonly mediaTurn = new THREE.Quaternion();
  private mediaTurnGoal: THREE.Quaternion | null = null;
  /** What the box holds besides its media (`papersOf`, drawn once), and whether they are out being read (`setPapersOut`). */
  private papersHeld: readonly Paper[] | null = null;
  private papersOut = false;
  /** Its cartridge (or disc) is in a console: the box opens empty. */
  private mediaAway = false;
  /** A shelf casts this box's shadow with its proxy (see `Shelf`), so the closed box does not. */
  private shadowProxied = false;
  /** The latest art set, and the faces the closed box's atlas was painted from. */
  private current: BoxArt | null = null;
  private painted: Pick<BoxArt, 'front' | 'left' | 'right' | 'top'> | null = null;
  private details: BoxDetails | null = null;
  private detailsAsked = false;
  /** Counts the times the box was put down: details asked before the last one are not wanted any more. */
  private detailsAsk = 0;
  /** Whether the back, the label and the manual cover are drawn for the current art. */
  private detailsPainted = false;
  private disposed = false;
  /** Whether the box was on the shared shadow layer before it was taken in hand (every light renders it there). */
  private sharedBeforeHand = false;

  constructor(game: Game, art: BoxArtLoader) {
    const dims = boxDimensionsOf(game);
    const { width, height, depth } = dims;
    const kind = caseOf(game).kind;
    const mediaSpec = mediaOf(game);

    // Printed card with a satin varnish; a plastic case's sleeve and a jewel case's inlay shine through clear plastic (a clearcoat, high quality).
    const gloss = GLOSS[kind];
    // `printGlow` on every face: the reading light (`setReading`) lifts the spines' and the back's print as the front's.
    const side = () => printGlow(plastic({ color: 0x0d0d0f, roughness: gloss.roughness + 0.15 }, gloss.clearcoat * 0.7));
    const faces: ShellMaterials = {
      right: side(),
      left: side(),
      top: side(),
      bottom: side(),
      front: printGlow(plastic({ map: art.placeholder(game), roughness: gloss.roughness }, gloss.clearcoat)),
      back: side(),
      interior: new THREE.MeshStandardMaterial({ color: INTERIOR[kind], roughness: kind === 'cardboard' ? 0.95 : 0.4 }),
    };

    const layout = computeShellLayout(dims, kind, mediaSpec);
    const closed = new ClosedBox(dims, layout.cover.origin, gloss);
    const hitVolume = new THREE.BoxGeometry(width, height, depth);
    for (const group of hitVolume.groups) group.materialIndex = HITBOX_INDEX;
    super(hitVolume, [...SHELL_MATERIAL_ORDER.map((name) => faces[name]), new THREE.MeshBasicMaterial({ visible: false }), closed.material]);

    this.game = game;
    this.dims = dims;
    this.kind = kind;
    this.mediaSpec = mediaSpec;
    this.art = art;
    this.faces = faces;
    this.layout = layout;
    this.closed = closed;
    this.name = `GameBox:${game.id}`;
    this.add(closed);
    // Second-hand copies: no booklet when the condition says so, a dulled box when it is worn.
    this.worn = game.condition === 'worn';
    this.hasManual = !(game.condition === 'noManual' || this.worn);
    this.paintClosed(null);
    // The copy's variant (`box/copyLook`): a sealed box under its shrink-wrap, a crushed one with a corner pushed in.
    this.sealed = game.variant === 'sealed';
    if (this.sealed) setWrapped(this.wrappable(), true);
    if (game.variant === 'crushed') dentGeometry(closed.geometry, dentedCorner(game, dims), dims, this.dentRoom());

    // Progressive: generated faces first, the real cover when it arrives (nearest boxes first).
    this.artOptions = { onUpdate: (set) => this.applyArt(set), anchor: this };
    void art.load(game, this.artOptions).then((set) => this.applyArt(set));
  }

  /** Frees every geometry, material and texture of the box and its contents, and lets go of its art. Remove it from the scene first. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.onDisposed?.(); // the hand lets go of it first
    this.art.release(this.game, this.artOptions);
    this.setStatusStyle('owned'); // drops the lent tag and the wish card
    this.geometry.dispose();
    this.material[HITBOX_INDEX]!.dispose();
    this.closed.dispose();
    this.film?.dispose();
    if (this.parts) {
      this.parts.shell.dispose();
      this.parts.media.dispose();
      this.parts.manual?.dispose();
      this.parts.hub?.geometry.dispose();
    }
    for (const name of SHELL_MATERIAL_ORDER) {
      this.faces[name].map?.dispose();
      this.faces[name].dispose();
    }
    this.details?.front?.dispose();
    this.details?.back?.dispose();
    this.details?.cart?.dispose();
    this.details?.disc?.dispose();
  }

  /** The copy's own box: its platform's, as sold in its region (`catalog/media`). */
  get dimensions(): BoxDimensions {
    return this.dims;
  }

  /** Which way it comes out of its row, in its own frame (see `Carriable`): its front, or its spine when it stands spine out. Read only. */
  get slideAxis(): THREE.Vector3 {
    return this.spineOut ? SPINE_OUT : COVER_OUT;
  }

  /** False for a wishlist ghost or a game lent out (a card in the gap): a shelf leaves it out of its shadow proxy. */
  get castsShadow(): boolean {
    return !this.inGap;
  }

  /** A gap on the shelf with a card in it, no box: a game wished for, or one a friend has. */
  private get inGap(): boolean {
    return this.status === 'wishlist' || this.status === 'lent';
  }

  /** Call once the box has been placed on its shelf. */
  saveRestPose(): void {
    this.restPosition.copy(this.position);
    this.restQuaternion.copy(this.quaternion);
  }

  setHovered(hovered: boolean): void {
    // In hand it is parented to the scene: its rest pose (local to its shelf or stall) would throw it across the world.
    if (this.inHand || this.hovered === hovered) return;
    this.hovered = hovered;
    if (this.restless) return this.restless(this);
    this.pop = hovered ? 1 : 0;
    this.applyPose();
  }

  /**
   * Stands the box `dx` metres aside along its row (0: back at its rest pose), eased: where it would slide to were
   * the box in hand put in the gap aimed at (`ShelfPlacing`). Its rest pose is untouched.
   */
  setParted(dx: number): void {
    if (this.inHand || this.partTarget === dx) return;
    this.partTarget = dx;
    if (this.restless) return this.restless(this);
    this.part = dx;
    this.applyPose();
  }

  /** Where `setParted` is taking the box along its row (m): the row as the crosshair sees it. */
  get parted(): number {
    return this.partTarget;
  }

  /**
   * Tips the box half out of its row, its top towards the eye, to look at it without taking it (`shelving/BoxTipping`,
   * Q held), or lets it back; eased by its shelf's ticks. Its rest pose is untouched.
   */
  setTipped(tipped: boolean): void {
    if (this.inHand || this.tipped === tipped) return;
    this.tipped = tipped;
    if (this.restless) return this.restless(this);
    this.tip = tipped ? 1 : 0;
    this.applyPose();
  }

  label(): string {
    const away = this.mediaAway ? `, in the ${getPlatform(this.game.platform).shortName}` : '';
    if (this.status === 'lent' && !this.inHand) {
      const loan = loanOf(this.game.id);
      return `${this.game.title}, ${loan ? `lent to ${loan.who}` : 'lent out'} · read the note`;
    }
    const note = this.status === 'wishlist' ? ', on your wishlist' : this.status === 'lent' ? ', lent out' : away;
    if (this.tipped) return `${tippedCaption(this.game)}${note} · pick up`;
    return `${this.game.title}${note} · pick up`;
  }

  /** Picks the box up; clicking it with another box in hand puts that one back and takes this one once it is home. */
  activate(session: SessionActions): void {
    // A friend has it: the card in the gap says who, and when it comes back; there is no box to take.
    if (this.status === 'lent' && !this.inHand) {
      const loan = loanOf(this.game.id);
      session.react(loan ? `${loan.who} has ${this.game.title}. Back ${loan.back}.` : `${this.game.title} is out on loan.`);
      return;
    }
    const held = session.held;
    if (held === this) return session.putBack();
    if (held) session.putBack();
    // Off a shelf (it lands back with the same clack, see `setInHand`); a stall plays its own.
    if (this.shadowProxied && !held) playBoxClack(false, 0.1, this.kind === 'cardboard');
    session.pickUp(this);
  }

  /** On the wishlist (a ghost in the gap) or lent to a friend: not a copy the TV can play. */
  get playable(): boolean {
    // A sealed copy's cartridge is under the wrap: the seal is broken first (O, `game/CopyOpening`), never by a console.
    return this.status !== 'wishlist' && this.status !== 'lent' && !this.sealed;
  }

  get statusStyle(): GameStatus {
    return this.status;
  }

  /**
   * Sets off from where it stands now to its (new) rest pose, after `delay` seconds, over
   * `SLIDE_SECONDS`: the shelf re-sorted. Its shelf ticks it (`restless`); without one it jumps there.
   */
  slideToRest(delay: number): void {
    const from = this.position.clone();
    // Along its own row it slides; to another row (or bookcase) it would cut through the boards: out, across, in.
    // Turned spine out or cover out again: out of the row too, turned in front of it, then in.
    const around = Math.abs(from.y - this.restPosition.y) > 0.02 || from.distanceTo(this.restPosition) > 0.6 || this.quaternion.angleTo(this.restQuaternion) > 0.5;
    this.slide = { from, fromQuaternion: this.quaternion.clone(), t: 0, delay, around };
    if (this.restless) this.restless(this);
    else this.stopSettling(true);
  }

  /** One step of the hover pop and of a slide; false once the box is at rest (the shelf stops ticking it). */
  settle(dt: number): boolean {
    const want = this.hovered ? 1 : 0;
    if (this.pop !== want) this.pop = want > this.pop ? Math.min(1, this.pop + dt / HOVER_SECONDS) : Math.max(0, this.pop - dt / HOVER_SECONDS);
    if (this.part !== this.partTarget) {
      this.part = damp(this.part, this.partTarget, PART_RATE, dt);
      if (Math.abs(this.partTarget - this.part) < PART_DONE) this.part = this.partTarget;
    }
    if (this.slide) {
      if (this.slide.delay > 0) this.slide.delay -= dt;
      else this.slide.t = Math.min(1, this.slide.t + dt / (this.slide.around ? ROUND_SLIDE_SECONDS : SLIDE_SECONDS));
    }
    const tipWant = this.tipped ? 1 : 0;
    if (this.tip !== tipWant) this.tip = tipWant > this.tip ? Math.min(1, this.tip + dt / TIP_SECONDS) : Math.max(0, this.tip - dt / TIP_SECONDS);
    this.applyPose();
    if (this.slide && this.slide.t >= 1) this.slide = null;
    return this.pop !== want || this.slide !== null || this.part !== this.partTarget || this.tip !== tipWant;
  }

  /** Off its shelf (taken in hand): the pop, the glow, the tip and any slide end here; `toRest` also puts it at its rest pose. */
  stopSettling(toRest = false): void {
    this.slide = null;
    this.pop = 0;
    this.tip = 0;
    this.tipped = false;
    this.part = this.partTarget = 0;
    this.setGlow(0);
    if (toRest) this.applyPose();
  }

  /** The rest pose (or on its way there), pushed out by the hover pop, and the cover's glow with it. */
  private applyPose(): void {
    const eased = THREE.MathUtils.smoothstep(this.pop, 0, 1);
    const slide = this.slide;
    if (slide && slide.t < 1 && slide.around) {
      // The first quarter out of the row, the middle half across in front of the boards, the last quarter in.
      const across = easeInOutQuad(THREE.MathUtils.clamp((slide.t - 0.25) / 0.5, 0, 1));
      const out = THREE.MathUtils.smoothstep(slide.t, 0, 0.25) * (1 - THREE.MathUtils.smoothstep(slide.t, 0.75, 1));
      this.position.lerpVectors(slide.from, this.restPosition, across);
      // Turning (spine out or back), it spins about its centre in front of the row: out far enough to clear its neighbours.
      const turning = slide.fromQuaternion.angleTo(this.restQuaternion) > 0.5;
      this.position.z += out * (this.slideOut + (turning ? Math.max(this.dims.width, this.dims.depth) / 2 : 0));
      this.quaternion.slerpQuaternions(slide.fromQuaternion, this.restQuaternion, across);
    } else if (slide && slide.t < 1) {
      const t = easeInOutQuad(slide.t);
      this.position.lerpVectors(slide.from, this.restPosition, t);
      this.quaternion.slerpQuaternions(slide.fromQuaternion, this.restQuaternion, t);
    } else {
      this.position.copy(this.restPosition);
      this.quaternion.copy(this.restQuaternion);
    }
    this.position.z += eased * HOVER_POP_OUT;
    this.position.x += this.part;
    const tip = THREE.MathUtils.smoothstep(this.tip, 0, 1);
    if (tip > 0) {
      // About its bottom front edge, the top coming out towards the eye, the whole box pulled out along its front.
      // Spine out, the row runs along the box's own z and the room is on its -x: the same tip in that frame.
      const { height, width, depth } = this.dims;
      const out = this.slideAxis;
      TIP_TURN.setFromAxisAngle(this.spineOut ? Z_AXIS : X_AXIS, TIP_ANGLE * tip);
      TIP_PIVOT.copy(out).multiplyScalar((this.spineOut ? width : depth) / 2).setY(-height / 2);
      TIP_SHIFT.copy(TIP_PIVOT).applyQuaternion(TIP_TURN).negate().add(TIP_PIVOT);
      TIP_SHIFT.addScaledVector(out, TIP_OUT * tip);
      this.position.add(TIP_SHIFT.applyQuaternion(this.quaternion));
      this.quaternion.multiply(TIP_TURN);
    }
    this.setGlow(Math.max(eased, tip));
  }

  private setGlow(amount: number): void {
    // In hand the shell's faces take the reading light instead (`setReading`).
    if (!this.inHand) this.faces.front.emissive.setScalar(HOVER_GLOW * amount);
    this.closed.material.emissive.setScalar(HOVER_GLOW * amount);
  }

  /**
   * The box examined up close reads as if held under a lamp, even in a dark room (`box/ReadingLight`): its printed
   * faces light their own print by `radiance` (linear, the scene's units; 0 off), warm. No light is added to the scene:
   * one more would recompile every program and the shadow budget is full. Only the box in hand takes it.
   */
  setReading(radiance: number): void {
    const value = this.inHand ? Math.max(0, radiance) : 0;
    if (value === this.reading) return;
    this.reading = value;
    for (const name of SHELL_MATERIAL_ORDER) if (name !== 'interior') this.faces[name].emissive.copy(READING_TINT).multiplyScalar(value);
  }

  /**
   * In hand (the Inspector's), the box is the openable shell with its back, cartridge and manual
   * drawn; put down, it is the one-draw closed box again and those textures leave the GPU.
   */
  setInHand(inHand: boolean): void {
    if (inHand === this.inHand || this.disposed) return;
    this.inHand = inHand;
    if (inHand) {
      const parts = (this.parts ??= this.buildParts());
      this.remove(this.closed);
      this.showWish();
      this.add(parts.shell, parts.media);
      if (parts.hub) this.add(parts.hub);
      if (parts.manual && !this.layout.manualOnLid) this.add(parts.manual); // one on the lid rides with the shell
      if (this.lentTag) parts.shell.cover.add(this.lentTag);
      this.placeContents();
      this.showContents(this.lid.openness > 0);
      if (!this.detailsPainted) this.paintDetails();
      this.askDetails();
      // Carried out of its room, it still casts: every zone's lights render the shared layer.
      this.sharedBeforeHand = this.layers.isEnabled(SHARED_SHADOW_LAYER);
      this.traverse((obj) => obj.layers.enable(SHARED_SHADOW_LAYER));
    } else if (this.parts) {
      const { shell, media, manual, hub } = this.parts;
      this.remove(shell, media);
      if (manual && manual.parent === this) this.remove(manual);
      if (hub) this.remove(hub);
      // Off the GPU, uploaded again next time.
      for (const mesh of [shell.tray, shell.lid, manual, hub]) mesh?.geometry.dispose();
      manual?.traverse((obj) => obj !== manual && (obj as THREE.Mesh).geometry?.dispose()); // the papers behind the booklet
      media.freeGpu();
      this.add(this.closed);
      if (this.lentTag) this.closed.lidAnchor.add(this.lentTag);
      this.dropDetails();
      this.setReading(0);
      this.showWish();
      if (!this.sharedBeforeHand) this.traverse((obj) => obj.layers.disable(SHARED_SHADOW_LAYER));
      // Home on a shelf again (the shelf took it back just before): the clack of it landing.
      if (this.shadowProxied) playBoxClack(true, 0.1, this.kind === 'cardboard');
    }
    this.updateShadows();
  }

  /** Set by the shelf the box stands on: its proxy casts the shadow (see `Shelf`). */
  setShadowProxied(proxied: boolean): void {
    if (proxied === this.shadowProxied) return;
    this.shadowProxied = proxied;
    this.updateShadows();
  }

  // --- Lid ------------------------------------------------------------------------------------

  /** True once asked to open, even while the lid is still swinging. */
  get isOpen(): boolean {
    return this.lid.isOpen;
  }

  /** 0 closed .. 1 fully open (eased), for anyone framing the opened box. */
  get openness(): number {
    return this.lid.openness;
  }

  open(): void {
    this.lid.open();
  }

  close(): void {
    this.lifted = false;
    this.lid.close();
  }

  toggleOpen(): void {
    if (this.lid.isOpen) this.lifted = false;
    this.lid.toggle();
  }

  /**
   * The open box's cartridge (or disc) lifted out towards the eye and tipped to show its label, or put back in its tray.
   * False when there is nothing to lift: the box shut, or its media in a console.
   */
  liftMedia(): boolean {
    if (!this.parts || this.mediaAway || this.lid.openness <= 0) return false;
    this.lifted = !this.lifted;
    return true;
  }

  /** Whether the media is out of the box in hand, being read. */
  get mediaLifted(): boolean {
    return this.lifted;
  }

  /** Its booklet is in it (the copy has kept it): open, it can be lifted out and read (`game/Hands`). */
  get hasBooklet(): boolean {
    return this.hasManual && this.status !== 'wishlist';
  }

  /** What the box holds besides its media, the booklet first (`box/papers`); none for a copy that lost its booklet. */
  get papers(): readonly Paper[] {
    return this.hasBooklet && this.layout.manual ? this.papersOfCopy() : [];
  }

  /** The booklet as it lies in the open box (the papers come out of it and go back there), once the box was in hand. */
  get bookletMesh(): THREE.Object3D | null {
    return this.parts?.manual ?? null;
  }

  /** What its papers' pages are drawn with: the game, its cover's accent, its cover art. */
  get pageLook(): PageLook {
    return { game: this.game, accent: this.current?.accent ?? new THREE.Color(getPlatform(this.game.platform).accentColor), art: imageSourceOf(this.faces.front.map) };
  }

  /** Its papers out of the box, read in front of the eye (`box/papers/PaperReader`): the booklet in it is hidden meanwhile. */
  setPapersOut(out: boolean): void {
    if (this.papersOut === out) return;
    this.papersOut = out;
    this.showContents(this.lid.openness > 0);
  }

  /** The copy's papers as they came (drawn once from its id; the booklet's page is the booklet's size in the box). */
  private papersOfCopy(): readonly Paper[] {
    if (this.papersHeld) return this.papersHeld;
    const manual = this.layout.manual;
    const size = manual ? slabSize(manual) : null;
    return (this.papersHeld = papersOf(this.game, this.hasManual && size ? { width: size.x, height: size.y } : null));
  }

  /**
   * The cartridge (or disc) lifted out, turned in the hand by `angle` about `axis` (world): at once (the mouse), or
   * eased (a quarter turn at a key). Its back with the sticker, its contacts, a disc's read side. False when nothing is lifted.
   */
  turnLifted(axis: THREE.Vector3, angle: number, eased: boolean): boolean {
    if (!this.lifted || !this.parts) return false;
    this.getWorldQuaternion(MEDIA_FRAME).invert();
    MEDIA_STEP.setFromAxisAngle(MEDIA_AXIS.copy(axis).applyQuaternion(MEDIA_FRAME), angle);
    if (eased) {
      this.mediaTurnGoal = (this.mediaTurnGoal ?? this.mediaTurn.clone()).premultiply(MEDIA_STEP).normalize();
      return true;
    }
    this.mediaTurn.premultiply(MEDIA_STEP).normalize();
    this.mediaTurnGoal?.premultiply(MEDIA_STEP).normalize();
    this.placeContents();
    return true;
  }

  /** The cartridge lifted out back to its label to the eye. False when nothing is lifted. */
  squareLifted(): boolean {
    if (!this.lifted) return false;
    this.mediaTurnGoal = new THREE.Quaternion();
    return true;
  }

  /** One frame of the lifted media's turn: eased to a key's goal; on its way back into the box, back square. True when it moved. */
  private stepMediaTurn(dt: number): boolean {
    if (!this.lifted && this.liftShown <= 0) {
      if (!this.mediaTurnGoal && this.mediaTurn.w === 1) return false;
      this.mediaTurn.identity();
      this.mediaTurnGoal = null;
      return true;
    }
    if (!this.lifted && !this.mediaTurnGoal && this.mediaTurn.w !== 1) this.mediaTurnGoal = new THREE.Quaternion();
    const goal = this.mediaTurnGoal;
    if (!goal) return false;
    const angle = this.mediaTurn.angleTo(goal);
    if (angle < 1e-3) {
      this.mediaTurn.copy(goal);
      this.mediaTurnGoal = null;
    } else this.mediaTurn.rotateTowards(goal, Math.max(angle * dampFactor(MEDIA_TURN_RATE, dt), 2.5 * dt));
    return true;
  }

  /** Whether the box still wears its shrink-wrap. */
  get isSealed(): boolean {
    return this.sealed;
  }

  /** The shrink-wrap comes off (the seal broken at home, `game/CopyOpening`): the ordinary finish from now on. */
  unseal(): void {
    if (!this.sealed) return;
    this.sealed = false;
    setWrapped(this.wrappable(), false);
    playWrapTear();
    this.film?.dispose();
    this.film = new FilmPeel(this, this.dims, this.layers.mask);
    this.film.scrap.visible = this.lid.openness > 0;
  }

  /** The printed outside: what the shrink-wrap covers. */
  private wrappable(): THREE.MeshStandardMaterial[] {
    return [this.faces.front, this.faces.back, this.faces.left, this.faces.right, this.faces.top, this.faces.bottom, this.closed.material];
  }

  /** Slams the lid shut without animating (used when the box lands back on its shelf). */
  snapClosed(): void {
    this.lifted = false;
    this.liftShown = 0;
    this.mediaTurn.identity();
    this.mediaTurnGoal = null;
    this.papersOut = false;
    this.lid.reset();
    this.parts?.shell.setOpenAngle(0);
    this.showContents(false);
  }

  /** Advances the lid animation. Call every frame while the box can be open. */
  tick(dt: number): void {
    this.film?.tick(dt);
    const lift = this.lifted && this.lid.openness > 0 && !this.mediaAway ? 1 : 0;
    if (Math.abs(this.liftShown - lift) > 1e-3) {
      // At a steady pace: the way out of the box is as smooth as the way to the eye.
      this.liftShown = THREE.MathUtils.clamp(this.liftShown + Math.sign(lift - this.liftShown) * (dt / LIFT_SECONDS), 0, 1);
      this.placeContents();
    }
    if (this.stepMediaTurn(dt)) this.placeContents();
    if (!this.lid.tick(dt)) return;
    this.parts?.shell.setOpenAngle(this.lid.angle);
    this.placeContents();
    this.showContents(this.lid.openness > 0);
  }

  /** Where the hand holds the opened box instead (see `Carriable.openShift`): to the right of a book-like case's spread, lower under a box's rising contents. */
  get openShift(): { x: number; y: number } {
    const rise = this.layout.rise.media * 0.6;
    return this.layout.opening === 'side' ? { x: this.dims.width * 0.5, y: 0 } : this.layout.opening === 'end' ? { x: -rise, y: 0 } : { x: 0, y: -rise };
  }

  /** Cartridge and manual are drawn (and cast shadows) only while the lid is off the tray. */
  private showContents(shown: boolean): void {
    if (!this.parts) return;
    this.parts.media.visible = shown && !this.mediaAway;
    if (this.film) this.film.scrap.visible = shown;
    if (this.parts.manual) this.parts.manual.visible = shown && !this.papersOut;
    if (this.parts.hub) this.parts.hub.visible = shown;
  }

  /** Out of an opened cardboard box the cartridge slides (the manual behind it a little less), up or out of its end; in a plastic case it stays in its tray. */
  private placeContents(): void {
    const parts = this.parts;
    if (!parts) return;
    const out = THREE.MathUtils.smoothstep(this.lid.openness, RISE_FROM, 1);
    const axis = this.layout.opening === 'end' ? 'x' : 'y';
    parts.media.position.copy(this.layout.media.centre);
    parts.media.position[axis] += this.layout.rise.media * out;
    // Lifted to read: out of the box, towards the eye, the label tipped up to it; turned in the hand on top of that.
    const lift = this.liftShown;
    if (lift > 0) parts.media.position.add(this.liftOffset(lift));
    parts.media.rotation.set(-0.35 * THREE.MathUtils.smoothstep(lift, LIFT_FORWARD, 1), 0, this.layout.media.sideways ? Math.PI / 2 : 0);
    parts.media.quaternion.premultiply(this.mediaTurn);
    const manual = this.layout.manual;
    if (parts.manual && manual && !this.layout.manualOnLid) parts.manual.position[axis] = (manual[axis].min + manual[axis].max) / 2 + this.layout.rise.manual * out;
  }

  /**
   * Where the media lifted to be read stands, `lift` of the way (0..1), from where it stands in the open box: first
   * on out the way the box opens until clear of it, then forward, then up to the eye and tipped. Never through a wall.
   */
  private liftOffset(lift: number): THREE.Vector3 {
    const layout = this.layout;
    const axis = layout.opening === 'end' ? 'x' : layout.opening === 'top' ? 'y' : 'z';
    const held = mediaSlab(layout, this.mediaSpec);
    const clear = Math.max(0, layout.outer[axis].max + LIFT_CLEARANCE - (held[axis].min + layout.rise.media));
    const forward = Math.max(this.dims.depth * 1.6, axis === 'z' ? clear : 0);
    const out = new THREE.Vector3().setComponent(['x', 'y', 'z'].indexOf(axis), clear);
    const before = out.clone().setZ(forward);
    const read = new THREE.Vector3(0, this.dims.height * 0.45, forward);
    const step = (from: number, to: number): number => THREE.MathUtils.smoothstep(lift, from, to);
    return out
      .clone()
      .multiplyScalar(step(0, LIFT_OUT))
      .addScaledVector(before.clone().sub(out), step(LIFT_OUT, LIFT_FORWARD))
      .addScaledVector(read.sub(before), step(LIFT_FORWARD, 1));
  }

  /** How far a crushed copy's corner may be pushed in: up to its cartridge and booklet (`box/copyLook`). */
  private dentRoom(): THREE.Vector3 {
    const held = [mediaSlab(this.layout, this.mediaSpec)];
    if (this.layout.manual && this.hasManual) held.push(this.layout.manual);
    return dentRoom(dentedCorner(this.game, this.dims), this.layout.cavity, held);
  }

  // --- Media ----------------------------------------------------------------------------------

  /** Freed (its shelf rebuilt it, it was sold): nothing may be flown back to it. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Whether its cartridge (or disc) is in a console just now. */
  get mediaOut(): boolean {
    return this.mediaAway;
  }

  /** Its cartridge went into a console (the box opens empty) or came back. */
  setMediaOut(out: boolean): void {
    if (this.mediaAway === out) return;
    this.mediaAway = out;
    this.showContents(this.lid.openness > 0);
  }

  /**
   * A new model of the box's media with its label printed (and the real one's photo when there is
   * one), in world space where the one in the box is (the box's middle while it is shut): what a
   * console takes. The caller adds it where it wants it (`attach` keeps the pose) and owns it.
   */
  takeMedia(): MediaModel {
    const model = createMediaModel(this.mediaSpec);
    const accent = this.current?.accent ?? new THREE.Color(getPlatform(this.game.platform).accentColor);
    model.setPrint(this.printFor(model, accent));
    const photo = this.mediaSpec.shape === 'disc' ? this.details?.disc : this.details?.cart;
    if (photo) {
      const copy = photo.clone();
      copy.needsUpdate = true;
      model.setPhoto(copy);
    }
    const inBox = this.parts && this.inHand && this.lid.openness > 0 && !this.mediaAway ? this.parts.media : this;
    inBox.updateWorldMatrix(true, false);
    inBox.matrixWorld.decompose(model.position, model.quaternion, new THREE.Vector3());
    model.traverse((obj) => (obj.layers.mask = this.layers.mask));
    return model;
  }

  private printFor(model: MediaModel, accent: THREE.Color): THREE.Texture {
    const cover = imageSourceOf(this.faces.front.map);
    return this.mediaSpec.shape === 'disc'
      ? createDiscPrintTexture(this.game, accent, cover, this.anisotropy)
      : createCartridgeLabelTexture(this.game, accent, cover, this.anisotropy, model.printAspect, model.printFold);
  }

  // --- Status ---------------------------------------------------------------------------------

  /**
   * Wishlist games leave a gap on the shelf with a handwritten card in it (a see-through ghost in
   * hand); lent boxes wear a paper tag on the cover. Idempotent.
   */
  setStatusStyle(status: GameStatus | undefined): void {
    const next = status ?? 'owned';
    if (next === this.status) return;
    this.status = next;
    this.styleMaterials(this.visibleMaterials());
    // A new card each time: wished-for and lent out are headed differently ("wanted", "lent to Sam").
    if (this.wishCard) {
      this.wishCard.removeFromParent();
      this.wishCard.dispose();
      this.wishCard = null;
    }
    if (this.inGap) {
      const { width, height } = this.dimensions;
      const loan = next === 'lent' ? loanOf(this.game.id) : null;
      const header = next === 'wishlist' ? 'wanted' : loan ? `lent to ${loan.who}` : 'lent out';
      this.wishCard = new WishCard(this.game.title, width, height, this.anisotropy, header);
      this.wishCard.layers.mask = this.layers.mask;
    }
    this.showWish();

    if (next === 'lent' && !this.lentTag) {
      const { width, height, thickness } = this.layout.cover;
      this.lentTag = new LentTag(width, height, thickness, this.anisotropy);
      this.lentTag.layers.mask = this.layers.mask;
      (this.inHand && this.parts ? this.parts.shell.cover : this.closed.lidAnchor).add(this.lentTag);
    } else if (next !== 'lent' && this.lentTag) {
      this.lentTag.removeFromParent();
      this.lentTag.dispose();
      this.lentTag = null;
    }
    this.updateShadows();
  }

  private styleMaterials(materials: readonly THREE.Material[]): void {
    const ghost = this.status === 'wishlist';
    for (const mat of materials) {
      if (mat.transparent === ghost) continue;
      mat.transparent = ghost;
      mat.opacity = ghost ? WISHLIST_OPACITY : 1;
      mat.depthWrite = !ghost;
      mat.needsUpdate = true;
    }
  }

  /**
   * A wishlist game, down: its card in the gap and no box. Swapped in and out of the group, not
   * hidden (the zone's culling shows every mesh it hid again).
   */
  private showWish(): void {
    const wish = this.inGap && !this.inHand;
    if (!this.inHand) {
      if (wish) this.remove(this.closed);
      else if (this.closed.parent !== this) this.add(this.closed);
    }
    if (!this.wishCard) return;
    if (wish) this.add(this.wishCard);
    else this.remove(this.wishCard);
  }

  /** Ghosts cast nothing; a box on a shelf leaves its shadow to the shelf's proxy, except in hand. */
  private updateShadows(): void {
    const ghost = !this.castsShadow;
    this.closed.castShadow = !ghost && !this.shadowProxied;
    if (this.parts) {
      for (const mesh of [this.parts.shell.tray, this.parts.shell.lid, this.parts.manual]) if (mesh) mesh.castShadow = !ghost;
    }
    if (this.lentTag) this.lentTag.castShadow = !ghost && (this.inHand || !this.shadowProxied);
  }

  // --- Art ------------------------------------------------------------------------------------

  private applyArt(set: BoxArt): void {
    if (this.disposed) return;
    this.current = set;
    this.swap(this.faces.front, set.front);
    this.swap(this.faces.left, set.left);
    this.swap(this.faces.right, set.right);
    if (set.top) {
      this.swap(this.faces.top, set.top);
      this.swap(this.faces.bottom, set.top);
    }
    // Top and bottom: a box's flaps tinted by the cover's accent so it reads as one object; a case's plain plastic.
    if (!set.top) {
      const flap = this.flapColour(set.accent);
      this.faces.top.color.copy(flap);
      this.faces.bottom.color.copy(flap);
    }
    this.anisotropy = Math.max(1, set.front.anisotropy);
    this.paintClosed(set);

    this.detailsPainted = false;
    if (this.inHand) this.paintDetails();
  }

  private swap(mat: THREE.MeshStandardMaterial, tex: THREE.Texture): void {
    const previous = mat.map;
    if (previous === tex) return;
    mat.map = tex;
    mat.color.setHex(this.worn ? WORN_TINT : 0xffffff);
    mat.needsUpdate = true;
    previous?.dispose();
  }

  /** The closed box's atlas, from the art set (null: the placeholder front, dark spines, the platform's accent). */
  private paintClosed(set: BoxArt | null): void {
    if (set && this.painted && this.painted.front === set.front && this.painted.left === set.left && this.painted.right === set.right && this.painted.top === set.top) return;
    const accent = set?.accent ?? new THREE.Color(getPlatform(this.game.platform).accentColor);
    this.closed.paint(
      {
        front: imageSourceOf(set?.front ?? this.faces.front.map),
        left: imageSourceOf(set?.left),
        right: imageSourceOf(set?.right),
        top: imageSourceOf(set?.top),
        flap: this.flapColour(accent),
        back: accent.clone().multiplyScalar(0.2), // the generated back's ground
        tint: this.worn ? new THREE.Color(WORN_TINT) : null,
        wear: { amount: this.wearAmount(), cardboard: this.kind === 'cardboard', seed: fnv1a(this.game.id) },
        dust: this.dustAmount(),
      },
      this.anisotropy,
    );
    this.painted = set;
  }

  /** How handled the box looks (`BoxAtlas.paintWear`): none sealed, a little complete, more without its manual, most worn. */
  private wearAmount(): number {
    if (this.game.variant === 'sealed') return 0;
    if (this.worn) return 1;
    return this.game.condition === 'noManual' ? 0.45 : 0.18;
  }

  /** A third of the boxes have stood a while: a film of dust on their tops, by the game (the same box, the same dust). */
  private dustAmount(): number {
    const r = unit01(`${this.game.id}|dust`);
    return r < 0.33 ? 0.3 + 2 * r : 0;
  }

  private flapColour(accent: THREE.Color): THREE.Color {
    return this.kind === 'cardboard' ? accent.clone().multiplyScalar(0.35) : new THREE.Color(PLASTIC_EDGE[this.kind]);
  }

  /** The back (scanned, or generated with a screenshot once `details` has one), the media's label (or its photo) and the manual cover. */
  private paintDetails(): void {
    const parts = this.parts;
    if (!parts) return;
    const accent = this.current?.accent ?? new THREE.Color(getPlatform(this.game.platform).accentColor);
    // The sharper front for the box held up (`BoxDetails.front`); the shelf's atlas keeps its own.
    const sharp = this.details?.front;
    // `swap` frees the shelf's front from the GPU (it stays in `current`, uploaded again if it is ever drawn).
    if (sharp) this.swap(this.faces.front, sharp);
    const cover = imageSourceOf(this.faces.front.map);
    this.swap(this.faces.back, this.details?.back ?? createBackTexture(this.game, accent, this.details?.screenshot ?? null, this.anisotropy));
    parts.media.setPrint(this.printFor(parts.media, accent));
    const photo = this.mediaSpec.shape === 'disc' ? this.details?.disc : this.details?.cart;
    if (photo) parts.media.setPhoto(photo); // a scan stays in `details`, off the GPU when put down
    const sticker = parts.media.backPrintAspect;
    if (sticker) parts.media.setBackPrint?.(createCartridgeBackTexture(this.game, sticker));
    if (parts.manual && this.layout.manual) {
      const manual = slabSize(this.layout.manual);
      parts.manual.setCover(createManualCoverTexture(this.game, accent, cover, this.anisotropy, manual.x / manual.y));
    }
    this.detailsPainted = true;
  }

  /** Once per time in hand: the back-cover sources, then the back is drawn again with them. */
  private askDetails(): void {
    if (this.detailsAsked) return;
    this.detailsAsked = true;
    const asked = this.detailsAsk;
    void this.art.details(this.game).then((details) => {
      if (this.disposed) {
        details.front?.dispose();
        details.back?.dispose();
        details.cart?.dispose();
        details.disc?.dispose();
        return;
      }
      // Put down before they came: nobody reads them now (the next time in hand asks again, from the browser's cache).
      if (asked !== this.detailsAsk) return;
      this.details = details;
      if (!details.front && !details.back && !details.screenshot && !details.cart && !details.disc) return;
      this.detailsPainted = false;
      if (this.inHand) this.paintDetails();
    });
  }

  /**
   * Put down: what only the box in hand shows is freed (drawn again next time), the faces the atlas was made from leave
   * the GPU. The large images read in hand (`BoxDetails`: the sharp front, the scanned back, the label's photo) are let
   * go altogether, so only the box in hand ever holds them; taken up again, it asks for them again.
   */
  private dropDetails(): void {
    const back = this.faces.back.map;
    this.faces.back.map = null;
    this.faces.back.needsUpdate = true;
    back?.dispose();
    // The shelf's front again in place of the sharp one (`swap` takes the sharp one off the GPU).
    if (this.current && this.details?.front && this.faces.front.map === this.details.front) this.swap(this.faces.front, this.current.front);
    this.parts?.media.setPhoto(null);
    this.parts?.media.setPrint(null);
    this.parts?.media.setBackPrint?.(null);
    this.parts?.manual?.setCover(null);
    for (const name of ['front', 'left', 'right', 'top', 'bottom'] as const) this.faces[name].map?.dispose();
    this.detailsPainted = false;
    if (this.details) {
      this.details.cart?.dispose();
      this.details.disc?.dispose();
    }
    this.details = null;
    this.detailsAsked = false;
    this.detailsAsk++;
    this.art.forgetDetails(this.game);
  }

  /**
   * `World.prime`'s `ShaderPrimer`: what only a box in hand draws (the shell's printed faces with their
   * maps, a labelled cartridge, a covered manual), as copies with a 1-pixel map, so the first box
   * picked up links no program. The caller drops the copy without disposing it (see `ShaderPrimer`).
   */
  primeShaders(): THREE.Object3D {
    const map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
    const printed = new Set<keyof ShellMaterials>(['front', 'back', 'left', 'right']);
    const faces = Object.fromEntries(
      SHELL_MATERIAL_ORDER.map((name) => {
        // A clone loses the shader patch (`onBeforeCompile` is not copied): the printed faces' `printGlow` put back.
        const material = name === 'interior' ? this.faces[name].clone() : printGlow(this.faces[name].clone());
        if (printed.has(name)) material.map = map;
        return [name, material];
      }),
    ) as unknown as ShellMaterials;
    const media = createMediaModel(this.mediaSpec);
    media.setPrint(map);
    const root = new THREE.Group();
    root.add(new BoxShell(this.layout, faces), media);
    if (this.layout.manual) {
      const manual = new Manual(this.layout.manual);
      manual.setCover(map);
      root.add(manual);
    }
    return root;
  }

  private buildParts(): OpenableParts {
    const layout = this.layout;
    const shell = new BoxShell(layout, this.faces);
    // Dented at its closed pose before anything rides on it (the manual on a lid stays as it is).
    if (this.game.variant === 'crushed') dentObject(shell, dentedCorner(this.game, this.dims), this.dims, this.dentRoom());
    const media = createMediaModel(this.mediaSpec);
    let manual: Manual | null = null;
    if (layout.manual && this.hasManual) {
      // The papers that came with the copy stand behind the booklet, in the back of its room (`box/papers/paperStack`).
      const papers = this.papersOfCopy();
      const depth = paperStackDepth(papers, layout.manual.z.max - layout.manual.z.min);
      const booklet: Slab = { ...layout.manual, z: { min: layout.manual.z.min + depth, max: layout.manual.z.max } };
      manual = new Manual(booklet);
      manual.add(paperStack(papers, slabSize(booklet), depth, layout.opening === 'top'));
      if (layout.manualOnLid) {
        // Under the lid's tabs, in its hinge space, the cover turned to face in: it shows as the lid swings open.
        manual.position.sub(layout.hinge);
        manual.rotation.set(0, Math.PI, 0.015);
        shell.lid.add(manual);
      } else {
        manual.rotation.set(0, 0, 0); // stood upright behind the cartridge, no room to lean
      }
    }
    let hub: THREE.Mesh | null = null;
    if (layout.kind === 'jewel') {
      hub = new THREE.Mesh(new THREE.CylinderGeometry(0.0145, 0.0145, 0.0016, 24), paint(0x141416, 0.45));
      hub.rotation.x = Math.PI / 2;
      hub.position.set(layout.media.centre.x, layout.media.centre.y, layout.cavity.z.min + 0.0008);
    }
    const parts: OpenableParts = { shell, media, manual, hub };
    // The layers the closed box was given (the zone's shadow layer, see `Zone.adopt`).
    for (const root of [shell, media, manual, hub]) root?.traverse((obj) => (obj.layers.mask = this.layers.mask));
    this.styleMaterials([...media.materials, ...bookletMaterials(manual)]);
    return parts;
  }

  /** Every material that actually draws something (closed box, shell, media, manual). */
  private visibleMaterials(): THREE.Material[] {
    const contents = this.parts ? [...this.parts.media.materials, ...bookletMaterials(this.parts.manual)] : [];
    return [...SHELL_MATERIAL_ORDER.map((name) => this.faces[name]), this.closed.material, ...contents];
  }
}

/** The booklet's materials and those of the papers stacked behind it (a wishlist ghost fades them all). */
function bookletMaterials(manual: Manual | null): THREE.Material[] {
  const out: THREE.Material[] = [];
  manual?.traverse((obj) => {
    const material = (obj as THREE.Mesh).material;
    if (material) out.push(...(Array.isArray(material) ? material : [material]));
  });
  return out;
}

/** Scratch for turning the lifted media (`turnLifted`), one box at a time. */
const MEDIA_FRAME = new THREE.Quaternion();
const MEDIA_AXIS = new THREE.Vector3();
const MEDIA_STEP = new THREE.Quaternion();

/** Scratch for the tip (`applyPose`), one box at a time. */
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
/** Out of its row in the box's own frame: along its front, or (spine out) its left side. Read only. */
const COVER_OUT = new THREE.Vector3(0, 0, 1);
const SPINE_OUT = new THREE.Vector3(-1, 0, 0);
const TIP_TURN = new THREE.Quaternion();
const TIP_PIVOT = new THREE.Vector3();
const TIP_SHIFT = new THREE.Vector3();

const CONDITION_WORDS = { complete: 'complete', noManual: 'no manual', worn: 'worn' } as const;
const EDITION_WORDS = { firstPrint: 'first print', standard: '', budget: 'budget re-release' } as const;

/** A tipped box's caption: what a look at the box itself tells (the year, the platform, the copy's edition and state). */
function tippedCaption(game: Game): string {
  const year = game.releaseDate?.slice(0, 4);
  const facts = [
    year && /^\d{4}$/.test(year) ? year : '',
    getPlatform(game.platform).shortName,
    game.edition ? EDITION_WORDS[game.edition] : '',
    game.condition ? CONDITION_WORDS[game.condition] : '',
  ].filter(Boolean);
  return `${game.title} (${facts.join(', ')})`;
}

