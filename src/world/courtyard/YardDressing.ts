import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { part } from '../props/Prop';
import { INSET } from '../props/joinery';
import { cylinderMesh } from '../meshUtils';
import { METAL, paint, standard, timber } from '../materials/palette';
import { FACADE, GROUND, RENDER_ORDER, onSurface } from '../surface/layers';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { GrassTufts } from '../street/GrassTufts';
import { Climber } from '../street/Climber';
import { facadeHeight } from '../street/facadePainter';
import { COURTYARD } from '../measures/street';
import { COURTYARD_PLAN, COURTYARD_YARD } from './courtyardPlan';
import { inHours } from '@/time/clock';

const IRON = paint(0x26282a, 0.55);
const CAST = paint(0x3a3e3c, 0.5);
/** Seconds between two readings of the weather and the hour. */
const READ_EVERY = 1;
/** The washing is out by day (game hours) when the yard is dry. */
const WASHING = { from: 8, to: 19, wetUnder: 0.15 };
/** The solar stakes glow from dusk until their charge runs out (game hours past midnight). */
const STAKES_OUT = 2;
const GARMENTS = [0xd8d4c8, 0x3a5a8a, 0xc85a4a, 0xe8d890, 0x6a8a5a, 0xf2f0ea, 0x8a5a8a];

/**
 * What the walked courtyard has that the window views leave out (`COURTYARD_PLAN.dressing`, the street's frame like
 * `Courtyard`, placed at the same offset): the bench against our wall, the rotary airer on the lawn with the washing
 * out on dry days (it sways), the cast-iron downpipe in the corner and the drain gratings, puddles that stand after
 * rain and dry off, the tap and its hose reel, the meter cabinet and a climber on the wing, the lean-to over the bins,
 * solar stakes round the lawn that glow from dusk (emissive only, no light), a bucket in the sandpit, a ball on the
 * lawn, weeds at the walls' foot. Collides where a shin would: the bench, the airer's pole, the lean-to's posts.
 */
