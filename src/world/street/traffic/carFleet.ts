import * as THREE from 'three';
import { canvasTexture, createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { CAR_SIZES, DRIVER_SEAT, VEHICLE_GLASS, carGeometries, type CarModelId } from '../carModel';
import { snowCovered } from '../snowCover';
import { QUALITY } from '@/graphics/quality';
import { afterChunk, patchShader } from '../../materials/shaderPatch';
import { VEHICLES } from '../../city/vehicles';
import { GROUND, RENDER_ORDER, onSurface } from '../../surface/layers';
import { additive } from '@/world/materials/blend';
import { lcg } from '@/random';
import { ROAD_Y } from './driving';
import { LampMaterial, lampStates } from './lampMaterial';
import { WheelMaterial, rollAngle, wheelAngles } from './wheelSpin';
import type { Car } from './Car';

/*
 * The cars' bodies: how `StreetCars`'s cars are drawn. Five shapes (a hatchback, a city car, a saloon, an estate, a
 * panel van), each
 * instanced (body, glass, tyres with the trim and the cabin seen through the tinted glass, lamps with the plates:
 * four draw calls a shape), plus the drivers' figures, the taxis' signs, the headlight pools on the road at night
 * and the dark under each car. Every mesh is culled by one sphere round the cars shown. The simulation writes each
 * car's instance through `show`; nothing here decides where a car goes.
 */

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * The cars' paint (tinted per car by its instance colour): on medium and high a clear coat over the colour, so the
 * sky and the lamps lie crisp along the roofs and bonnets; and the road's grime up the sills and the bumpers' feet,
 * fading out by half a metre up (the body's own height, the same on every car).
 */
function carPaint(): THREE.MeshStandardMaterial {
  const material =
    QUALITY.level === 'low'
      ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
      : new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.06 });
  patchShader(material, 'carGrime', (shader) => {
    shader.vertexShader = 'varying float vCarY;\n' + afterChunk(shader.vertexShader, 'begin_vertex', 'vCarY = position.y;');
    shader.fragmentShader = 'varying float vCarY;\n' + afterChunk(shader.fragmentShader, 'color_fragment', 'diffuseColor.rgb *= mix(vec3(0.62, 0.6, 0.56), vec3(1.0), smoothstep(0.28, 0.55, vCarY));');
  });
  return snowCovered(material);
}
const MODELS: readonly CarModelId[] = ['hatch', 'city', 'saloon', 'estate', 'van'];
/** A taxi's roof sign: size (along, up, across) and where it sits (along from the middle, over the roof). */
const TAXI_SIGN = { size: [0.2, 0.14, 0.55] as const, along: -0.25, lift: 0.07 };
/** The pool of the headlights on the road ahead of a driving car at night: how far it reaches, how wide it spreads, how bright. */
const BEAM = { length: 9, width: 4.6, strength: 0.55 };
/** How dark the ground under a car gets, and how far past its body the dark reaches (m, on both sides together). */
const SHADE_OPACITY = 0.55;
const SHADE_MARGIN = 0.5;

/** One car shape's instanced meshes (body, glass, tyres and trim, lamps), their per-instance lamp states and wheel angles. */
interface ModelSet {
  body: THREE.InstancedMesh;
  glass: THREE.InstancedMesh;
  wheels: THREE.InstancedMesh;
  lamps: THREE.InstancedMesh;
  lampState: THREE.InstancedBufferAttribute;
  wheelAngle: THREE.InstancedBufferAttribute;
  used: number;
}

