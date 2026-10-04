import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { Prop } from '../props/Prop';
import { invisibleHitbox } from '../meshUtils';
import { paint, standard } from '../materials/palette';
import { INSET, PROUD } from '../props/joinery';
import { HoverGlint } from '../props/hoverGlint';

/** The chimneypiece's size: the mantel shelf's width and height, the jambs, the firebox's opening. */
const MANTEL = { width: 1.36, depth: 0.3, thickness: 0.05, y: 1.06 };
const JAMB = { width: 0.2, depth: 0.24 };
const OPENING = { width: 0.76, height: 0.78 };
const HEARTH = { width: 1.5, depth: 0.5, thickness: 0.025 };

const MARBLE = standard({ color: 0xe9e4dc, roughness: 0.22, metalness: 0 });
const VEIN = standard({ color: 0xcfc8bd, roughness: 0.3, metalness: 0 });
const IRON = paint(0x1d1d1f, 0.75);
const SOOT = paint(0x0e0d0c, 1);
const PHOTO = paint(0x6e5a44, 0.5);
const FRAME = standard({ color: 0xb08d4a, roughness: 0.35, metalness: 0.8 });
const CARD = paint(0xf3eee2, 0.8);

/** One mesh of `geometries` merged, in `material`. */
function merged(geometries: THREE.BufferGeometry[], material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(mergeGeometries(geometries)!, material);
  for (const g of geometries) g.dispose();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/** What the fireplace says when read: Mrs Roux's note on the mantel, by the photo she left. */
interface FireplaceNote {
  title: string;
  text: string;
}

/**
 * Mrs Roux's white marble chimneypiece on the party wall, as such flats have one in their best room: two jambs, a
 * frieze, the mantel shelf; the cast-iron fireback in a sooty firebox, a marble hearth on the parquet (never lit: the
 * flue was closed long ago). On the mantel, a framed photo and her folded note, read with a click. Wall-hung: origin on
 * the floor at the wall, +z into the room. Collides as a box (its hearth and jambs).
 */
export class Fireplace extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly glint: HoverGlint;

  constructor(private readonly note: FireplaceNote, mantel: { photo: number; note: number }) {
    super();
    this.name = 'Fireplace';
    const top = MANTEL.y;
    const jx = OPENING.width / 2 + JAMB.width / 2;
    const marble = [
      // The jambs, run a millimetre up into the shelf.
      box(JAMB.width, top + INSET, JAMB.depth, -jx, (top + INSET) / 2, JAMB.depth / 2),
      box(JAMB.width, top + INSET, JAMB.depth, jx, (top + INSET) / 2, JAMB.depth / 2),
      // The frieze over the opening, between the jambs and buried in them, a little shallower.
      box(OPENING.width + 2 * INSET, top - OPENING.height, JAMB.depth - 0.02, 0, (top + OPENING.height) / 2, (JAMB.depth - 0.02) / 2),
      // The shelf, proud of everything under it.
      box(MANTEL.width, MANTEL.thickness, MANTEL.depth, 0, top + MANTEL.thickness / 2, MANTEL.depth / 2),
      // The hearth stone on the floor, standing a hair over it.
      box(HEARTH.width, HEARTH.thickness, HEARTH.depth, 0, HEARTH.thickness / 2 + PROUD, HEARTH.depth / 2),
    ];
    this.add(merged(marble, MARBLE));
    // A grey vein down each jamb's face and along the frieze, proud of the marble.
    const veins = [
      box(0.012, 0.6, 0.002, -jx + 0.03, 0.55, JAMB.depth + 0.001),
      box(0.01, 0.4, 0.002, jx - 0.05, 0.5, JAMB.depth + 0.001),
      box(0.3, 0.01, 0.002, 0.12, top - 0.12, JAMB.depth - 0.02 + 0.001),
    ];
    this.add(merged(veins, VEIN));
    // The firebox: soot at the back and sides, the cast-iron fireback with its grate.
    const back = 0.02;
    this.add(merged([box(OPENING.width, OPENING.height, 0.01, 0, OPENING.height / 2 + HEARTH.thickness, back)], SOOT));
    const iron = [
      box(OPENING.width - 0.1, OPENING.height - 0.12, 0.02, 0, (OPENING.height - 0.12) / 2 + HEARTH.thickness + 0.02, back + 0.015),
      box(0.5, 0.03, 0.18, 0, HEARTH.thickness + PROUD + 0.12, 0.14),
      box(0.03, 0.12, 0.03, -0.22, HEARTH.thickness + PROUD + 0.06, 0.2),
      box(0.03, 0.12, 0.03, 0.22, HEARTH.thickness + PROUD + 0.06, 0.2),
    ];
    this.add(merged(iron, IRON));

    // On the shelf: the photo in its gilt frame, leaning back; her note folded like a tent.
    const shelf = top + MANTEL.thickness;
    const frame = new THREE.Group();
    frame.position.set(mantel.photo, shelf, 0.12);
    frame.rotation.x = -0.18;
    const gilt = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.012), FRAME);
    gilt.position.y = 0.09;
    const picture = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.002), PHOTO);
    picture.position.set(0, 0.09, 0.006 + 0.001);
    frame.add(gilt, picture);
    this.add(frame);
    const card = new THREE.Group();
    card.position.set(mantel.note, shelf, 0.15);
    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.075, 0.001), CARD);
      leaf.position.set(0, 0.035, side * 0.012);
      leaf.rotation.x = side * 0.35;
      card.add(leaf);
    }
    this.add(card);
    this.glint = HoverGlint.of(gilt);

    const hitbox = invisibleHitbox(MANTEL.width, 0.3, MANTEL.depth + 0.04, { y: shelf + 0.12, z: MANTEL.depth / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  override get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-HEARTH.width / 2, 0, 0), new THREE.Vector3(HEARTH.width / 2, MANTEL.y + MANTEL.thickness, HEARTH.depth));
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string {
    return 'A note on the mantelpiece · read';
  }

  activate(session: SessionActions): void {
    session.read({ title: this.note.title, text: this.note.text, look: 'letter' });
  }
}
