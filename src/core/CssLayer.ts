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

  render(camera: THREE.Camera): void {
    this.renderer.render(this.scene, camera);
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height);
  }

  /** Material that makes a mesh transparent to the DOM layer while still occluding 3D behind it. */
  static createCutoutMaterial(): THREE.Material {
    return new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, blending: THREE.NoBlending, toneMapped: false });
  }
}
