import * as THREE from 'three';
import { METAL, instancedStandard, standard } from '../materials/palette';
import { boxMesh } from '../meshUtils';

/** Upright flat bars across the gate, the first on its west post, the last the one with the handle. */
const BARS = 11;
/** Rows of crossed links (the lattice's tall diamonds) between two bars, from rail to rail. */
const ROWS = 3;
const BAR = { w: 0.014, d: 0.012 };
const LINK = { w: 0.01, d: 0.004 };
/** Clear air between the bars' faces and the links in front of and behind them. */
const LINK_GAP = 0.0015;
/** Each link's middle off the bars' middle plane: one diagonal in front of them, the other behind. */
const LINK_Z = BAR.d / 2 + LINK_GAP + LINK.d / 2;
/** The rails it slides in (top and bottom): their height, and their depth, clear of the links on both sides. */
const RAIL = 0.025;
const RAIL_D = 2 * (LINK_Z + LINK.d / 2) + 0.01;
/** What is left of its width once folded open: the bars bunched against the west post. */
const FOLDED = 0.15;
const IRON_LOOK = { color: 0x1c1d20, roughness: 0.45, metalness: 0 };
// Painted wrought iron, a dielectric (docs/graphics.md): the bars and links instanced, the rails plain.
const IRON = instancedStandard(IRON_LOOK);
const RAIL_IRON = standard(IRON_LOOK);

/**
 * The old lift's folding gate, a "grille extensible": upright flat bars joined by crossed links that
 * scissor as it folds, the bars bunching against its west post, a brass handle on the last one. Built
 * from its west post (local x 0) across `width`, `height` tall from its foot, in two instanced meshes
 * (the bars, the links) between its two rails. `setOpen(0..1)` folds it.
 */
export class FoldingGate extends THREE.Group {
  private readonly bars: THREE.InstancedMesh;
  private readonly links: THREE.InstancedMesh;
  private readonly handle: THREE.Mesh;
  private open = -1;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly zAxis = new THREE.Vector3(0, 0, 1);

  constructor(
    private readonly width: number,
    private readonly height: number,
  ) {
    super();
    this.name = 'FoldingGate';
    // The bars run half into each rail.
    this.bars = new THREE.InstancedMesh(new THREE.BoxGeometry(BAR.w, height - RAIL, BAR.d), IRON, BARS);
    this.links = new THREE.InstancedMesh(new THREE.BoxGeometry(LINK.w, 1, LINK.d), IRON, (BARS - 1) * ROWS * 2);
    this.add(this.bars, this.links);
    for (const y of [RAIL / 2, height - RAIL / 2]) this.add(boxMesh(width, RAIL, RAIL_D, RAIL_IRON, { x: width / 2, y }));
    this.handle = boxMesh(0.028, 0.14, 0.03, METAL.brass(), { y: height * 0.48 });
    this.add(this.handle);
    this.setOpen(0);
    // Its bounds shut hold it folded too (frustum culling reads them once).
    this.bars.computeBoundingSphere();
    this.links.computeBoundingSphere();
  }

  /** Folds it: 0 shut across the opening, 1 bunched against the west post. */
  setOpen(open: number): void {
    if (Math.abs(open - this.open) < 1e-4) return;
    this.open = open;
    const pitch = (this.width / (BARS - 1)) * (1 - (1 - FOLDED) * open);
    const span = this.height - 2 * RAIL;
    for (let i = 0; i < BARS; i++) {
      this.m.makeTranslation(i * pitch, this.height / 2, 0);
      this.bars.setMatrixAt(i, this.m);
    }
    const row = span / ROWS;
    const length = Math.hypot(pitch, row);
    let n = 0;
    for (let i = 0; i < BARS - 1; i++) {
      for (let r = 0; r < ROWS; r++) {
        // The two diagonals of one diamond, one in front of the bars, one behind.
        for (const side of [-1, 1]) {
          this.p.set((i + 0.5) * pitch, RAIL + (r + 0.5) * row, side * LINK_Z);
          this.q.setFromAxisAngle(this.zAxis, Math.atan2(row, side * pitch) - Math.PI / 2);
          this.s.set(1, length, 1);
          this.links.setMatrixAt(n++, this.m.compose(this.p, this.q, this.s));
        }
      }
    }
    this.bars.instanceMatrix.needsUpdate = true;
    this.links.instanceMatrix.needsUpdate = true;
    // Its west side buried in the last bar.
    this.handle.position.x = (BARS - 1) * pitch + 0.012;
  }
}
