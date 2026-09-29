import * as THREE from 'three';
import type { BoxDimensions } from '@/catalog/types';
import { isLandscape } from '@/catalog/media';
import { boxAtlasLayout, createBoxAtlas, paintBoxAtlas, type AtlasColumn, type BoxAtlasFaces, type BoxAtlasLayout } from '@/covers/generated/BoxAtlas';
import { plastic } from '../materials/finishes';
import { printGlow } from '../materials/printGlow';

type Column = keyof Omit<BoxAtlasLayout, 'width' | 'height'>;
/** BoxGeometry's faces in order: +x, -x, +y, -y, +z (front), -z (back); which atlas column each one shows (a landscape box prints its top and bottom). */
const FACE_COLUMNS: readonly Column[] = ['right', 'left', 'flap', 'flap', 'front', 'back'];
const LANDSCAPE_COLUMNS: readonly Column[] = ['right', 'left', 'top', 'top', 'front', 'back'];
/** The printed faces are stretched across their column; the others take its middle, a plain colour. */
const PRINTED = new Set<Column>(['front', 'left', 'right', 'top']);

/**
 * A game box as it stands closed on a shelf or a stall: one box, one material, one texture (the
 * front cover and both spines side by side in an atlas, flat colours for the flaps and the back),
 * so it costs one draw call instead of the openable box's dozen. It looks the same from outside;
 * `GameBox` swaps in the openable shell when the box is taken in hand.
 */
export class ClosedBox extends THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial> {
  /** The printed cover's frame (see `ShellLayout.cover`): cover decorations hang here while the box is closed. */
  readonly lidAnchor = new THREE.Group();
  private readonly layout: BoxAtlasLayout;
  private readonly atlas: THREE.CanvasTexture;

  constructor(dims: BoxDimensions, coverOrigin: THREE.Vector3, gloss: { roughness: number; clearcoat: number }) {
    const layout = boxAtlasLayout(dims, isLandscape(dims));
    const atlas = createBoxAtlas(layout);
    // The front's finish over the whole box (the spines were a touch rougher).
    // The atlas lights itself a little under a hover (`GameBox.setGlow`): the print brightens rather than go grey.
    super(new THREE.BoxGeometry(dims.width, dims.height, dims.depth), printGlow(plastic({ map: atlas, emissive: 0x000000, roughness: gloss.roughness }, gloss.clearcoat)));
    this.name = 'ClosedBox';
    this.layout = layout;
    this.atlas = atlas;
    mapToAtlas(this.geometry, layout);
    this.castShadow = true;
    this.receiveShadow = true;
    this.lidAnchor.position.copy(coverOrigin);
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
  (layout.top ? LANDSCAPE_COLUMNS : FACE_COLUMNS).forEach((name, face) => {
    const column: AtlasColumn = layout[name] ?? layout.flap;
    for (let i = face * perFace; i < (face + 1) * perFace; i++) {
      const u = PRINTED.has(name) ? column.x + uv.getX(i) * column.width : column.x + column.width / 2;
      uv.setXY(i, u / layout.width, PRINTED.has(name) ? uv.getY(i) : 0.5);
    }
  });
  uv.needsUpdate = true;
  geometry.clearGroups();
}