export class CarFleet {
  private readonly sets = new Map<CarModelId, ModelSet>();
  private readonly lampMaterial = new LampMaterial(true);
  private readonly color = new THREE.Color();
  private readonly scratch = new THREE.Matrix4();
  private readonly lift = new THREE.Matrix4();
  private readonly seat = new THREE.Matrix4();
  private readonly lampValue = new THREE.Vector4();
  /** The model sets moved this frame (reused: no set a frame). */
  private readonly touched = new Set<ModelSet>();
  /** The taxis' roof signs, one slot per car, and their lit material. */
  private readonly signs: THREE.InstancedMesh;
  private readonly signMaterial = new THREE.MeshBasicMaterial({ color: 0xf2d27a });
  /** The drivers seen through the glass: heads and shoulders, one slot per car. */
  private readonly heads: THREE.InstancedMesh;
  private readonly shoulders: THREE.InstancedMesh;
  /** The headlights' pools on the road, one slot per car (additive, the canvas alpha kept). */
  private readonly beams: THREE.InstancedMesh;
  private readonly beamMaterial: THREE.MeshBasicMaterial;
  private readonly beamLocal = new THREE.Matrix4();
  /** The dark under each car (no sky reaches under it): a soft rectangle on the road, one slot per car. */
  private readonly shades: THREE.InstancedMesh;
  private readonly shadeLocal = new THREE.Matrix4();
  /** One sphere round every car shown, shared by all the meshes (they are culled as one, kept up to date as cars move). */
  private readonly bounds = new THREE.Sphere();
  private readonly box = new THREE.Box3();
  private readonly v = new THREE.Vector3();
  /** Whether the indicators are lit this frame (they blink: the simulation keeps the phase). */
  blink = false;

