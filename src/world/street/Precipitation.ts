import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { KERB_HEIGHT } from '@/world/measures/street';
import { roadGlsl } from './relief/ground';
import { SINE_HASH } from '@/graphics/glslNoise';
import { RENDER_ORDER } from '../surface/layers';
import { POINT_SCALE, scalesPoints } from '../particles/pointScale';
import { overKeepingAlpha } from '@/world/materials/blend';
import { lcg } from '@/random';
import RAIN_FRAGMENT from './PrecipitationRain.frag.glsl?raw';
import SNOW_FRAGMENT from './PrecipitationSnow.frag.glsl?raw';
import SPLASH_FRAGMENT from './PrecipitationSplash.frag.glsl?raw';
import precipitationRainVert from './PrecipitationRain.vert.glsl?raw';
import precipitationSnowVert from './PrecipitationSnow.vert.glsl?raw';
import precipitationSplashVert from './PrecipitationSplash.vert.glsl?raw';
import precipitationDripVert from './PrecipitationDrip.vert.glsl?raw';
import DRIP_FRAGMENT from './PrecipitationDrip.frag.glsl?raw';
import { assemble } from '@/graphics/glslAssemble';
import { MAX_SHELTERS, SHELTER_GLSL, STREET_SHELTERS } from './shelters';
import { LAMP_FIELD_GLSL, STREET_LAMP_FIELD } from './lampField';

/** The box of air around the eye the drops and flakes fill (metres), and how many there can be at most. */
const BOX = new THREE.Vector3(34, 16, 34);
const DROPS = 7000;
const FLAKES = 5000;
/** Splashes on the ground: how many at most, over what square around the eye, how long each ring lasts. */
const SPLASHES = 900;
const SPLASH_BOX = 22;
const SPLASH_SECONDS = 0.45;
/** Spring petals: how many at most, the box they fill (lower: they drift down from the trees), the share shown in a calm. */
const PETALS = 600;
const PETAL_BOX = new THREE.Vector3(30, 9, 30);
const PETAL_SHARE = 0.35;
/** Drips off the shelters' edges: how many at most (each in one of the nearest shelters), how much of the lamps' light the rain catches. */
const DRIPS = 420;
const LAMP_SHARE = 0.55;

/*
 * Both shaders place every particle in world space from its seed and the time, wrapped into the
 * box centred on the camera, so the rain stands still while the player walks through it and no
 * vertex is ever touched on the CPU. A particle whose threshold is above the current amount is
 * thrown out of the clip volume. The programs are the `Precipitation*.glsl` files beside this one; the shelters
 * (`shelters.ts`) and the lamps (`lampField.ts`) are the chunks `assemble()` writes into them.
 */
/** The nearest shelters are chosen again every `RESELECT` metres walked (`shelters.ts`). */
const RESELECT = 2;
/** The rig that wrote the shared shelters last: another drawing after it writes its own again. */
let shelterWriter: object | null = null;

const RAIN_VERTEX = assemble(precipitationRainVert, { chunks: { shelter: SHELTER_GLSL, lamp_field: LAMP_FIELD_GLSL } });

const SNOW_VERTEX = assemble(precipitationSnowVert, { chunks: { shelter: SHELTER_GLSL, lamp_field: LAMP_FIELD_GLSL } });

/*
 * A splash: each point is a ring on the ground that grows and fades over `period`, then turns up
 * elsewhere (its spot re-drawn from its seed and the cycle's number), wrapped into the square
 * around the camera. The ground is a kerb lower on the road (`roadY` inside the road's rectangles,
 * in zone-local metres: `origin` is the zone's world position). The ring is squashed by the view's
 * slant so it lies on the ground.
 */
const SPLASH_VERTEX = assemble(precipitationSplashVert, { chunks: { roadGlsl: roadGlsl(), sine_hash: SINE_HASH, shelter: SHELTER_GLSL } });

const DRIP_VERTEX = assemble(precipitationDripVert, { chunks: { roadGlsl: roadGlsl(), sine_hash: SINE_HASH, shelter: SHELTER_GLSL } });

/** Blends over the scene but keeps the canvas alpha (the video cut-out rule, docs/graphics.md). */
function overlay(material: THREE.ShaderMaterial): THREE.ShaderMaterial {
  material.depthWrite = false;
  return overKeepingAlpha(material);
}

/**
 * The rain's drops as quads: four corners a drop (head and tail, either side), two triangles; `extra` x 0 head / 1
 * tail, y the drop's threshold; `side` -1 / 1 across.
 */
