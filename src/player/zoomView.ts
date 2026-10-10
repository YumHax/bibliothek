import type * as THREE from 'three';
import { clamp, smooth } from '@/math/scalar';

/** The zoom under way, cancelled by the next one (one camera, one close shot at a time). */
let running = 0;

/**
 * Eases `camera`'s zoom to `factor` over `seconds` (1: the player's own field of view): the close
 * shot of a conversation. The zoom is separate from the field of view the settings, the sprint and
 * photo mode set, so nothing of theirs is overwritten.
 */
export function zoomView(camera: THREE.PerspectiveCamera, factor: number, seconds = 0.45): void {
  cancelAnimationFrame(running);
  const from = camera.zoom;
  if (from === factor) return;
  const start = performance.now();
  const step = (now: number): void => {
    const t = clamp((now - start) / (seconds * 1000), 0, 1);
    camera.zoom = from + (factor - from) * smooth(t);
    camera.updateProjectionMatrix();
    if (t < 1) running = requestAnimationFrame(step);
  };
  running = requestAnimationFrame(step);
}
