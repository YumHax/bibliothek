import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { seededRandom } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { KERB_HEIGHT } from './streetPlan';

/** The box of air around the eye the drops and flakes fill (metres), and how many there can be at most. */
const BOX = new THREE.Vector3(34, 16, 34);
const DROPS = 7000;
const FLAKES = 5000;
/** Splashes on the ground: how many at most, over what square around the eye, how long each ring lasts. */
const SPLASHES = 900;
const SPLASH_BOX = 22;
const SPLASH_SECONDS = 0.45;

/*
 * Both shaders place every particle in world space from its seed and the time, wrapped into the
 * box centred on the camera, so the rain stands still while the player walks through it and no
 * vertex is ever touched on the CPU. A particle whose threshold is above the current amount is
 * thrown out of the clip volume. No backtick in these strings.
 */
/** A box no particle falls into (world space; empty by default): the building's sas, open on the street. */
const SHELTER = /* glsl */ `
uniform vec3 shelterMin;
uniform vec3 shelterMax;
bool sheltered(vec3 p) { return all(greaterThan(p, shelterMin)) && all(lessThan(p, shelterMax)); }
`;

const RAIN_VERTEX = /* glsl */ `
${SHELTER}
attribute vec2 extra;
uniform float time;
uniform float amount;
uniform vec3 box;
uniform vec3 velocity;
uniform float streak;
varying float vFade;
void main() {
  vec3 p = position * box + velocity * time;
  vec3 origin = cameraPosition - box * 0.5;
  vec3 w = origin + mod(p - origin, box);
  w -= normalize(velocity) * streak * extra.x;
  vFade = 1.0 - extra.x * 0.8;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
  if (extra.y > amount || sheltered(w)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const RAIN_FRAGMENT = /* glsl */ `
