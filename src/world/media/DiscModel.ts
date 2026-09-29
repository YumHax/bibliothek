import * as THREE from 'three';
import type { MediaSpec } from '@/catalog/media';
import type { MediaModel } from './MediaModel';

/** The centre hole's radius (15 mm across) and how many sides the rings get. */
const HOLE_RADIUS = 0.0075;
const SEGMENTS = 64;

/**
 * A CD at real size (120 mm, 1.2 mm): the printed face towards +z, the black read side of a
 * PlayStation disc underneath with a faint sheen, the centre hole through both. `setPrint` takes
 * a drawn print, `setPhoto` the scan of the real disc (square, the disc filling it); either maps
 * straight onto the face. Its materials are its own.
 */
export class DiscModel extends THREE.Group implements MediaModel {
  readonly materials: THREE.MeshStandardMaterial[];
  readonly printAspect = 1;
  readonly printFold = 0;
  private readonly print: THREE.MeshStandardMaterial;
  private photo = false;

  constructor(readonly spec: MediaSpec) {
    super();
    this.name = 'Disc';
    const r = spec.size.width / 2;
    const t = spec.size.depth;
    this.print = new THREE.MeshStandardMaterial({ color: 0xd9d9dc, roughness: 0.45, alphaTest: 0.5 });
    const under = new THREE.MeshStandardMaterial({ color: spec.colour, roughness: 0.16, metalness: 0.55 });

    // RingGeometry's uvs are planar over its outer square: a square scan lands on it as it is.
    const top = new THREE.Mesh(new THREE.RingGeometry(HOLE_RADIUS, r, SEGMENTS, 1), this.print);
    top.position.z = t / 2;
    const bottom = new THREE.Mesh(new THREE.RingGeometry(HOLE_RADIUS, r, SEGMENTS, 1), under);
    bottom.rotation.y = Math.PI;
    bottom.position.z = -t / 2;
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(r, r, t, SEGMENTS, 1, true), under);
    rim.rotation.x = Math.PI / 2;
    this.add(top, bottom, rim);
    this.materials = [this.print, under];
    for (const mesh of [top, bottom, rim]) {
      mesh.castShadow = mesh !== rim;
      mesh.receiveShadow = true;
    }
  }

  setPrint(texture: THREE.Texture | null): void {
    if (this.photo) {
      texture?.dispose(); // the scan stays
      return;
    }
    this.swap(texture);
  }

  setPhoto(texture: THREE.Texture | null): boolean {
    if (!texture) {
      if (this.photo) this.swap(null);
      this.photo = false;
      return false;
    }
    const image = texture.image as { width?: number; height?: number } | undefined;
    const square = !!image?.width && !!image.height && Math.abs(image.width / image.height - 1) < 0.08;
    if (!square) {
      texture.dispose();
      return false;
    }
    this.photo = true;
    this.swap(texture);
    return true;
  }

  freeGpu(): void {
    this.traverse((obj) => (obj as THREE.Mesh).geometry?.dispose());
    this.print.map?.dispose();
  }

  dispose(): void {
    this.traverse((obj) => (obj as THREE.Mesh).geometry?.dispose());
    for (const m of this.materials) {
      m.map?.dispose();
      m.dispose();
    }
  }

  private swap(texture: THREE.Texture | null): void {
    if (this.print.map === texture) return;
    this.print.map?.dispose();
    this.print.map = texture;
    this.print.color.setHex(texture ? 0xffffff : 0xd9d9dc);
    this.print.needsUpdate = true;
  }
}
