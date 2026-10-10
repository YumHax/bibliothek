import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { HAIRS, SHIRTS, SKINS, TROUSERS } from '../props/outdoors/figures';
import { afterChunk, patchShader } from '../materials/shaderPatch';
import { wakefulnessAt } from '@/time/wakefulness';
import { lcg } from '@/random';

/** A walking lane down the street: from x0 to x1 at z (zone-local), and who walks it. */
interface FarLane {
  x0: number;
  x1: number;
  z: number;
}

interface FarWalkersOptions {
  lanes: readonly FarLane[];
  /** How many walk at once at the busiest hour. */
  count: number;
  /** Whose distance decides who is drawn (the camera). */
  viewer: THREE.Object3D;
  /** Drawn only past this distance from the viewer (m), fading in over `fade` (the 3D crowd ends there). */
  near: number;
  fade: number;
}

/** The figures' atlas: looks across, two steps of the walk down; a cell's size in pixels and the figure's height (m). */
const LOOKS = 12;
const CELL = { w: 24, h: 64 };
const HEIGHT = 1.72;
const WIDTH = (HEIGHT * CELL.w) / CELL.h;
/** Walking pace (m/s) and steps a second (the two frames swap at each step). */
const PACE = [1.1, 1.5] as const;
const STEPS = 1.9;

/**
 * The people far down the street, past where the real passers-by are drawn (`StreetCrowd`'s draw distance): flat
 * figures from a small painted atlas (the window view's colours: `figures`), standing up to face the camera, walking
 * along the pavements both ways at their own pace with a two-step gait, fewer at night and in the small hours, faded
 * in only beyond `near` so they never meet a 3D walker. One instanced draw, no shadow, the air's fog on them.
 */
export class FarWalkers extends THREE.InstancedMesh implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  private readonly walkers: { lane: FarLane; at: number; dir: 1 | -1; pace: number; look: number; phase: number; rank: number }[] = [];
  private readonly cells: THREE.InstancedBufferAttribute;
  private readonly uniforms = { farLight: { value: 1 }, farNear: { value: 0 }, farFade: { value: 1 } };
  private readonly eye = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private clock = 0;

  constructor(private readonly dayNight: DayNight, private readonly options: FarWalkersOptions) {
    const geometry = new THREE.PlaneGeometry(WIDTH, HEIGHT).translate(0, HEIGHT / 2, 0);
    const material = new THREE.MeshBasicMaterial({ map: figureAtlas(), alphaTest: 0.5, side: THREE.DoubleSide });
    super(geometry, material, Math.max(options.count, 1));
    this.name = 'FarWalkers';
    this.uniforms.farNear.value = options.near;
    this.uniforms.farFade.value = options.fade;
    this.cells = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(options.count, 1)), 1);
    this.cells.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('farCell', this.cells);
    patchShader(material, 'farWalkers', (shader) => {
      Object.assign(shader.uniforms, this.uniforms);
      // Standing up to face the camera about the vertical (a cylindrical billboard), its cell of the atlas picked.
      shader.vertexShader =
        'attribute float farCell;\nvarying vec2 vFarAt;\n' +
        afterChunk(shader.vertexShader, 'uv_vertex', /* glsl */ `
          #ifdef USE_MAP
            float farLook = mod(farCell, ${LOOKS.toFixed(1)});
            float farStep = floor(farCell / ${LOOKS.toFixed(1)});
            vMapUv = vec2((farLook + uv.x) / ${LOOKS.toFixed(1)}, (farStep + uv.y) / 2.0);
          #endif
        `);
      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        /* glsl */ `
          vec3 farFoot = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          vec3 farToEye = cameraPosition - farFoot;
          vec2 farFace = normalize(farToEye.xz + vec2(1e-4));
          vec3 farRight = vec3(farFace.y, 0.0, -farFace.x);
          vec3 farWorld = farFoot + farRight * transformed.x + vec3(0.0, transformed.y, 0.0);
          vFarAt = farWorld.xz;
          vec4 mvPosition = viewMatrix * vec4(farWorld, 1.0);
          gl_Position = projectionMatrix * mvPosition;
        `,
      );
      shader.fragmentShader =
        'uniform float farLight;\nuniform float farNear;\nuniform float farFade;\nvarying vec2 vFarAt;\n' +
        afterChunk(shader.fragmentShader, 'map_fragment', /* glsl */ `
          diffuseColor.rgb *= farLight;
          // Past the 3D crowd only: dithered in over the fade, no blending (the figures are cut out).
          float farIn = smoothstep(farNear, farNear + farFade, distance(vFarAt, cameraPosition.xz));
          if (farIn < fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453)) discard;
        `);
    });
    const random = lcg(8807);
    for (let i = 0; i < options.count; i++) {
      const lane = options.lanes[i % options.lanes.length]!;
      this.walkers.push({ lane, at: lane.x0 + random() * (lane.x1 - lane.x0), dir: random() < 0.5 ? 1 : -1, pace: PACE[0] + random() * (PACE[1] - PACE[0]), look: Math.floor(random() * LOOKS), phase: random(), rank: random() });
    }
    this.castShadow = false;
    this.receiveShadow = false;
    this.frustumCulled = false;
  }

  update(dt: number): void {
    this.clock += dt;
    const s = this.dayNight.state;
    // Lit by the day, and by the street's lamps a little at night; fewer about in the small hours.
    this.uniforms.farLight.value = 0.3 + 0.7 * s.daylight;
    const about = THREE.MathUtils.clamp(wakefulnessAt(s.hours) * (1 - 0.5 * s.rain), 0, 1);
    this.options.viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    let shown = 0;
    for (const w of this.walkers) {
      w.at += w.dir * w.pace * dt;
      // At the end of their lane they turn into a door or a side street: a new one comes the other way.
      if (w.at > w.lane.x1 || w.at < w.lane.x0) {
        w.dir = w.dir > 0 ? -1 : 1;
        w.at = THREE.MathUtils.clamp(w.at, w.lane.x0, w.lane.x1);
        w.look = (w.look + 5) % LOOKS;
      }
      if (w.rank > about) continue;
      // The 3D crowd's ground: never drawn near the viewer at all (the shader fades the rest in).
      if (Math.hypot(w.at - this.eye.x, w.lane.z - this.eye.z) < this.options.near - 1) continue;
      this.setMatrixAt(shown, this.m.makeTranslation(w.at, 0, w.lane.z));
      const step = Math.floor((this.clock + w.phase) * STEPS) % 2;
      this.cells.setX(shown, w.look + step * LOOKS);
      shown++;
    }
    this.count = shown;
    this.instanceMatrix.needsUpdate = true;
    this.cells.needsUpdate = true;
  }
}

