import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import type { Updatable } from '@/core/Engine';
import { createCanvas, seededRandom } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../../Furniture';
import type { DayNight, SkyState } from '../../props/DayNight';
import type { PaintedFront } from '../Buildings';
import { isShopOpen } from '../shops/shopHours';
import { nightnessOf } from '../streetAir';
import { FRONT, KERB_HEIGHT, PARK_STREET, STREET_PLAN, type ShopKind, type Vec2 } from '../streetPlan';
import { FacadeFrame } from './facadeFrame';
import { groundHeight } from './ground';

export interface WetGroundOptions {
  fronts: readonly PaintedFront[];
  /** The lamp heads (zone-local) and their colour: what the lamps reflect from. */
  lamps: readonly THREE.Vector3[];
  /** The camera: the streaks run towards it. */
  viewer: THREE.Object3D;
  /** A real reflection of the street in the puddles on the road (a second render while wet; `QUALITY.reflections`). */
  mirror: boolean;
}

/** Streaks are not drawn for lights further than this from the eye; they are at most this long. */
const STREAK_RANGE = 55;
const STREAK_MAX = 11;
/** The eye's height, for where along the ground a light's reflection sits. */
const EYE = 1.7;
const LAMP_COLOR = new THREE.Color(0xffd7a0);
const WEATHER_EVERY = 0.5;
/** The stretch of road the mirror covers (the walkable part of Front Street), zone-local. */
const MIRROR = { x0: PARK_STREET.farKerb, x1: 40, z0: FRONT.nearKerb, z1: FRONT.farKerb };
const MIRROR_TEXTURE = 512;

type Source = { kind: 'lamp' | 'neon' | 'shop'; top: THREE.Vector3; foot: THREE.Vector3; color: THREE.Color; width: number; shop?: ShopKind };

interface Puddle {
  at: Vec2;
  y: number;
  sx: number;
  sz: number;
  yaw: number;
}

/**
 * The street after rain. The lights stand in the wet ground as long soft streaks running from each
 * one's foot towards the eye (the street lamps, the neon over the arcade and RÉTRO JEUX, the lit
 * shop windows): camera-facing quads laid flat, additive with the canvas alpha kept, as bright as
 * the ground is wet and the night dark. Puddles lie in the gutters, along the kerbs and on the
 * pavements' low spots: dark glossy decals that grow as the ground soaks and shrink as it dries,
 * gone under snow. With `mirror` (high quality), the puddles on Front Street's road also show the
 * street itself upside down: a `Reflector` over the road masked by them, hidden (costing nothing)
 * while the road is dry.
 */