uniform vec3 color;
uniform float opacity;
varying float vFade;
void main() {
  gl_FragColor = vec4(color, opacity * vFade);
}
`;

const SNOW_VERTEX = /* glsl */ `
${SHELTER}
attribute vec2 extra;
uniform float time;
uniform float amount;
uniform vec3 box;
uniform vec3 velocity;
uniform float size;
void main() {
  vec3 p = position * box + velocity * time;
  p.x += sin(time * 0.9 + position.y * 40.0) * 0.6;
  p.z += cos(time * 0.7 + position.x * 40.0) * 0.6;
  vec3 origin = cameraPosition - box * 0.5;
  vec3 w = origin + mod(p - origin, box);
  vec4 view = viewMatrix * vec4(w, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = size * (0.6 + 0.8 * extra.x) / max(-view.z, 0.5);
  if (extra.y > amount || sheltered(w)) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const SNOW_FRAGMENT = /* glsl */ `
uniform vec3 color;
uniform float opacity;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  gl_FragColor = vec4(color, opacity * (1.0 - d * 3.0));
}
`;

/*
 * A splash: each point is a ring on the ground that grows and fades over `period`, then turns up
 * elsewhere (its spot re-drawn from its seed and the cycle's number), wrapped into the square
 * around the camera. The ground is a kerb lower on the road (`roadY` inside the road's rectangles,
 * in zone-local metres: `origin` is the zone's world position). The ring is squashed by the view's
 * slant so it lies on the ground.
 */
const SPLASH_VERTEX = /* glsl */ `
${SHELTER}
attribute vec2 extra;
uniform float time;
uniform float amount;
uniform float box;
uniform float period;
uniform float size;
uniform vec3 origin;
uniform float roadY;
varying float vAge;
varying float vSquash;
float hash(float n) { return fract(sin(n) * 43758.5453); }
bool onRoad(vec2 p) {
  if (p.x >= -36.0 && p.x <= 136.0 && abs(p.y) <= 8.0) return true;
  if (p.x >= -36.0 && p.x <= -20.0 && p.y <= -8.0) return true;
  return p.x >= 114.0 && p.x <= 118.0 && p.y <= -8.0 && p.y >= -60.0;
}
void main() {
  float phase = time / period + extra.x;
  float cycle = floor(phase);
  vAge = fract(phase);
  vec2 seed = position.xz + vec2(hash(cycle + extra.x * 91.0), hash(cycle * 1.7 + extra.x * 57.0));
  vec2 corner = cameraPosition.xz - vec2(box * 0.5);
  vec2 w = corner + mod(seed * box - corner, vec2(box));
  vec2 local = w - origin.xz;
  float y = origin.y + (onRoad(local) ? roadY : 0.0) + 0.01;
  vec4 view = viewMatrix * vec4(w.x, y, w.y, 1.0);
  gl_Position = projectionMatrix * view;
  vec3 toEye = normalize(cameraPosition - vec3(w.x, y, w.y));
  vSquash = max(abs(toEye.y), 0.12);
  gl_PointSize = size / max(-view.z, 0.5);
  if (extra.y > amount || sheltered(vec3(w.x, y, w.y))) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const SPLASH_FRAGMENT = /* glsl */ `
uniform vec3 color;
uniform float opacity;
varying float vAge;
varying float vSquash;
void main() {
  vec2 c = (gl_PointCoord - 0.5) * 2.0;
  c.y /= vSquash;
  float r = length(c);
  float ring = 1.0 - smoothstep(0.0, 0.12, abs(r - (0.2 + 0.75 * vAge)));
  if (ring <= 0.0 || r > 1.0) discard;
  gl_FragColor = vec4(color, opacity * ring * (1.0 - vAge));
}
`;

/** Blends over the scene but keeps the canvas alpha (the video cut-out rule, docs/graphics.md). */
function overlay(material: THREE.ShaderMaterial): THREE.ShaderMaterial {
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.CustomBlending;
  material.blendSrc = THREE.SrcAlphaFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
  return material;
}

function particles(count: number, verticesEach: number, seed: number): THREE.BufferGeometry {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * verticesEach * 3);
  const extra = new Float32Array(count * verticesEach * 2);
  for (let i = 0; i < count; i++) {
    const x = random();
    const y = random();
    const z = random();
    const threshold = random();
    const size = random();
    for (let v = 0; v < verticesEach; v++) {
      const k = i * verticesEach + v;
      positions.set([x, y, z], k * 3);
      extra[k * 2] = verticesEach === 2 ? v : size;
      extra[k * 2 + 1] = threshold;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('extra', new THREE.BufferAttribute(extra, 2));
  return geometry;
}

/**
 * Rain and snow around the player, following `SkyState.rain` / `snow` (how many particles show)
 * and `wind` (how they slant): rain as short streaks (`LineSegments`), snow as soft round points
 * drifting down, and while it rains, splashes on the ground (little rings growing and fading, on
 * the road a kerb lower than on the pavements). Everything moves in the vertex shader; the meshes
 * are hidden (no draw call) while nothing falls. Coloured by the light: pale by day, dim at night.
 */
export class Precipitation extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly rain: THREE.LineSegments;
  private readonly snow: THREE.Points;
  private readonly rainUniforms: Record<string, THREE.IUniform>;
  private readonly snowUniforms: Record<string, THREE.IUniform>;
  private readonly splash: THREE.Points;
  private readonly splashUniforms: Record<string, THREE.IUniform>;
  private time = 0;
  /** The sheltered box, zone-local (empty: none), and the world-space corners the shaders read. */
  private readonly shelter: THREE.Box3;
  private readonly shelterMin = new THREE.Vector3(1, 1, 1);
  private readonly shelterMax = new THREE.Vector3(-1, -1, -1);
  private readonly shelterWorld = new THREE.Box3();

  /** `shelter`: a box (zone-local) nothing falls into, the building's sas seen through its open street door. */
  constructor(private readonly dayNight: DayNight, options: { shelter?: THREE.Box3 } = {}) {
    super();
    this.name = 'Precipitation';
    this.shelter = options.shelter?.clone() ?? new THREE.Box3();
    const shelterUniforms = (): Record<string, THREE.IUniform> => ({ shelterMin: { value: this.shelterMin }, shelterMax: { value: this.shelterMax } });
    this.rainUniforms = {
      time: { value: 0 },
      amount: { value: 0 },
      box: { value: BOX },
      velocity: { value: new THREE.Vector3(0, -11, 0) },
      streak: { value: 0.55 },
      color: { value: new THREE.Color(0xbfc8d2) },
      opacity: { value: 0.35 },
      ...shelterUniforms(),
    };
    this.snowUniforms = {
      time: { value: 0 },
      amount: { value: 0 },
      box: { value: BOX },
      velocity: { value: new THREE.Vector3(0, -1.1, 0) },
      size: { value: 60 },
      color: { value: new THREE.Color(0xffffff) },
      opacity: { value: 0.85 },
      ...shelterUniforms(),
    };
    this.rain = new THREE.LineSegments(particles(DROPS, 2, 71), overlay(new THREE.ShaderMaterial({ uniforms: this.rainUniforms, vertexShader: RAIN_VERTEX, fragmentShader: RAIN_FRAGMENT })));
    this.snow = new THREE.Points(particles(FLAKES, 1, 73), overlay(new THREE.ShaderMaterial({ uniforms: this.snowUniforms, vertexShader: SNOW_VERTEX, fragmentShader: SNOW_FRAGMENT })));
    this.splashUniforms = {
      time: { value: 0 },
      amount: { value: 0 },
      box: { value: SPLASH_BOX },
      period: { value: SPLASH_SECONDS },
      size: { value: 16 },
      origin: { value: new THREE.Vector3() },
      roadY: { value: -KERB_HEIGHT },
      color: { value: new THREE.Color(0xd0d8e0) },
      opacity: { value: 0.55 },
      ...shelterUniforms(),
    };
    this.splash = new THREE.Points(particles(SPLASHES, 1, 79), overlay(new THREE.ShaderMaterial({ uniforms: this.splashUniforms, vertexShader: SPLASH_VERTEX, fragmentShader: SPLASH_FRAGMENT })));
    for (const mesh of [this.rain, this.snow, this.splash]) {
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.renderOrder = 3;
      mesh.visible = false;
      this.add(mesh);
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    if (!this.shelter.isEmpty()) {
      const world = this.shelterWorld.copy(this.shelter).applyMatrix4(this.matrixWorld);
      this.shelterMin.copy(world.min);
      this.shelterMax.copy(world.max);
    }
    this.time = (this.time + dt) % 600;
    const light = 0.25 + 0.75 * s.daylight + s.lightning;
    const windX = s.wind * 4.5;
    const rainAmount = s.rain;
    this.rain.visible = rainAmount > 0.02;
    if (this.rain.visible) {
      const u = this.rainUniforms;
      u.time!.value = this.time;
      u.amount!.value = rainAmount;
      (u.velocity!.value as THREE.Vector3).set(windX, -11, windX * 0.3);
      (u.color!.value as THREE.Color).setRGB(0.75, 0.79, 0.84).multiplyScalar(light);
    }
    this.splash.visible = rainAmount > 0.05 && s.snowCover < 0.5;
    if (this.splash.visible) {
      const u = this.splashUniforms;
      u.time!.value = this.time;
      u.amount!.value = rainAmount;
      this.getWorldPosition(u.origin!.value as THREE.Vector3);
      (u.color!.value as THREE.Color).setRGB(0.8, 0.84, 0.88).multiplyScalar(light);
    }
    this.snow.visible = s.snow > 0.02;
    if (this.snow.visible) {
      const u = this.snowUniforms;
      u.time!.value = this.time;
      u.amount!.value = s.snow;
      (u.velocity!.value as THREE.Vector3).set(windX * 0.4, -1.1, windX * 0.15);
      (u.color!.value as THREE.Color).setRGB(1, 1, 1).multiplyScalar(0.4 + 0.6 * light);
    }
  }
}
