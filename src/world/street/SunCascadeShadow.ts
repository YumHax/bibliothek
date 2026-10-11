import * as THREE from 'three';

/** The far square's half-side (m) and the near one's, and where the near square is centred (world). */
interface CascadeFrames {
  farReach: number;
  nearReach: number;
  nearCentre: THREE.Vector3;
}

/** three.js exports `DirectionalLightShadow` as a type only: its class, as every directional light gets one. */
const DirectionalShadow = new THREE.DirectionalLight().shadow.constructor as new () => THREE.DirectionalLightShadow;

const _centre = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _camera = new THREE.Vector3();

/**
 * The street sun's shadow with a second, finer square round the player in the same map (no second shadow-casting
 * light, so no texture unit more in any lit shader): the map is two squares wide, the near one (`nearReach` round
 * `nearCentre`) in its right half, the far one (the rig's whole square) in its left. three.js draws one viewport each
 * (as it does a point light's six faces); after both, `matrix` is the far square's, and `mapping` (xy scale, zw
 * offset) takes a far square's coordinate to the near one's, written only when the map is drawn so the two always
 * agree. The near square snaps to its own texels in the light's frame, so its edges do not shimmer either.
 * `shadowFade` reads both (`sunCascade`).
 */
export class SunCascadeShadow extends DirectionalShadow {
  private readonly frames: CascadeFrames;
  private readonly mapping: THREE.Vector4;
  private readonly extents = new THREE.Vector2(2, 1);
  private readonly views = [new THREE.Vector4(1, 0, 1, 1), new THREE.Vector4(0, 0, 1, 1)];
  private readonly near = { left: 0, right: 0, top: 0, bottom: 0 };

  constructor(frames: CascadeFrames, mapping: THREE.Vector4) {
    super();
    this.frames = frames;
    this.mapping = mapping;
  }

  override getViewportCount(): number {
    return 2;
  }

  override getViewport(viewportIndex: number): THREE.Vector4 {
    return this.views[viewportIndex] ?? this.views[1]!;
  }

  override getFrameExtents(): THREE.Vector2 {
    return this.extents;
  }

  /** Viewport 0 the near square (drawn first), 1 the far one (its matrix is the one left for the shaders). */
  override updateMatrices(light: THREE.Light, viewportIndex = 1): void {
    const cam = this.camera;
    const { farReach, nearReach } = this.frames;
    if (viewportIndex === 1) {
      this.frame(-farReach, farReach, farReach, -farReach);
      super.updateMatrices(light);
      // Far coordinate u = (v - l_f) / w_f; near u' = (v - l_n) / w_n: u' = u * w_f / w_n + (l_f - l_n) / w_n.
      const wn = this.near.right - this.near.left;
      const hn = this.near.top - this.near.bottom;
      this.mapping.set((2 * farReach) / wn, (2 * farReach) / hn, (-farReach - this.near.left) / wn, (-farReach - this.near.bottom) / hn);
      return;
    }
    // Where the near centre stands in the light's view, its square snapped to whole near texels along the light's
    // own axes, measured from the world's origin (the camera itself moves in the far square's texels).
    super.updateMatrices(light);
    cam.updateMatrixWorld();
    _right.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    _up.setFromMatrixColumn(cam.matrixWorld, 1).normalize();
    _camera.setFromMatrixPosition(cam.matrixWorld);
    _centre.copy(this.frames.nearCentre);
    const texel = (2 * nearReach) / this.mapSize.x;
    const camX = _camera.dot(_right);
    const camY = _camera.dot(_up);
    const x = Math.round(_centre.dot(_right) / texel) * texel - camX;
    const y = Math.round(_centre.dot(_up) / texel) * texel - camY;
    this.near.left = x - nearReach;
    this.near.right = x + nearReach;
    this.near.bottom = y - nearReach;
    this.near.top = y + nearReach;
    this.frame(this.near.left, this.near.right, this.near.top, this.near.bottom);
    super.updateMatrices(light);
  }

  private frame(left: number, right: number, top: number, bottom: number): void {
    const cam = this.camera;
    if (cam.left === left && cam.right === right && cam.top === top && cam.bottom === bottom) return;
    cam.left = left;
    cam.right = right;
    cam.top = top;
    cam.bottom = bottom;
    cam.updateProjectionMatrix();
  }
}
