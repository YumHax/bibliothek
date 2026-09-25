import * as THREE from 'three';
import type { Game, GameStatus } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { BoxArt, BoxArtLoader, BoxArtOptions, BoxDetails } from '@/covers/BoxArtLoader';
import { imageSourceOf } from '@/covers/generated/canvasUtils';
import { createBackTexture } from '@/covers/generated/BackTexture';
import { createCartridgeLabelTexture } from '@/covers/generated/CartridgeLabel';
import { createManualCoverTexture } from '@/covers/generated/ManualCover';
import type { Interactable } from '@/interaction/Interactable';
import type { Carriable } from '@/interaction/Carriable';
import type { SessionActions } from '@/game/SessionActions';
import { BoxShell, SHELL_MATERIAL_ORDER, type ShellMaterials } from './box/BoxShell';
import { Cartridge } from './box/Cartridge';
import { ClosedBox } from './box/ClosedBox';
import { LentTag } from './box/LentTag';
import { LidMotion } from './box/LidMotion';
import { Manual } from './box/Manual';
import { computeShellLayout, type ShellLayout } from './box/shellLayout';
import { slabSize } from './box/slabs';
import { plastic } from './materials/finishes';

const HOVER_POP_OUT = 0.02;
const HOVER_GLOW = 0x222222;
const OPEN_ANGLE = (160 * Math.PI) / 180;
const OPEN_SECONDS = 0.4;
const WISHLIST_OPACITY = 0.35;
/** A worn second-hand box: its printed faces are dulled to this tint instead of pure white. */
const WORN_TINT = 0xb8afa2;
/** Index of the invisible hit-volume material in `material`, after the seven shell materials. */
const HITBOX_INDEX = SHELL_MATERIAL_ORDER.length;

/** The openable box: built the first time the box is taken in hand, kept (off the GPU) afterwards. */
interface OpenableParts {
  shell: BoxShell;
  cartridge: Cartridge;
  manual: Manual;
}

