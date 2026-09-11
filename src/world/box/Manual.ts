import * as THREE from 'three';
import { centredSlab, QuadGeometryBuilder, slabCentre, slabSize, type Slab } from './slabs';

const PAPER = 0;
const COVER = 1;
/** Slight tilt so the booklet looks tucked in rather than glued. */
const TILT = -0.07;

/** The instruction booklet: a thin paper block whose front (+z) face shows a mini cover. */
export class Manual extends THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial[]> {
  constructor(placement: Slab) {
    const size = slabSize(placement);
    const local = centredSlab(size.x, size.y, size.z);
    const geometry = new QuadGeometryBuilder(local)
      .add('px', local, PAPER).add('nx', local, PAPER).add('py', local, PAPER)
      .add('ny', local, PAPER).add('nz', local, PAPER).add('pz', local, COVER)
      .build();
    super(geometry, [
      new THREE.MeshStandardMaterial({ color: 0xf1ede2, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0xe6e1d3, roughness: 0.85 }),
    ]);
    this.name = 'Manual';
    this.position.copy(slabCentre(placement));
    this.rotation.z = TILT;
    this.castShadow = true;
    this.receiveShadow = true;
  }

  setCover(texture: THREE.Texture): void {
    const mat = this.material[COVER];
    mat.map?.dispose();
    mat.map = texture;
    mat.color.setHex(0xffffff);
    mat.needsUpdate = true;
  }
}
