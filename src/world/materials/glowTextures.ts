import * as THREE from 'three';
import { createCanvas } from '@/graphics/canvas';
import { sharedCanvasTexture } from './sharedResources';

/*
 * The soft masks glows are drawn with (`blend.additive`): a pool under a lamp, a strip or a screen, a wash
 * down a wall. White, the falloff in the alpha; each shape painted once for the page and shared.
 * Data maps (no sRGB decode): the alpha carries the falloff, and no colour space touches an alpha; the
 * white RGB decodes to white either way. Marked as data they say what they are, every one made alike
 * (they were sRGB in some places and colour-less in others).
 */

/** Where the falloff is: [offset 0..1 from the bright end, alpha 0..1], ascending offsets. */
type GlowStops = readonly (readonly [number, number])[];

interface RadialGlow {
  /** Canvas size in texels. */
  width: number;
  height: number;
  /** Centre of the pool, in texels (default the canvas's middle). */
  centre?: readonly [number, number];
  /** Inner and outer radius, in texels (default 0 to half the width). */
  radius?: readonly [number, number];
  stops: GlowStops;
}

/** A round (or, on a wide canvas stretched over its plane, oval) pool of light. */
export function radialGlow(glow: RadialGlow): THREE.CanvasTexture {
  const { width, height, stops } = glow;
  const [cx, cy] = glow.centre ?? [width / 2, height / 2];
  const [r0, r1] = glow.radius ?? [0, width / 2];
  return sharedCanvasTexture(
    `glow:radial:${width}x${height}:${cx},${cy}:${r0},${r1}:${stopsKey(stops)}`,
    () => {
      const [canvas, ctx] = createCanvas(width, height);
      const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
      for (const [at, alpha] of stops) g.addColorStop(at, `rgba(255,255,255,${alpha})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
      return canvas;
    },
    { data: true },
  );
}

/** A fade from the top of the canvas (offset 0) down to its foot (offset 1): a strip's light washing down a wall. */
export function verticalGlow(height: number, stops: GlowStops): THREE.CanvasTexture {
  return sharedCanvasTexture(
    `glow:vertical:${height}:${stopsKey(stops)}`,
    () => {
      const [canvas, ctx] = createCanvas(8, height);
      const g = ctx.createLinearGradient(0, 0, 0, height);
      for (const [at, alpha] of stops) g.addColorStop(at, `rgba(255,255,255,${alpha})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 8, height);
      return canvas;
    },
    { data: true },
  );
}

/**
 * Light spilling out of a lit window onto the pavement: brightest along the canvas's top edge (the wall),
 * falling off as (1 - out)^`power` towards the kerb, and fading out over the last `edge` of each end.
 */
export function spillGlow(width: number, height: number, power: number, edge: number): THREE.CanvasTexture {
  return sharedCanvasTexture(
    `glow:spill:${width}x${height}:${power}:${edge}`,
    () => {
      const [canvas, ctx] = createCanvas(width, height);
      const image = ctx.createImageData(width, height);
      for (let y = 0; y < height; y++) {
        const fade = Math.pow(1 - y / (height - 1), power);
        for (let x = 0; x < width; x++) {
          const across = Math.abs(x / (width - 1) - 0.5) * 2;
          const side = 1 - THREE.MathUtils.smoothstep(across, 1 - edge, 1);
          const k = (y * width + x) * 4;
          image.data[k] = image.data[k + 1] = image.data[k + 2] = 255;
          image.data[k + 3] = Math.round(255 * fade * side);
        }
      }
      ctx.putImageData(image, 0, 0);
      return canvas;
    },
    { data: true },
  );
}

function stopsKey(stops: GlowStops): string {
  return stops.map(([at, alpha]) => `${at}/${alpha}`).join(',');
}
