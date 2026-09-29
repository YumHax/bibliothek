import * as THREE from 'three';
import { CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import type { LayerRenderer } from './Engine';

/**
 * A DOM layer rendered *behind* the WebGL canvas with the same camera.
 * Meshes using a "cut-out" material (alpha 0, NoBlending) punch holes in the canvas so
 * DOM elements placed here (e.g. a YouTube iframe) appear embedded in the 3D scene.
 */
export class CssLayer implements LayerRenderer {
  readonly scene = new THREE.Scene();
  readonly renderer = new CSS3DRenderer();

  constructor(container: HTMLElement) {
    const el = this.renderer.domElement;
    el.className = 'css-layer';
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    container.prepend(el); // behind the canvas
  }

  /** Whether the last render showed anything: once everything is hidden, one more render hides the elements and the layer then rests. */
  private shown = true;
  private filter = '';

  /**
   * A CSS filter over the whole layer: the frame's exposure, contrast, saturation and depth-of-field
   * blur mirrored by the graphics (`graphics` `VideoLayer`), since no pass reaches the DOM behind
   * the cut-out. Written only when it changes (a style write is a recalc); a neutral filter is none.
   */
  setFilter(filter: string): void {
    const value = filter === 'brightness(1.00) contrast(1.00) saturate(1.00)' || filter === 'brightness(1.00)' ? '' : filter;
    if (value === this.filter) return;
    this.filter = value;
    this.renderer.domElement.style.filter = value;
  }

  /**
   * Places the elements with the camera. With nothing shown (no video playing, the usual case) it
   * does nothing: `CSS3DRenderer` would otherwise rewrite the camera's transform and hide every
   * element again each frame, a style recalc for a layer that shows nothing.
   */
  render(camera: THREE.Camera): void {
    const shown = this.scene.children.some((child) => child.visible);
    if (!shown && !this.shown) return;
    this.shown = shown;
    this.renderer.render(this.scene, camera);
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height);
  }

  /** Material that makes a mesh transparent to the DOM layer while still occluding 3D behind it. No fog: haze would tint the hole. */
  static createCutoutMaterial(): THREE.Material {
    return new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending, toneMapped: false, fog: false });
  }
}
