import * as THREE from 'three';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { sharedCanvasTexture } from '../materials/sharedResources';
import { cylinderMesh } from '../meshUtils';
import { Prop, part } from '../props/Prop';
import { shared } from '../materials/palette';
import { PROUD } from '../props/joinery';

const THICKNESS = 0.012;
/** The squares' colours, granny's leftovers: rings of each round a cream centre, a black border round every square. */
const WOOLS = ['#b8483a', '#e0a83a', '#4a7a5a', '#3a5a8a', '#8a4a7a', '#d87a4a'];

/** Four by four granny squares, once for the page (the throw's uvs tile it). */
function squaresCanvas(): HTMLCanvasElement {
  const S = 256;
  const N = 4;
  const cell = S / N;
  const [canvas, ctx] = createCanvas(S, S);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const x = i * cell;
      const y = j * cell;
      ctx.fillStyle = '#1e1a18';
      ctx.fillRect(x, y, cell, cell);
      for (let ring = 0; ring < 3; ring++) {
        const inset = 4 + ring * 8;
        ctx.fillStyle = ring === 2 ? '#efe4cc' : WOOLS[(i * 3 + j * 5 + ring * 2) % WOOLS.length]!;
        ctx.fillRect(x + inset, y + inset, cell - 2 * inset, cell - 2 * inset);
      }
      // The stitches' holes: a few dark dots in each ring.
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      for (let k = 0; k < 4; k++) {
        ctx.fillRect(x + 8 + k * 14, y + 8, 3, 3);
        ctx.fillRect(x + 8, y + 8 + k * 14, 3, 3);
      }
    }
  }
  return canvas;
}

function crochet(): THREE.MeshStandardMaterial {
  return shared('grandma-crochet', () => new THREE.MeshStandardMaterial({ map: sharedCanvasTexture('grandma-crochet', squaresCanvas, { repeat: true }), roughness: 1 }));
}

/**
 * A crocheted throw over the back of Mémé's armchair (`furnishGrandmaDecor`): granny squares in her leftover wools,
 * folded over the top, a long fall down the back, a short one in front. Origin on the middle of the back's top, the
 * back running along local x, the long fall towards -z (behind the chair). `edge` is the back's thickness there.
 * Decoration: never collides.
 */
export class CrochetThrow extends Prop {
  readonly contactShadow = false;

  constructor({ width = 0.62, edge = 0.15, drop = 0.42, inner = 0.08 }: { width?: number; edge?: number; drop?: number; inner?: number } = {}) {
    super();
    this.name = 'CrochetThrow';
    const wool = crochet();
    const half = edge / 2 + THICKNESS / 2;
    part(this, width, THICKNESS, edge + 2 * THICKNESS, wool, { y: THICKNESS / 2 });
    for (const side of [-1, 1]) {
      const fold = cylinderMesh(THICKNESS, width, wool, { y: 0, z: side * half }, { segments: 10 });
      fold.rotation.z = Math.PI / 2;
      this.add(fold);
    }
    part(this, width, drop, THICKNESS, wool, { y: -drop / 2, z: -half - PROUD });
    part(this, width * 0.97, inner, THICKNESS, wool, { y: -inner / 2, z: half });
  }
}
