import * as THREE from 'three';
import { createCanvas } from '@/covers/generated/canvasUtils';
import type { Rng } from './Sheet';

/** Equirectangular size of the sky map: 360° across, 180° down; the sky needs far less detail than the scenery. */
const W = 2048;
const H = 1024;
const PX_PER_RAD = W / (Math.PI * 2);

/**
 * The sky's detail masks, painted once, linear (not colour): R the stars, G the clouds (soft
 * puffs, 1 at their heart). The shader scales each with a uniform as the day goes by. Sampled
 * along the eye ray itself: the sky is at infinity.
 */
export function paintSkyDetail(random: Rng): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#f00';
  for (let i = 0; i < 900; i++) {
    ctx.beginPath();
    ctx.arc(random() * W, random() * (H / 2 - 20), 0.6 + random() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 28; i++) {
    const cx = random() * W;
    const cy = H / 2 - (8 + random() * 26) * THREE.MathUtils.DEG2RAD * PX_PER_RAD;
    const puffs = Array.from({ length: 4 + Math.floor(random() * 4) }, () => ({ dx: (random() - 0.5) * 90, dy: (random() - 0.5) * 18, r: 16 + random() * 22 }));
    for (const x of [cx - W, cx, cx + W])
      for (const puff of puffs) {
        const glow = ctx.createRadialGradient(x + puff.dx, cy + puff.dy, 0, x + puff.dx, cy + puff.dy, puff.r);
        glow.addColorStop(0, 'rgba(0,255,0,1)');
        glow.addColorStop(1, 'rgba(0,255,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x + puff.dx - puff.r, cy + puff.dy - puff.r, puff.r * 2, puff.r * 2);
      }
  }
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}
