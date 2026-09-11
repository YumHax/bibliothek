import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { GameBox } from '@/world/GameBox';

interface Active {
  box: GameBox;
  materials: THREE.MeshStandardMaterial[];
  original: THREE.Color[];
  remaining: number;
  elapsed: number;
}

/**
 * Pulses the emissive colour of a box's materials for a few seconds so the player can spot it
 * on the shelf (search result, random pick). Per-frame, so register it with `engine.addUpdatable`.
 * Only one box is highlighted at a time; a new call restores the previous one first.
 */
export class Highlighter implements Updatable {
  /** Pulse colour and speed (cycles per second). */
  readonly color = new THREE.Color(0xffc24d);
  pulseHz = 1.5;

  private active: Active | null = null;
  private readonly tmp = new THREE.Color();

  get current(): GameBox | null {
    return this.active?.box ?? null;
  }

  highlight(box: GameBox, seconds = 3): void {
    this.clear();
    const materials = emissiveMaterials(box);
    this.active = {
      box,
      materials,
      original: materials.map((m) => m.emissive.clone()),
      remaining: seconds,
      elapsed: 0,
    };
  }

  /** Stops the pulse and restores the box's original emissive colours. */
  clear(): void {
    const a = this.active;
    if (!a) return;
    a.materials.forEach((m, i) => m.emissive.copy(a.original[i]!));
    this.active = null;
  }

  update(dt: number): void {
    const a = this.active;
    if (!a) return;
    a.remaining -= dt;
    a.elapsed += dt;
    if (a.remaining <= 0) {
      this.clear();
      return;
    }
    // Ease out over the last second so the glow does not snap off.
    const fade = Math.min(1, a.remaining);
    const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(a.elapsed * this.pulseHz * Math.PI * 2));
    this.tmp.copy(this.color).multiplyScalar(pulse * fade);
    for (const m of a.materials) m.emissive.copy(this.tmp);
  }
}

function emissiveMaterials(box: GameBox): THREE.MeshStandardMaterial[] {
  const list = Array.isArray(box.material) ? box.material : [box.material];
  return list.filter((m): m is THREE.MeshStandardMaterial => (m as THREE.MeshStandardMaterial).isMeshStandardMaterial === true);
}
