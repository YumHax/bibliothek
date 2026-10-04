import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { GameBox } from '../GameBox';

/** How far away a box can be tipped out (m): arm's length and a step. */
const REACH = 2.2;

interface BoxTippingOptions {
  /** The keys, read every frame (`Input.isDown`). */
  input: { isDown(...codes: string[]): boolean };
  /** Held to tip (the game's code: `primaryCode('tipBox')`). */
  key: string;
  camera: THREE.Camera;
  /** Every box that may be tipped: the flat's shelves' and its displays'. */
  boxes: () => Iterable<GameBox>;
  /** Hands free, in the room, nothing carried, not seated: only then does the key tip anything. */
  allowed: () => boolean;
  /** A wall stands between two world points. */
  blocked: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
}

/**
 * Looking at a box without taking it (docs/furnishing.md "Tipping a box out"): while the key is held (Q, the market's
 * "read the stalls" key), the box under the crosshair on a shelf or a display tips half out of its row, its top
 * towards the eye (`GameBox.setTipped`), and its caption says its year, platform and state; let go (or looked
 * away), it slides back in. Nothing changes on the shelves.
 */
export class BoxTipping implements Updatable {
  private tipped: GameBox | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly centre = new THREE.Vector2(0, 0);
  private readonly hits: THREE.Intersection[] = [];

  constructor(private readonly options: BoxTippingOptions) {
    this.raycaster.far = REACH;
  }

  update(): void {
    const { input, key, allowed } = this.options;
    this.set(input.isDown(key) && allowed() ? this.aimed() : null);
  }

  /** The nearest box under the crosshair (in reach, no wall between), or null. */
  private aimed(): GameBox | null {
    this.raycaster.setFromCamera(this.centre, this.options.camera);
    this.hits.length = 0;
    // The tipped box is still a target where it stands now (out of its row): it does not flicker in and out.
    const boxes = [...this.options.boxes()].filter((box) => box.parent !== null);
    this.raycaster.intersectObjects(boxes, false, this.hits);
    const hit = this.hits[0];
    if (!hit) return null;
    if (this.options.blocked(this.raycaster.ray.origin, hit.point)) return null;
    return hit.object as GameBox;
  }

  private set(box: GameBox | null): void {
    if (box === this.tipped) return;
    this.tipped?.setTipped(false);
    this.tipped = box;
    box?.setTipped(true);
  }
}