export class YardDressing extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  readonly colliders: THREE.Box3[] = [];
  private readonly washing = new THREE.Group();
  private readonly garments: THREE.Object3D[] = [];
  private readonly puddle: THREE.MeshStandardMaterial;
  private readonly glow: THREE.MeshStandardMaterial;
  private clock = READ_EVERY;
  private time = 0;

  constructor(private readonly dayNight: DayNight) {
    super();
    this.name = 'YardDressing';
    const d = COURTYARD_PLAN.dressing;
    this.bench(d.bench);
    this.airer(d.airer);
    this.downpipe(d.downpipe);
    const grate = grateMaterial();
    for (const [x, z] of d.drains) {
      const g = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42).rotateX(-Math.PI / 2), grate);
      g.position.set(x, GROUND.grate.lift, z);
      g.receiveShadow = true;
      this.add(g);
    }
    this.puddle = onSurface(new THREE.MeshStandardMaterial({ color: 0x2c3036, roughness: 0.04, metalness: 0, transparent: true, opacity: 0, depthWrite: false, envMapIntensity: 1.6 }), GROUND.puddle);
    for (const p of d.puddles) {
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(p.radius, 28).rotateX(-Math.PI / 2), this.puddle);
      mesh.scale.set(p.stretch, 1, 1);
      mesh.rotation.y = p.yaw;
      mesh.position.set(p.at[0], GROUND.puddle.lift, p.at[1]);
      mesh.renderOrder = RENDER_ORDER.groundGlow;
      mesh.receiveShadow = true;
      this.add(mesh);
    }
    this.tap(d.tap);
    this.meters(d.meters);
    const climber = new Climber(d.climber.width, d.climber.height, 57);
    climber.position.set(COURTYARD.east - 0.012, 0, d.climber.z);
    climber.rotation.y = -Math.PI / 2;
    this.add(climber);
    this.binShelter(d.binShelter);
    this.glow = new THREE.MeshStandardMaterial({ color: 0xe8f0e0, roughness: 0.3, emissive: 0xfff0c8, emissiveIntensity: 0 });
    this.stakes(d.stakes);
    this.toys(d.bucket, d.ball);
    this.add(new GrassTufts(d.weeds.map((w) => ({ from: w.from, to: w.to, width: 0.08 })), 6, 73));
    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Flat things laid on a surface (the gratings, the puddles, the plate) take shadows, never cast them.
      mesh.receiveShadow = true;
      mesh.castShadow = !(mesh.material as THREE.Material).polygonOffset;
    });
    this.add(this.washing);
  }

  update(dt: number): void {
    this.time += dt;
    // The washing stirs in the air.
    if (this.washing.visible) {
      this.garments.forEach((g, i) => {
        g.rotation.x = 0.08 * Math.sin(this.time * 1.3 + i * 1.7) + 0.04 * Math.sin(this.time * 2.9 + i);
      });
    }
    this.clock += dt;
    if (this.clock < READ_EVERY) return;
    this.clock = 0;
    const { hours, wetness, snowCover, daylight } = this.dayNight.state;
    this.puddle.opacity = 0.7 * THREE.MathUtils.smoothstep(wetness, 0.1, 0.6) * (1 - snowCover);
    this.washing.visible = inHours(hours, WASHING) && wetness < WASHING.wetUnder && snowCover < 0.1;
    const lit = daylight < 0.2 && inHours(hours, { from: 12, to: 24 + STAKES_OUT });
    this.glow.emissiveIntensity = lit ? 1.4 : 0;
  }

  dispose(): void {
    this.puddle.dispose();
    this.glow.dispose();
  }

  /** A slatted park bench: two cast-iron ends, three seat slats, two back slats; its front to +z before its yaw. */
  private bench({ at, yaw, width }: { at: readonly [number, number]; yaw: number; width: number }): void {
    const g = new THREE.Group();
    const slat = timber(0x8a6a48, 0.8);
    for (const side of [-1, 1]) {
      const x = (side * (width - 0.12)) / 2;
      part(g, 0.05, 0.43, 0.06, CAST, { x, y: 0.215, z: 0.17 });
      part(g, 0.05, 0.8, 0.06, CAST, { x, y: 0.4, z: -0.2 });
      part(g, 0.05, 0.05, 0.42, CAST, { x, y: 0.4, z: -0.02 });
    }
    for (let i = 0; i < 3; i++) part(g, width, 0.03, 0.11, slat, { y: 0.44, z: 0.15 - i * 0.13 });
    for (let i = 0; i < 2; i++) part(g, width, 0.1, 0.025, slat, { y: 0.58 + i * 0.14, z: -0.235 });
    g.position.set(at[0], 0, at[1]);
    g.rotation.y = yaw;
    this.add(g);
    this.collide(at[0] - width / 2, at[1] - 0.3, at[0] + width / 2, at[1] + 0.3, 0.5);
  }

  /** The rotary airer: its pole, four arms, three loops of line, the washing pegged on the outer two. */
  private airer({ at, radius, height }: { at: readonly [number, number]; radius: number; height: number }): void {
    const g = new THREE.Group();
    const alloy = METAL.satinSteel();
    g.add(cylinderMesh(0.018, height, alloy, { y: height / 2 }));
    const line = paint(0xd8d8d0, 0.6);
    const arms = 4;
    for (let a = 0; a < arms; a++) {
      const arm = part(g, radius, 0.012, 0.012, alloy, {});
      const angle = (a * Math.PI * 2) / arms + Math.PI / 4;
      arm.position.set((Math.cos(angle) * radius) / 2, height - 0.04, (-Math.sin(angle) * radius) / 2);
      arm.rotation.y = angle;
    }
    // Three square loops of line between the arms.
    const loops = [0.45, 0.75, 1].map((f) => f * radius);
    loops.forEach((r) => {
      const side = r * Math.SQRT2;
      for (let a = 0; a < arms; a++) {
        const seg = part(g, side, 0.004, 0.004, line, {});
        const angle = (a * Math.PI * 2) / arms;
        seg.position.set((Math.cos(angle) * r) / Math.SQRT2, height - 0.045, (-Math.sin(angle) * r) / Math.SQRT2);
        seg.rotation.y = angle + Math.PI / 2;
      }
    });
    // The washing: on the two outer loops, a garment every so often, hanging from the line.
    let n = 0;
    for (const r of loops.slice(1)) {
      for (let a = 0; a < arms; a++) {
        const angle = (a * Math.PI * 2) / arms;
        const side = r * Math.SQRT2;
        for (const t of [-0.25, 0.22]) {
          const color = GARMENTS[n % GARMENTS.length]!;
          const big = n % 3 === 0;
          const w = big ? 0.55 : 0.32;
          const h = big ? 0.7 : 0.42;
          const garment = new THREE.Group();
          const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, h), standard({ color, roughness: 1, side: THREE.DoubleSide }));
          cloth.position.y = -h / 2;
          cloth.castShadow = true;
          garment.add(cloth);
          const cx = (Math.cos(angle) * r) / Math.SQRT2;
          const cz = (-Math.sin(angle) * r) / Math.SQRT2;
          const along = new THREE.Vector3(Math.cos(angle + Math.PI / 2), 0, -Math.sin(angle + Math.PI / 2)).multiplyScalar(t * side);
          garment.position.set(cx + along.x, height - 0.05, cz + along.z);
          garment.rotation.order = 'YXZ';
          garment.rotation.y = angle + Math.PI / 2;
          this.garments.push(garment);
          this.washing.add(garment);
          n++;
        }
      }
    }
    this.washing.position.set(at[0], 0, at[1]);
    g.position.set(at[0], 0, at[1]);
    this.add(g);
    this.collide(at[0] - 0.08, at[1] - 0.08, at[0] + 0.08, at[1] + 0.08, height);
  }

  /** The cast-iron downpipe from the gutter to the gully: a hopper head under the parapet, brackets, a shoe at its foot. */
  private downpipe({ x, storeys }: { x: number; storeys: number }): void {
    const top = facadeHeight(storeys) - 0.5;
    // Stood off the wall by its brackets, clear of the plinth (`YardGroundFloors`).
    const z = COURTYARD.back - 0.1;
    this.add(cylinderMesh(0.045, top - 0.25, CAST, { x, y: 0.25 + (top - 0.25) / 2, z }));
    part(this, 0.2, 0.22, 0.16, CAST, { x, y: top + 0.11, z: z + 0.01 });
    for (let y = 1.2; y < top; y += 2.2) part(this, 0.13, 0.03, 0.11, IRON, { x, y, z: COURTYARD.back - 0.055 });
    const shoe = cylinderMesh(0.045, 0.3, CAST, { x, y: 0.16, z: z - 0.09 });
    shoe.rotation.x = 0.9;
    this.add(shoe);
  }

  /** The yard's tap on our wall, a green hose wound on its reel under it. */
  private tap({ x, y }: { x: number; y: number }): void {
    const z = COURTYARD.back;
    part(this, 0.06, 0.06, 0.04, METAL.agedBrass(), { x, y, z: z - 0.02 });
    part(this, 0.025, 0.025, 0.12, METAL.agedBrass(), { x, y: y - 0.01, z: z - 0.09 });
    part(this, 0.05, 0.014, 0.014, paint(0xa82a1a, 0.5), { x, y: y + 0.045, z: z - 0.05 });
    const reel = new THREE.Group();
    const frame = paint(0x2e6a3a, 0.5);
    for (const side of [-1, 1]) {
      const disc = cylinderMesh(0.2, 0.015, frame, { x: side * 0.11, y: 0.25 });
      disc.rotation.z = Math.PI / 2;
      reel.add(disc);
    }
    const wound = cylinderMesh(0.15, 0.2, paint(0x3a8a3a, 0.45), { y: 0.25 });
    wound.rotation.z = Math.PI / 2;
    reel.add(wound);
    part(reel, 0.24, 0.02, 0.2, frame, { y: 0.01 });
    reel.position.set(x, 0, z - 0.3);
    this.add(reel);
    this.collide(x - 0.14, z - 0.52, x + 0.14, z - 0.08, 0.45);
  }

  /** The meter cabinet on the wing's wall: grey, its door with a vent and a triangle sticker. */
  private meters({ z, bottom, width, height }: { z: number; bottom: number; width: number; height: number }): void {
    const x = COURTYARD.east;
    const depth = 0.22;
    // Its door's leaf, and what is fixed on it (the vent's louvres, the sticker), each sunk a hair into what it is on.
    const DOOR = 0.012;
    const FIT = 0.008;
    part(this, depth, height, width, paint(0x9a9c96, 0.6), { x: x - depth / 2, y: bottom + height / 2, z });
    part(this, DOOR, height - 0.06, width - 0.06, paint(0xa8aaa4, 0.55), { x: x - depth - DOOR / 2 + INSET, y: bottom + height / 2, z });
    for (let i = 0; i < 4; i++) part(this, FIT, 0.012, width * 0.4, paint(0x5a5c58, 0.6), { x: x - depth - DOOR - FIT / 2 + INSET, y: bottom + height - 0.12 - i * 0.03, z });
    part(this, FIT, 0.08, 0.09, paint(0xe8c020, 0.5), { x: x - depth - DOOR - FIT / 2 + INSET, y: bottom + height * 0.45, z: z + width * 0.2 });
  }

  /** The lean-to over the bins: posts at its front, a beam, a corrugated roof falling from the rear building's wall. */
  private binShelter({ x0, x1, depth, high, low, posts }: { x0: number; x1: number; depth: number; high: number; low: number; posts: readonly number[] }): void {
    const wall = COURTYARD.far;
    const front = wall + depth;
    const wood = timber(0x6a5038, 0.85);
    for (const x of posts) {
      part(this, 0.07, low, 0.07, wood, { x, y: low / 2, z: front - 0.04 });
      this.collide(x - 0.04, front - 0.08, x + 0.04, front, low);
    }
    part(this, x1 - x0, 0.09, 0.08, wood, { x: (x0 + x1) / 2, y: low + 0.045, z: front - 0.04 });
    part(this, x1 - x0, 0.08, 0.05, wood, { x: (x0 + x1) / 2, y: high + 0.04, z: wall + 0.025 });
    const run = Math.hypot(depth + 0.1, high - low);
    const roof = part(this, x1 - x0 + 0.12, 0.025, run, paint(0x6a7072, 0.6), { x: (x0 + x1) / 2, y: (high + low) / 2 + 0.1, z: wall + (depth + 0.1) / 2 });
    roof.rotation.x = Math.atan2(high - low, depth + 0.1);
    // Its enamel plate on the wall: which bin for what.
    const [canvas, ctx] = createCanvas(768, 288);
    ctx.scale(3, 3);
    ctx.fillStyle = '#f2efe6';
    ctx.fillRect(0, 0, 256, 96);
    ctx.strokeStyle = '#2d5aa0';
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, 244, 84);
    ctx.fillStyle = '#2d5aa0';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ORDURES · TRI', 128, 44);
    ctx.font = '20px sans-serif';
    ctx.fillText('lids shut, please', 128, 74);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.16), onSurface(new THREE.MeshStandardMaterial({ map: toTexture(canvas), roughness: 0.3 }), FACADE.card));
    plate.position.set((x0 + x1) / 2 - 1.2, high - 0.2, wall + FACADE.card.lift);
    this.add(plate);
  }

  /** Solar stakes round the lawn's curb: a dark stake, a frosted cap that glows from dusk. */
  private stakes({ alongX, alongZ }: { alongX: number; alongZ: number }): void {
    const { lawn } = COURTYARD_YARD;
    const out = 0.22;
    const spots: [number, number][] = [];
    for (let i = 0; i < alongX; i++) {
      const x = lawn.x0 + ((i + 0.5) * (lawn.x1 - lawn.x0)) / alongX;
      spots.push([x, lawn.z0 - out], [x, lawn.z1 + out]);
    }
    for (let i = 0; i < alongZ; i++) {
      const z = lawn.z0 + ((i + 0.5) * (lawn.z1 - lawn.z0)) / alongZ;
      spots.push([lawn.x0 - out, z], [lawn.x1 + out, z]);
    }
    const stake = paint(0x1e1e20, 0.5);
    for (const [x, z] of spots) {
      this.add(cylinderMesh(0.008, 0.3, stake, { x, y: 0.15, z }));
      this.add(cylinderMesh(0.035, 0.05, this.glow, { x, y: 0.325, z }));
      part(this, 0.08, 0.012, 0.08, stake, { x, y: 0.356, z });
    }
  }

  /** A bucket and spade left in the sandpit, a ball on the lawn. */
  private toys(bucket: readonly [number, number], ball: readonly [number, number]): void {
    const sand = 0.2;
    this.add(cylinderMesh(0.075, 0.12, paint(0xd83a2a, 0.45), { x: bucket[0], y: sand + 0.06, z: bucket[1] }, { radiusBottom: 0.055 }));
    const spade = part(this, 0.06, 0.008, 0.26, paint(0x2a6ad8, 0.45), { x: bucket[0] + 0.18, y: sand + 0.03, z: bucket[1] + 0.05 });
    spade.rotation.set(0.12, 0.6, 0);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.1, 18, 12), paint(0xe8b820, 0.5));
    b.position.set(ball[0], 0.03 + 0.1, ball[1]);
    this.add(b);
  }

  private collide(x0: number, z0: number, x1: number, z1: number, high: number): void {
    this.colliders.push(new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, high, z1)));
  }
}

/** A cast-iron grating: its frame and slots, on its own small canvas (alpha where the slots are dark). */
function grateMaterial(): THREE.MeshStandardMaterial {
  const [canvas, ctx] = createCanvas(256, 256);
  ctx.scale(4, 4);
  ctx.fillStyle = '#2e2d2b';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#0c0c0c';
  for (let i = 0; i < 7; i++) ctx.fillRect(9 + i * 7, 8, 4, 48);
  return onSurface(new THREE.MeshStandardMaterial({ map: toTexture(canvas), roughness: 0.55 }), GROUND.grate);
}
