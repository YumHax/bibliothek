import * as THREE from 'three';
import type { Paper } from './paperContents';

/** One paper in the box, as thin as it is (m), and what is left between two (a share of each one's room). */
const SHEET = 0.0004;
const BETWEEN = 0.2;
/** The papers behind a booklet that rises out of the top of its box stand this much higher each (m): their tops show. */
const PEEK = 0.0025;
/** What a paper's slab may take of the booklet's face (it never sticks out at the sides). */
const INSET = 0.96;

/** How deep (m) the papers other than the booklet stack behind it: at most `share` of the booklet's own room. */
export function paperStackDepth(papers: readonly Paper[], room: number, share = 0.4): number {
  const others = Math.max(0, papers.length - 1);
  return others ? Math.min(others * SHEET, room * share) : 0;
}

/**
 * The papers that came with a copy, stacked behind its booklet in the box (`GameBox`): one thin slab each, in its
 * stock's colour, `depth` deep all told behind the booklet's back face (its local -z, at `-bookletDepth / 2`); in a box
 * whose contents rise out of its top (`peek`) each stands a little higher, so the edges show over the booklet.
 */
export function paperStack(papers: readonly Paper[], booklet: THREE.Vector3, depth: number, peek: boolean): THREE.Group {
  const group = new THREE.Group();
  group.name = 'Papers';
  const others = papers.slice(1);
  if (!others.length || depth <= 0) return group;
  const each = depth / others.length;
  others.forEach((paper, i) => {
    const across = paper.folds ? paper.width / paper.folds.across : paper.width;
    const down = paper.folds ? paper.height / paper.folds.down : paper.height;
    // A landscape card stands on its long edge in a tall box.
    const [w, h] = across > down && booklet.y > booklet.x ? [down, across] : [across, down];
    const width = Math.min(w, booklet.x * INSET);
    const height = Math.min(h, booklet.y * INSET);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(width, height, each * (1 - BETWEEN)), new THREE.MeshStandardMaterial({ color: paper.stock, roughness: 0.9 }));
    slab.name = `Paper:${paper.kind}`;
    const top = peek ? booklet.y / 2 + PEEK * (i + 1) : height / 2;
    slab.position.set(0, top - height / 2, -booklet.z / 2 - each * (i + 0.5));
    slab.castShadow = false;
    slab.receiveShadow = true;
    group.add(slab);
  });
  return group;
}