function dropQuads(count: number, seed: number): THREE.BufferGeometry {
  const random = lcg(seed);
  const positions = new Float32Array(count * 4 * 3);
  const extra = new Float32Array(count * 4 * 2);
  const side = new Float32Array(count * 4);
  const index = new Uint32Array(count * 6);
  for (let i = 0; i < count; i++) {
    const [x, y, z, threshold] = [random(), random(), random(), random()];
    for (let v = 0; v < 4; v++) {
      const k = i * 4 + v;
      positions.set([x, y, z], k * 3);
      extra[k * 2] = v < 2 ? 0 : 1;
      extra[k * 2 + 1] = threshold;
      side[k] = v % 2 === 0 ? -1 : 1;
    }
    const b = i * 4;
    index.set([b, b + 1, b + 2, b + 1, b + 3, b + 2], i * 6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('extra', new THREE.BufferAttribute(extra, 2));
  geometry.setAttribute('side', new THREE.BufferAttribute(side, 1));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return geometry;
}

/** The drips as short streaks (two ends each), each with its edge (`drip` x) and pace (`drip` y). */
function dripLines(count: number, seed: number): THREE.BufferGeometry {
  const geometry = particles(count, 2, seed);
  const random = lcg(seed + 1);
  const drip = new Float32Array(count * 2 * 2);
  for (let i = 0; i < count; i++) {
    const [edge, pace] = [random(), random()];
    for (let v = 0; v < 2; v++) drip.set([edge, pace], (i * 2 + v) * 2);
  }
  geometry.setAttribute('drip', new THREE.BufferAttribute(drip, 2));
  return geometry;
}

function particles(count: number, verticesEach: number, seed: number): THREE.BufferGeometry {
  const random = lcg(seed);
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
 * and `wind` (how they slant): rain as thin streaks (quads turned to the eye, a pixel wide at
 * least), snow as soft round points drifting down, both catching the nearest lamps' light
 * (`STREET_LAMP_FIELD`: a drop falling past a lamp glints); while it rains, splashes (little rings
 * growing and fading, on the road a kerb lower than on the pavements, on a shelter's roof where it
 * has one) and drips running off the shelters' edges, on for a while after the rain as the ground
 * stays wet. Everything moves in the vertex shader; the meshes are hidden (no draw call) while
 * nothing falls. Coloured by the light: pale by day, dim at night. The nearest shelters
 * (`STREET_SHELTERS`) are chosen whatever falls (a probe that draws nothing reports the camera), so
 * the snow lying on the street's materials knows them too.
 */
export class Precipitation extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly rain: THREE.Mesh;
  private readonly drips: THREE.LineSegments;
  private readonly dripUniforms: Record<string, THREE.IUniform>;
  private readonly snow: THREE.Points;
  private readonly rainUniforms: Record<string, THREE.IUniform>;
  private readonly snowUniforms: Record<string, THREE.IUniform>;
  private readonly splash: THREE.Points;
  private readonly splashUniforms: Record<string, THREE.IUniform>;
  private time = 0;
  /** Every sheltered box, zone-local, and in world space once the zone has been placed (`placeShelters`). */
  private readonly shelters: THREE.Box3[];
  private readonly shelterWorld: THREE.Box3[];
  /** The world-space corners the shaders read (shared: `STREET_SHELTERS`): the nearest `MAX_SHELTERS`, unused slots inside out. */
  private readonly shelterMin = STREET_SHELTERS.shelterMin.value;
  private readonly shelterMax = STREET_SHELTERS.shelterMax.value;
  private readonly viewport = new THREE.Vector4();
  /** The zone's world matrix the world boxes were worked out for, and where the eye stood at the last choice. */
  private readonly placedFor = new THREE.Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
  private readonly chosenAt = new THREE.Vector3(Infinity, 0, 0);
  private readonly shelterOrder: number[];
  private readonly shelterDistance: Float32Array;
  private readonly petals: THREE.Points | null = null;
  private readonly petalUniforms: Record<string, THREE.IUniform> | null = null;
  private readonly splashes: boolean;

  /**
   * `shelters`: boxes (zone-local) nothing falls into: the building's sas seen through its open street
   * door, the awnings, the bus shelter, the kiosk (any number: the nearest `MAX_SHELTERS` are used). `petals`: spring blossom
   * blows about in dry weather (the trees are in flower). `splashes`: false where the ground is not
   * the zone's floor all round (a balcony high over the street: the rings would hang in the air).
   */
  constructor(private readonly dayNight: DayNight, options: { shelters?: readonly THREE.Box3[]; petals?: boolean; splashes?: boolean } = {}) {
    super();
    this.splashes = options.splashes ?? true;
    this.name = 'Precipitation';
    this.shelters = (options.shelters ?? []).map((box) => box.clone());
    this.shelterWorld = this.shelters.map((box) => box.clone());
    this.shelterOrder = this.shelters.map((_, i) => i);
    this.shelterDistance = new Float32Array(this.shelters.length);
    const shelterUniforms = (): Record<string, THREE.IUniform> => ({ ...STREET_SHELTERS });
    this.rainUniforms = {
      time: { value: 0 },
      amount: { value: 0 },
      box: { value: BOX },
      velocity: { value: new THREE.Vector3(0, -11, 0) },
      streak: { value: 0.55 },
      color: { value: new THREE.Color(0xbfc8d2) },
      opacity: { value: 0.35 },
      viewport: { value: new THREE.Vector2(1920, 1080) },
      lampShare: { value: LAMP_SHARE },
      ...STREET_LAMP_FIELD,
      ...shelterUniforms(),
    };
    this.snowUniforms = {
      time: { value: 0 },
      amount: { value: 0 },
      box: { value: BOX },
      velocity: { value: new THREE.Vector3(0, -1.1, 0) },
      size: { value: 60 },
      pointScale: POINT_SCALE,
      color: { value: new THREE.Color(0xffffff) },
      opacity: { value: 0.85 },
      lampShare: { value: LAMP_SHARE * 0.8 },
      ...STREET_LAMP_FIELD,
      ...shelterUniforms(),
    };
    this.rain = new THREE.Mesh(dropQuads(DROPS, 71), overlay(new THREE.ShaderMaterial({ uniforms: this.rainUniforms, vertexShader: RAIN_VERTEX, fragmentShader: RAIN_FRAGMENT })));
    // The quads are turned to the eye: neither side may be culled.
    (this.rain.material as THREE.ShaderMaterial).side = THREE.DoubleSide;
    this.snow = new THREE.Points(particles(FLAKES, 1, 73), overlay(new THREE.ShaderMaterial({ uniforms: this.snowUniforms, vertexShader: SNOW_VERTEX, fragmentShader: SNOW_FRAGMENT })));
    this.splashUniforms = {
      time: { value: 0 },
      amount: { value: 0 },
      box: { value: SPLASH_BOX },
      period: { value: SPLASH_SECONDS },
      size: { value: 16 },
      pointScale: POINT_SCALE,
      origin: { value: new THREE.Vector3() },
      roadY: { value: -KERB_HEIGHT },
      color: { value: new THREE.Color(0xd0d8e0) },
      opacity: { value: 0.55 },
      ...shelterUniforms(),
    };
    this.splash = new THREE.Points(particles(SPLASHES, 1, 79), overlay(new THREE.ShaderMaterial({ uniforms: this.splashUniforms, vertexShader: SPLASH_VERTEX, fragmentShader: SPLASH_FRAGMENT })));
    this.dripUniforms = {
      time: { value: 0 },
      amount: { value: 0 },
      origin: this.splashUniforms.origin!,
      roadY: { value: -KERB_HEIGHT },
      color: { value: new THREE.Color(0xc8d2dc) },
      opacity: { value: 0.5 },
      ...shelterUniforms(),
    };
    this.drips = new THREE.LineSegments(dripLines(DRIPS, 89), overlay(new THREE.ShaderMaterial({ uniforms: this.dripUniforms, vertexShader: DRIP_VERTEX, fragmentShader: DRIP_FRAGMENT })));
    if (options.petals) {
      this.petalUniforms = {
        time: { value: 0 },
        amount: { value: 0 },
        box: { value: PETAL_BOX },
        velocity: { value: new THREE.Vector3(0.8, -0.45, 0.2) },
        size: { value: 26 },
        pointScale: POINT_SCALE,
        color: { value: new THREE.Color(0xf6c9d6) },
        opacity: { value: 0.9 },
        ...shelterUniforms(),
      };
      this.petals = new THREE.Points(particles(PETALS, 1, 83), overlay(new THREE.ShaderMaterial({ uniforms: this.petalUniforms, vertexShader: SNOW_VERTEX, fragmentShader: SNOW_FRAGMENT })));
    }
    for (const mesh of [this.rain, this.snow, this.splash, this.drips, ...(this.petals ? [this.petals] : [])]) {
      mesh.frustumCulled = false;
      mesh.castShadow = false;
      mesh.renderOrder = RENDER_ORDER.particles;
      mesh.visible = false;
      // The shelters round whichever camera draws it (the player's, or a window's onto the street).
      mesh.onBeforeRender = (renderer, _scene, camera) => {
        this.chooseShelters(camera);
        if (mesh === this.rain) {
          renderer.getCurrentViewport(this.viewport);
          (this.rainUniforms.viewport!.value as THREE.Vector2).set(Math.max(1, this.viewport.z), Math.max(1, this.viewport.w));
        }
      };
      if ((mesh as THREE.Points).isPoints) scalesPoints(mesh);
      this.add(mesh);
    }
    if (this.shelters.length > 0) this.add(this.shelterProbe());
  }

  /**
   * An object that draws nothing (an empty draw range) but is drawn every frame: its hook chooses the nearest
   * shelters for the camera even while nothing falls (the snow lying under an awning must know it is there).
   */
  private shelterProbe(): THREE.Mesh {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    geometry.setDrawRange(0, 0);
    const probe = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false }));
    probe.name = 'ShelterProbe';
    probe.frustumCulled = false;
    probe.castShadow = false;
    probe.receiveShadow = false;
    // First of its scene's opaque draws, so every weathered material of that scene (the street's, or a window's view of
    // it, two scenes a frame) reads this scene's shelters, not the other's.
    probe.renderOrder = RENDER_ORDER.first;
    probe.onBeforeRender = (_renderer, _scene, camera) => this.chooseShelters(camera);
    return probe;
  }

  /**
   * The world boxes again only when the zone has moved (never, once placed), and the nearest
   * `MAX_SHELTERS` of them to `camera` into the shaders' slots once it has walked `RESELECT` metres.
   */
  private chooseShelters(camera: THREE.Camera): void {
    const n = this.shelters.length;
    if (n === 0) {
      // None of its own: the shared slots emptied once (another rig's boxes are elsewhere in the world).
      if (shelterWriter !== this) {
        shelterWriter = this;
        for (let k = 0; k < MAX_SHELTERS; k++) {
          this.shelterMin[k]!.set(1, 1, 1);
          this.shelterMax[k]!.set(-1, -1, -1);
        }
      }
      return;
    }
    let moved = false;
    if (!this.placedFor.equals(this.matrixWorld)) {
      this.placedFor.copy(this.matrixWorld);
      for (let i = 0; i < n; i++) this.shelterWorld[i]!.copy(this.shelters[i]!).applyMatrix4(this.matrixWorld);
      moved = true;
    }
    const eye = camera.matrixWorld.elements;
    const ex = eye[12]!;
    const ez = eye[14]!;
    const dx = ex - this.chosenAt.x;
    const dz = ez - this.chosenAt.z;
    if (!moved && shelterWriter === this && dx * dx + dz * dz < RESELECT * RESELECT) return;
    shelterWriter = this;
    this.chosenAt.set(ex, 0, ez);
    const order = this.shelterOrder;
    const distance = this.shelterDistance;
    for (let i = 0; i < n; i++) {
      const box = this.shelterWorld[i]!;
      const cx = Math.max(box.min.x - ex, 0, ex - box.max.x);
      const cz = Math.max(box.min.z - ez, 0, ez - box.max.z);
      distance[i] = cx * cx + cz * cz;
    }
    if (n > MAX_SHELTERS) order.sort((a, b) => distance[a]! - distance[b]!);
    for (let k = 0; k < MAX_SHELTERS; k++) {
      if (k < n) {
        const box = this.shelterWorld[order[k]!]!;
        this.shelterMin[k]!.copy(box.min);
        this.shelterMax[k]!.copy(box.max);
      } else {
        this.shelterMin[k]!.set(1, 1, 1);
        this.shelterMax[k]!.set(-1, -1, -1);
      }
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
    // Off the shelters' edges while it rains and for a while after, as long as the ground is still wet.
    const dripAmount = this.splashes ? Math.min(1, rainAmount * 1.5 + 0.5 * THREE.MathUtils.smoothstep(s.wetness, 0.3, 0.8)) * (1 - s.snowCover) : 0;
    this.drips.visible = dripAmount > 0.03 && this.shelters.length > 0;
    if (this.drips.visible) {
      const u = this.dripUniforms;
      u.time!.value = this.time;
      u.amount!.value = dripAmount;
      this.getWorldPosition(u.origin!.value as THREE.Vector3);
      (u.color!.value as THREE.Color).setRGB(0.78, 0.82, 0.86).multiplyScalar(light);
    }
    this.splash.visible = this.splashes && rainAmount > 0.05 && s.snowCover < 0.5;
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
    // Blossom on the breeze: a few petals in still air, more as it blows, none in the rain or at night.
    if (this.petals && this.petalUniforms) {
      const amount = s.rain < 0.05 && s.snow < 0.02 ? PETAL_SHARE * (0.25 + s.wind) * Math.min(1, s.daylight * 3) : 0;
      this.petals.visible = amount > 0.01;
      if (this.petals.visible) {
        const u = this.petalUniforms;
        u.time!.value = this.time;
        u.amount!.value = amount;
        (u.velocity!.value as THREE.Vector3).set(0.5 + windX * 0.9, -0.45, windX * 0.3);
        (u.color!.value as THREE.Color).setRGB(0.96, 0.79, 0.84).multiplyScalar(0.35 + 0.65 * light);
      }
    }
  }
}
