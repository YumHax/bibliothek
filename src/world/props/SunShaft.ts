import * as THREE from 'three';

export interface SunShaftOptions {
  /** Glazed opening, metres (the shaft's section at the glass). */
  width: number;
  height: number;
  /** Mullion grid of the window, so the beam carries its bars. */
  columns: number;
  rows: number;
  /** Local y of the floor (the window's origin is the centre of the glass). */
  floorY: number;
}

/** Longest beam: a low sun would otherwise throw a shaft across the whole flat. */
const MAX_LENGTH = 4.5;
/** Brightness of the beam per unit of sun intensity (additive, linear light). */
const BEAM_STRENGTH = 0.022;
const MOTES = 180;
const MOTE_STRENGTH = 0.9;

/** Adds colour without touching the alpha: a beam across a playing video lights it instead of blacking it out. */
function additive(material: THREE.ShaderMaterial): THREE.ShaderMaterial {
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.SrcAlphaFactor;
  material.blendDst = THREE.OneFactor;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneFactor;
  return material;
}

/**
 * The sunbeam through a window: the glazed opening swept along the sun's rays down to the floor,
 * drawn as a faint additive volume (its far side, so it still shows from inside the beam),
 * striped by the mullions (each fragment is traced back along the ray to the glass and tested
 * against the grid), brightest near the glass and shimmering slowly; and the dust floating in it,
 * points drifting on slow noise that only show in the light. Window-local: +z into the room.
 * `setSun` takes the direction towards the sun in the window's frame (as `RoomWindow` computes it).
 */
export class SunShaft extends THREE.Group {
  private readonly beam: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly motes: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly uniforms: {
    time: THREE.IUniform<number>;
    rayDir: THREE.IUniform<THREE.Vector3>;
    color: THREE.IUniform<THREE.Color>;
    strength: THREE.IUniform<number>;
    beamLength: THREE.IUniform<number>;
    opening: THREE.IUniform<THREE.Vector4>;
    eye: THREE.IUniform<THREE.Vector3>;
  };

  constructor(private readonly options: SunShaftOptions) {
    super();
    this.name = 'SunShaft';
    const { width, height, columns, rows } = options;
    this.uniforms = {
      time: { value: 0 },
      rayDir: { value: new THREE.Vector3(0, -0.5, 1).normalize() },
      color: { value: new THREE.Color(0xffffff) },
      strength: { value: 0 },
      beamLength: { value: 1 },
      opening: { value: new THREE.Vector4(width, height, columns, rows) },
      eye: { value: new THREE.Vector3() },
    };

    const beamGeometry = new THREE.BufferGeometry();
    beamGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
    // Two quads (at the glass, at the far end) joined by four sides: a skewed box, wound inwards so
    // the faces drawn are the far side of the volume (what the eye looks through the beam to).
    beamGeometry.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
    this.beam = new THREE.Mesh(
      beamGeometry,
      additive(
        new THREE.ShaderMaterial({
          uniforms: this.uniforms,
          vertexShader: BEAM_VERTEX,
          fragmentShader: BEAM_FRAGMENT,
        }),
      ),
    );
    this.beam.frustumCulled = false;
    this.beam.renderOrder = 2;
    // The camera in the window's frame, for the march (cheaper here than a matrix inverse per fragment).
    this.beam.onBeforeRender = (_renderer, _scene, camera) => {
      this.uniforms.eye.value.setFromMatrixPosition(camera.matrixWorld);
      this.worldToLocal(this.uniforms.eye.value);
    };

    // Dust: fixed seeds in the unit prism (u, v across the opening, t along the beam), placed by the shader.
    const seeds = new Float32Array(MOTES * 3);
    const phases = new Float32Array(MOTES);
    for (let i = 0; i < MOTES; i++) {
      seeds[i * 3] = Math.random() - 0.5;
      seeds[i * 3 + 1] = Math.random() - 0.5;
      seeds[i * 3 + 2] = Math.pow(Math.random(), 1.4);
      phases[i] = Math.random() * 100;
    }
    const moteGeometry = new THREE.BufferGeometry();
    moteGeometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
    moteGeometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    this.motes = new THREE.Points(
      moteGeometry,
      additive(
        new THREE.ShaderMaterial({
          uniforms: { ...this.uniforms, moteStrength: { value: MOTE_STRENGTH }, pixelRatio: { value: Math.min(window.devicePixelRatio, 1.5) } },
          vertexShader: MOTE_VERTEX,
          fragmentShader: MOTE_FRAGMENT,
        }),
      ),
    );
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 2;

    for (const object of [this.beam, this.motes]) {
      object.castShadow = false;
      object.receiveShadow = false;
    }
    this.add(this.beam, this.motes);
    this.visible = false;
  }

