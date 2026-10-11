import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTexture, createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { CAR_SIZES, DRIVER_SEAT, VEHICLE_GLASS, WINDSCREEN, carGeometries, type CarModelId } from '../carModel';
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
 * The cars' bodies: how `StreetCars`'s cars are drawn. Five shapes (a hatchback, a city car, a saloon, an estate with
 * its roof rails, a panel van), each instanced (body, glass, tyres with the trim and the cabin seen through the tinted
 * glass, lamps with the plates: four draw calls a shape; the body leans on its springs, the front wheels steer), plus
 * the drivers and their passengers, the taxis' signs (lit while free), the wipers, the roof bars some carry, a parking
 * ticket under a wiper, the headlight pools on the road at night and the dark under each car. Every mesh is culled by
 * one sphere round the cars shown. The simulation writes each car's instance through `show`; nothing here decides
 * where a car goes.
 */

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * The cars' paint (tinted per car by its instance colour): on medium and high a clear coat over the colour, so the
 * sky and the lamps lie crisp along the roofs and bonnets; and the road's grime up the sills and the bumpers' feet,
 * higher and greyer on a worn car (`carWear`, per instance: its paint dulled too).
 */
function carPaint(): THREE.MeshStandardMaterial {
  const material =
    QUALITY.level === 'low'
      ? new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 })
      : new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.06 });
  patchShader(material, 'carGrime', (shader) => {
    shader.vertexShader = 'attribute float carWear;\nvarying float vCarY;\nvarying float vWear;\n' + afterChunk(shader.vertexShader, 'begin_vertex', 'vCarY = position.y; vWear = carWear;');
    shader.fragmentShader =
      'varying float vCarY;\nvarying float vWear;\n' +
      afterChunk(
        afterChunk(shader.fragmentShader, 'color_fragment', 'diffuseColor.rgb *= mix(vec3(0.62, 0.6, 0.56), vec3(1.0), smoothstep(0.28 + 0.35 * vWear, 0.55 + 0.45 * vWear, vCarY));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))) * 0.9, 0.35 * vWear);'),
        'roughnessmap_fragment',
        'roughnessFactor = mix(roughnessFactor, 0.75, vWear);',
      );
    // A worn car has lost its shine (the clear coat, on medium and high).
    if (material instanceof THREE.MeshPhysicalMaterial) shader.fragmentShader = afterChunk(shader.fragmentShader, 'lights_physical_fragment', 'material.clearcoat *= 1.0 - 0.85 * vWear;');
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
/** The skins of the people seen through the glass. */
const SKINS = [0xf1c7a8, 0xe3b08e, 0xc99b7c, 0xa8775a, 0x8a5a3e, 0x5e3b28];
/** What a worn car's paint fades towards. */
const FADED = new THREE.Color(0.62, 0.62, 0.6);
/** A wiper: its length (m), the angle it rests at along the windscreen's foot and how far it sweeps up, its beats a second. */
const WIPER = { length: 0.46, rest: 0.08, sweep: 1.75, hz: 0.75 };
/** Roof bars on the shapes that may carry them: the roof's middle along x. */
const ROOF_MIDDLE: Partial<Record<CarModelId, number>> = { hatch: -0.47, city: -0.62, saloon: -0.3 };
/** The springs: how much the body leans (radians) per m/s² of braking and per m/s² across in a bend, and the most. */
const SPRINGS = { pitch: 0.0022, roll: 0.0035, most: 0.03, pivot: 0.45 };

/** One car shape's instanced meshes (body, glass, tyres and trim, lamps), their per-instance lamp states, wheel angles and wear. */
interface ModelSet {
  body: THREE.InstancedMesh;
  glass: THREE.InstancedMesh;
  wheels: THREE.InstancedMesh;
  lamps: THREE.InstancedMesh;
  lampState: THREE.InstancedBufferAttribute;
  wheelAngle: THREE.InstancedBufferAttribute;
  wear: THREE.InstancedBufferAttribute;
  used: number;
}

/** The wipers' and the ticket's frame on a shape's windscreen: the foot's point, the way up the glass, its outward normal. */
interface Screen {
  foot: THREE.Vector3;
  up: THREE.Vector3;
  normal: THREE.Vector3;
  wipers: number;
}

export class CarFleet {
  private readonly sets = new Map<CarModelId, ModelSet>();
  private readonly lampMaterial = new LampMaterial(true);
  private readonly color = new THREE.Color();
  private readonly scratch = new THREE.Matrix4();
  private readonly body = new THREE.Matrix4();
  private readonly lean = new THREE.Matrix4();
  private readonly lift = new THREE.Matrix4();
  private readonly seat = new THREE.Matrix4();
  private readonly part = new THREE.Matrix4();
  private readonly lampValue = new THREE.Vector4();
  /** The model sets moved this frame (reused: no set a frame). */
  private readonly touched = new Set<ModelSet>();
  /** The taxis' roof signs, one slot per car, and their material (each sign's own colour: lit while free). */
  private readonly signs: THREE.InstancedMesh;
  private readonly signMaterial = new THREE.MeshBasicMaterial({ color: 0xf2d27a });
  /** The people seen through the glass: heads and shoulders, the driver's slot per car, then three passengers' a car. */
  private readonly heads: THREE.InstancedMesh;
  private readonly shoulders: THREE.InstancedMesh;
  /** Two wipers a car, the bars on a few roofs, a ticket under a wiper. */
  private readonly wipers: THREE.InstancedMesh;
  private readonly racks: THREE.InstancedMesh;
  private readonly tickets: THREE.InstancedMesh;
  private readonly screens = new Map<CarModelId, Screen>();
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
  private readonly basisX = new THREE.Vector3();
  private readonly basisZ = new THREE.Vector3();
  /** Whether the indicators are lit this frame (they blink: the simulation keeps the phase). */
  blink = false;
  /** The wipers' sweep now (0 resting .. 1 at the top), the same on every car with them going; whether they go. */
  wipe = 0;
  wiping = false;
  /** Per car: carries roof bars, has a ticket on its windscreen. */
  private readonly racked: boolean[];

  /**
   * Builds the meshes into `parent` for `models` (every car's shape, parked and driving): a set per shape that has
   * any, then the people, signs, wipers, bars, tickets, beams and shades, by car.
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
      const wear = new THREE.InstancedBufferAttribute(new Float32Array(count), 1);
      g.body.setAttribute('carWear', wear);
      const set: ModelSet = {
        body: new THREE.InstancedMesh(g.body, body, count),
        glass: new THREE.InstancedMesh(g.glass, glass, count),
        wheels: new THREE.InstancedMesh(g.wheels, tyres, count),
        lamps: new THREE.InstancedMesh(g.lamps, this.lampMaterial, count),
        lampState: lampStates(g.lamps, count),
        wheelAngle: wheelAngles(g.wheels, count),
        wear,
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
      const screen = WINDSCREEN[model];
      const up = new THREE.Vector3(screen.top[0] - screen.foot[0], screen.top[1] - screen.foot[1], 0).normalize();
      this.screens.set(model, { foot: new THREE.Vector3(screen.foot[0], screen.foot[1], 0), up, normal: new THREE.Vector3(up.y, -up.x, 0), wipers: screen.wipers });
    }

    const n = models.length;
    this.racked = Array.from({ length: n }, () => false);
    this.signs = this.instanced(parent, new THREE.BoxGeometry(...TAXI_SIGN.size), this.signMaterial, n);
    for (let i = 0; i < n; i++) this.signs.setColorAt(i, this.color.setRGB(1, 1, 1));
    this.heads = this.instanced(parent, new THREE.SphereGeometry(0.1, 10, 8).translate(0.04, 0.38, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), n * 4);
    // Shoulders a little under the seat back's top (`carModel`'s cabin: level with it, the two would fight).
    this.shoulders = this.instanced(parent, new THREE.BoxGeometry(0.24, 0.27, 0.42).translate(-0.02, 0.125, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), n * 4);
    const people = lcg(311);
    for (let i = 0; i < n * 4; i++) {
      this.shoulders.setColorAt(i, this.color.setHSL(people(), 0.25, 0.18 + 0.3 * people()));
      this.heads.setColorAt(i, this.color.setHex(SKINS[Math.floor(people() * SKINS.length)]!));
    }
    const rubber = new THREE.MeshStandardMaterial({ color: 0x121314, roughness: 0.6 });
    this.wipers = this.instanced(parent, new THREE.BoxGeometry(WIPER.length, 0.012, 0.018).translate(WIPER.length / 2, 0.012, 0), rubber, n * 2);
    this.wipers.castShadow = false;
    this.racks = this.instanced(parent, rackGeometry(), new THREE.MeshStandardMaterial({ color: 0x1c1d20, roughness: 0.5, metalness: 0.4 }), n);
    this.tickets = this.instanced(parent, new THREE.BoxGeometry(0.09, 0.004, 0.13).translate(0, 0.012, 0), new THREE.MeshStandardMaterial({ color: 0xf2e7a8, roughness: 0.9 }), n);
    this.tickets.castShadow = false;
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

  /** Paints car `i` (`car`) `hex`, faded and dirtied by `car.wear`; draws who rides in it and whether it carries roof bars. */
  paint(car: Car, hex: number, i = -1): void {
    const set = this.sets.get(car.model)!;
    // A worn car's paint has faded towards a chalky grey.
    this.color.setHex(hex).lerp(FADED, 0.35 * car.wear);
    set.body.setColorAt(car.slot, this.color);
    if (set.body.instanceColor) set.body.instanceColor.needsUpdate = true;
    set.wear.setX(car.slot, car.wear);
    set.wear.needsUpdate = true;
    if (i >= 0) this.racked[i] = car.model in ROOF_MIDDLE && ((hex * 2654435761) >>> 0) % 7 === 0;
  }

  /**
   * The night's lights: the lamps (on by day too in fog and a downpour: `murk`), the taxi signs' glow, the headlight
   * pools (only by night).
   */
  setNight(night: number, murk = 0): void {
    const lamps = Math.max(night, 0.55 * murk);
    this.lampMaterial.setNight(lamps);
    this.signMaterial.color.setRGB(0.9 + 1.6 * lamps, 0.75 + 1.3 * lamps, 0.35 + 0.6 * lamps);
    this.beamMaterial.color.setRGB(1, 0.94, 0.82).multiplyScalar(BEAM.strength * night);
    this.beams.visible = night > 0.02;
  }

  /** Writes car `i`'s instance (pose, lamps, wheels, people, sign, wipers, beam), or hides what it does not show, and notes its set as moved. */
  show(car: Car, i: number): void {
    const set = this.sets.get(car.model)!;
    this.touched.add(set);
    const away = car.mode === 'away';
    if (away) {
      this.scratch.copy(HIDDEN);
      this.body.copy(HIDDEN);
    } else {
      this.scratch.makeRotationY(car.yaw).setPosition(car.position.x, ROAD_Y, car.position.z);
      // The body on its springs: pitched about its axles' height (nose down braking), rolled out of the bend.
      const pivot = SPRINGS.pivot;
      this.lean.makeTranslation(0, pivot, 0).multiply(this.part.makeRotationZ(-car.pitch)).multiply(this.seat.makeRotationX(car.roll)).multiply(this.lift.makeTranslation(0, -pivot, 0));
      this.body.multiplyMatrices(this.scratch, this.lean);
    }
    set.body.setMatrixAt(car.slot, this.body);
    set.glass.setMatrixAt(car.slot, this.body);
    set.wheels.setMatrixAt(car.slot, this.body);
    set.lamps.setMatrixAt(car.slot, this.body);
    const left = this.blink && (car.hazards || car.signal < 0);
    const right = this.blink && (car.hazards || car.signal > 0);
    this.lampValue.set(car.lit ? (car.reversing ? 2 : 1) : 0, car.braking && car.lit ? 1 : 0, left ? 1 : 0, right ? 1 : 0);
    set.lampState.setXYZW(car.slot, this.lampValue.x, this.lampValue.y, this.lampValue.z, this.lampValue.w);
    set.wheelAngle.setXY(car.slot, rollAngle(car.rolled, wheelRadius(car.model)), car.steer);
    this.showPeople(car, i, car.active);
    this.showDressing(car, i, car.active, away);
  }

  /** Car `i`'s driver (on the road) and passengers, in the body's frame. */
  private showPeople(car: Car, i: number, driving: boolean): void {
    const seat = DRIVER_SEAT[car.model];
    this.place(i * 4, driving, seat.x + 0.06, seat.belt, seat.z);
    const places: readonly [number | null, number][] = [[seat.x + 0.06, -seat.z], [seat.rear, -seat.z], [seat.rear, seat.z]];
    // A taxi's fare sits in the back; others fill the front first.
    const order = car.taxi ? [1, 2, 0] : [0, 1, 2];
    for (let k = 0; k < 3; k++) {
      const place = order[k]!;
      const [x, z] = places[place]!;
      this.place(i * 4 + 1 + place, driving && x !== null && k < car.passengers, x ?? 0, seat.belt, z);
    }
  }

  /** One person's head and shoulders at slot `slot`, at `x` along and `z` across in the body's frame (or hidden). */
  private place(slot: number, shown: boolean, x: number, belt: number, z: number): void {
    if (shown) this.seat.makeTranslation(x, belt, z).premultiply(this.body);
    this.heads.setMatrixAt(slot, shown ? this.seat : HIDDEN);
    this.shoulders.setMatrixAt(slot, shown ? this.seat : HIDDEN);
  }

  /** Car `i`'s headlight pool and taxi sign (on the road only), wipers, bars, ticket, and the dark under it (whenever it is there). */
  private showDressing(car: Car, i: number, driving: boolean, away: boolean): void {
    // The pool ahead of the nose, in the car's frame, just over the asphalt (none while reversing).
    if (driving && !car.reversing) this.beamLocal.makeTranslation(car.length / 2 - 0.2 + BEAM.length / 2, GROUND.lampPool.lift, 0).premultiply(this.scratch);
    this.beams.setMatrixAt(i, driving && !car.reversing ? this.beamLocal : HIDDEN);
    // The sign rides on the roof, in the body's frame; lit while the taxi is free.
    if (car.taxi && driving) this.lift.makeTranslation(TAXI_SIGN.along, CAR_SIZES[car.model].height + TAXI_SIGN.lift, 0).premultiply(this.body);
    this.signs.setMatrixAt(i, car.taxi && driving ? this.lift : HIDDEN);
    if (car.taxi) this.signs.setColorAt(i, car.hired ? this.color.setRGB(0.22, 0.2, 0.16) : this.color.setRGB(1, 1, 1));
    // The dark under it, a little wider and longer than the car, just over the asphalt.
    if (!away) this.shadeLocal.makeScale(car.length + SHADE_MARGIN, 1, CAR_SIZES[car.model].width + SHADE_MARGIN).setPosition(0, GROUND.carShade.lift, 0).premultiply(this.scratch);
    this.shades.setMatrixAt(i, away ? HIDDEN : this.shadeLocal);
    // Bars on the roof.
    const middle = ROOF_MIDDLE[car.model];
    const racked = !away && middle !== undefined && this.racked[i] === true;
    if (racked) this.part.makeTranslation(middle, CAR_SIZES[car.model].height, 0).premultiply(this.body);
    this.racks.setMatrixAt(i, racked ? this.part : HIDDEN);
    this.showScreen(car, i, away);
  }

  /** The two wipers (sweeping while it rains and the car drives) and a ticket under one (parked, ticketed), on the windscreen. */
  private showScreen(car: Car, i: number, away: boolean): void {
    const screen = this.screens.get(car.model)!;
    const sweep = car.active && this.wiping ? this.wipe : 0;
    const angle = WIPER.rest + WIPER.sweep * sweep;
    for (let k = 0; k < 2; k++) {
      if (away) {
        this.wipers.setMatrixAt(i * 2 + k, HIDDEN);
        continue;
      }
      // Along the foot, then up the glass: the blade's way, its normal the glass's.
      this.basisX.set(0, 0, 1).multiplyScalar(Math.cos(angle)).addScaledVector(screen.up, Math.sin(angle));
      this.basisZ.crossVectors(this.basisX, screen.normal);
      this.part.makeBasis(this.basisX, screen.normal, this.basisZ);
      const z = (k === 0 ? -1 : 0) * screen.wipers - 0.08;
      this.part.setPosition(screen.foot.x + screen.normal.x * 0.01, screen.foot.y + screen.normal.y * 0.01, z);
      this.wipers.setMatrixAt(i * 2 + k, this.lift.multiplyMatrices(this.body, this.part));
    }
    if (away || !car.ticketed) {
      this.tickets.setMatrixAt(i, HIDDEN);
      return;
    }
    this.part.makeBasis(this.basisX.set(0, 0, 1), screen.normal, this.basisZ.crossVectors(this.basisX, screen.normal));
    this.part.setPosition(screen.foot.x + screen.up.x * 0.1, screen.foot.y + screen.up.y * 0.1, -0.25);
    this.tickets.setMatrixAt(i, this.lift.multiplyMatrices(this.body, this.part));
  }

  /** Uploads what `show` wrote: the sets moved since the last call (then forgotten), and, if any car moved, the per-car meshes and the culling sphere. */
  commit(cars: readonly Car[], moved: boolean): void {
    for (const set of this.touched) this.flag(set);
    this.touched.clear();
    if (!moved) return;
    for (const mesh of [this.beams, this.signs, this.heads, this.shoulders, this.shades, this.wipers, this.racks, this.tickets]) mesh.instanceMatrix.needsUpdate = true;
    if (this.signs.instanceColor) this.signs.instanceColor.needsUpdate = true;
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

/** A shape's wheels' radius. */
function wheelRadius(model: CarModelId): number {
  return VEHICLES[model === 'hatch' ? 'car' : model === 'city' ? 'cityCar' : model].wheelRadius;
}

/** Two bars across a roof on four feet, centred on the roof's middle, for a car about 1.75 m wide. */
function rackGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const x of [-0.42, 0.42]) {
    parts.push(new THREE.BoxGeometry(0.05, 0.03, 1.3).translate(x, 0.075, 0));
    for (const z of [-0.6, 0.6]) parts.push(new THREE.BoxGeometry(0.07, 0.06, 0.05).translate(x, 0.03, z));
  }
  const merged = mergeGeometries(parts)!;
  for (const g of parts) g.dispose();
  return merged;
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