/** The figures, painted once: `LOOKS` people (shirt, trousers, skin, hair from the window view's palettes), each in two steps of a walk. */
function figureAtlas(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(CELL.w * LOOKS, CELL.h * 2);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const random = lcg(4409);
  const px = CELL.h / HEIGHT;
  for (let look = 0; look < LOOKS; look++) {
    const shirt = SHIRTS[Math.floor(random() * SHIRTS.length)]!;
    const trousers = TROUSERS[Math.floor(random() * TROUSERS.length)]!;
    const skin = SKINS[Math.floor(random() * SKINS.length)]!;
    const hair = HAIRS[Math.floor(random() * HAIRS.length)]!;
    const broad = 0.38 + random() * 0.1;
    for (let step = 0; step < 2; step++) {
      // Row 0 of the texture is the bottom (flipY): step 0 drawn in the lower half.
      const top = (1 - step) * CELL.h;
      const cx = look * CELL.w + CELL.w / 2;
      const y = (m: number): number => top + CELL.h - m * px;
      const box = (x: number, y0: number, w: number, h: number, fill: string): void => {
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.roundRect(cx + x * px - (w * px) / 2, y(y0 + h), w * px, h * px, Math.min(w, h) * px * 0.3);
        ctx.fill();
      };
      // Legs: apart on the first step, together on the second.
      const spread = step === 0 ? 0.09 : 0.03;
      box(-spread, 0, 0.12, 0.84, trousers);
      box(spread, 0, 0.12, 0.84, trousers);
      box(0, 0.8, broad, 0.62, shirt);
      box(-broad / 2 - 0.04, 0.88, 0.08, 0.5, shirt);
      box(broad / 2 + 0.04, 0.88, 0.08, 0.5, shirt);
      box(0, 1.44, 0.2, 0.24, skin);
      box(0, 1.58, 0.22, 0.12, hair);
    }
  }
  return toTexture(canvas, 'facing');
}
