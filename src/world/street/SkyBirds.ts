import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { currentSeason } from '@/time/season';
import { afterChunk, patchShader } from '../materials/shaderPatch';
import { damp } from '@/math/damp';

/**
 * Where the birds fly (zone-local): the swifts' screaming parties round three points over Front Street and the
 * park's corner, 22 to 40 m up; the starlings' murmuration far over the park.
 */
const SWIFT_CENTRES: readonly [number, number, number][] = [[-12, 30, 2], [26, 36, -4], [62, 26, 3]];
const SWIFTS = 30;
const MURMURATION = { centre: [-120, 55, 30] as [number, number, number], count: 220 };

/**
 * Birds in the sky over the street: in summer the swifts, dark sickles racing round in screaming parties above the
 * rooftops by day, most at dusk; in autumn and winter at dusk a murmuration of starlings over the park, a cloud of
 * specks folding on itself. One instanced draw each (a bird is two triangles, wings flapping or held for a glide),
 * every bird placed in the vertex shader from its number and the time; none at night, in rain or fog. Not lit: a
 * dark silhouette against the sky, fogged with the distance.
 */
export class SkyBirds extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly time = { value: 0 };
  private readonly swifts: THREE.InstancedMesh | null;
  private readonly starlings: THREE.InstancedMesh | null;
  private readonly season = currentSeason().name;
  private shown = 0;

  constructor(private readonly dayNight: DayNight) {
    super();
    this.name = 'SkyBirds';
    this.swifts = this.season === 'summer' ? this.flock('swifts', SWIFTS * SWIFT_CENTRES.length, swiftGlsl(), 0.42, 0x1c1c20) : null;
    this.starlings = this.season === 'autumn' || this.season === 'winter' ? this.flock('starlings', MURMURATION.count, murmurationGlsl(), 0.38, 0x202024) : null;
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    this.time.value = (this.time.value + dt) % 3000;
    const s = this.dayNight.state;
    const clear = 1 - Math.max(s.rain, s.snow, s.fog);
    // Swifts by day, thickest towards dusk; starlings only in the half hour round sunset.
    const dusk = 1 - THREE.MathUtils.smoothstep(Math.abs(s.sunHeight - 0.04), 0.03, 0.14);
    const want = this.swifts ? clear * THREE.MathUtils.smoothstep(s.daylight, 0.15, 0.4) : this.starlings ? clear * dusk * (s.hours > 12 ? 1 : 0) : 0;
    this.shown = damp(this.shown, want, 0.5, dt);
    const mesh = this.swifts ?? this.starlings;
    if (!mesh) return;
    mesh.visible = this.shown > 0.02;
    mesh.count = Math.round((mesh.geometry.userData.count as number) * Math.min(1, this.shown * 1.2));
  }

  private flock(name: string, count: number, place: string, span: number, color: number): THREE.InstancedMesh {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, fog: true });
    patchShader(material, `skyBirds:${name}`, (shader) => {
      shader.uniforms.birdTime = this.time;
      shader.vertexShader = 'uniform float birdTime;\n' + place + afterChunk(shader.vertexShader, 'begin_vertex', /* glsl */ `
        {
          float id = float(gl_InstanceID);
          vec3 at;
          vec3 heading;
          float flap;
          birdPlace(id, birdTime, at, heading, flap);
          // The bird's frame: its heading, level wings across it.
          vec3 fwd = normalize(heading + vec3(1e-4, 0.0, 0.0));
          vec3 side = normalize(cross(vec3(0.0, 1.0, 0.0), fwd) + vec3(0.0, 0.0, 1e-4));
          vec3 up = cross(fwd, side);
          // position.x across the wing (0 at the body), y the wingtip's lift, z along the body.
          float tip = abs(position.x);
          vec3 p = side * position.x * ${span.toFixed(2)} + fwd * position.z * ${span.toFixed(2)} + up * (tip * flap * ${(span * 0.6).toFixed(2)});
          transformed = at + p;
        }
      `);
    });
    const mesh = new THREE.InstancedMesh(birdGeometry(), material, count);
    mesh.geometry.userData.count = count;
    mesh.name = name;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.visible = false;
    this.add(mesh);
    return mesh;
  }
}