  /**
   * The sun, as `RoomWindow` sees it: `towardSun` (window frame, unit), its colour and the
   * intensity of the spot it throws (0 hides the shaft).
   */
  setSun(towardSun: THREE.Vector3, color: THREE.Color, intensity: number): void {
    const inward = this.uniforms.rayDir.value.copy(towardSun).negate();
    // Only a sun in front of the wall and above the horizon throws a beam into the room.
    this.visible = intensity > 0 && inward.z > 0.05 && inward.y < -0.02;
    if (!this.visible) return;
    this.uniforms.color.value.copy(color);
    this.uniforms.strength.value = intensity * BEAM_STRENGTH;
    const { width: w, height: h, floorY } = this.options;
    // Until the rays from the top of the glass reach the floor (the far edge of the sun patch), no
    // longer than MAX_LENGTH; the part of the volume that dips under the floor is hidden by it.
    const length = Math.min(MAX_LENGTH, Math.max(0.5, (floorY - h / 2) / inward.y));
    this.uniforms.beamLength.value = length;
    const position = this.beam.geometry.getAttribute('position') as THREE.BufferAttribute;
    const corners: [number, number][] = [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ];
    corners.forEach(([x, y], i) => {
      position.setXYZ(i, x, y, 0.01);
      position.setXYZ(i + 4, x + inward.x * length, y + inward.y * length, 0.01 + inward.z * length);
    });
    position.needsUpdate = true;
  }

  update(dt: number): void {
    if (this.visible) this.uniforms.time.value += dt;
  }
}

/** Window-local position of the fragment, for the shader to trace it back to the glass. */
const BEAM_VERTEX = /* glsl */ `
varying vec3 vLocal;
void main() {
  vLocal = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

/**
 * The beam is shaded by what reaches the eye through it, approximated per fragment of its back
 * face: the ray from the camera to the fragment is sampled at a few points inside the volume,
 * each traced back to the glass along the sun's direction to see if a mullion shades it, and
 * weighted by how far along the beam it is (fading out towards the floor) and a slow noise (the
 * air moving). Far side only, so the camera may stand inside the beam.
 */
const BEAM_FRAGMENT = /* glsl */ `
uniform float time;
uniform vec3 rayDir;
uniform vec3 color;
uniform float strength;
uniform float beamLength;
uniform vec4 opening;
uniform vec3 eye;
varying vec3 vLocal;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

/** 1 in the sun at window-local point p, 0 behind a mullion or outside the opening. */
float lit(vec3 p) {
  float t = p.z / rayDir.z;
  vec2 onGlass = p.xy - rayDir.xy * t;
  vec2 uv = onGlass / opening.xy + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0 || t < 0.0 || t > beamLength) return 0.0;
  vec2 cell = fract(uv * opening.zw);
  vec2 bar = 0.028 / opening.xy * opening.zw;
  float mullion = step(bar.x * 0.5, cell.x) * step(cell.x, 1.0 - bar.x * 0.5) * step(bar.y * 0.5, cell.y) * step(cell.y, 1.0 - bar.y * 0.5);
  float fade = (1.0 - smoothstep(0.35, 1.0, t / beamLength)) * smoothstep(0.0, 0.25, t);
  return mullion * fade;
}

void main() {
  vec3 toFrag = vLocal - eye;
  float total = length(toFrag);
  vec3 dir = toFrag / total;
  // March from the eye (or the near side of the volume) to this far face.
  float start = max(0.0, total - beamLength * 2.0);
  float light = 0.0;
  const int STEPS = 10;
  float jitter = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  for (int i = 0; i < STEPS; i++) {
    float s = mix(start, total, (float(i) + jitter) / float(STEPS));
    vec3 p = eye + dir * s;
    light += lit(p) * (0.65 + 0.7 * noise(p * 2.2 + vec3(0.0, time * 0.05, time * 0.03)));
  }
  float path = (total - start) / float(STEPS);
  gl_FragColor = vec4(color * light * path * strength, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const MOTE_VERTEX = /* glsl */ `
uniform float time;
uniform vec3 rayDir;
uniform float beamLength;
uniform vec4 opening;
uniform float pixelRatio;
attribute float phase;
varying float vFade;
void main() {
  // Seeded point in the beam: across the opening, then along the rays; drifting on slow sines.
  float t = position.z * beamLength;
  vec3 p = vec3(position.xy * opening.xy, 0.0) + rayDir * t;
  p += vec3(sin(time * 0.13 + phase), sin(time * 0.09 + phase * 1.7) - 0.3 * fract(time * 0.004 + phase), cos(time * 0.11 + phase * 0.6)) * 0.12;
  vFade = (1.0 - smoothstep(0.5, 1.0, position.z)) * (0.4 + 0.6 * abs(sin(time * 0.7 + phase * 3.1)));
  vec4 view = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * view;
  gl_PointSize = clamp(2.2 * pixelRatio * (1.5 / -view.z), 1.0, 4.0);
}
`;

const MOTE_FRAGMENT = /* glsl */ `
uniform vec3 color;
uniform float strength;
uniform float moteStrength;
varying float vFade;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = (1.0 - smoothstep(0.1, 0.5, d)) * vFade;
  gl_FragColor = vec4(color * strength * moteStrength * 12.0, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
