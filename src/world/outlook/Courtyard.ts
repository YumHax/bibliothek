import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, roundRect, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { part } from '../props/Prop';
import { paint } from '../materials/palette';
import { seasonalLawn } from '../props/outdoors/paint';
import { QuadBuilder } from '../street/QuadBuilder';
import { lawnTile } from '../street/groundTextures';
import { facadeHeight } from '../street/facadePainter';
import { COURTYARD_YARD as yard } from './outlookPlan';

/** A sett's side (m) and how many to a texture tile. */
const SETT = 0.11;
const SETTS_PER_TILE = 9;
const SNOW = new THREE.Color(0xf2f4f8);
/** Seconds between two readings of the weather (the yard soaks and dries over game hours). */
const WEATHER_EVERY = 2;
/** The workshop's height over the yard: one storey and its parapet, as the street's plan has its front. */
const WORKSHOP_HEIGHT = facadeHeight(1);

/**
 * Our block's courtyard as the stairwell's windows see it (`COURTYARD_YARD`; the facades round it are the street's
 * own): granite setts, the lawn with its concrete curb (the chestnut on it is planted with the street's trees), the
 * workshop's back wall and tarred roof on the Park Street side, the wheelie bins along the rear building, the shed
 * against the wing, the carpet-beating rack, the sandpit, bikes against the wall. The setts and the lawn darken in the
 * rain and whiten under snow, as the street's ground does. Street-local, placed at the outlook's origin.
 */