  /**
   * Builds the meshes into `parent` for `models` (every car's shape, parked and driving): a set per shape that has
   * any, then the drivers, signs, beams and shades, one slot per car.
   */
  constructor(parent: THREE.Object3D, models: readonly CarModelId[]) {
    const body = carPaint();
    // Tinted, see-through: the seats and the driver show behind it.
    // Over the body's panels as `carModel.VEHICLE_GLASS`.
    const glass = onSurface(snowCovered(new THREE.MeshStandardMaterial({ color: 0x1a232b, roughness: 0.06, transparent: true, opacity: 0.66 })), VEHICLE_GLASS, { depthWrite: false });
    // Its own, not the palette's: an instanced mesh sharing a material with plain meshes (the bus's wheels) switches programs every draw.
    const tyres = new WheelMaterial(true);
    for (const model of MODELS) {
      const count = models.filter((m) => m === model).length;
      if (!count) continue;
      const g = carGeometries(model);
      const set: ModelSet = {
        body: new THREE.InstancedMesh(g.body, body, count),
        glass: new THREE.InstancedMesh(g.glass, glass, count),
        wheels: new THREE.InstancedMesh(g.wheels, tyres, count),
        lamps: new THREE.InstancedMesh(g.lamps, this.lampMaterial, count),
        lampState: lampStates(g.lamps, count),
        wheelAngle: wheelAngles(g.wheels, count),
        used: 0,
      };
      for (const mesh of [set.body, set.glass, set.wheels, set.lamps]) {
        mesh.castShadow = mesh !== set.lamps && mesh !== set.glass;
        mesh.receiveShadow = mesh !== set.lamps;
        mesh.boundingSphere = this.bounds;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        for (let i = 0; i < count; i++) mesh.setMatrixAt(i, HIDDEN);
        parent.add(mesh);
      }
      set.glass.renderOrder = RENDER_ORDER.glass;
      this.sets.set(model, set);
    }

    const n = models.length;
    this.signs = this.instanced(parent, new THREE.BoxGeometry(...TAXI_SIGN.size), this.signMaterial, n);
    this.heads = this.instanced(parent, new THREE.SphereGeometry(0.1, 10, 8).translate(0.04, 0.38, 0), new THREE.MeshStandardMaterial({ color: 0xc99b7c, roughness: 0.7 }), n);
    // Shoulders a little under the seat back's top (`carModel`'s cabin: level with it, the two would fight).
    this.shoulders = this.instanced(parent, new THREE.BoxGeometry(0.24, 0.27, 0.42).translate(-0.02, 0.125, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), n);
    const clothes = lcg(311);
    for (let i = 0; i < n; i++) this.shoulders.setColorAt(i, this.color.setHSL(clothes(), 0.25, 0.18 + 0.3 * clothes()));
    this.beamMaterial = onSurface(
      additive(new THREE.MeshBasicMaterial({
        map: beamTexture(),
        color: 0x000000,
        transparent: true,
        fog: true,
      })),
      GROUND.lampPool,
      { depthWrite: false },
    );
    // Flat on the road, u forward from just behind the nose.
    this.beams = this.instanced(parent, new THREE.PlaneGeometry(BEAM.length, BEAM.width).rotateX(-Math.PI / 2), this.beamMaterial, n);
    this.beams.castShadow = false;
    this.beams.receiveShadow = false;
    this.beams.renderOrder = RENDER_ORDER.groundGlow;
    this.beams.visible = false;
    const shade = onSurface(new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: shadeTexture(), transparent: true, opacity: SHADE_OPACITY, fog: true }), GROUND.carShade, { depthWrite: false });
    this.shades = this.instanced(parent, new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), shade, n);
    this.shades.castShadow = false;
    this.shades.receiveShadow = false;
    this.shades.renderOrder = RENDER_ORDER.contactShadow;
  }

  /** The next free slot in `model`'s meshes, for a new car of that shape. */
  claim(model: CarModelId): number {
    return this.sets.get(model)!.used++;
  }

  /** Paints `car`'s body `hex`. */
  paint(car: Car, hex: number): void {
    const set = this.sets.get(car.model)!;
    set.body.setColorAt(car.slot, this.color.setHex(hex));
    if (set.body.instanceColor) set.body.instanceColor.needsUpdate = true;
  }

  /** The night's lights: the lamps, the taxi signs' glow, the headlight pools (none by day). */
  setNight(night: number): void {
    this.lampMaterial.setNight(night);
    this.signMaterial.color.setRGB(0.9 + 1.6 * night, 0.75 + 1.3 * night, 0.35 + 0.6 * night);
    this.beamMaterial.color.setRGB(1, 0.94, 0.82).multiplyScalar(BEAM.strength * night);
    this.beams.visible = night > 0.02;
  }

  /** Writes car `i`'s instance (pose, lamps, wheels, driver, sign, beam), or hides what it does not show, and notes its set as moved. */
  show(car: Car, i: number): void {
    const set = this.sets.get(car.model)!;
    this.touched.add(set);
    const away = car.mode === 'away';
    if (away) this.scratch.copy(HIDDEN);
    else this.scratch.makeRotationY(car.yaw).setPosition(car.position.x, ROAD_Y, car.position.z);
    set.body.setMatrixAt(car.slot, this.scratch);
    set.glass.setMatrixAt(car.slot, this.scratch);
    set.wheels.setMatrixAt(car.slot, this.scratch);
    set.lamps.setMatrixAt(car.slot, this.scratch);
    const left = this.blink && (car.hazards || car.signal < 0);
    const right = this.blink && (car.hazards || car.signal > 0);
    this.lampValue.set(car.lit ? (car.reversing ? 2 : 1) : 0, car.braking && car.lit ? 1 : 0, left ? 1 : 0, right ? 1 : 0);
    set.lampState.setXYZW(car.slot, this.lampValue.x, this.lampValue.y, this.lampValue.z, this.lampValue.w);
    set.wheelAngle.setX(car.slot, rollAngle(car.rolled, VEHICLES[car.model === 'hatch' ? 'car' : car.model === 'city' ? 'cityCar' : car.model].wheelRadius));
    this.showDressing(car, i, car.active, away);
  }

  /** Car `i`'s driver, headlight pool and taxi sign (on the road only) and the dark under it (whenever it is there), in the car's frame (`scratch`). */
  private showDressing(car: Car, i: number, driving: boolean, away: boolean): void {
    if (driving) {
      const seat = DRIVER_SEAT[car.model];
      this.seat.makeTranslation(seat.x + 0.06, seat.belt, seat.z).premultiply(this.scratch);
    }
    this.heads.setMatrixAt(i, driving ? this.seat : HIDDEN);
    this.shoulders.setMatrixAt(i, driving ? this.seat : HIDDEN);
    // The pool ahead of the nose, in the car's frame, just over the asphalt (none while reversing).
    if (driving && !car.reversing) this.beamLocal.makeTranslation(car.length / 2 - 0.2 + BEAM.length / 2, GROUND.lampPool.lift, 0).premultiply(this.scratch);
    this.beams.setMatrixAt(i, driving && !car.reversing ? this.beamLocal : HIDDEN);
    // The sign rides on the roof, in the car's frame.
    if (car.taxi && driving) this.lift.makeTranslation(TAXI_SIGN.along, CAR_SIZES[car.model].height + TAXI_SIGN.lift, 0).premultiply(this.scratch);
    this.signs.setMatrixAt(i, car.taxi && driving ? this.lift : HIDDEN);
    // The dark under it, a little wider and longer than the car, just over the asphalt.
    if (!away) this.shadeLocal.makeScale(car.length + SHADE_MARGIN, 1, CAR_SIZES[car.model].width + SHADE_MARGIN).setPosition(0, GROUND.carShade.lift, 0).premultiply(this.scratch);
    this.shades.setMatrixAt(i, away ? HIDDEN : this.shadeLocal);
  }

  /** Uploads what `show` wrote: the sets moved since the last call (then forgotten), and, if any car moved, the per-car meshes and the culling sphere. */
  commit(cars: readonly Car[], moved: boolean): void {
    for (const set of this.touched) this.flag(set);
    this.touched.clear();
    if (!moved) return;
    for (const mesh of [this.beams, this.signs, this.heads, this.shoulders, this.shades]) mesh.instanceMatrix.needsUpdate = true;
    this.updateBounds(cars);
  }

  /** Uploads every set (the first frame, every car placed). */
  flagAll(): void {
    for (const set of this.sets.values()) this.flag(set);
  }

  /** Uploads one car's set (a car settled into its bay outside the frame's loop). */
  flagModel(model: CarModelId): void {
    this.flag(this.sets.get(model)!);
  }

  /** The shared sphere round every car shown (and their beams ahead): what the meshes are culled by. */
  updateBounds(cars: readonly Car[]): void {
    this.box.makeEmpty();
    for (const car of cars) if (car.mode !== 'away') this.box.expandByPoint(car.position);
    if (this.box.isEmpty()) this.box.setFromCenterAndSize(this.v.set(0, 0, 0), this.v.clone().setScalar(1));
    this.box.getBoundingSphere(this.bounds);
    this.bounds.radius += BEAM.length + 3;
  }

  private flag(set: ModelSet): void {
    for (const mesh of [set.body, set.glass, set.wheels, set.lamps]) mesh.instanceMatrix.needsUpdate = true;
    set.lampState.needsUpdate = true;
    set.wheelAngle.needsUpdate = true;
  }

  /** An instanced mesh of `count` hidden slots, culled with the cars' shared sphere. */
  private instanced(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, count: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, count));
    mesh.boundingSphere = this.bounds;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, HIDDEN);
    parent.add(mesh);
    return mesh;
  }
}

