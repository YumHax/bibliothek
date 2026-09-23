import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';

/** Metres of floor covered by one tile of the texture; the confetti is drawn wrapped, so it tiles seamlessly. */
const TILE_M = 3;
const TILE_PX = 1024;
/** How strongly the neon shapes glow of their own accord: the ground is near black, so only they do. */
const GLOW = 0.45;

const GROUND = '#14111f';
const NEON = ['#ff2fa0', '#33e0ff', '#ffe23a', '#4dff7a', '#b05cff', '#ff7a33'];

/**
 * The black carpet every arcade of the nineties had: a dark, fibrous ground scattered with
 * neon confetti (triangles, squiggles, rings, bars, sparkles) that glows faintly under the
 * blacklights. Painted once and tiled over the floor; the same canvas serves as the emissive map,
 * so the shapes read in a hall lit by nothing but its screens. The flat's rooms keep their parquet.
 */
export function carpetMaterial(floorWidth: number, floorDepth: number): THREE.MeshStandardMaterial {
  const [canvas, ctx] = createCanvas(TILE_PX, TILE_PX);
  const random = seededRandom(0x4a7c4de);

  ctx.fillStyle = GROUND;
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);
  // Fibres: a fine, uneven pile, lighter and darker flecks all over.
  for (let i = 0; i < 26000; i++) {
    const v = random();
    ctx.fillStyle = v < 0.5 ? `rgba(60,52,90,${0.2 + random() * 0.3})` : `rgba(8,6,14,${0.2 + random() * 0.3})`;
    ctx.fillRect(random() * TILE_PX, random() * TILE_PX, 1 + random() * 2, 1 + random() * 3);
  }

  // Every shape is drawn at its spot and again shifted by a tile each way, so what crosses an edge continues on the other side.
  const wrapped = (draw: () => void, x: number, y: number): void => {
    for (const dx of [-TILE_PX, 0, TILE_PX]) {
      for (const dy of [-TILE_PX, 0, TILE_PX]) {
        ctx.save();
        ctx.translate(x + dx, y + dy);
        draw();
        ctx.restore();
      }
    }
  };
  const pick = (): string => NEON[Math.floor(random() * NEON.length)]!;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = 0; i < 110; i++) {
    const x = random() * TILE_PX;
    const y = random() * TILE_PX;
    const angle = random() * Math.PI * 2;
    const size = 18 + random() * 40;
    const color = pick();
    const kind = random();
    wrapped(() => {
      ctx.rotate(angle);
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 5 + random() * 4;
      if (kind < 0.22) {
        // A triangle, outlined or filled.
        ctx.beginPath();
        ctx.moveTo(-size / 2, size / 3);
        ctx.lineTo(size / 2, size / 3);
        ctx.lineTo(0, -size / 1.6);
        ctx.closePath();
        if (random() < 0.5) ctx.fill();
        else ctx.stroke();
      } else if (kind < 0.42) {
        // A squiggle: a wavy stroke.
        ctx.beginPath();
        ctx.moveTo(-size, 0);
        ctx.bezierCurveTo(-size / 2, -size, 0, size, size / 2, -size / 2);
        ctx.bezierCurveTo(size * 0.8, 0, size, size / 2, size * 1.3, 0);
        ctx.stroke();
      } else if (kind < 0.58) {
        // A ring.
        ctx.beginPath();
        ctx.arc(0, 0, size / 2.2, 0, Math.PI * 2);
        ctx.stroke();
      } else if (kind < 0.76) {
        // A short bar, or two crossing.
        ctx.fillRect(-size, -4, size * 2, 8);
        if (random() < 0.4) ctx.fillRect(-4, -size * 0.7, 8, size * 1.4);
      } else if (kind < 0.9) {
        // A sparkle: four thin points.
        for (let k = 0; k < 4; k++) {
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(size * 0.8, 0);
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.rotate(Math.PI / 2);
        }
      } else {
        // A filled dot.
        ctx.beginPath();
        ctx.arc(0, 0, size / 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }, x, y);
  }
  // Tiny specks of the same colours between the shapes.
  for (let i = 0; i < 260; i++) {
    const x = random() * TILE_PX;
    const y = random() * TILE_PX;
    const color = pick();
    wrapped(() => {
      ctx.fillStyle = color;
      ctx.fillRect(-2, -2, 4, 4);
    }, x, y);
  }
  // Wear: a dull tread down the middle where everyone walks, the pattern half rubbed away.
  const wear = ctx.createLinearGradient(0, 0, 0, TILE_PX);
  wear.addColorStop(0, 'rgba(20,17,31,0)');
  wear.addColorStop(0.5, 'rgba(20,17,31,0.25)');
  wear.addColorStop(1, 'rgba(20,17,31,0)');
  ctx.fillStyle = wear;
  ctx.fillRect(0, 0, TILE_PX, TILE_PX);

  const map = toTexture(canvas, 8);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(floorWidth / TILE_M, floorDepth / TILE_M);
  return new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: GLOW, roughness: 1, metalness: 0 });
}
