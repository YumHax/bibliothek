import * as THREE from 'three';
import type { BoxDimensions } from '@/catalog/types';
import { boxAtlasLayout, createBoxAtlas, paintBoxAtlas, type AtlasColumn, type BoxAtlasFaces, type BoxAtlasLayout } from '@/covers/generated/BoxAtlas';
import { plastic } from '../materials/finishes';

/** BoxGeometry's faces in order: +x, -x, +y, -y, +z (front), -z (back); which atlas column each one shows. */
const FACE_COLUMNS: readonly (keyof Omit<BoxAtlasLayout, 'width' | 'height'>)[] = ['right', 'left', 'flap', 'flap', 'front', 'back'];
/** The printed faces are stretched across their column; the others take its middle, a plain colour. */
const PRINTED = new Set(['front', 'left', 'right']);

/**
 * A game box as it stands closed on a shelf or a stall: one box, one material, one texture (the
 * front cover and both spines side by side in an atlas, flat colours for the flaps and the back),
 * so it costs one draw call instead of the openable box's dozen. It looks the same from outside;
 * `GameBox` swaps in the openable shell when the box is taken in hand.
 */
export class ClosedBox extends THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> {
  /** Where the lid's hinge is (see `BoxShell.lid`): cover decorations hang here while the box is closed. */
  readonly lidAnchor = new THREE.Group();
  private readonly layout: BoxAtlasLayout;
  private readonly atlas: THREE.CanvasTexture;

  constructor(dims: BoxDimensions, hinge: THREE.Vector3) {
    const layout = boxAtlasLayout(dims);
    const atlas = createBoxAtlas(layout);
    // The front's finish over the whole box (the spines were a touch rougher).
    super(new THREE.BoxGeometry(dims.width, dims.height, dims.depth), plastic({ map: atlas, roughness: 0.5 }, 0.7));
    this.name = 'ClosedBox';
    this.layout = layout;
    this.atlas = atlas;
    mapToAtlas(this.geometry, layout);
    this.castShadow = true;
    this.receiveShadow = true;
    this.lidAnchor.position.copy(hinge);
    this.add(this.lidAnchor);
  }

  paint(faces: BoxAtlasFaces, anisotropy: number): void {
    paintBoxAtlas(this.atlas, this.layout, faces, anisotropy);
  }

  dispose(): void {
    this.geometry.dispose();
    this.atlas.dispose();
    this.material.dispose();
  }
}

/** Points each face's uvs at its atlas column and drops the face groups, so the box is a single draw. */
function mapToAtlas(geometry: THREE.BoxGeometry, layout: BoxAtlasLayout): void {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
  const perFace = uv.count / FACE_COLUMNS.length;
  FACE_COLUMNS.forEach((name, face) => {
    const column: AtlasColumn = layout[name];
    for (let i = face * perFace; i < (face + 1) * perFace; i++) {
      const u = PRINTED.has(name) ? column.x + uv.getX(i) * column.width : column.x + column.width / 2;
      uv.setXY(i, u / layout.width, PRINTED.has(name) ? uv.getY(i) : 0.5);
    }
  });
  uv.needsUpdate = true;
  geometry.clearGroups();
}
