import * as THREE from 'three';
import { QuadGeometryBuilder, type Slab } from './slabs';
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
 * The shell of an openable box, cut from the same texture space as the closed box so that shut it
 * looks exactly like it. A cardboard box (`opening: 'top'`) is five walls and a top flap hinged on
 * the back edge, its tongue tucked in behind the front; a plastic case (`'side'`) is a tray and a
 * front hinged on its left edge like a book.
 */
export class BoxShell extends THREE.Group {
  readonly tray: THREE.Mesh;
  /** The moving part, in hinge space (the hinge axis through the origin). Things riding on it are added here. */
  readonly lid: THREE.Mesh;
  /** Where the printed cover's frame is (see `ShellLayout.cover`): the lid itself, or a point on the tray's front. */
  readonly cover: THREE.Object3D;
  private readonly hinge = new THREE.Group();
  private readonly opening: ShellLayout['opening'];

  constructor(layout: ShellLayout, materials: ShellMaterials) {
    super();
    this.name = 'BoxShell';
    this.opening = layout.opening;
    const list = SHELL_MATERIAL_ORDER.map((name) => materials[name]);

    const flap = layout.opening !== 'side';
    this.tray = new THREE.Mesh(layout.opening === 'top' ? buildOpenTopTray(layout) : layout.opening === 'end' ? buildOpenEndTray(layout) : buildTray(layout), list);
    this.tray.name = 'Tray';
    this.lid = new THREE.Mesh(layout.opening === 'top' ? buildFlap(layout) : layout.opening === 'end' ? buildEndFlap(layout) : buildLid(layout), list);
    this.lid.name = flap ? 'Flap' : 'Lid';
    for (const mesh of [this.tray, this.lid]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }

    this.hinge.position.copy(layout.hinge);
    this.hinge.add(this.lid);
    this.add(this.tray, this.hinge);

    if (layout.cover.onLid) {
      this.cover = this.lid;
    } else {
      this.cover = new THREE.Group();
      this.cover.position.copy(layout.cover.origin);
      this.add(this.cover);
    }
  }

  /** Frees the geometry; the materials are the box's (see `GameBox`). */
  dispose(): void {
    this.tray.geometry.dispose();
    this.lid.geometry.dispose();
  }

  /**
   * 0 = closed. A book-like case swings its front out through the front and round to the left; a
   * cardboard box lifts its flap up and over the back, or swings its end flap out and round behind.
   */
  setOpenAngle(radians: number): void {
    if (this.opening === 'top') this.hinge.rotation.x = -radians;
    else if (this.opening === 'end') this.hinge.rotation.y = radians;
    else this.hinge.rotation.y = -radians;
  }
}

/** The tray of a book-like case: back plus four walls, open to the front. */
function buildTray(layout: ShellLayout): THREE.BufferGeometry {
  const { tray } = layout;
  const b = new QuadGeometryBuilder(layout.outer);
  const inside = index('interior');

  b.add('nx', tray.left, index('left')).add('px', tray.left, inside).add('py', tray.left, index('top'));
  b.add('ny', tray.left, index('bottom')).add('pz', tray.left, inside).add('nz', tray.left, index('back'));

  b.add('px', tray.right, index('right')).add('nx', tray.right, inside).add('py', tray.right, index('top'));
  b.add('ny', tray.right, index('bottom')).add('pz', tray.right, inside).add('nz', tray.right, index('back'));

  const top = tray.top!;
  b.add('py', top, index('top')).add('ny', top, inside).add('pz', top, inside).add('nz', top, index('back'));
  b.add('ny', tray.bottom, index('bottom')).add('py', tray.bottom, inside).add('pz', tray.bottom, inside).add('nz', tray.bottom, index('back'));

  b.add('nz', tray.back, index('back')).add('pz', tray.back, inside);
  return b.build();
}

/** The front of a book-like case, in hinge space. */
function buildLid(layout: ShellLayout): THREE.BufferGeometry {
  const s = layout.lidSlab;
  const b = new QuadGeometryBuilder(layout.outer);
  b.add('px', s, index('right')).add('nx', s, index('left')).add('py', s, index('top'));
  b.add('ny', s, index('bottom')).add('pz', s, index('front')).add('nz', s, index('interior'));
  return toHingeSpace(b.build(), layout);
}

