import type * as THREE from 'three';
import type { MediaSpec } from '@/catalog/media';

/**
 * A game's media as a thing in the room: a cartridge or a disc at real size (`CartridgeModel`,
 * `DiscModel`), built from its `MediaSpec`. Its label or print faces +z, its top +y. Seen in an
 * open box, flown to a console and left in it.
 */
export interface MediaModel extends THREE.Object3D {
  readonly spec: MediaSpec;
  /** Its own materials (none is shared): a wishlist ghost fades them. */
  readonly materials: readonly THREE.Material[];
  /** Width over height of the texture `setPrint` wants. */
  readonly printAspect: number;
  /** The share of that texture's height, at its top, that folds over the top edge (the end label); 0 without one. */
  readonly printFold: number;
  /** The drawn label (or disc print); null leaves it blank. Frees the one it replaces. */
  setPrint(texture: THREE.Texture | null): void;
  /** A photograph (or scan) of the real thing's face, over the whole of it; false when it does not fit (it is then freed). */
  setPhoto(texture: THREE.Texture | null): boolean;
  /** Geometries and textures off the GPU while nobody sees it (uploaded again when drawn). */
  freeGpu(): void;
  dispose(): void;
}
