import * as THREE from 'three';

/**
 * Window panes: flat quads a few millimetres off the wall, whose picture is somewhere far behind them (the painted
 * view, the street through a portal). The ambient occlusion reads them as the wall they lie on and darkens the view
 * round every mullion, frame and curtain standing a few centimetres proud of them (dark halos over the street). The
 * panes are registered here (`markGlass`, by `RoomWindow` and `OutlookView`), and `GlassMask` draws where they show in
 * the frame (not hidden behind a mullion or a curtain: their depth against the scene's) so the occlusion spares them.
 */
const panes = new Set<THREE.Mesh>();

/** `mesh` is a window pane: what it shows lies far beyond it. */
export function markGlass(mesh: THREE.Mesh): void {
  panes.add(mesh);
}

/** The pane is gone (its room unloaded, its view freed). */
export function unmarkGlass(mesh: THREE.Mesh): void {
  panes.delete(mesh);
}

const VERTEX = /* glsl */ `
void main() {
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * The pane's fragment is kept where it is the nearest thing (its own depth against the scene's at that pixel, within a
 * couple of centimetres: the mask is half the scene's resolution, and a slanted pane's depth varies across a texel);
 * a mullion or a curtain in front of it is 3 cm and more nearer.
 */
const FRAGMENT = /* glsl */ `
#include <packing>
uniform sampler2D tDepth;
uniform vec2 maskTexel;
uniform float cameraNear;
uniform float cameraFar;
void main() {
  vec2 uv = gl_FragCoord.xy * maskTexel;
  float scene = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar);
  float own = -perspectiveDepthToViewZ(gl_FragCoord.z, cameraNear, cameraFar);
  if (own > scene + 0.012 + 0.004 * own) discard;
  gl_FragColor = vec4(1.0);
}
`;

/**
 * Where the frame shows a window pane: 1 there, 0 elsewhere, at the occlusion's resolution and share of its target
 * (`PostFx`'s adaptive render scale). Each registered pane in the scene and shown is drawn by a proxy sharing its
 * geometry and world matrix: a handful of quads, no traversal of the room.
 */
export class GlassMask {
  readonly target: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly proxies = new Map<THREE.Mesh, THREE.Mesh>();
  private readonly material: THREE.ShaderMaterial;
  /** Whether the last render drew anything (else the cleared mask stands). */
  private dirty = true;

  constructor(depth: THREE.DepthTexture, width: number, height: number) {
    this.target = new THREE.WebGLRenderTarget(width, height, { type: THREE.UnsignedByteType, format: THREE.RedFormat, depthBuffer: false });
    this.target.texture.name = 'PostFx.glass';
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tDepth: { value: depth },
        maskTexel: { value: new THREE.Vector2(1 / width, 1 / height) },
        cameraNear: { value: 0.1 },
        cameraFar: { value: 100 },
      },
    });
    this.scene.matrixWorldAutoUpdate = false;
  }

  get texture(): THREE.Texture {
    return this.target.texture;
  }

  setSize(width: number, height: number): void {
    this.target.setSize(width, height);
    (this.material.uniforms.maskTexel!.value as THREE.Vector2).set(1 / width, 1 / height);
    this.dirty = true;
  }

  /** The mask of `scene`'s panes as `camera` sees them, over `viewport` of the target (the frame's share). */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, viewport: THREE.Vector4): void {
    let any = false;
    for (const [pane, proxy] of this.proxies) {
      if (panes.has(pane)) continue;
      this.scene.remove(proxy);
      this.proxies.delete(pane);
    }
    for (const pane of panes) {
      let proxy = this.proxies.get(pane);
      if (!proxy) {
        proxy = new THREE.Mesh(pane.geometry, this.material);
        proxy.matrixAutoUpdate = false;
        this.proxies.set(pane, proxy);
        this.scene.add(proxy);
      }
      proxy.geometry = pane.geometry;
      proxy.visible = shownIn(pane, scene, camera);
      if (!proxy.visible) continue;
      proxy.matrixWorld.copy(pane.matrixWorld);
      any = true;
    }
    if (!any && !this.dirty) return;
    const uniforms = this.material.uniforms;
    uniforms.cameraNear!.value = camera.near;
    uniforms.cameraFar!.value = camera.far;
    this.target.viewport.copy(viewport);
    this.target.scissor.copy(viewport);
    const previous = renderer.getRenderTarget();
    const clearColor = renderer.getClearColor(CLEAR);
    const clearAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    if (any) {
      const autoClear = renderer.autoClear;
      const shadows = renderer.shadowMap.autoUpdate;
      renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.render(this.scene, camera);
      renderer.autoClear = autoClear;
      renderer.shadowMap.autoUpdate = shadows;
    }
    renderer.setClearColor(clearColor, clearAlpha);
    renderer.setRenderTarget(previous);
    this.dirty = any;
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
  }
}

const CLEAR = new THREE.Color();

/** Whether `pane` is drawn in this frame: under `scene`, itself and every parent visible, on a layer the camera sees. */
function shownIn(pane: THREE.Mesh, scene: THREE.Scene, camera: THREE.Camera): boolean {
  if (!pane.layers.test(camera.layers)) return false;
  let o: THREE.Object3D = pane;
  for (;;) {
    if (!o.visible) return false;
    if (!o.parent) return o === scene;
    o = o.parent;
  }
}