export class Courtyard extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  private readonly surfaces: { material: THREE.MeshStandardMaterial; dry: THREE.Color; roughness: number; soaks: number }[] = [];
  private clock = WEATHER_EVERY;

  constructor(private readonly dayNight: DayNight, anisotropy: number) {
    super();
    this.name = 'Courtyard';
    const { setts, lawn, workshop } = yard;
    const tile = SETT * SETTS_PER_TILE;
    // The setts, and the lawn a hair over them, its curb round it.
    const ground = new QuadBuilder(tile).floor(setts.x0, setts.z0, setts.x1, setts.z1, 0);
    this.surface(ground.build(), settsTexture(anisotropy), 0.85, 0.7);
    const grass = lawnTile(seasonalLawn('#5d8a3c'), anisotropy);
    this.surface(new QuadBuilder(grass.metres).floor(lawn.x0, lawn.z0, lawn.x1, lawn.z1, 0.03).build(), grass.texture, 0.95, 0.2);
    const curb = paint(0xa8a49a, 0.85);
    const cx = (lawn.x0 + lawn.x1) / 2;
    const cz = (lawn.z0 + lawn.z1) / 2;
    const w = lawn.x1 - lawn.x0;
    const d = lawn.z1 - lawn.z0;
    part(this, w + 0.2, 0.08, 0.1, curb, { x: cx, y: 0.04, z: lawn.z0 - 0.05 });
    part(this, w + 0.2, 0.08, 0.1, curb, { x: cx, y: 0.04, z: lawn.z1 + 0.05 });
    part(this, 0.1, 0.08, d, curb, { x: lawn.x0 - 0.05, y: 0.04, z: cz });
    part(this, 0.1, 0.08, d, curb, { x: lawn.x1 + 0.05, y: 0.04, z: cz });

    // The workshop's back: a rendered wall with a door and two barred windows, a tarred flat roof behind its parapet.
    const wall = paint(workshop.wall, 0.92);
    const depthZ = workshop.z1 - workshop.z0;
    const midZ = (workshop.z0 + workshop.z1) / 2;
    const widthX = workshop.x1 - workshop.x0;
    part(this, widthX, WORKSHOP_HEIGHT, depthZ, wall, { x: workshop.x0 + widthX / 2, y: WORKSHOP_HEIGHT / 2, z: midZ });
    part(this, widthX - 0.4, 0.04, depthZ - 0.4, paint(workshop.roof, 0.95), { x: workshop.x0 + widthX / 2, y: WORKSHOP_HEIGHT - 0.5, z: midZ });
    part(this, 0.12, 0.08, depthZ + 0.1, paint(0x8a8680, 0.8), { x: workshop.x1 + 0.02, y: WORKSHOP_HEIGHT + 0.04, z: midZ });
    const face = workshop.x1 + 0.012;
    part(this, 0.03, 2.15, 1.0, paint(0x3a3430, 0.7), { x: face, y: 1.075, z: workshop.door });
    const glass = paint(0x2f3d48, 0.15);
    const bars = paint(0x2a2a2c, 0.5);
    for (const z of workshop.windows) {
      part(this, 0.03, 1.1, 1.3, glass, { x: face, y: 1.75, z });
      for (let i = -2; i <= 2; i++) part(this, 0.03, 1.1, 0.02, bars, { x: face + 0.03, y: 1.75, z: z + i * 0.26 });
      part(this, 0.1, 0.05, 1.45, paint(0x9a958c, 0.8), { x: face + 0.04, y: 1.18, z });
    }

    this.bins();
    this.shed();
    this.rack();
    this.sandpit();
    this.bikes();
    this.traverse((obj) => {
      if (!(obj as THREE.Mesh).isMesh) return;
      obj.castShadow = true;
      obj.receiveShadow = true;
    });
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock < WEATHER_EVERY) return;
    this.clock = 0;
    const { wetness, snowCover } = this.dayNight.state;
    for (const s of this.surfaces) {
      const wet = wetness * s.soaks;
      s.material.color.copy(s.dry).multiplyScalar(1 - 0.45 * wet).lerp(SNOW, snowCover * 0.85);
      s.material.roughness = THREE.MathUtils.lerp(s.roughness, 0.22, wet * (1 - snowCover));
    }
  }

  private surface(geometry: THREE.BufferGeometry, texture: THREE.Texture, roughness: number, soaks: number): void {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    const material = new THREE.MeshStandardMaterial({ map: texture, roughness, envMapIntensity: 0.6 });
    this.add(new THREE.Mesh(geometry, material));
    this.surfaces.push({ material, dry: material.color.clone(), roughness, soaks });
  }

  /** The wheelie bins: a dark grey body each, its lid in its colour, a pair of wheels. */
  private bins(): void {
    const body = paint(0x3a3c3e, 0.7);
    const wheel = paint(0x1a1a1a, 0.8);
    for (const { at, color } of yard.bins) {
      const [x, z] = at;
      part(this, 0.58, 1.0, 0.72, body, { x, y: 0.52, z });
      part(this, 0.62, 0.05, 0.76, paint(color, 0.6), { x, y: 1.045, z: z + 0.01 });
      part(this, 0.62, 0.16, 0.08, wheel, { x, y: 0.08, z: z - 0.3 });
    }
  }

  /** The shed: boarded walls, a door, a felt pent roof falling towards the yard. */
  private shed(): void {
    const { x0, x1, z0, z1, height, low } = yard.shed;
    const boards = paint(0x7a5a3c, 0.85);
    const w = x1 - x0;
    const d = z1 - z0;
    const mid = (height + low) / 2;
    part(this, w, mid, d, boards, { x: x0 + w / 2, y: mid / 2, z: z0 + d / 2 });
    part(this, 0.03, 1.85, 0.8, paint(0x5a4230, 0.8), { x: x0 - 0.015, y: 0.93, z: z0 + d / 2 });
    const roof = part(this, w + 0.3, 0.06, d + 0.3, paint(0x2e2e30, 0.9), { x: x0 + w / 2, y: mid + 0.05, z: z0 + d / 2 });
    roof.rotation.z = Math.atan2(height - low, w);
  }

  /** The carpet-beating rack: two steel posts and the bar between them. */
  private rack(): void {
    const { at, width, height } = yard.rack;
    const steel = paint(0x3a4a44, 0.5);
    const [x, z] = at;
    part(this, 0.05, height, 0.05, steel, { x: x - width / 2, y: height / 2, z });
    part(this, 0.05, height, 0.05, steel, { x: x + width / 2, y: height / 2, z });
    part(this, width + 0.05, 0.05, 0.05, steel, { x, y: height, z });
  }

  /** The sandpit: a timber frame round a patch of sand. */
  private sandpit(): void {
    const { x0, x1, z0, z1 } = yard.sandpit;
    const timber = paint(0x8a6a48, 0.85);
    const w = x1 - x0;
    const d = z1 - z0;
    part(this, w - 0.2, 0.2, d - 0.2, paint(0xd8c8a0, 0.95), { x: x0 + w / 2, y: 0.1, z: z0 + d / 2 });
    part(this, w, 0.28, 0.1, timber, { x: x0 + w / 2, y: 0.14, z: z0 + 0.05 });
    part(this, w, 0.28, 0.1, timber, { x: x0 + w / 2, y: 0.14, z: z1 - 0.05 });
    part(this, 0.1, 0.28, d, timber, { x: x0 + 0.05, y: 0.14, z: z0 + d / 2 });
    part(this, 0.1, 0.28, d, timber, { x: x1 - 0.05, y: 0.14, z: z0 + d / 2 });
  }

  /** Bikes leaned on the wing's wall: two wheels and a frame each, seen side on from the yard. */
  private bikes(): void {
    const tyre = paint(0x1c1c1c, 0.8);
    for (const { at, color } of yard.bikes) {
      const [x, z] = at;
      const frame = paint(color, 0.45);
      for (const dz of [-0.52, 0.52]) {
        const wheel = new THREE.Mesh(WHEEL, tyre);
        wheel.position.set(x, 0.34, z + dz);
        wheel.rotation.y = Math.PI / 2;
        this.add(wheel);
      }
      part(this, 0.04, 0.04, 1.0, frame, { x, y: 0.62, z });
      part(this, 0.04, 0.5, 0.04, frame, { x, y: 0.5, z: z - 0.12 });
      part(this, 0.2, 0.05, 0.1, paint(0x1a1a1a, 0.7), { x, y: 0.84, z: z - 0.14 });
      part(this, 0.45, 0.03, 0.03, frame, { x, y: 0.98, z: z + 0.42 });
    }
  }
}

/** A bicycle wheel: a thin tyre ring. */
const WHEEL = new THREE.TorusGeometry(0.33, 0.02, 6, 24);

/** Granite setts laid in rows, each its own grey, the joints darker: one tile `SETTS_PER_TILE` setts square. */
function settsTexture(anisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const [canvas, ctx] = createCanvas(size, size);
  const random = seededRandom(2417);
  ctx.fillStyle = '#56534e';
  ctx.fillRect(0, 0, size, size);
  const cell = size / SETTS_PER_TILE;
  for (let row = 0; row < SETTS_PER_TILE; row++) {
    const shift = row % 2 ? cell / 2 : 0;
    for (let col = -1; col < SETTS_PER_TILE; col++) {
      const x = col * cell + shift + 3;
      const y = row * cell + 3;
      const g = 118 + Math.floor(random() * 42);
      ctx.fillStyle = `rgb(${g}, ${g - 3}, ${g - 8})`;
      roundRect(ctx, x, y, cell - 6, cell - 6, 7);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fillRect(x + 4, y + 4, cell - 16, (cell - 6) / 3);
    }
  }
  return toTexture(canvas, anisotropy);
}
