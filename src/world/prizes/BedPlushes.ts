import * as THREE from 'three';
import { getPrize, type OwnedPrize } from '@/economy/Prizes';
import { isShared } from '../materials/sharedResources';
import { Prop } from '../props/Prop';
import { prizeModel } from './prizeModel';

interface BedPlushesOptions {
  /** The prizes taken home, and a way to hear about new ones. */
  prizes: { readonly owned: readonly OwnedPrize[]; subscribe(cb: () => void): () => void };
  /** Height of the sheet's top over the bed's origin (`Bed.sheetTop`): where they sit. */
  top: number;
  /** Bed-local row they sit along: its distance from the headboard, and its length across the bed. */
  row: { z: number; span: number };
}

/**
 * The arcade's soft toys on the bed (docs/household.md): the plush bear and cat from the counter and every claw bunny,
 * one of each, sat in a row in front of the pillows facing the foot, the bear and the cat in the middle, the bunnies
 * either side in the rainbow's order. Follows the prize store live. Bed-local (placed with the bed or the mattress);
 * decoration, never collides.
 */
export class BedPlushes extends Prop {
  private readonly shown = new THREE.Group();
  private readonly unsubscribe: () => void;

  constructor(private readonly options: BedPlushesOptions) {
    super();
    this.name = 'BedPlushes';
    this.add(this.shown);
    this.rebuild();
    this.unsubscribe = options.prizes.subscribe(() => this.rebuild());
  }

  dispose(): void {
    this.unsubscribe();
  }

  private rebuild(): void {
    for (const child of [...this.shown.children]) {
      this.shown.remove(child);
      child.traverse((obj) => {
        const geometry = (obj as THREE.Mesh).geometry;
        if (geometry && !isShared(geometry)) geometry.dispose();
      });
    }
    const ids = new Set(this.options.prizes.owned.map((p) => p.id));
    const plush = [...ids].map((id) => getPrize(id)).filter((p) => p?.home === 'bed').map((p) => p!);
    // The bear and the cat in the middle, the bunnies out from them by turns.
    const big = plush.filter((p) => p.kind !== 'plush');
    const bunnies = plush.filter((p) => p.kind === 'plush');
    const row = [...bunnies.filter((_, i) => i % 2 === 1).reverse(), ...big, ...bunnies.filter((_, i) => i % 2 === 0)];
    const { top, row: { z, span } } = this.options;
    const step = row.length > 1 ? Math.min(0.16, span / (row.length - 1)) : 0;
    row.forEach((prize, i) => {
      const model = prizeModel(prize.kind, prize.color);
      model.position.set((i - (row.length - 1) / 2) * step, top + 0.008, z); // convention-ok: sat on the sheet's soft rounding, not a flat face
      // Facing the foot of the bed, each a little askew, leaning back on the pillows.
      model.rotation.set(-0.12, ((i * 29) % 7 - 3) * 0.07, 0);
      this.shown.add(model);
    });
  }
}
