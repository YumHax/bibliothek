import * as THREE from 'three';
import { centredSlab, QuadGeometryBuilder, slabCentre, slabSize, type Slab } from './slabs';

const PLASTIC = 0;
const LABEL = 1;

/** The game media: a plastic slab with a label on its front (+z) face. */
export class Cartridge extends THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial[]> {
  constructor(placement: Slab) {
    const size = slabSize(placement);
    const local = centredSlab(size.x, size.y, size.z);
    const geometry = new QuadGeometryBuilder(local)
      .add('px', local, PLASTIC).add('nx', local, PLASTIC).add('py', local, PLASTIC)
      .add('ny', local, PLASTIC).add('nz', local, PLASTIC).add('pz', local, LABEL)
      .build();
    super(geometry, [
      new THREE.MeshStandardMaterial({ color: 0x8f8f93, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ color: 0x7a7a7e, roughness: 0.7 }),
    ]);
    this.name = 'Cartridge';
    this.position.copy(slabCentre(placement));
    this.castShadow = true;
    this.receiveShadow = true;
  }

  /** Frees the previous label; null leaves the plain grey plastic. */
  setLabel(texture: THREE.Texture | null): void {
    const mat = this.material[LABEL];
    mat.map?.dispose();
    mat.map = texture;
    mat.color.setHex(texture ? 0xffffff : 0x7a7a7e);
    mat.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    for (const mat of this.material) {
      mat.map?.dispose();
      mat.dispose();
    }
  }
}