/** A bird: two swept wings meeting at the body (x across, z along), the wingtips' lift added in the shader. */
function birdGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    // Left wing: root front, root back, tip (swept back).
    0, 0, 0.18, 0, 0, -0.12, -0.5, 0, -0.22,
    // Right wing.
    0, 0, 0.18, 0.5, 0, -0.22, 0, 0, -0.12,
  ], 3));
  return g;
}

/** The swifts: three parties, each bird on its own loop round its party's centre, fast, banking, flickering wings then gliding. */
function swiftGlsl(): string {
  const centres = SWIFT_CENTRES.map(([x, y, z]) => `vec3(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)})`).join(', ');
  return /* glsl */ `
void birdPlace(float id, float t, out vec3 at, out vec3 heading, out float flap) {
  vec3 centres[${SWIFT_CENTRES.length}] = vec3[](${centres});
  int party = int(mod(id, ${SWIFT_CENTRES.length.toFixed(1)}));
  vec3 c = centres[0];
  for (int i = 0; i < ${SWIFT_CENTRES.length}; i++) if (i == party) c = centres[i];
  float h1 = fract(sin(id * 12.9898) * 43758.5453);
  float h2 = fract(sin(id * 78.233) * 12345.678);
  float speed = 0.35 + 0.25 * h1;
  float a = t * speed + h2 * 6.2832;
  float r = 9.0 + 14.0 * h1;
  vec3 p = vec3(cos(a) * r, sin(a * 2.0 + h1 * 3.0) * 3.5, sin(a) * r * (0.6 + 0.3 * h2));
  // The party drifts about its centre, now stringing out, now bunching.
  p += vec3(sin(t * 0.07 + h2 * 5.0) * 10.0, 0.0, cos(t * 0.05 + h1 * 4.0) * 6.0);
  at = c + p;
  heading = vec3(-sin(a) * r, cos(a * 2.0 + h1 * 3.0) * 7.0, cos(a) * r * (0.6 + 0.3 * h2));
  float burst = step(0.45, fract(t * 0.4 + h1));
  flap = mix(0.15, sin(t * 22.0 + id) , burst);
}
`;
}

/** The starlings' murmuration: specks on a slowly folding cloud over the park, a few beats a second each. */
function murmurationGlsl(): string {
  const [x, y, z] = MURMURATION.centre;
  return /* glsl */ `
void birdPlace(float id, float t, out vec3 at, out vec3 heading, out float flap) {
  float h1 = fract(sin(id * 12.9898) * 43758.5453);
  float h2 = fract(sin(id * 78.233) * 12345.678);
  float h3 = fract(sin(id * 39.425) * 24634.633);
  // A point in a ball, the ball squeezed and swung round as the flock folds.
  vec3 q = (vec3(h1, h2, h3) - 0.5) * 2.0;
  float fold = sin(t * 0.21) * 0.8;
  vec3 shape = vec3(q.x * (22.0 + 10.0 * sin(t * 0.13)), q.y * (7.0 + 5.0 * cos(t * 0.17 + q.x * fold)), q.z * (14.0 + 8.0 * sin(t * 0.11 + 1.0)));
  float spin = t * 0.09;
  shape.xz = mat2(cos(spin), -sin(spin), sin(spin), cos(spin)) * shape.xz;
  vec3 drift = vec3(sin(t * 0.05) * 30.0, sin(t * 0.08) * 6.0, cos(t * 0.04) * 20.0);
  at = vec3(${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) + drift + shape;
  heading = vec3(cos(spin), 0.1 * sin(t + id), -sin(spin));
  flap = sin(t * 14.0 + id * 3.1);
}
`;
}
