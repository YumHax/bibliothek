import * as THREE from 'three';
import { Prop, part } from '../props/Prop';
import { paint, timber } from '../materials/palette';
import { INSET, SEAM } from '../props/joinery';

/*
 * A cork pinboard in a pine frame, for the kitchen wall (docs/social.md "Keepsakes"): once bought, the twenty
 * keepsakes past the fridge's eight are pinned on it (`fridgeKeepsakes`). Wall-hung: back at local z 0, facing +z,
 * centred on its origin. `slots` are where each goes on the cork's face.
 */

const SIZE = { w: 0.72, h: 0.5 };
const FRAME = { width: 0.028, depth: 0.022 };
const CORK_DEPTH = 0.012;
const CORK = paint(0xb88a5c, 0.95);
const PINE = timber(0xc9a06a, 0.55);
/** The keepsakes on it: five across, four down. */
const COLUMNS = 5;
const ROWS = 4;

export class Corkboard extends Prop {
  /** The middle of each keepsake's place on the cork's face, in the board's coordinates. */
  readonly slots: readonly THREE.Vector3[];

  constructor() {
    super();
    this.name = 'Corkboard';
    const { w, h } = SIZE;
    const fw = FRAME.width;
    // The cork, buried a millimetre into the frame on every side and a seam off the wall (no shared face), its face under the frame's.
    part(this, w - 2 * fw + 2 * INSET, h - 2 * fw + 2 * INSET, CORK_DEPTH, CORK, { z: SEAM + CORK_DEPTH / 2 }).castShadow = false;
    // The frame: two long rails over the full width, two stiles buried into them.
    for (const side of [-1, 1]) part(this, w, fw, FRAME.depth, PINE, { y: side * (h / 2 - fw / 2), z: FRAME.depth / 2 });
    for (const side of [-1, 1]) part(this, fw, h - 2 * fw + 2 * INSET, FRAME.depth - 2 * SEAM, PINE, { x: side * (w / 2 - fw / 2), z: FRAME.depth / 2 });
    const innerW = w - 2 * fw;
    const innerH = h - 2 * fw;
    const slots: THREE.Vector3[] = [];
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLUMNS; c++) slots.push(new THREE.Vector3(-innerW / 2 + (c + 0.5) * (innerW / COLUMNS), innerH / 2 - (r + 0.5) * (innerH / ROWS), SEAM + CORK_DEPTH));
    this.slots = slots;
  }
}