/** The dark under a car: a rectangle fading out towards its edges, darkest under the middle (an alpha map, white is dark). */
function shadeTexture(): THREE.CanvasTexture {
  const size = 64;
  const [canvas, ctx] = createCanvas(size, size);
  const image = ctx.createImageData(size, size);
  const edge = (t: number): number => THREE.MathUtils.smoothstep(Math.min(t, 1 - t), 0, 0.3);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v = Math.round(255 * edge(x / (size - 1)) * edge(y / (size - 1)));
      const k = (y * size + x) * 4;
      image.data[k] = v;
      image.data[k + 1] = v;
      image.data[k + 2] = v;
      image.data[k + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvasTexture(canvas, { data: true });
}

/**
 * A headlights' pool seen from above, u forward from the nose: two lamps' cones merging, brightest
 * a few metres ahead, spreading and fading out towards the far end, soft at the sides.
 */
function beamTexture(): THREE.CanvasTexture {
  const [w, h] = [256, 128];
  const [canvas, ctx] = createCanvas(w, h);
  const image = ctx.createImageData(w, h);
  for (let x = 0; x < w; x++) {
    const t = x / (w - 1);
    const along = THREE.MathUtils.smoothstep(t, 0.0, 0.12) * (1 - t) ** 1.6;
    const half = 0.18 + 0.32 * t;
    for (let y = 0; y < h; y++) {
      const across = Math.abs(y / (h - 1) - 0.5);
      const side = 1 - THREE.MathUtils.smoothstep(across, half * 0.55, half);
      const v = Math.round(255 * along * side);
      const k = (y * w + x) * 4;
      image.data[k] = 255;
      image.data[k + 1] = 255;
      image.data[k + 2] = 255;
      image.data[k + 3] = v;
    }
  }
  ctx.putImageData(image, 0, 0);
  return toTexture(canvas);
}
