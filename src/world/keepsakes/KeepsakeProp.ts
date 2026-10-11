import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { KeepsakeId } from '@/grandma/keepsakeLines';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { METAL, paint } from '../materials/palette';
import { Prop, part } from '../props/Prop';

/** Off the board they lie on (m): a hair, so no face of theirs shares the board's plane. */
const LIFT = 0.0015;

const PAPER = paint(0xe6dfcb, 0.9);
const NEWSPRINT = paint(0xd6d1c2, 0.95);
const INK = paint(0x4a4a4a, 0.9);
const CARD = paint(0xa8794a, 0.85);
const RED = paint(0x7a2a24, 0.7);
const FRAME = paint(0x2a2622, 0.5);
const SCREEN = paint(0x1b2440, 0.4);
const GLOW = paint(0xd8e4f0, 0.4);
const STICKER = paint(0xf2f0ea, 0.6);

/** The size of each keepsake's click box (width, height, depth), centred over its footprint. */
const SIZE: Record<Exclude<KeepsakeId, 'cushion'>, readonly [number, number, number]> = {
  wrapping: [0.12, 0.03, 0.085],
  screenPhoto: [0.085, 0.1, 0.05],
  gaspardLetter: [0.12, 0.02, 0.09],
  suitcaseLabel: [0.06, 0.02, 0.1],
  catalogue: [0.11, 0.02, 0.15],
  keyRing: [0.06, 0.02, 0.07],
  stickers: [0.06, 0.03, 0.06],
};

/**
 * One of the small things Mémé gave the player (docs/grandma.md "What the memories leave behind"), standing on Félix's
 * shelf: its caption is its name, and a click reads what there is to read on it (`read`, absent for the cushion's
 * kind). Origin at the middle of its footprint on the board's top. Never collides.
 */
export class KeepsakeProp extends Prop implements Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];

  constructor(
    readonly keepsake: Exclude<KeepsakeId, 'cushion'>,
    private readonly caption: string,
    private readonly read: (() => void) | null,
  ) {
    super();
    this.name = `Keepsake:${keepsake}`;
    const body = new THREE.Group();
    body.position.y = LIFT;
    this.add(body);
    MODELS[keepsake](body);
    const [w, h, d] = SIZE[keepsake];
    const hitbox = invisibleHitbox(w, h, d, { y: h / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  setHovered(_hovered: boolean): void {}

  label(): string | null {
    return this.read ? `${this.caption} · read` : this.caption;
  }

  activate(_session: SessionActions): void {
    this.read?.();
  }
}

/** A box lying on what is under it (its bottom at `on`, the top of what it lies on), at [x, z] (m). */
function slab(to: THREE.Object3D, size: readonly [number, number, number], material: THREE.Material, on = 0, x = 0, z = 0): THREE.Mesh {
  const [w, h, d] = size;
  return part(to, w, h, d, material, { x, y: on + h / 2, z });
}

const NEWS: readonly [number, number, number] = [0.11, 0.016, 0.075];
const PHOTO_FRAME: readonly [number, number, number] = [0.075, 0.095, 0.008];
const PHOTO: readonly [number, number, number] = [0.058, 0.074, 0.002];
const ENVELOPE: readonly [number, number, number] = [0.115, 0.004, 0.08];
const LABEL: readonly [number, number, number] = [0.05, 0.003, 0.09];
const BOOKLET: readonly [number, number, number] = [0.1, 0.008, 0.14];

const MODELS: Record<Exclude<KeepsakeId, 'cushion'>, (to: THREE.Group) => void> = {
  // The sports pages folded in eight, two columns of print showing.
  wrapping: (to) => {
    slab(to, NEWS, NEWSPRINT);
    for (const x of [-0.025, 0.025]) slab(to, [0.04, 0.001, 0.06], INK, NEWS[1], x).castShadow = false;
  },
  // A photo of a screen in a little black frame, leaning back on its strut; three lines of scores bright on it.
  screenPhoto: (to) => {
    const frame = new THREE.Group();
    frame.position.set(0, 0, 0.01);
    frame.rotation.x = -0.22;
    to.add(frame);
    const [fw, fh, fd] = PHOTO_FRAME;
    const [pw, ph, pd] = PHOTO;
    part(frame, fw, fh, fd, FRAME, { y: fh / 2 });
    part(frame, pw, ph, pd, SCREEN, { y: fh / 2, z: (fd + pd) / 2 }).castShadow = false;
    for (let i = 0; i < 3; i++) part(frame, 0.03 - i * 0.006, 0.004, pd / 2, GLOW, { x: -0.01, y: 0.068 - i * 0.012, z: (fd + pd) / 2 + (pd + pd / 2) / 2 }).castShadow = false;
    part(to, 0.008, 0.06, 0.006, FRAME, { y: 0.03, z: -0.012 }).rotation.x = 0.4;
  },
  // An envelope, the letter half out of it.
  gaspardLetter: (to) => {
    slab(to, ENVELOPE, PAPER);
    slab(to, [0.1, 0.002, 0.07], STICKER, ENVELOPE[1], 0.01, -0.01).rotation.y = 0.12;
  },
  // The brown luggage label and its knot of string.
  suitcaseLabel: (to) => {
    slab(to, LABEL, CARD).rotation.y = -0.2;
    slab(to, [0.004, 0.003, 0.05], PAPER, LABEL[1], 0.012, -0.06).rotation.y = 0.5;
  },
  // The sale's catalogue: a stapled booklet, a red band across its cover.
  catalogue: (to) => {
    slab(to, BOOKLET, PAPER);
    slab(to, [0.1, 0.001, 0.03], RED, BOOKLET[1], 0, -0.04).castShadow = false;
  },
  // The brass ring lying flat, its cardboard tag beside it.
  keyRing: (to) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0028, 8, 24), METAL.brass());
    ring.rotation.x = Math.PI / 2;
    ring.position.set(-0.01, 0.0028, 0.01);
    to.add(ring);
    slab(to, [0.028, 0.002, 0.042], CARD, 0, 0.016, -0.014).rotation.y = 0.5;
  },
  // Half a roll of round stickers on its cardboard core.
  stickers: (to) => {
    to.add(cylinderMesh(0.026, 0.022, STICKER, { y: 0.011 }, { segments: 24 }));
    to.add(cylinderMesh(0.011, 0.024, CARD, { y: 0.012 }, { segments: 16 }));
  },
};
