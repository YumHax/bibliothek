import * as THREE from 'three';
import type { Game, GameStatus } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { BoxArt, BoxArtLoader } from '@/covers/BoxArtLoader';
import { imageSourceOf } from '@/covers/generated/canvasUtils';
import { createCartridgeLabelTexture } from '@/covers/generated/CartridgeLabel';
import { createManualCoverTexture } from '@/covers/generated/ManualCover';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { BoxShell, SHELL_MATERIAL_ORDER, type ShellMaterials } from './box/BoxShell';
import { Cartridge } from './box/Cartridge';
import { LentTag } from './box/LentTag';
import { LidMotion } from './box/LidMotion';
import { Manual } from './box/Manual';
import { computeShellLayout, type ShellLayout } from './box/shellLayout';
import { slabSize } from './box/slabs';
import { plastic } from './materials/finishes';

const HOVER_POP_OUT = 0.02;
const OPEN_ANGLE = (160 * Math.PI) / 180;
const OPEN_SECONDS = 0.4;
const WISHLIST_OPACITY = 0.35;
/** A worn second-hand box: its printed faces are dulled to this tint instead of pure white. */
const WORN_TINT = 0xb8afa2;
/** Index of the invisible hit-volume material in `material`, after the seven shell materials. */
const HITBOX_INDEX = SHELL_MATERIAL_ORDER.length;

/**
 * A physical game box that opens like a clamshell: a hollow cardboard tray, a front lid hinged on
 * the left (-x) edge, and inside it the cartridge and the manual.
 *
 * The mesh itself is only the hit volume of the closed box (it draws nothing); the visible parts
 * are children. `material` still lists the shell materials in BoxGeometry order
 * `[right (+x), left (-x), top, bottom, front, back]`, then the interior paint and the hit-volume
 * material, so code tinting "the box's materials" keeps working.
 *
 * Boxes are not registered with the engine: whoever carries one calls `tick(dt)` to animate the lid.
 */
export class GameBox extends THREE.Mesh<THREE.BoxGeometry, THREE.Material[]> implements Interactable {
  readonly game: Game;
  readonly hitboxes: THREE.Object3D[] = [this];
  /** Where the box sits when at rest on its shelf (local to the shelf). */
  readonly restPosition = new THREE.Vector3();
  readonly restQuaternion = new THREE.Quaternion();

  private readonly faces: ShellMaterials;
  private readonly layout: ShellLayout;
  private readonly shell: BoxShell;
  private readonly cartridge: Cartridge;
  private readonly manual: Manual;
  private readonly lid = new LidMotion(OPEN_ANGLE, OPEN_SECONDS);
  private hovered = false;
  private status: GameStatus = 'owned';
  private lentTag: LentTag | null = null;
  private anisotropy = 1;
  /** A `worn` copy keeps a dulled cover (see `BoxCondition`). */
  private readonly worn: boolean;

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

    const hitVolume = new THREE.BoxGeometry(width, height, depth);
    for (const group of hitVolume.groups) group.materialIndex = HITBOX_INDEX;
    super(hitVolume, [...SHELL_MATERIAL_ORDER.map((name) => faces[name]), new THREE.MeshBasicMaterial({ visible: false })]);

    this.game = game;
    this.faces = faces;
    this.name = `GameBox:${game.id}`;

    this.layout = computeShellLayout(platform.boxDimensions, game.platform);
    this.shell = new BoxShell(this.layout, faces);
    this.cartridge = new Cartridge(this.layout.cartridge);
    this.manual = new Manual(this.layout.manual);
    this.add(this.shell, this.cartridge, this.manual);
    // Second-hand copies: no booklet when the condition says so, a dulled box when it is worn.
    this.worn = game.condition === 'worn';
    if (game.condition === 'noManual' || this.worn) this.manual.visible = false;

