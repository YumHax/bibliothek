import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Shelf } from '../Shelf';
import type { ShelfLamp } from '../props/ShelfLamp';
import { Prop } from '../props/Prop';

/** Moves `lamp` to a zone-local pose (the shelving's host: its zone). */
type MoveLamp = (lamp: ShelfLamp, position: THREE.Vector3, rotationY: number) => void;

/** How far inside the walls a spot keeps (m), when the bookcase it lights faces a wall close by. */
const WALL_CLEAR = 0.15;

/**
 * Keeps each bookcase's ceiling spot `throw` metres in front of it, looking back at it, when the player moves the
 * bookcase (`furnishing/`): checked every tick (a handful of numbers), the spot moved only when its bookcase did.
 * Kept inside the room's plan (`halfWidth`, `halfDepth`, zone-local). One per `Shelving`, placed at its zone's origin.
 */
export class LampFollow extends Prop implements Updatable {
  readonly contactShadow = false;
  private pairs: { shelf: Shelf; lamp: ShelfLamp; x: number; z: number; yaw: number }[] = [];

  constructor(
    private readonly move: MoveLamp,
    private readonly throwDistance: number,
    private readonly ceiling: number,
    private readonly halfWidth: number,
    private readonly halfDepth: number,
  ) {
    super();
    this.name = 'LampFollow';
  }

  /** The bookcases standing now and their spots (by slot, the same order); the spots stand where their slots put them. */
  set(pairs: readonly { shelf: Shelf; lamp: ShelfLamp }[]): void {
    this.pairs = pairs.map(({ shelf, lamp }) => ({ shelf, lamp, x: NaN, z: NaN, yaw: NaN }));
  }

  update(): void {
    for (const pair of this.pairs) {
      const { position, rotation } = pair.shelf;
      if (position.x === pair.x && position.z === pair.z && rotation.y === pair.yaw) continue;
      const first = Number.isNaN(pair.x);
      pair.x = position.x;
      pair.z = position.z;
      pair.yaw = rotation.y;
      // The first look finds the bookcase in its slot, where the spot already hangs.
      if (first && this.inSlot(pair)) continue;
      const at = new THREE.Vector3(Math.sin(rotation.y), 0, Math.cos(rotation.y)).multiplyScalar(this.throwDistance).add(position).setY(this.ceiling);
      at.x = THREE.MathUtils.clamp(at.x, -this.halfWidth + WALL_CLEAR, this.halfWidth - WALL_CLEAR);
      at.z = THREE.MathUtils.clamp(at.z, -this.halfDepth + WALL_CLEAR, this.halfDepth - WALL_CLEAR);
      this.move(pair.lamp, at, rotation.y);
    }
  }

  /** Whether the spot already hangs where it goes for its bookcase (as the slot placed both). */
  private inSlot(pair: { shelf: Shelf; lamp: ShelfLamp }): boolean {
    const { shelf, lamp } = pair;
    const ahead = new THREE.Vector3(Math.sin(shelf.rotation.y), 0, Math.cos(shelf.rotation.y)).multiplyScalar(this.throwDistance).add(shelf.position);
    return Math.abs(ahead.x - lamp.position.x) < 1e-4 && Math.abs(ahead.z - lamp.position.z) < 1e-4 && Math.abs(lamp.rotation.y - shelf.rotation.y) < 1e-4;
  }
}
