import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { playHingeCreak, playLatchClick } from '@/audio/furnitureSounds';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { METAL, paint, timber } from '../materials/palette';
import { boxMesh, invisibleHitbox } from '../meshUtils';
import { Prop } from '../props/Prop';
import { CELL, SPRING, type StorageBox } from './cellarPlan';
import { isOpened, markOpened } from './cellarFinds';
import { lcg } from '@/random';

/** The slats of a front (m): their width, the gap between, their thickness. */
const SLAT = { width: 0.085, gap: 0.035, depth: 0.022 };
/** The door in the middle of a front: its width; the time it takes to swing open (s), how far (rad). */
const DOOR = { width: 0.78, height: 1.85, swingS: 0.9, open: -1.75 };
/** Where the carton stands inside, behind the door (m from the front), and its size. */
const CARTON = { back: 0.55, width: 0.46, depth: 0.34, height: 0.3 };

/**
 * A storage box's front in the cellars: a slatted wooden partition across a cell's side, floor to the vault's spring,
 * with a slatted door in its middle on a hasp and padlock, and the tag with its number and name. Through the slats
 * one sees inside (the cell's masonry is `CellarVaults`'), a few cartons and the owner's things. Ours (`state:
 * 'ours'`) opens with the flat's key, once (saved); an abandoned one hangs open; the rest are padlocked and say what
 * is seen through the slats. Origin on the floor at the front's middle, the passage on its +z side (the door swings
 * out into it). Its collider is the whole front: the boxes are reached into, never walked into.
 */
export class CellarBox extends Prop implements Interactable, Updatable {
  readonly hitboxes: THREE.Object3D[];
  readonly colliders: THREE.Box3[];
  /** Where a find's carton top is (local: the builder sets the game on it). */
  readonly cartonTop = new THREE.Vector3(0.05, CARTON.height, -CARTON.back);
  private readonly door = new THREE.Group();
  private angle = 0;
  private target = 0;