    // Progressive: generated faces first, the real cover when it arrives (nearest boxes first).
    void art.load(game, { onUpdate: (set) => this.applyArt(set), anchor: this }).then((set) => this.applyArt(set));
  }

  /** Frees every geometry, material and texture of the box and its contents. Remove it from the scene first. */
  dispose(): void {
    this.setStatusStyle('owned'); // drops the lent tag
    const seen = new Set<THREE.Material>();
    this.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      obj.geometry.dispose();
      const mats: THREE.Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const mat of mats) {
        if (seen.has(mat)) continue;
        seen.add(mat);
        (mat as THREE.MeshStandardMaterial).map?.dispose();
        mat.dispose();
      }
    });
  }

  get dimensions() {
    return getPlatform(this.game.platform).boxDimensions;
  }

  /** Call once the box has been placed on its shelf. */
  saveRestPose(): void {
    this.restPosition.copy(this.position);
    this.restQuaternion.copy(this.quaternion);
  }

  setHovered(hovered: boolean): void {
    if (this.hovered === hovered) return;
    this.hovered = hovered;
    this.faces.front.emissive.setHex(hovered ? 0x222222 : 0x000000);
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
    this.shell.setOpenAngle(0);
  }

  /** Advances the lid animation. Call every frame while the box can be open. */
  tick(dt: number): void {
    if (this.lid.tick(dt)) this.shell.setOpenAngle(this.lid.angle);
  }

  // --- Status ---------------------------------------------------------------------------------

  /** Wishlist boxes are see-through ghosts; lent boxes wear a paper tag on the cover. Idempotent. */
  setStatusStyle(status: GameStatus | undefined): void {
    const next = status ?? 'owned';
    if (next === this.status) return;
    this.status = next;

    const ghost = next === 'wishlist';
    for (const mat of this.visibleMaterials()) {
      mat.transparent = ghost;
      mat.opacity = ghost ? WISHLIST_OPACITY : 1;
      mat.depthWrite = !ghost;
      mat.needsUpdate = true;
    }
    this.traverse((obj) => {
      if (obj !== this && obj instanceof THREE.Mesh) obj.castShadow = !ghost;
    });

    if (next === 'lent' && !this.lentTag) {
      const lidSize = slabSize(this.layout.lidSlab);
      this.lentTag = new LentTag(lidSize.x, lidSize.y, lidSize.z, this.anisotropy);
      this.shell.lid.add(this.lentTag);
    } else if (next !== 'lent' && this.lentTag) {
      this.shell.lid.remove(this.lentTag);
      this.lentTag.dispose();
      this.lentTag = null;
    }
  }

  // --- Art ------------------------------------------------------------------------------------

  private applyArt(set: BoxArt): void {
    const swap = (mat: THREE.MeshStandardMaterial, tex: THREE.Texture) => {
      const previous = mat.map;
      if (previous === tex) return;
      mat.map = tex;
      mat.color.setHex(this.worn ? WORN_TINT : 0xffffff);
      mat.needsUpdate = true;
      previous?.dispose();
    };
    swap(this.faces.front, set.front);
    swap(this.faces.back, set.back);
    swap(this.faces.left, set.left);
    swap(this.faces.right, set.right);
    // Top and bottom flaps: plain, tinted by the cover's accent so the box reads as one object.
    const flap = set.accent.clone().multiplyScalar(0.35);
    this.faces.top.color.copy(flap);
    this.faces.bottom.color.copy(flap);
    this.faces.interior.color.copy(interiorColor(set.accent));

    this.anisotropy = Math.max(1, set.front.anisotropy, set.back.anisotropy);
    const cover = imageSourceOf(set.front);
    const labelArt = extraImage(set, 'title') ?? extraImage(set, 'snap') ?? cover;
    const cart = slabSize(this.layout.cartridge);
    this.cartridge.setLabel(createCartridgeLabelTexture(this.game, set.accent, labelArt, this.anisotropy, cart.x / cart.y));
    const manual = slabSize(this.layout.manual);
    this.manual.setCover(createManualCoverTexture(this.game, set.accent, cover, this.anisotropy, manual.x / manual.y));
  }

  /** Every material that actually draws something (shell, cartridge, manual). */
  private visibleMaterials(): THREE.Material[] {
    return [...SHELL_MATERIAL_ORDER.map((name) => this.faces[name]), ...this.cartridge.material, ...this.manual.material];
  }
}

/** Darker shade of the accent for the inside of the box, lifted a little so black covers do not give a black hole. */
function interiorColor(accent: THREE.Color): THREE.Color {
  return accent.clone().lerp(new THREE.Color(0x808080), 0.15).multiplyScalar(0.3);
}

/**
 * Optional extra faces the art loader may expose (`title` screen, in-game `snap`) as textures or
 * images. Read defensively so this file does not depend on them existing.
 */
function extraImage(set: BoxArt, key: 'title' | 'snap'): CanvasImageSource | null {
  const value: unknown = (set as Partial<Record<'title' | 'snap', unknown>>)[key];
  if (value instanceof THREE.Texture) return imageSourceOf(value);
  if (value instanceof HTMLImageElement) return value.complete && value.naturalWidth > 0 ? value : null;
  if (value instanceof HTMLCanvasElement) return value;
  return null;
}
