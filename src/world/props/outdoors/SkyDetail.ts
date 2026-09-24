import * as THREE from 'three';
import { createCanvas } from '@/covers/generated/canvasUtils';
import type { Rng } from './Sheet';
import { between } from './paint';

/** Equirectangular size of the sky map: 360° across, 180° down; the sky needs far less detail than the scenery. */
const W = 2048;
const H = 1024;
const PX_PER_RAD = W / (Math.PI * 2);

/** Texture y of an elevation above the horizon. */
function skyY(elevation: number): number {
  return H / 2 - elevation * PX_PER_RAD;
}

/**
 * The sky's detail masks, painted once, linear (not colour): R the stars (brighter the bigger), G
 * the clouds (1 at their heart), B the shade on a cloud's underside. The shader scales each with a
 * uniform as the day goes by. Sampled along the eye ray itself: the sky is at infinity.
 */
export function paintSkyDetail(random: Rng): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 1100; i++) {
    const bright = random();
    ctx.fillStyle = `rgb(${Math.round(90 + 165 * bright * bright)},0,0)`;
    ctx.beginPath();
    ctx.arc(random() * W, random() * (H / 2 - 20), 0.5 + bright * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'lighter';
  // Cumulus: heaps of puffs on a flat base, smaller and flatter towards the horizon, shaded underneath.
  for (let i = 0; i < 44; i++) {
    const elevation = THREE.MathUtils.degToRad(between(random, 4, 34));
    const scale = 0.45 + (elevation / THREE.MathUtils.degToRad(34)) * 0.9;
    const cx = random() * W;
    const base = skyY(elevation);
    const width = between(random, 50, 130) * scale;
    const height = width * between(random, 0.28, 0.45);
    const puffs = Array.from({ length: 6 + Math.floor(random() * 7) }, () => {
      const dx = (random() - 0.5) * width;
      // Taller in the middle of the heap.
      const rise = (1 - Math.abs(dx) / (width * 0.6)) * height;
      return { dx, dy: -between(random, 0.2, 0.8) * rise, r: between(random, 0.35, 0.6) * height + 6 * scale };
    });
    for (const x of [cx - W, cx, cx + W]) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x - width, base - height * 2.2, width * 2, height * 2.2);
      ctx.clip();
      for (const puff of puffs) {
        const glow = ctx.createRadialGradient(x + puff.dx, base + puff.dy, 0, x + puff.dx, base + puff.dy, puff.r);
        glow.addColorStop(0, 'rgba(0,255,0,1)');
        glow.addColorStop(0.55, 'rgba(0,255,0,0.75)');
        glow.addColorStop(1, 'rgba(0,255,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(x + puff.dx - puff.r, base + puff.dy - puff.r, puff.r * 2, puff.r * 2);
      }
      const shade = ctx.createLinearGradient(0, base - height * 1.4, 0, base);
      shade.addColorStop(0, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,255,0.9)');
      ctx.fillStyle = shade;
      ctx.fillRect(x - width, base - height * 1.4, width * 2, height * 1.4);
      ctx.restore();
    }
  }
  // Cirrus: long faint streaks high up.
  for (let i = 0; i < 16; i++) {
    const y = skyY(THREE.MathUtils.degToRad(between(random, 30, 65)));
    const cx = random() * W;
    const len = between(random, 120, 320);
    const tilt = between(random, -0.08, 0.08);
    const strands = Array.from({ length: 5 }, () => ({ oy: between(random, -6, 6), alpha: between(random, 0.15, 0.35), thick: between(random, 2, 4) }));
    for (const x of [cx - W, cx, cx + W]) {
      for (const { oy, alpha, thick } of strands) {
        const g = ctx.createLinearGradient(-len / 2, 0, len / 2, 0);
        g.addColorStop(0, 'rgba(0,255,0,0)');
        g.addColorStop(0.5, `rgba(0,255,0,${alpha})`);
        g.addColorStop(1, 'rgba(0,255,0,0)');
        ctx.save();
        ctx.translate(x, y + oy);
        ctx.rotate(tilt);
        ctx.fillStyle = g;
        ctx.fillRect(-len / 2, -1.5, len, thick);
        ctx.restore();
      }
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}
