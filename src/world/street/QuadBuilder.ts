import * as THREE from 'three';

/**
 * Collects axis-aligned quads (floors and upright faces) into one indexed `BufferGeometry`, with
 * uvs in metres divided by `tile` (so a tiling texture keeps its real scale whatever the size).
 * The street's ground, kerbs and markings are each one of these: one draw call apiece.
 */
export class QuadBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];

  constructor(private readonly tile = 1) {}

  /** A horizontal rectangle at height `y`, facing up; uv = (x, -z) / tile. */
  floor(x0: number, z0: number, x1: number, z1: number, y: number): this {
    const t = this.tile;
    return this.quad(
      [x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0],
      [0, 1, 0],
      [x0 / t, -z1 / t, x1 / t, -z1 / t, x1 / t, -z0 / t, x0 / t, -z0 / t],
    );
  }

  /**
   * An upright face from (ax, az) to (bx, bz), `y0` to `y1`, facing (-dz, dx): a -> b along +x
   * faces +z, like a facade's `from` -> `to` (`streetPlan`); uv = (along, height) / tile.
   */
  wall(ax: number, az: number, bx: number, bz: number, y0: number, y1: number): this {
    const t = this.tile;
    const length = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / length;
    const nz = (bx - ax) / length;
    return this.quad(
      [ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y1, az],
      [nx, 0, nz],
      [0, y0 / t, length / t, y0 / t, length / t, y1 / t, 0, y1 / t],
    );
  }

  get isEmpty(): boolean {
    return this.positions.length === 0;
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setIndex(this.indices);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }

  /** Four corners counter-clockwise seen from the side the normal points to. */
  private quad(corners: number[], normal: number[], uv: number[]): this {
    const base = this.positions.length / 3;
    this.positions.push(...corners);
    for (let i = 0; i < 4; i++) this.normals.push(...normal);
    this.uvs.push(...uv);
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    return this;
  }
}
