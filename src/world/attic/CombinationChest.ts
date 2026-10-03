import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { playLatchClick, playHingeCreak } from '@/audio/furnitureSounds';
import { boxMesh, invisibleHitbox } from '../meshUtils';
import { METAL, standard, timber } from '../materials/palette';
import { Prop } from '../props/Prop';

const SIZE = { width: 0.8, height: 0.46, depth: 0.45 };
/** The padlock's four wheels, side by side on the hasp (chest-local x of the first, the step). */
const WHEEL = { x0: -0.045, step: 0.03, y: 0.36, z: SIZE.depth / 2 + 0.035, radius: 0.012, width: 0.022 };
/** Seconds the lid takes to swing open. */
const LID_S = 1.2;

/**
 * The collector's steamer trunk under the slope: iron corners, leather straps, and a brass
 * padlock with four number wheels on its hasp. Each wheel is clicked on its own (`wheels`, placed
 * by the builder: one more each click, 9 then 0); the right four (`code`) spring the lock and the
 * lid swings up, and `onOpen` hands over what is inside. Open once, it stays open (`opened`).
 * Origin on the floor under its middle, +z the side with the lock.
 */
export class CombinationChest extends Prop implements Updatable {
  readonly wheels: ChestWheel[] = [];
  private readonly lid = new THREE.Group();
  private opening = 0;
  private open = false;

  constructor(
    private readonly code: string,
    private readonly onOpen: (session: SessionActions) => void,
    opened: boolean,
  ) {
    super();
    this.name = 'CombinationChest';
    const { width, height, depth } = SIZE;
    const wood = timber(0x4a2f1c, 0.65);
    const iron = standard({ color: 0x2a2826, roughness: 0.55, metalness: 0 });
    const brass = METAL.brass();
    const body = height * 0.72;
    this.add(boxMesh(width, body, depth, wood, { y: body / 2 }));
    // The lid, hinged along its back edge.
    this.lid.position.set(0, body, -depth / 2);
    this.lid.add(boxMesh(width, height - body, depth, wood, { y: (height - body) / 2, z: depth / 2 }));
    this.add(this.lid);
    for (const x of [-width / 2 + 0.12, width / 2 - 0.12]) {
      this.add(boxMesh(0.05, body + 0.005, depth + 0.01, iron, { x, y: body / 2 }));
      this.lid.add(boxMesh(0.05, height - body + 0.005, depth + 0.01, iron, { x, y: (height - body) / 2, z: depth / 2 }));
    }
    // The hasp and the lock's body.
    this.add(boxMesh(0.14, 0.09, 0.02, brass, { y: WHEEL.y, z: depth / 2 + 0.012 }));
    for (let i = 0; i < code.length; i++) {
      const wheel = new ChestWheel(i, () => this.check());
      wheel.position.set(WHEEL.x0 + i * WHEEL.step, WHEEL.y, WHEEL.z);
      this.wheels.push(wheel);
    }
    if (opened) {
      this.open = true;
      this.opening = 1;
      this.lid.rotation.x = -1.9;
    }
  }

  get footprint(): THREE.Box3 {
    const { width, height, depth } = SIZE;
    return new THREE.Box3(new THREE.Vector3(-width / 2, 0, -depth / 2), new THREE.Vector3(width / 2, height, depth / 2));
  }

  get isOpen(): boolean {
    return this.open;
  }

  update(dt: number): void {
    if (!this.open || this.opening >= 1) return;
    this.opening = Math.min(1, this.opening + dt / LID_S);
    const t = 1 - (1 - this.opening) ** 3;
    this.lid.rotation.x = -1.9 * t;
  }

  /** A wheel turned: the four read the code, the lock springs. */
  private check(): ((session: SessionActions) => void) | null {
    if (this.open) return null;
    if (this.wheels.map((w) => w.digit).join('') !== this.code) return null;
    return (session) => {
      this.open = true;
      playLatchClick(0.2);
      playHingeCreak(0.08);
      for (const wheel of this.wheels) wheel.lock();
      this.onOpen(session);
    };
  }
}

/** One number wheel of the chest's padlock: click, and it turns to the next digit. */
export class ChestWheel extends Prop implements Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  digit = 0;
  private readonly drum: THREE.Mesh;
  private locked = false;

  constructor(private readonly index: number, private readonly onTurn: () => ((session: SessionActions) => void) | null) {
    super();
    this.name = `ChestWheel:${index}`;
    const material = new THREE.MeshStandardMaterial({ map: digitsTexture(), metalness: 0.8, roughness: 0.35 });
    this.drum = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL.radius, WHEEL.radius, WHEEL.width * 0.9, 20, 1), material);
    // The drum's axis along x, the digits round it; digit 0 faces the player.
    this.drum.rotation.z = Math.PI / 2;
    this.drum.castShadow = false;
    this.add(this.drum);
    this.turnTo(0);
    const hitbox = invisibleHitbox(WHEEL.width + 0.006, 0.05, 0.05);
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  setHovered(): void {}

  label(): string {
    return this.locked ? 'The padlock hangs open' : `The padlock’s ${['first', 'second', 'third', 'fourth'][this.index] ?? 'next'} wheel (${this.digit}) · turn`;
  }

  activate(session: SessionActions): void {
    if (this.locked) return;
    this.turnTo((this.digit + 1) % 10);
    playLatchClick(0.04);
    this.onTurn()?.(session);
  }

  lock(): void {
    this.locked = true;
  }

  private turnTo(digit: number): void {
    this.digit = digit;
    // Ten faces round the drum, a tenth of a turn each, about its own axis (x, once laid down): digit `digit` to the front.
    this.drum.rotation.x = ((digit + 0.5) / 10) * Math.PI * 2;
  }
}

/** The digits 0-9 round the drum, engraved on brass. */
function digitsTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(400, 40);
  ctx.fillStyle = '#c9a75b';
  ctx.fillRect(0, 0, 400, 40);
  ctx.fillStyle = '#2a1a08';
  ctx.font = 'bold 30px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Each digit turned a quarter: round the drum is up and down on the lock.
  for (let d = 0; d < 10; d++) {
    ctx.save();
    ctx.translate(d * 40 + 20, 20);
    ctx.rotate(Math.PI / 2);
    ctx.fillText(String(d), 0, 2);
    ctx.restore();
  }
  return toTexture(canvas, 'facing');
}
