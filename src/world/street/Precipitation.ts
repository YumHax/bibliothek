import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { seededRandom } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';

/** The box of air around the eye the drops and flakes fill (metres), and how many there can be at most. */
const BOX = new THREE.Vector3(34, 16, 34);
const DROPS = 7000;
const FLAKES = 5000;

/*
 * Both shaders place every particle in world space from its seed and the time, wrapped into the
 * box centred on the camera, so the rain stands still while the player walks through it and no
 * vertex is ever touched on the CPU. A particle whose threshold is above the current amount is
 * thrown out of the clip volume. No backtick in these strings.
 */
const RAIN_VERTEX = /* glsl */ `
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
  if (extra.y > amount) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
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
  if (extra.y > amount) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
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
 * drifting down. Everything moves in the vertex shader; the meshes are hidden (no draw call)
 * while nothing falls. Coloured by the light: pale by day, dim at night.
 */
export class Precipitation extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly rain: THREE.LineSegments;
  private readonly snow: THREE.Points;
  private readonly rainUniforms: Record<string, THREE.IUniform>;
  private readonly snowUniforms: Record<string, THREE.IUniform>;
  private time = 0;

  constructor(private readonly dayNight: DayNight) {
    super();
    this.name = 'Precipitation';
    this.rainUniforms = {
      time: { value: 0 },
      amount: { value: 0 },
      box: { value: BOX },
      velocity: { value: new THREE.Vector3(0, -11, 0) },
      streak: { value: 0.55 },
      color: { value: new THREE.Color(0xbfc8d2) },
      opacity: { value: 0.35 },
    };
    this.snowUniforms = {
      time: { value: 0 },
      amount: { value: 0 },
      box: { value: BOX },
      velocity: { value: new THREE.Vector3(0, -1.1, 0) },
      size: { value: 60 },
      color: { value: new THREE.Color(0xffffff) },
      opacity: { value: 0.85 },
    };
    this.rain = new THREE.LineSegments(particles(DROPS, 2, 71), overlay(new THREE.ShaderMaterial({ uniforms: this.rainUniforms, vertexShader: RAIN_VERTEX, fragmentShader: RAIN_FRAGMENT })));
    this.snow = new THREE.Points(particles(FLAKES, 1, 73), overlay(new THREE.ShaderMaterial({ uniforms: this.snowUniforms, vertexShader: SNOW_VERTEX, fragmentShader: SNOW_FRAGMENT })));
    for (const mesh of [this.rain, this.snow]) {
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
