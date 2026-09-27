import * as THREE from 'three';
import { createPaperTagTexture } from '@/covers/generated/PaperTag';
import { WALL, onSurface } from '@/world/surface/layers';

/**
 * A small paper tag stuck to the lower-right corner of the cover, marking a box lent to a friend.
 * Lives in the lid's hinge space (x from hinge to free edge) so it swings open with the cover; it
 * lies on the cover's `print` layer (a tag stuck on a box). Its own material (a per-tag texture).
 */
export class LentTag extends THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial> {
  constructor(lidWidth: number, lidHeight: number, lidThickness: number, anisotropy: number) {
    const tagW = Math.min(0.032, lidWidth * 0.28);
    const tagH = tagW * 1.4;
    super(
      new THREE.PlaneGeometry(tagW, tagH),
      onSurface(
        new THREE.MeshStandardMaterial({
          map: createPaperTagTexture(['LENT', 'OUT'], anisotropy),
          transparent: true,
          roughness: 0.9,
          side: THREE.DoubleSide,
        }),
        WALL.print,
      ),
    );
    this.name = 'LentTag';
    this.position.set(lidWidth - tagW / 2 - 0.006, -lidHeight / 2 + tagH / 2 + 0.007, lidThickness + WALL.print.lift);
    this.rotation.z = -0.12;
    this.castShadow = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
  }
}
