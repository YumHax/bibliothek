import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { inHours } from '@/time/clock';
import { clockShort } from '@/text/clock';
import type { Furniture } from '../../Furniture';
import type { Walker } from '../../people/Walker';
import { boxMesh, invisibleHitbox } from '../../meshUtils';
import { paint, standard, timber } from '../../materials/palette';
import { snowCovered, snowPaint } from '../snowCover';
import { FACADE, layMesh } from '../../surface/layers';

interface ChristmasStallOptions {
  /** The game hour now, and the stall's hours. */
  hours: () => number;
  open: readonly [number, number];
  /** Who keeps it (placed by the builder behind the counter): shown while it is open. */
  keeper: Walker;
  /** What a click does while it is open (the builder's: gift wrapping, hot chestnuts). */
  serve: (session: SessionActions) => void;
}

/** The chalet: its width (local x), depth, the counter's height, the eaves' and the ridge's. */
const CHALET = { width: 2.4, depth: 1.0, counter: 1.0, eaves: 2.25, ridge: 2.75 };
/** Fairy lights along the eaves: how many bulbs. */
const BULBS = 14;

/**
 * December's stall on Front Street (`STREET_PLACES.christmas`, while the street is dressed for Christmas): a little
 * timber chalet with a pitched roof, snow on it, fairy lights along its eaves, GIFT WRAPPING · HOT CHESTNUTS on its
 * board; open in its hours with its keeper behind the counter (the hatch's shutter down otherwise). Clicked while open,
 * `serve` (the builder's). Local +z faces the pavement. Collides.
 */
export class ChristmasStall extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly hitboxes: THREE.Object3D[];
  private readonly shutter: THREE.Mesh;
  private readonly bulbs: THREE.MeshStandardMaterial;
  private openNow: boolean | null = null;

  constructor(private readonly options: ChristmasStallOptions) {
    super();
    this.name = 'ChristmasStall';
    const { width, depth, counter, eaves, ridge } = CHALET;
    const wood = snowCovered(timber(0x7a5236, 0.75));
    const dark = timber(0x4a3222, 0.8);
    // The walls: the back, the sides, the counter's front under the hatch.
    this.add(boxMesh(width, eaves, 0.05, wood, { y: eaves / 2, z: -depth / 2 + 0.025 }));
    for (const x of [-width / 2 + 0.025, width / 2 - 0.025]) this.add(boxMesh(0.05, eaves, depth, wood, { x, y: eaves / 2 }));
    this.add(boxMesh(width - 0.1, counter, 0.05, wood, { y: counter / 2, z: depth / 2 - 0.025 }));
    this.add(boxMesh(width + 0.1, 0.05, 0.3, dark, { y: counter + 0.025, z: depth / 2 + 0.05 }));
    // The roof: two pitched leaves meeting on the ridge, snow on their tops.
    const rise = ridge - eaves;
    const run = depth / 2 + 0.25;
    const pitch = Math.atan2(rise, run);
    const leaf = Math.hypot(rise, run);
    const roof = snowPaint(0x5a3a26, 0.85);
    for (const side of [-1, 1]) {
      const slope = boxMesh(width + 0.3, 0.06, leaf, roof, { y: eaves + rise / 2, z: (side * run) / 2 });
      slope.rotation.x = side * pitch;
      this.add(slope);
    }
    // The gables' triangles over the side walls.
    for (const x of [-width / 2 + 0.025, width / 2 - 0.025]) {
      const shape = new THREE.Shape([new THREE.Vector2(-depth / 2, 0), new THREE.Vector2(depth / 2, 0), new THREE.Vector2(0, rise)]);
      const gable = new THREE.Mesh(new THREE.ShapeGeometry(shape), wood);
      gable.rotation.y = Math.PI / 2;
      gable.position.set(x + Math.sign(x) * 0.026, eaves, 0);
      if (x < 0) gable.rotation.y = -Math.PI / 2;
      gable.castShadow = true;
      this.add(gable);
    }
    // The board over the hatch.
    const board = new THREE.Mesh(new THREE.PlaneGeometry(width * 0.85, 0.3), new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.7 }));
    board.position.set(0, eaves - 0.2, depth / 2 + FACADE.card.lift);
    this.add(layMesh(board, FACADE.card));
    // The hatch's shutter, let down when it is shut.
    this.shutter = boxMesh(width - 0.1, eaves - counter - 0.45, 0.03, dark, { y: counter + (eaves - counter - 0.45) / 2, z: depth / 2 - 0.02 });
    this.add(this.shutter);
    // Fairy lights along the front eaves.
    this.bulbs = standard({ color: 0xffe2a0, emissive: 0xffc860, emissiveIntensity: 1.6, roughness: 0.4 });
    const bulb = new THREE.SphereGeometry(0.025, 8, 6);
    for (let i = 0; i < BULBS; i++) {
      const light = new THREE.Mesh(bulb, this.bulbs);
      const t = i / (BULBS - 1);
      light.position.set(-width / 2 + 0.1 + t * (width - 0.2), eaves - 0.04 - Math.sin(t * Math.PI * 3) ** 2 * 0.05, depth / 2 + 0.24);
      this.add(light);
    }
    // A string of greenery under the counter's edge.
    this.add(boxMesh(width + 0.08, 0.08, 0.08, paint(0x2a5a32, 0.9), { y: counter - 0.06, z: depth / 2 + 0.04 }));
    const hitbox = invisibleHitbox(width, eaves, depth + 0.3, { y: eaves / 2, z: 0.15 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    const { width, depth, counter } = CHALET;
    return new THREE.Box3(new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2, counter, depth / 2 + 0.2));
  }

  /** Where the keeper stands behind the counter (stall-local). */
  static get keeperAt(): THREE.Vector3 {
    return new THREE.Vector3(0.3, 0, -0.15);
  }

  update(): void {
    const open = inHours(this.options.hours(), this.options.open);
    if (open === this.openNow) return;
    this.openNow = open;
    this.shutter.visible = !open;
    this.options.keeper.setPresent(open);
    this.bulbs.emissiveIntensity = open ? 1.6 : 0.4;
  }

  setHovered(): void {
    // The caption says it.
  }

  label(): string {
    return this.openNow ? 'Christmas stall · gift wrapping, hot chestnuts' : `Christmas stall · shut, opens at ${clockShort(this.options.open[0])}`;
  }

  activate(session: SessionActions): void {
    if (this.openNow) this.options.serve(session);
    else session.react(`The hatch is down. A card in the window: back at ${clockShort(this.options.open[0])}.`);
  }
}

/** GIFT WRAPPING · HOT CHESTNUTS, gold on red. */
function boardTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(512, 72);
  ctx.fillStyle = '#8a1a1e';
  ctx.fillRect(0, 0, 512, 72);
  ctx.fillStyle = '#f0c94a';
  ctx.font = 'bold 30px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GIFT WRAPPING · HOT CHESTNUTS', 256, 38, 490);
  return toTexture(canvas, 'facing');
}