export class WetGround extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly sources: Source[] = [];
  private readonly streaks: THREE.InstancedMesh;
  private readonly puddles: THREE.InstancedMesh;
  private readonly puddleSpots: Puddle[];
  private readonly puddleMaterial: THREE.MeshStandardMaterial;
  private readonly mirror: Reflector | null;
  private readonly mirrorStrength: { value: number } = { value: 0 };
  private readonly eye = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly stretch = new THREE.Vector3();
  private readonly spot = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private weatherClock = WEATHER_EVERY;
  private wet = 0;
  private hours = 12;

  constructor(private readonly dayNight: DayNight, private readonly options: WetGroundOptions) {
    super();
    this.name = 'WetGround';
    for (const top of options.lamps) this.sources.push({ kind: 'lamp', top, foot: new THREE.Vector3(top.x, groundHeight(top.x, top.z), top.z), color: LAMP_COLOR, width: 0.55 });
    for (const sign of STREET_PLAN.signs) {
      const [x, y, z] = sign.at;
      // The sign hangs on the wall; its light falls on the pavement just in front.
      const fx = x + Math.sin(sign.yaw) * 0.6;
      const fz = z + Math.cos(sign.yaw) * 0.6;
      this.sources.push({ kind: 'neon', top: new THREE.Vector3(x, y, z), foot: new THREE.Vector3(fx, groundHeight(fx, fz), fz), color: new THREE.Color(sign.color), width: sign.width * 0.5 });
    }
    for (const front of options.fronts) {
      if (front.spec.detail < 20) continue;
      const frame = new FacadeFrame(front.spec);
      for (const shop of front.features.shopfronts) {
        const mid = (shop.s0 + shop.s1) / 2;
        const foot = frame.point(mid, 0, 0.3);
        foot.y = groundHeight(foot.x, foot.z);
        this.sources.push({ kind: 'shop', top: frame.point(mid, 1.8, 0), foot, color: new THREE.Color(shop.light), width: (shop.s1 - shop.s0) * 0.45, shop: shop.kind });
      }
    }

    const streakMaterial = new THREE.MeshBasicMaterial({
      map: streakTexture(),
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      blendDstAlpha: THREE.OneFactor,
      fog: true,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    // A flat quad from its foot (z = 0) out to z = 1, x across: turned towards the eye and stretched every frame.
    const streak = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    this.streaks = new THREE.InstancedMesh(streak, streakMaterial, Math.max(1, this.sources.length));
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 2;
    this.streaks.castShadow = false;
    this.streaks.visible = false;
    for (let i = 0; i < this.sources.length; i++) this.streaks.setColorAt(i, new THREE.Color(0, 0, 0));
    this.add(this.streaks);

    this.puddleSpots = puddleSpots();
    this.puddleMaterial = new THREE.MeshStandardMaterial({
      color: 0x101316,
      roughness: 0.05,
      metalness: 0.1,
      alphaMap: blobTexture(),
      transparent: true,
      depthWrite: false,
      opacity: 0,
      envMapIntensity: 1.4,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.puddles = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.puddleMaterial, this.puddleSpots.length);
    this.puddles.receiveShadow = true;
    this.puddles.castShadow = false;
    this.puddles.renderOrder = 1;
    this.puddles.visible = false;
    this.add(this.puddles);
    this.layPuddles(1);
    this.puddles.computeBoundingSphere();

    this.mirror = options.mirror ? this.buildMirror() : null;
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    this.weatherClock += dt;
    if (this.weatherClock >= WEATHER_EVERY) {
      this.weatherClock = 0;
      this.hours = s.hours;
      const wet = s.wetness * (1 - s.snowCover);
      if (Math.abs(wet - this.wet) > 0.01 || (wet === 0) !== (this.wet === 0)) {
        this.wet = wet;
        const grow = THREE.MathUtils.smoothstep(wet, 0.15, 0.75);
        this.puddles.visible = grow > 0.01;
        this.puddleMaterial.opacity = 0.85 * grow;
        if (this.puddles.visible) this.layPuddles(0.35 + 0.65 * grow);
        if (this.mirror) {
          this.mirrorStrength.value = 0.55 * THREE.MathUtils.smoothstep(wet, 0.25, 0.85);
          this.mirror.visible = this.mirrorStrength.value > 0.02;
        }
      }
    }
    this.layStreaks(s);
  }

  /** Every light near enough: a streak from its foot towards the eye, centred on where its mirror image lies. */
  private layStreaks(s: SkyState): void {
    const night = THREE.MathUtils.smoothstep(nightnessOf(s), 0.15, 0.6);
    const strength = this.wet * (0.25 + 0.75 * night);
    this.streaks.visible = strength > 0.02;
    if (!this.streaks.visible) return;
    this.options.viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    const lampNight = THREE.MathUtils.smoothstep(nightnessOf(s), 0.25, 0.6);
    this.sources.forEach((src, i) => {
      this.dir.set(this.eye.x - src.foot.x, 0, this.eye.z - src.foot.z);
      const distance = this.dir.length();
      let level = 0;
      if (distance < STREAK_RANGE && distance > 0.5) {
        level = src.kind === 'lamp' ? 1.1 * lampNight : src.kind === 'neon' ? 0.9 * (0.3 + 0.7 * night) : src.shop && isShopOpen(src.shop, this.hours) ? 0.6 * night : 0;
      }
      if (level <= 0) {
        this.m.makeScale(0, 0, 0);
        this.streaks.setMatrixAt(i, this.m);
        return;
      }
      this.dir.divideScalar(distance);
      // The mirror point: where the eye sees the light reflected, a share of the way from the foot.
      const height = Math.max(0.3, src.top.y - src.foot.y);
      const mirror = (distance * height) / (height + EYE);
      const length = Math.min(STREAK_MAX, distance * 0.9, 1.4 * mirror + 1.5);
      const start = Math.max(0, mirror - length * 0.55);
      this.spot.copy(src.foot).addScaledVector(this.dir, start);
      this.spot.y += 0.008;
      this.q.setFromAxisAngle(this.yAxis, Math.atan2(this.dir.x, this.dir.z));
      this.stretch.set(src.width * (1 + distance * 0.015), 1, length);
      this.m.compose(this.spot, this.q, this.stretch);
      this.streaks.setMatrixAt(i, this.m);
      this.streaks.setColorAt(i, this.color.copy(src.color).multiplyScalar(level * strength));
    });
    this.streaks.instanceMatrix.needsUpdate = true;
    if (this.streaks.instanceColor) this.streaks.instanceColor.needsUpdate = true;
  }

  /** The puddles at `grow` of their full size. */
  private layPuddles(grow: number): void {
    this.puddleSpots.forEach((p, i) => {
      this.spot.set(p.at[0], p.y, p.at[1]);
      this.q.setFromAxisAngle(this.yAxis, p.yaw);
      this.stretch.set(p.sx * grow, 1, p.sz * grow);
      this.m.compose(this.spot, this.q, this.stretch);
      this.puddles.setMatrixAt(i, this.m);
    });
    this.puddles.instanceMatrix.needsUpdate = true;
  }

  /** The road's mirror: a `Reflector` over the walkable stretch of Front Street, shown only through the puddles' mask. */
  private buildMirror(): Reflector {
    const { x0, x1, z0, z1 } = MIRROR;
    const mask = puddleMask(this.puddleSpots);
    const mirror = new Reflector(new THREE.PlaneGeometry(x1 - x0, z1 - z0), {
      textureWidth: MIRROR_TEXTURE,
      textureHeight: MIRROR_TEXTURE / 2,
      clipBias: 0.003,
      multisample: 0,
      shader: mirrorShader(mask),
    });
    mirror.name = 'WetRoadMirror';
    mirror.rotation.x = -Math.PI / 2;
    mirror.position.set((x0 + x1) / 2, -KERB_HEIGHT + 0.009, (z0 + z1) / 2);
    const material = mirror.material as THREE.ShaderMaterial;
    material.uniforms.strength = this.mirrorStrength;
    material.uniforms.mask!.value = mask;
    material.transparent = true;
    material.depthWrite = false;
    material.blending = THREE.CustomBlending;
    material.blendEquation = THREE.AddEquation;
    material.blendSrc = THREE.OneFactor;
    material.blendDst = THREE.OneFactor;
    material.blendSrcAlpha = THREE.ZeroFactor;
    material.blendDstAlpha = THREE.OneFactor;
    mirror.receiveShadow = false;
    mirror.castShadow = false;
    mirror.renderOrder = 2;
    mirror.visible = false;
    this.add(mirror);
    return mirror;
  }
}

/** Where the puddles lie (seeded): in the gutters of Front Street and Park Street, a few in the lanes, on the pavements' low spots. */
function puddleSpots(): Puddle[] {
  const random = seededRandom(6061);
  const out: Puddle[] = [];
  const add = (x: number, z: number, big: number): void => {
    out.push({ at: [x, z], y: groundHeight(x, z) + 0.006, sx: (0.8 + random() * 1.6) * big, sz: (0.5 + random() * 0.7) * big, yaw: (random() - 0.5) * 0.5 });
  };
  for (let i = 0; i < 22; i++) {
    const side = random() < 0.5 ? -1 : 1;
    add(-34 + random() * 130, side * (6.9 + random() * 0.8), 1.1);
  }
  for (let i = 0; i < 8; i++) add(-30 + random() * 70, (random() < 0.5 ? -1 : 1) * (1.5 + random() * 3.5), 0.9);
  for (let i = 0; i < 6; i++) add((random() < 0.5 ? PARK_STREET.nearKerb - 0.9 : PARK_STREET.farKerb + 0.9) + (random() - 0.5) * 0.4, -12 - random() * 70, 1);
  for (let i = 0; i < 14; i++) {
    const side = random() < 0.5 ? -1 : 1;
    add(-38 + random() * 75, side * (8.5 + random() * 3.2), 0.7);
  }
  return out;
}

/** The mirror's mask: the road's puddles painted white where they lie, as the mirror's uvs see the road. */
function puddleMask(puddles: readonly Puddle[]): THREE.CanvasTexture {
  const w = 1024;
  const h = 256;
  const [canvas, ctx] = createCanvas(w, h);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const { x0, x1, z0, z1 } = MIRROR;
  for (const p of puddles) {
    const [x, z] = p.at;
    if (x < x0 || x > x1 || z < z0 || z > z1) continue;
    // The plane is turned flat: its uv v = 1 edge lies at z0, and canvas rows run down from v = 1.
    const px = ((x - x0) / (x1 - x0)) * w;
    const py = ((z - z0) / (z1 - z0)) * h;
    const rx = (p.sx / 2 / (x1 - x0)) * w;
    const ry = (p.sz / 2 / (z1 - z0)) * h;
    const g = ctx.createRadialGradient(px, py, 0, px, py, Math.max(rx, ry));
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(px, py, rx, ry, -p.yaw, 0, Math.PI * 2);
    ctx.fill();
  }
  // A thin sheen of water everywhere, so the wettest road still mirrors a little outside the puddles.
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.fillRect(0, 0, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/** The Reflector's shader: the mirrored street, blurred a little, through the puddle mask, stronger at a grazing angle. Added light only. */
function mirrorShader(mask: THREE.Texture) {
  return {
    name: 'WetRoadMirrorShader',
    uniforms: {
      color: { value: null },
      tDiffuse: { value: null },
      textureMatrix: { value: null },
      strength: { value: 0 },
      mask: { value: mask },
    },
    vertexShader: /* glsl */ `
      uniform mat4 textureMatrix;
      varying vec4 vUvProj;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        vUvProj = textureMatrix * vec4(position, 1.0);
        vUv = uv;
        vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform sampler2D mask;
      uniform float strength;
      varying vec4 vUvProj;
      varying vec2 vUv;
      varying vec3 vWorld;
      void main() {
        float m = texture2D(mask, vUv).r;
        vec3 sum = vec3(0.0);
        float spread = 0.006 * vUvProj.w;
        for (int x = -1; x <= 1; x++) {
          for (int y = -1; y <= 1; y++) {
            sum += texture2DProj(tDiffuse, vUvProj + vec4(float(x) * spread, float(y) * spread * 2.0, 0.0, 0.0)).rgb;
          }
        }
        vec3 toEye = normalize(cameraPosition - vWorld);
        float fresnel = 0.2 + 0.8 * pow(1.0 - clamp(toEye.y, 0.0, 1.0), 3.0);
        gl_FragColor = vec4(sum / 9.0 * strength * fresnel * m, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  };
}

/** A streak of light on wet asphalt: a soft band across, bright around its middle along, broken into ripples. */
function streakTexture(): THREE.CanvasTexture {
  const w = 64;
  const h = 256;
  const [canvas, ctx] = createCanvas(w, h);
  const image = ctx.createImageData(w, h);
  const random = seededRandom(707);
  const ripple = Array.from({ length: h }, () => 0.7 + random() * 0.3);
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const along = Math.exp(-Math.pow((t - 0.45) / 0.28, 2)) * ripple[y]!;
    for (let x = 0; x < w; x++) {
      const across = (x / (w - 1) - 0.5) * 2;
      const a = along * Math.exp(-across * across * 3.2);
      const k = (y * w + x) * 4;
      image.data[k] = 255;
      image.data[k + 1] = 255;
      image.data[k + 2] = 255;
      image.data[k + 3] = Math.round(255 * a);
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A puddle's soft irregular outline (the alpha map reads green). */
function blobTexture(): THREE.CanvasTexture {
  const size = 128;
  const [canvas, ctx] = createCanvas(size, size);
  const random = seededRandom(909);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 7; i++) {
    const x = size / 2 + (random() - 0.5) * size * 0.4;
    const y = size / 2 + (random() - 0.5) * size * 0.4;
    const r = size * (0.18 + random() * 0.14);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(canvas);
}
