import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture, repeatTexture } from '@/covers/generated/canvasUtils';
import { facadeHeight } from '../street/facadePainter';
import { FACADES } from '../street/streetPlan';
import { Prop } from '../props/Prop';

/** How deep a block runs back from its street front (m), and how far under its parapet's top its roof lies. */
const BLOCK_DEPTH = 16;
const UNDER_PARAPET = 0.25;

/**
 * The roofs behind the street's facades, as only the roof sees them: down on the street the
 * facades are sheets with nothing behind (`Buildings`), from up here a block needs a top. One dark
 * slate-and-zinc quad behind each front of Front Street's two rows (but ours: the roof is ours), at
 * its parapet's height, `BLOCK_DEPTH` back. One mesh. Placed in the street's frame.
 */
export class Roofscape extends Prop {
  readonly contactShadow = false;

  constructor() {
    super();
    this.name = 'Roofscape';
    const positions: number[] = [];
    const uvs: number[] = [];
    for (const f of FACADES) {
      if (f.from[1] !== f.to[1] || Math.abs(f.from[1]) !== 12 || f.id.startsWith('ours')) continue;
      const z = f.from[1];
      // Our side's fronts face the street (+z): the block runs back (-z); across, the other way.
      const back = z < 0 ? z - BLOCK_DEPTH : z + BLOCK_DEPTH;
      const y = facadeHeight(f.storeys) - UNDER_PARAPET;
      const xa = Math.min(f.from[0], f.to[0]);
      const xb = Math.max(f.from[0], f.to[0]);
      const za = Math.min(z, back);
      const zb = Math.max(z, back);
      // Facing up: counter-clockwise seen from above.
      const quad = [[xa, zb], [xb, zb], [xb, za], [xa, zb], [xb, za], [xa, za]] as const;
      for (const [x, qz] of quad) {
        positions.push(x, y, qz);
        uvs.push(x / 6, qz / 6);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: roofsTexture(), roughness: 0.8 }));
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.add(mesh);
  }
}

/** Six metres of city roof: slate and zinc patches, skylights, chimney stacks' soot. */
function roofsTexture(): THREE.CanvasTexture {
  const px = 256;
  const [canvas, ctx] = createCanvas(px, px);
  const random = seededRandom(91);
  ctx.fillStyle = '#4c5058';
  ctx.fillRect(0, 0, px, px);
  for (let i = 0; i < 26; i++) {
    const t = 0.7 + random() * 0.5;
    ctx.fillStyle = random() < 0.4 ? `rgb(${Math.round(150 * t)}, ${Math.round(154 * t)}, ${Math.round(160 * t)})` : `rgb(${Math.round(60 * t)}, ${Math.round(64 * t)}, ${Math.round(74 * t)})`;
    ctx.fillRect(random() * px, random() * px, 20 + random() * 70, 14 + random() * 40);
  }
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = '#7a4a36';
    ctx.fillRect(random() * px, random() * px, 10, 6);
    ctx.fillStyle = 'rgba(160, 190, 210, 0.6)';
    ctx.fillRect(random() * px, random() * px, 9, 12);
  }
  const texture = toTexture(canvas, 'grazing');
  repeatTexture(texture);
  return texture;
}
