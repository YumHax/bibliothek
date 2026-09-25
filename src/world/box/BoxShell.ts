import * as THREE from 'three';
import { QuadGeometryBuilder } from './slabs';
import type { ShellLayout } from './shellLayout';

/** One material per box face plus the interior paint. Names follow BoxGeometry's order. */
export interface ShellMaterials {
  right: THREE.MeshStandardMaterial;
  left: THREE.MeshStandardMaterial;
  top: THREE.MeshStandardMaterial;
  bottom: THREE.MeshStandardMaterial;
  front: THREE.MeshStandardMaterial;
  back: THREE.MeshStandardMaterial;
  interior: THREE.MeshStandardMaterial;
}

export const SHELL_MATERIAL_ORDER = ['right', 'left', 'top', 'bottom', 'front', 'back', 'interior'] as const satisfies readonly (keyof ShellMaterials)[];

const index = (name: keyof ShellMaterials) => SHELL_MATERIAL_ORDER.indexOf(name);

/**
 * The cardboard of an openable box: a hollow tray (back wall + four thin sides) and a front lid
 * hinged on the tray's left edge like a clamshell. Both are cut from the same texture space, so
 * the closed shell looks exactly like a solid textured box.
 */
export class BoxShell extends THREE.Group {
  readonly tray: THREE.Mesh;
  /** The lid mesh lives in hinge space: x runs from the hinge (0) to the free edge. Attach cover decorations here. */
  readonly lid: THREE.Mesh;
  private readonly hinge = new THREE.Group();

  constructor(layout: ShellLayout, materials: ShellMaterials) {
    super();
    this.name = 'BoxShell';
    const list = SHELL_MATERIAL_ORDER.map((name) => materials[name]);

    this.tray = new THREE.Mesh(buildTray(layout), list);
    this.tray.name = 'Tray';
    this.tray.castShadow = true;
    this.tray.receiveShadow = true;

    this.lid = new THREE.Mesh(buildLid(layout), list);
    this.lid.name = 'Lid';
    this.lid.castShadow = true;
    this.lid.receiveShadow = true;

    this.hinge.position.copy(layout.hinge);
    this.hinge.add(this.lid);
    this.add(this.tray, this.hinge);
  }

  /** Frees the geometry; the materials are the box's (see `GameBox`). */
  dispose(): void {
    this.tray.geometry.dispose();
    this.lid.geometry.dispose();
  }

  /** 0 = closed; positive angles swing the lid out through the front and round to the left. */
  setOpenAngle(radians: number): void {
    this.hinge.rotation.y = -radians;
  }
}

function buildTray(layout: ShellLayout): THREE.BufferGeometry {
  const { tray } = layout;
  const b = new QuadGeometryBuilder(layout.outer);
  const inside = index('interior');

  b.add('nx', tray.left, index('left')).add('px', tray.left, inside).add('py', tray.left, index('top'));
  b.add('ny', tray.left, index('bottom')).add('pz', tray.left, inside).add('nz', tray.left, index('back'));

  b.add('px', tray.right, index('right')).add('nx', tray.right, inside).add('py', tray.right, index('top'));
  b.add('ny', tray.right, index('bottom')).add('pz', tray.right, inside).add('nz', tray.right, index('back'));

  b.add('py', tray.top, index('top')).add('ny', tray.top, inside).add('pz', tray.top, inside).add('nz', tray.top, index('back'));
  b.add('ny', tray.bottom, index('bottom')).add('py', tray.bottom, inside).add('pz', tray.bottom, inside).add('nz', tray.bottom, index('back'));

  b.add('nz', tray.back, index('back')).add('pz', tray.back, inside);
  return b.build();
}

function buildLid(layout: ShellLayout): THREE.BufferGeometry {
  const s = layout.lidSlab;
  const b = new QuadGeometryBuilder(layout.outer);
  b.add('px', s, index('right')).add('nx', s, index('left')).add('py', s, index('top'));
  b.add('ny', s, index('bottom')).add('pz', s, index('front')).add('nz', s, index('interior'));
  const geometry = b.build();
  // Hinge space: the hinge axis passes through the origin.
  geometry.translate(-layout.hinge.x, -layout.hinge.y, -layout.hinge.z);
  return geometry;
}
