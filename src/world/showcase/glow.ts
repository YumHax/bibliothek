import * as THREE from 'three';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { standard } from '../materials/palette';
import { RENDER_ORDER } from '../surface/layers';

/** A warm LED strip, lit (no light of its own: the displays never add one, see docs/props.md "Lights"). */
export const WARM_STRIP = standard({ color: 0xfff1d0, emissive: 0xffe2a8, emissiveIntensity: 1.6, roughness: 0.5 });
/** The lit front edge of a glass shelf (edge-lit glass), a cooler white. */
export const EDGE_LIGHT = standard({ color: 0xeaf4ff, emissive: 0xd8ecff, emissiveIntensity: 1.25, roughness: 0.3 });
/** Clear glass: panes and shelves, see-through to the eye and to the crosshair (`unclickable`). */
export const CLEAR_GLASS = standard({ color: 0xe8f4f4, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 2.4 });
export const SHELF_GLASS = standard({ color: 0xcfe6e2, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false, envMapIntensity: 1.8 });

/** `object` no longer stops the crosshair (the boxes behind a pane are clicked through it), casts no shadow, draws as glass. */
export function asGlass<T extends THREE.Object3D>(object: T): T {
  object.raycast = () => {};
  object.castShadow = false;
  object.receiveShadow = false;
  object.renderOrder = RENDER_ORDER.glass;
  return object;
}

/** A strip's light painted onto what it shines on: added over it, the canvas's alpha kept (docs/graphics.md). */
export function bakedGlow(color: number, opacity: number, map: THREE.Texture): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color, map, transparent: true, opacity, depthWrite: false,
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor,
  });
}

/** Bright at the top (under the strip), fading down. */
export function washTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(8, 64);
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0.06)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 8, 64);
  return new THREE.CanvasTexture(canvas);
}

/** A soft oval pool, brightest towards the front. */
export function poolTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(64, 32);
  const g = ctx.createRadialGradient(32, 20, 2, 32, 20, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 32);
  return new THREE.CanvasTexture(canvas);
}
