import * as THREE from 'three';
import { canvasTexture } from '@/graphics/canvas';
import type { KeepsakeDef } from '@/social/keepsakes';
import { cylinderMesh } from '../meshUtils';
import { paint, METAL } from '../materials/palette';
import { UsableProp, type UseOptions } from '../props/UsableProp';
import { SEAM } from '../props/joinery';
import { onSurface, type SurfaceLayer } from '../surface/layers';
import { keepsakeSize, paintKeepsake, paintPhoto } from './keepsakeTextures';

/*
 * One place for a friend's keepsake (docs/social.md "Keepsakes"): on the fridge door under a magnet, or on the
 * corkboard under a pin. Its click target is this prop, placed in front of the place (`fridgeKeepsakes`); its look
 * goes in whatever holds it (`holder`: the fridge door's panel, so it swings with the door, or the board), at `at` on
 * that face, lifted off it by a layer (`SlotPlace.layer`). Empty, it shows nothing and is taken out of the room.
 */

/** How thick the paper is drawn (one face, lifted by its layer), and how far a magnet or a pin stands. */
const MAGNET = { radius: 0.011, height: 0.006 };
const PIN = { radius: 0.005, height: 0.007 };
const MAGNET_COLOURS = [0xd9463c, 0x2f6fb3, 0xf0b429, 0x3f9b5e, 0x8e5bb5] as const;
/** How deep the click target stands out of the face. */
const TARGET_DEPTH = 0.03;

/** Where a slot is and how it holds its keepsake. */
interface SlotPlace {
  /** What holds its look (the fridge door's panel, the board), and where on that face. */
  holder: THREE.Object3D;
  at: THREE.Vector3;
  index: number;
  fastener: 'magnet' | 'pin';
  /** Its layer off the face: neighbours that may overlap take two different ones (no shared plane). */
  layer: SurfaceLayer;
  /** The click target's width and height: a little more than a keepsake, short of its neighbours. */
  target: readonly [number, number];
  /** The crosshair left it. */
  onLeave?: () => void;
}

/** What is shown in a slot: whose, which, and its picture for a photo. */
export interface SlotContent {
  key: string;
  person: string;
  def: KeepsakeDef;
  giver: string;
  photo?: string;
}

export class KeepsakeSlot extends UsableProp {
  /** What is shown now, or null. */
  content: SlotContent | null = null;
  private look: THREE.Group | null = null;
  private texture: THREE.CanvasTexture | null = null;
  private material: THREE.MeshStandardMaterial | null = null;
  private geometry: THREE.PlaneGeometry | null = null;

  constructor(use: UseOptions, private readonly place: SlotPlace) {
    super(use);
    this.name = 'KeepsakeSlot';
    this.target(place.target[0], place.target[1], TARGET_DEPTH, { z: TARGET_DEPTH / 2 });
  }

  override setHovered(hovered: boolean): void {
    if (!hovered) this.place.onLeave?.();
  }

  /** Shows `content` (null: empty), drawing it again only when it changed. */
  show(content: SlotContent | null): void {
    if ((content?.key ?? null) === (this.content?.key ?? null) && (content?.photo ?? null) === (this.content?.photo ?? null)) return;
    this.empty();
    this.content = content;
    if (!content) return;
    const { def } = content;
    const [w, h] = keepsakeSize(def.kind);
    const canvas = paintKeepsake(def, content.giver, content.key);
    const texture = canvasTexture(canvas, { anisotropy: 'facing' });
    this.texture = texture;
    this.material = onSurface(new THREE.MeshStandardMaterial({ map: texture, roughness: def.kind === 'photo' || def.kind === 'polaroid' ? 0.45 : 0.85 }), this.place.layer);
    this.geometry = new THREE.PlaneGeometry(w, h);
    const look = new THREE.Group();
    look.name = 'Keepsake';
    const paper = new THREE.Mesh(this.geometry, this.material);
    paper.castShadow = false;
    paper.receiveShadow = true;
    look.add(paper);
    // A magnet or a pin at its top, a hair proud of the paper.
    const top = h / 2 - Math.min(0.018, h * 0.15);
    const fast = this.place.fastener === 'magnet' ? MAGNET : PIN;
    const material = this.place.fastener === 'magnet' ? paint(MAGNET_COLOURS[this.place.index % MAGNET_COLOURS.length]!, 0.4) : METAL.brass();
    const knob = cylinderMesh(fast.radius, fast.height, material, { y: top, z: SEAM + fast.height / 2 }, { segments: 14 });
    knob.rotation.x = Math.PI / 2;
    knob.castShadow = false;
    look.add(knob);
    // Never quite straight: tilted a few degrees, its own way every time.
    look.rotation.z = (((this.place.index * 7919 + content.key.length * 31) % 13) - 6) * 0.012;
    look.position.set(this.place.at.x, this.place.at.y, this.place.at.z + this.place.layer.lift);
    this.place.holder.add(look);
    this.look = look;
    // A photo's print arrives as a picture: drawn in once it has loaded.
    if (def.kind === 'photo' && content.photo) {
      const image = new Image();
      image.onload = () => {
        if (this.texture !== texture) return;
        paintPhoto(canvas, image);
        texture.needsUpdate = true;
      };
      image.src = content.photo;
    }
  }

  private empty(): void {
    if (this.look) this.place.holder.remove(this.look);
    this.look = null;
    this.texture?.dispose();
    this.material?.dispose();
    this.geometry?.dispose();
    this.texture = null;
    this.material = null;
    this.geometry = null;
    this.content = null;
  }

  dispose(): void {
    this.empty();
  }
}