/**
 * A physical game box that opens like a clamshell: a hollow cardboard tray, a front lid hinged on
 * the left (-x) edge, and inside it the cartridge and the manual.
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
export class GameBox extends THREE.Mesh<THREE.BoxGeometry, THREE.Material[]> implements Interactable, Carriable {
  readonly game: Game;
  readonly hitboxes: THREE.Object3D[] = [this];
  /** Where the box sits when at rest on its shelf (local to the shelf). */
  readonly restPosition = new THREE.Vector3();
  readonly restQuaternion = new THREE.Quaternion();

  private readonly art: BoxArtLoader;
  private readonly artOptions: BoxArtOptions;
  private readonly faces: ShellMaterials;
  private readonly layout: ShellLayout;
  private readonly closed: ClosedBox;
  private parts: OpenableParts | null = null;
  private readonly lid = new LidMotion(OPEN_ANGLE, OPEN_SECONDS);
  private hovered = false;
  private status: GameStatus = 'owned';
  private lentTag: LentTag | null = null;
  private anisotropy = 1;
  /** A `worn` copy keeps a dulled cover (see `BoxCondition`). */
  private readonly worn: boolean;
  /** False for a copy sold without its booklet (or a worn one). */
  private readonly hasManual: boolean;
  private inHand = false;
  /** A shelf casts this box's shadow with its proxy (see `Shelf`), so the closed box does not. */
  private shadowProxied = false;
  /** The latest art set, and the faces the closed box's atlas was painted from. */
  private current: BoxArt | null = null;
  private painted: Pick<BoxArt, 'front' | 'left' | 'right'> | null = null;
  private details: BoxDetails | null = null;
  private detailsAsked = false;
  /** Whether the back, the label and the manual cover are drawn for the current art. */
  private detailsPainted = false;
  private disposed = false;

  constructor(game: Game, art: BoxArtLoader) {
    const platform = getPlatform(game.platform);
    const { width, height, depth } = platform.boxDimensions;
    const accent = new THREE.Color(platform.accentColor);

    // The shell is printed card under a clear plastic sleeve: a clearcoat over the print (high quality).
    const side = () => plastic({ color: 0x0d0d0f, roughness: 0.7 }, 0.5);
    const faces: ShellMaterials = {
      right: side(),
      left: side(),
      top: side(),
      bottom: side(),
      front: plastic({ map: art.placeholder(game), roughness: 0.5 }, 0.7),
      back: side(),
      interior: new THREE.MeshStandardMaterial({ color: interiorColor(accent), roughness: 0.95 }),
    };

    const layout = computeShellLayout(platform.boxDimensions, game.platform);
    const closed = new ClosedBox(platform.boxDimensions, layout.hinge);
    const hitVolume = new THREE.BoxGeometry(width, height, depth);
    for (const group of hitVolume.groups) group.materialIndex = HITBOX_INDEX;
    super(hitVolume, [...SHELL_MATERIAL_ORDER.map((name) => faces[name]), new THREE.MeshBasicMaterial({ visible: false }), closed.material]);

    this.game = game;
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

    // Progressive: generated faces first, the real cover when it arrives (nearest boxes first).
    this.artOptions = { onUpdate: (set) => this.applyArt(set), anchor: this };
    void art.load(game, this.artOptions).then((set) => this.applyArt(set));
  }

  /** Frees every geometry, material and texture of the box and its contents, and lets go of its art. Remove it from the scene first. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.art.release(this.game, this.artOptions);
    this.setStatusStyle('owned'); // drops the lent tag
    this.geometry.dispose();
    this.material[HITBOX_INDEX]!.dispose();
    this.closed.dispose();
    if (this.parts) {
      this.parts.shell.dispose();
      this.parts.cartridge.dispose();
      this.parts.manual.dispose();
    }
    for (const name of SHELL_MATERIAL_ORDER) {
      this.faces[name].map?.dispose();
      this.faces[name].dispose();
    }
    this.details?.back?.dispose();
  }

  get dimensions() {
    return getPlatform(this.game.platform).boxDimensions;
  }

  /** False for a wishlist ghost: a shelf leaves it out of its shadow proxy. */
  get castsShadow(): boolean {
    return this.status !== 'wishlist';
  }

  /** Call once the box has been placed on its shelf. */
  saveRestPose(): void {
    this.restPosition.copy(this.position);
    this.restQuaternion.copy(this.quaternion);
  }

  setHovered(hovered: boolean): void {
    if (this.hovered === hovered) return;
    this.hovered = hovered;
    this.faces.front.emissive.setHex(hovered ? HOVER_GLOW : 0x000000);
    this.closed.material.emissive.setHex(hovered ? HOVER_GLOW : 0x000000);
    this.position.copy(this.restPosition);
    if (hovered) this.position.z += HOVER_POP_OUT;
  }

  label(): string {
    return `${this.game.title} — click to pick up`;
  }

  /** Picks the box up, or puts the one already in hand back when clicking another box. */
  activate(session: SessionActions): void {
    if (session.held) session.putBack();
    else session.pickUp(this);
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
      this.add(parts.shell, parts.cartridge, parts.manual);
      if (this.lentTag) parts.shell.lid.add(this.lentTag);
      this.showContents(this.lid.openness > 0);
      if (!this.detailsPainted) this.paintDetails();
      this.askDetails();
    } else if (this.parts) {
      const { shell, cartridge, manual } = this.parts;
      this.remove(shell, cartridge, manual);
      for (const mesh of [shell.tray, shell.lid, cartridge, manual]) mesh.geometry.dispose(); // off the GPU, uploaded again next time
      this.add(this.closed);
      if (this.lentTag) this.closed.lidAnchor.add(this.lentTag);
      this.dropDetails();
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
    this.lid.close();
  }

  toggleOpen(): void {
    this.lid.toggle();
  }

  /** Slams the lid shut without animating (used when the box lands back on its shelf). */
  snapClosed(): void {
    this.lid.reset();
    this.parts?.shell.setOpenAngle(0);
    this.showContents(false);
  }

  /** Advances the lid animation. Call every frame while the box can be open. */
  tick(dt: number): void {
    if (!this.lid.tick(dt)) return;
    this.parts?.shell.setOpenAngle(this.lid.angle);
    this.showContents(this.lid.openness > 0);
  }

  /** Cartridge and manual are drawn (and cast shadows) only while the lid is off the tray. */
  private showContents(shown: boolean): void {
    if (!this.parts) return;
    this.parts.cartridge.visible = shown;
    this.parts.manual.visible = shown && this.hasManual;
  }

  // --- Status ---------------------------------------------------------------------------------

  /** Wishlist boxes are see-through ghosts; lent boxes wear a paper tag on the cover. Idempotent. */
  setStatusStyle(status: GameStatus | undefined): void {
    const next = status ?? 'owned';
    if (next === this.status) return;
    this.status = next;
    this.styleMaterials(this.visibleMaterials());

    if (next === 'lent' && !this.lentTag) {
      const lidSize = slabSize(this.layout.lidSlab);
      this.lentTag = new LentTag(lidSize.x, lidSize.y, lidSize.z, this.anisotropy);
      this.lentTag.layers.mask = this.layers.mask;
      (this.inHand && this.parts ? this.parts.shell.lid : this.closed.lidAnchor).add(this.lentTag);
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

  /** Ghosts cast nothing; a box on a shelf leaves its shadow to the shelf's proxy, except in hand. */
  private updateShadows(): void {
    const ghost = !this.castsShadow;
    this.closed.castShadow = !ghost && !this.shadowProxied;
    if (this.parts) {
      for (const mesh of [this.parts.shell.tray, this.parts.shell.lid, this.parts.cartridge, this.parts.manual]) mesh.castShadow = !ghost;
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
    // Top and bottom flaps: plain, tinted by the cover's accent so the box reads as one object.
    const flap = set.accent.clone().multiplyScalar(0.35);
    this.faces.top.color.copy(flap);
    this.faces.bottom.color.copy(flap);
    this.faces.interior.color.copy(interiorColor(set.accent));
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
    if (set && this.painted && this.painted.front === set.front && this.painted.left === set.left && this.painted.right === set.right) return;
    const accent = set?.accent ?? new THREE.Color(getPlatform(this.game.platform).accentColor);
    this.closed.paint(
      {
        front: imageSourceOf(set?.front ?? this.faces.front.map),
        left: imageSourceOf(set?.left),
        right: imageSourceOf(set?.right),
        flap: accent.clone().multiplyScalar(0.35),
        back: accent.clone().multiplyScalar(0.2), // the generated back's ground
        tint: this.worn ? new THREE.Color(WORN_TINT) : null,
      },
      this.anisotropy,
    );
    this.painted = set;
  }

  /** The back (scanned, or generated with a screenshot once `details` has one), the cartridge label and the manual cover. */
  private paintDetails(): void {
    const parts = this.parts;
    if (!parts) return;
    const accent = this.current?.accent ?? new THREE.Color(getPlatform(this.game.platform).accentColor);
    const cover = imageSourceOf(this.faces.front.map);
    this.swap(this.faces.back, this.details?.back ?? createBackTexture(this.game, accent, this.details?.screenshot ?? null, this.anisotropy));
    const cart = slabSize(this.layout.cartridge);
    parts.cartridge.setLabel(createCartridgeLabelTexture(this.game, accent, cover, this.anisotropy, cart.x / cart.y));
    const manual = slabSize(this.layout.manual);
    parts.manual.setCover(createManualCoverTexture(this.game, accent, cover, this.anisotropy, manual.x / manual.y));
    this.detailsPainted = true;
  }

  /** Once per box: the back-cover sources, then the back is drawn again with them. */
  private askDetails(): void {
    if (this.detailsAsked) return;
    this.detailsAsked = true;
    void this.art.details(this.game).then((details) => {
      if (this.disposed) {
        details.back?.dispose();
        return;
      }
      this.details = details;
      if (!details.back && !details.screenshot) return;
      this.detailsPainted = false;
      if (this.inHand) this.paintDetails();
    });
  }

  /** Put down: what only the box in hand shows is freed (drawn again next time), the faces the atlas was made from leave the GPU. */
  private dropDetails(): void {
    const back = this.faces.back.map;
    this.faces.back.map = null;
    this.faces.back.needsUpdate = true;
    back?.dispose(); // a scanned back stays in `details`, off the GPU
    this.parts?.cartridge.setLabel(null);
    this.parts?.manual.setCover(null);
    for (const name of ['front', 'left', 'right'] as const) this.faces[name].map?.dispose();
    this.detailsPainted = false;
  }

  private buildParts(): OpenableParts {
    const parts: OpenableParts = {
      shell: new BoxShell(this.layout, this.faces),
      cartridge: new Cartridge(this.layout.cartridge),
      manual: new Manual(this.layout.manual),
    };
    // The layers the closed box was given (the zone's shadow layer, see `Zone.adopt`).
    for (const root of [parts.shell, parts.cartridge, parts.manual]) root.traverse((obj) => (obj.layers.mask = this.layers.mask));
    this.styleMaterials([...parts.cartridge.material, ...parts.manual.material]);
    return parts;
  }

  /** Every material that actually draws something (closed box, shell, cartridge, manual). */
  private visibleMaterials(): THREE.Material[] {
    const contents = this.parts ? [...this.parts.cartridge.material, ...this.parts.manual.material] : [];
    return [...SHELL_MATERIAL_ORDER.map((name) => this.faces[name]), this.closed.material, ...contents];
  }
}

/** Darker shade of the accent for the inside of the box, lifted a little so black covers do not give a black hole. */
function interiorColor(accent: THREE.Color): THREE.Color {
  return accent.clone().lerp(new THREE.Color(0x808080), 0.15).multiplyScalar(0.3);
}
