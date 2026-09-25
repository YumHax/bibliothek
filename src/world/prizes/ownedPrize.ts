import type * as THREE from 'three';

/** The prizes taken home, as a prize that stands at home reads them. */
export interface OwnedPrizes {
  owns(id: string): boolean;
  subscribe(cb: () => void): () => void;
}

/** Far under the floor: where a prize not yet won keeps its hitbox, out of the crosshair's reach. */
const HIDDEN_Y = -50;

/**
 * Shows `object` (and puts its hitbox where it belongs) only while prize `id` is owned, following
 * the store live; returns the unsubscribe. For the prizes that stand at home doing something (the
 * poster, the lamp, the cat's wand): they are placed with the room and appear once won.
 */
export function showWhenOwned(prizes: OwnedPrizes, id: string, object: THREE.Object3D, hitbox: THREE.Object3D | null, onChange?: (owned: boolean) => void): () => void {
  const hitboxY = hitbox?.position.y ?? 0;
  const apply = (): void => {
    const owned = prizes.owns(id);
    object.visible = owned;
    if (hitbox) hitbox.position.y = owned ? hitboxY : HIDDEN_Y;
    onChange?.(owned);
  };
  apply();
  return prizes.subscribe(apply);
}
