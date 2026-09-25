import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, seededRandom } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import type { Season } from '../../props/outdoors/season';
import { FRONT, type Vec2 } from '../streetPlan';
import { groundHeight } from './ground';

const AUTUMN = ['#c9862f', '#d9a33a', '#b8562a', '#8a7a32', '#a8442a', '#e0b048', '#7a5a2a'];
/** Fallen leaves at the season's deepest, and how many fall at once. */
const FALLEN = 2600;
const FALLING = 180;
/** A falling leaf drops from the crowns (this high) over this many seconds, drifting with the wind. */
const CROWN = 6.2;
const FALL_SECONDS = 9;

const FALL_VERTEX = /* glsl */ `
attribute vec4 seed;
attribute vec3 tint;
uniform float time;
uniform float wind;
uniform float size;
varying vec3 vTint;
varying float vSpin;
varying float vFade;
void main() {
  float t = fract(time / ${FALL_SECONDS.toFixed(1)} + seed.w);
  vec3 p = position;
  p.y = mix(${CROWN.toFixed(1)} + seed.z * 1.5, seed.x, t);
  // Drift downwind, and flutter from side to side as it falls.
  p.x += wind * 5.0 * t + sin(time * 1.7 + seed.w * 40.0) * 0.5;
  p.z += wind * 1.5 * t + cos(time * 1.3 + seed.w * 23.0) * 0.4;
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = size / max(-view.z, 0.5);
  vTint = tint;
  vSpin = time * (1.5 + seed.y * 3.0) + seed.w * 6.28;
  vFade = smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.92, 1.0, t));
}
`;

const FALL_FRAGMENT = /* glsl */ `
uniform float light;
varying vec3 vTint;
varying float vSpin;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float cs = cos(vSpin);
  float sn = sin(vSpin);
  vec2 r = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
  // A leaf seen turning: an ellipse whose width swings with its spin.
  float w = 0.12 + 0.2 * abs(sin(vSpin * 0.7));
  if ((r.x * r.x) / (w * w) + (r.y * r.y) / 0.16 > 1.0) discard;
  gl_FragColor = vec4(vTint * light, vFade);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * Autumn on the pavements: leaves fallen around every street tree and swept into the gutters
 * along the kerbs (more as the season deepens: small instanced quads in the season's russets and
 * golds, lying at their own angles), and a few still coming down from the crowns, fluttering and
 * drifting with the wind (points animated in the vertex shader, no vertex touched on the CPU).
 * Built only in autumn; nothing at all otherwise.
 */
export class Leaves extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private time = 0;

  constructor(private readonly dayNight: DayNight, trees: readonly Vec2[], season: Season) {
    super();
    this.name = 'Leaves';
    const random = seededRandom(1311);
    const depth = 0.35 + 0.65 * season.depth;

    // Fallen: around the trees (denser near the trunk) and in the gutters.
    const count = Math.round(FALLEN * depth);
    const leaf = new THREE.PlaneGeometry(0.13, 0.09).rotateX(-Math.PI / 2);
    const material = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
    const fallen = new THREE.InstancedMesh(leaf, material, count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      let x: number;
      let z: number;
      if (random() < 0.65 && trees.length) {
        const [tx, tz] = trees[Math.floor(random() * trees.length)]!;
        const a = random() * Math.PI * 2;
        const r = 0.5 + Math.pow(random(), 1.6) * 5.5;
        x = tx + Math.cos(a) * r;
        z = THREE.MathUtils.clamp(tz + Math.sin(a) * r, FRONT.ourLine + 0.15, FRONT.farLine - 0.15);
      } else {
        // Swept against a kerb, on the road side.
        x = -34 + random() * 130;
        z = (random() < 0.5 ? -1 : 1) * (FRONT.farKerb - 0.1 - Math.pow(random(), 2) * 0.6);
      }
      p.set(x, groundHeight(x, z) + 0.004 + random() * 0.006, z);
      e.set((random() - 0.5) * 0.3, random() * Math.PI * 2, (random() - 0.5) * 0.3);
      q.setFromEuler(e);
      const k = 0.7 + random() * 0.6;
      s.set(k, 1, k);
      fallen.setMatrixAt(i, m.compose(p, q, s));
      fallen.setColorAt(i, color.set(AUTUMN[Math.floor(random() * AUTUMN.length)]!).multiplyScalar(0.75 + random() * 0.35));
    }
    fallen.instanceMatrix.needsUpdate = true;
    fallen.computeBoundingSphere();
    fallen.receiveShadow = true;
    fallen.castShadow = false;
    this.add(fallen);

    // Falling: each starts under a street tree's crown.
    const falling = Math.round(FALLING * depth);
    const positions = new Float32Array(falling * 3);
    const seeds = new Float32Array(falling * 4);
    const tints = new Float32Array(falling * 3);
    for (let i = 0; i < falling; i++) {
      const [tx, tz] = trees.length ? trees[Math.floor(random() * trees.length)]! : [0, 0];
      const x = tx + (random() - 0.5) * 4;
      const z = tz + (random() - 0.5) * 4;
      positions.set([x, 0, z], i * 3);
      seeds.set([groundHeight(x, z) + 0.02, random(), random(), random()], i * 4);
      color.set(AUTUMN[Math.floor(random() * AUTUMN.length)]!);
      tints.set([color.r, color.g, color.b], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
    geometry.setAttribute('tint', new THREE.BufferAttribute(tints, 3));
    this.uniforms = { time: { value: 0 }, wind: { value: 0.3 }, size: { value: 70 }, light: { value: 1 } };
    const fallMaterial = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: FALL_VERTEX, fragmentShader: FALL_FRAGMENT, transparent: true, depthWrite: false });
    // Blends over the scene but keeps the canvas alpha (docs/graphics.md).
    fallMaterial.blending = THREE.CustomBlending;
    fallMaterial.blendSrc = THREE.SrcAlphaFactor;
    fallMaterial.blendDst = THREE.OneMinusSrcAlphaFactor;
    fallMaterial.blendSrcAlpha = THREE.ZeroFactor;
    fallMaterial.blendDstAlpha = THREE.OneFactor;
    const points = new THREE.Points(geometry, fallMaterial);
    points.frustumCulled = false;
    points.renderOrder = 3;
    this.add(points);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    this.time = (this.time + dt) % (FALL_SECONDS * 100);
    this.uniforms.time!.value = this.time;
    this.uniforms.wind!.value += (s.wind - (this.uniforms.wind!.value as number)) * Math.min(1, dt);
    this.uniforms.light!.value = 0.2 + 0.8 * s.daylight;
  }
}

/** A leaf: a pointed oval with a midrib, white (tinted per instance), alpha outside it. */
function leafTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 44;
  const [canvas, ctx] = createCanvas(w, h);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(2, h / 2);
  ctx.quadraticCurveTo(w * 0.45, -h * 0.15, w - 2, h / 2);
  ctx.quadraticCurveTo(w * 0.45, h * 1.15, 2, h / 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,60,30,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(4, h / 2);
  ctx.lineTo(w - 6, h / 2);
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