  constructor(private readonly box: StorageBox) {
    super();
    this.name = `CellarBox ${box.n}`;
    const random = lcg(box.n * 97 + 5);
    const wood = timber(0x6e5236, 0.85);
    // The partition either side of the door: slats floor to spring, two rails across.
    const slats: THREE.BufferGeometry[] = [];
    const halfFront = CELL / 2;
    const halfDoor = DOOR.width / 2;
    for (let x = -halfFront + SLAT.width / 2; x < halfFront; x += SLAT.width + SLAT.gap) {
      if (Math.abs(x) < halfDoor + SLAT.width / 2) continue;
      slats.push(new THREE.BoxGeometry(SLAT.width, SPRING, SLAT.depth).translate(x, SPRING / 2, 0));
    }
    for (const y of [0.25, 1.6]) {
      slats.push(new THREE.BoxGeometry(halfFront - halfDoor, 0.07, 0.03).translate(-(halfFront + halfDoor) / 2, y, 0.026));
      slats.push(new THREE.BoxGeometry(halfFront - halfDoor, 0.07, 0.03).translate((halfFront + halfDoor) / 2, y, 0.026));
    }
    // Over the door, up to the spring.
    slats.push(new THREE.BoxGeometry(DOOR.width, SPRING - DOOR.height, SLAT.depth).translate(0, (SPRING + DOOR.height) / 2, 0));
    const front = new THREE.Mesh(mergeGeometries(slats)!, wood);
    for (const g of slats) g.dispose();
    front.castShadow = true;
    front.receiveShadow = true;
    this.add(front);
    // The door: slats on a Z brace, hinged on its west edge.
    const leaf: THREE.BufferGeometry[] = [];
    for (let x = SLAT.width / 2; x < DOOR.width; x += SLAT.width + SLAT.gap) leaf.push(new THREE.BoxGeometry(SLAT.width, DOOR.height, SLAT.depth).translate(x, DOOR.height / 2, 0));
    for (const y of [0.2, DOOR.height - 0.2]) leaf.push(new THREE.BoxGeometry(DOOR.width, 0.08, 0.025).translate(DOOR.width / 2, y, 0.024));
    const brace = new THREE.BoxGeometry(0.07, Math.hypot(DOOR.width, DOOR.height - 0.4), 0.025);
    brace.rotateZ(-Math.atan2(DOOR.width, DOOR.height - 0.4));
    leaf.push(brace.translate(DOOR.width / 2, DOOR.height / 2, 0.024));
    const leafMesh = new THREE.Mesh(mergeGeometries(leaf)!, wood);
    for (const g of leaf) g.dispose();
    leafMesh.castShadow = true;
    this.door.add(leafMesh);
    this.door.position.set(-halfDoor, 0, 0);
    this.add(this.door);
    // The hasp and its padlock (on the door's free edge), the tag over it.
    const steel = METAL.satinSteel();
    const brass = METAL.brass();
    this.door.add(boxMesh(0.03, 0.12, 0.012, steel, { x: DOOR.width - 0.05, y: 1.05, z: 0.04 }));
    if (box.state !== 'open') this.door.add(boxMesh(0.05, 0.06, 0.025, brass, { x: DOOR.width - 0.05, y: 0.98, z: 0.055 }));
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.08), new THREE.MeshStandardMaterial({ map: tagTexture(box), roughness: 0.9 }));
    tag.position.set(0, DOOR.height + 0.07, SLAT.depth / 2 + 0.003);
    this.add(tag);
    // Inside: the cartons, the owner's clutter (seeded), the find's carton just behind the door.
    const card = paint(0x9a7448, 0.95);
    if (box.find) this.add(boxMesh(CARTON.width, CARTON.height, CARTON.depth, card, { x: 0.05, y: CARTON.height / 2, z: -CARTON.back }));
    const clutter = 3 + Math.floor(random() * 4);
    for (let i = 0; i < clutter; i++) {
      const w = 0.3 + random() * 0.4;
      const h = 0.2 + random() * 0.6;
      const d = 0.3 + random() * 0.3;
      const x = (random() - 0.5) * (CELL - w - 0.1);
      const z = -0.9 - random() * 0.5;
      const mesh = boxMesh(w, h, d, random() < 0.6 ? card : paint(0x4a4440, 0.8), { x, y: h / 2, z });
      mesh.rotation.y = (random() - 0.5) * 0.5;
      this.add(mesh);
    }
    if (box.state === 'open') this.angle = this.target = -1.1;
    if (box.state === 'ours' && isOpened(box.n)) this.angle = this.target = DOOR.open;
    this.door.rotation.y = this.angle;
    // On the leaf, so a door standing open leaves the way clear to what is inside.
    const hitbox = invisibleHitbox(DOOR.width, DOOR.height, 0.12, { x: DOOR.width / 2, y: DOOR.height / 2 });
    this.hitboxes = [hitbox];
    this.door.add(hitbox);
    this.colliders = [new THREE.Box3(new THREE.Vector3(-halfFront, 0, -0.05), new THREE.Vector3(halfFront, SPRING, 0.05))];
  }

  get number(): number {
    return this.box.n;
  }

  /** Whether its inside can be reached (open, or ours opened): a find in it is clickable. */
  get isOpen(): boolean {
    return this.box.state === 'open' || (this.box.state === 'ours' && isOpened(this.box.n));
  }

  setHovered(): void {
    // The caption says it.
  }

  label(): string {
    const { box } = this;
    if (box.state === 'ours') return isOpened(box.n) ? `Box No ${box.n} · yours` : `Box No ${box.n} · yours · unlock`;
    if (box.state === 'open') return `Box No ${box.n} · its door hangs open`;
    return `Box No ${box.n} · ${box.tag}`;
  }

  activate(session: SessionActions): void {
    const { box } = this;
    if (box.state === 'ours' && !isOpened(box.n)) {
      playLatchClick(0.14);
      playHingeCreak(0.05);
      markOpened(box.n);
      this.target = DOOR.open;
      session.react(box.find?.line ?? 'Your box: empty, swept, waiting.');
      return;
    }
    if (this.isOpen) {
      session.react(box.find?.line ?? 'Nothing left in it but dust.');
      return;
    }
    playLatchClick(0.1);
    session.react(box.locked ?? 'Padlocked.');
  }

  update(dt: number): void {
    if (this.angle === this.target) return;
    const step = (dt / DOOR.swingS) * Math.abs(DOOR.open);
    this.angle = this.angle > this.target ? Math.max(this.target, this.angle - step) : Math.min(this.target, this.angle + step);
    this.door.rotation.y = this.angle;
  }
}

/** A box's tag: its number big, its owner's name under it, in pen on a card. */
function tagTexture(box: StorageBox): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(200, 80);
  ctx.fillStyle = '#e8dfc8';
  ctx.fillRect(0, 0, 200, 80);
  ctx.fillStyle = '#2a2018';
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillText(`No ${box.n}`, 100, 36);
  ctx.font = '20px Georgia, serif';
  ctx.fillText(box.tag, 100, 68, 190);
  return toTexture(canvas, 'facing');
}