/** A cardboard box without its flap: front, back, both sides and the bottom, open at the top. */
function buildOpenTopTray(layout: ShellLayout): THREE.BufferGeometry {
  const { tray } = layout;
  const b = new QuadGeometryBuilder(layout.outer);
  const inside = index('interior');
  const edge = index('top'); // the cut edges of the card, seen when the flap is up
  const front = tray.front!;

  b.add('pz', front, index('front')).add('nz', front, inside).add('py', front, edge);
  b.add('nx', front, index('left')).add('px', front, index('right')).add('ny', front, index('bottom'));

  b.add('nz', tray.back, index('back')).add('pz', tray.back, inside).add('py', tray.back, edge);
  b.add('nx', tray.back, index('left')).add('px', tray.back, index('right')).add('ny', tray.back, index('bottom'));

  b.add('nx', tray.left, index('left')).add('px', tray.left, inside).add('py', tray.left, edge).add('ny', tray.left, index('bottom'));
  b.add('px', tray.right, index('right')).add('nx', tray.right, inside).add('py', tray.right, edge).add('ny', tray.right, index('bottom'));

  b.add('ny', tray.bottom, index('bottom')).add('py', tray.bottom, inside);
  return b.build();
}

/** A landscape box without its end flap: front, back, top, bottom and the left end, open at the right. */
function buildOpenEndTray(layout: ShellLayout): THREE.BufferGeometry {
  const { tray } = layout;
  const b = new QuadGeometryBuilder(layout.outer);
  const inside = index('interior');
  const edge = index('right'); // the cut edges of the card, seen when the flap is open
  const front = tray.front!;
  const top = tray.top!;

  b.add('pz', front, index('front')).add('nz', front, inside).add('px', front, edge);
  b.add('nx', front, index('left')).add('py', front, index('top')).add('ny', front, index('bottom'));

  b.add('nz', tray.back, index('back')).add('pz', tray.back, inside).add('px', tray.back, edge);
  b.add('nx', tray.back, index('left')).add('py', tray.back, index('top')).add('ny', tray.back, index('bottom'));

  b.add('py', top, index('top')).add('ny', top, inside).add('px', top, edge);
  b.add('ny', tray.bottom, index('bottom')).add('py', tray.bottom, inside).add('px', tray.bottom, edge);

  b.add('nx', tray.left, index('left')).add('px', tray.left, inside);
  return b.build();
}

/** The end flap and its tuck tongue, in hinge space (the axis up the back's right edge). */
function buildEndFlap(layout: ShellLayout): THREE.BufferGeometry {
  const s = layout.lidSlab;
  const b = new QuadGeometryBuilder(layout.outer);
  b.add('px', s, index('right')).add('nx', s, index('interior'));
  b.add('pz', s, index('front')).add('nz', s, index('back')).add('py', s, index('top')).add('ny', s, index('bottom'));
  if (layout.tongue) addInside(b, layout.tongue);
  return toHingeSpace(b.build(), layout);
}

/** The top flap and its tuck tongue, in hinge space (the axis along x at the top of the back). */
function buildFlap(layout: ShellLayout): THREE.BufferGeometry {
  const s = layout.lidSlab;
  const b = new QuadGeometryBuilder(layout.outer);
  b.add('py', s, index('top')).add('ny', s, index('interior'));
  b.add('pz', s, index('front')).add('nz', s, index('back')).add('nx', s, index('left')).add('px', s, index('right'));
  if (layout.tongue) addInside(b, layout.tongue);
  return toHingeSpace(b.build(), layout);
}

/** Every face of a slab in the interior's plain card. */
function addInside(b: QuadGeometryBuilder, s: Slab): void {
  b.addBox(s, index('interior'));
}

function toHingeSpace(geometry: THREE.BufferGeometry, layout: ShellLayout): THREE.BufferGeometry {
  geometry.translate(-layout.hinge.x, -layout.hinge.y, -layout.hinge.z);
  return geometry;
}
