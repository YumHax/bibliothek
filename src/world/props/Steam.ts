import * as THREE from 'three';

export interface SteamOptions {
  /** Puffs alive at once at full rate. Default 24. */
  count?: number;
  /** Seconds a puff lives. Default 1.8. */
  life?: number;
  /** How fast a puff rises (m/s). Default 0.2. */
  rise?: number;
  /** Diameter of a puff when it is born and when it fades (m). Default 0.025 -> 0.12. */
  startSize?: number;
  endSize?: number;
  /** Opacity of a fresh puff. Default 0.28. */
  opacity?: number;
}

/**
 * A plume of steam: soft round puffs (one `Points` draw call) born at the origin, rising along
 * +y, drifting and swelling as they fade. `rate` (0..1) is how hard it is steaming; at 0 the last
 * puffs rise away and the plume hides itself. The puffs blend over the scene without touching the
 * canvas alpha (the video cut-out; see docs/graphics.md). Unlit: a pale, faint grey that reads
 * as steam by day and does not glow at night. The owner calls `update(dt)`.
 */
export class Steam extends THREE.Points {
  /** 0 none .. 1 a full plume. */
  rate = 0;
  private readonly ages: Float32Array;
  private readonly drift: Float32Array;
  private readonly positions: THREE.BufferAttribute;
  private readonly lives: THREE.BufferAttribute;
  private readonly settings: Required<SteamOptions>;
  private readonly uniforms: { viewScale: { value: number }; startSize: { value: number }; endSize: { value: number }; opacity: { value: number } };
  private untilNext = 0;
  private next = 0;

  constructor(options: SteamOptions = {}) {
    const settings: Required<SteamOptions> = { count: 24, life: 1.8, rise: 0.2, startSize: 0.025, endSize: 0.12, opacity: 0.28, ...options };
    const geometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array(settings.count * 3), 3);
    const lives = new THREE.BufferAttribute(new Float32Array(settings.count).fill(-1), 1);
    positions.setUsage(THREE.DynamicDrawUsage);
    lives.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positions);
    geometry.setAttribute('life', lives);
    const uniforms = { viewScale: { value: 800 }, startSize: { value: settings.startSize }, endSize: { value: settings.endSize }, opacity: { value: settings.opacity } };
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false });
    // Over the colour, never over the alpha.
    material.blending = THREE.CustomBlending;
    material.blendEquation = THREE.AddEquation;
    material.blendSrc = THREE.SrcAlphaFactor;
    material.blendDst = THREE.OneMinusSrcAlphaFactor;
    material.blendSrcAlpha = THREE.ZeroFactor;
    material.blendDstAlpha = THREE.OneFactor;
    super(geometry, material);
    this.name = 'Steam';
    this.settings = settings;
    this.uniforms = uniforms;
    this.positions = positions;
    this.lives = lives;
    this.ages = new Float32Array(settings.count).fill(-1);
    this.drift = new Float32Array(settings.count * 2);
    this.frustumCulled = false;
    this.castShadow = false;
    this.receiveShadow = false;
    this.renderOrder = 2;
    this.visible = false;
    // Puff sizes are in metres: the shader needs the pixels one metre spans at one metre away.
    this.onBeforeRender = (renderer, _scene, camera) => {
      const perspective = camera as THREE.PerspectiveCamera;
      if (!perspective.isPerspectiveCamera) return;
      const height = renderer.getDrawingBufferSize(SIZE).y;
      this.uniforms.viewScale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(perspective.fov) / 2));
    };
  }

  update(dt: number): void {
    const { count, life, rise } = this.settings;
    let alive = 0;
    for (let i = 0; i < count; i++) {
      const before = this.ages[i]!;
      if (before < 0) continue;
      const age = before + dt / life;
      if (age >= 1) {
        this.ages[i] = -1;
        this.lives.setX(i, -1);
        continue;
      }
      this.ages[i] = age;
      alive++;
      // Rises, slowing as it cools, and wanders sideways.
      const up = rise * dt * (1.2 - 0.6 * age);
      this.positions.setXYZ(i, this.positions.getX(i) + this.drift[i * 2]! * dt, this.positions.getY(i) + up, this.positions.getZ(i) + this.drift[i * 2 + 1]! * dt);
      this.lives.setX(i, age);
    }
    if (this.rate > 0) {
      this.untilNext -= dt;
      const every = life / count / this.rate;
      while (this.untilNext <= 0) {
        this.untilNext += every;
        this.spawn();
        alive++;
      }
    }
    this.visible = alive > 0;
    this.positions.needsUpdate = true;
    this.lives.needsUpdate = true;
  }

  private spawn(): void {
    const i = this.next;
    this.next = (this.next + 1) % this.settings.count;
    this.ages[i] = 0;
    this.positions.setXYZ(i, (Math.random() - 0.5) * 0.01, 0, (Math.random() - 0.5) * 0.01);
    this.drift[i * 2] = (Math.random() - 0.5) * 0.06;
    this.drift[i * 2 + 1] = (Math.random() - 0.5) * 0.06;
    this.lives.setX(i, 0);
  }
}

const SIZE = new THREE.Vector2();

const VERTEX = /* glsl */ `
uniform float viewScale;
uniform float startSize;
uniform float endSize;
attribute float life;
varying float vLife;
void main() {
  vLife = life;
  vec4 view = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * view;
  float size = mix(startSize, endSize, sqrt(max(life, 0.0)));
  gl_PointSize = life < 0.0 ? 0.0 : clamp(size * viewScale / -view.z, 1.0, 256.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float opacity;
varying float vLife;
void main() {
  if (vLife < 0.0) discard;
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float soft = 1.0 - smoothstep(0.2, 1.0, d);
  // Fades in over its first tenth, out over the rest.
  float fade = smoothstep(0.0, 0.1, vLife) * (1.0 - vLife);
  gl_FragColor = vec4(vec3(0.82, 0.84, 0.86), soft * fade * opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
