import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { wakefulnessAt } from '../props/outdoors/wakefulness';
import { NIGHT_SCALE, PARAPET, facadeHeight, paintFacade, type AtlasSlot, type NightLight } from './facadePainter';
import { nightnessOf } from './streetAir';
import type { FacadeSpec } from './streetPlan';

export interface BuildingsOptions {
  /** Scales every facade's `detail` (lower on low quality). */
  detailScale: number;
  anisotropy: number;
  /** The retro games shop's display colours (today's market stock), if known. */
  shopGoods: readonly string[] | null;
}

const ATLAS_WIDTH = 4096;
const PADDING = 4;
/** The cornice ledge along each roofline: how far it stands out and how tall it is. */
const LEDGE = { depth: 0.38, height: 0.4 };
/** Seconds between two looks at the clock, and the least time between two uploads of the night map. */
const CHECK_EVERY = 1;
const UPLOAD_EVERY = 6;

interface Placed {
  spec: FacadeSpec;
  width: number;
  height: number;
  slot: AtlasSlot;
}

/**
 * Every building face along the street, as one mesh with one material: each face is a quad (and a
 * cornice ledge along its roofline) whose painted facade (`paintFacade`) sits in a shared canvas
 * atlas, shelf-packed. A second, quarter-size atlas holds the lit windows for the night
 * (`emissiveMap`): each light comes on at its own point of dusk and goes out when the city's
 * wakefulness drops below its curfew, as in the painted view; the night map is repainted where
 * lights change and re-uploaded at most every `UPLOAD_EVERY` seconds (a few times a game hour).
 * One draw call for the whole street's architecture (two with the sun's shadow).
 */
export class Buildings extends THREE.Mesh implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly lights: NightLight[] = [];
  private readonly on: boolean[];
  private readonly night: CanvasRenderingContext2D;
  private readonly nightTexture: THREE.CanvasTexture;
  private readonly dayNight: DayNight;
  private checkClock = CHECK_EVERY;
  private sinceUpload = UPLOAD_EVERY;
  private dirty = false;

  constructor(facades: readonly FacadeSpec[], dayNight: DayNight, options: BuildingsOptions) {
    const placed = pack(facades, options.detailScale);
    const atlasHeight = Math.ceil(Math.max(...placed.map((p) => p.slot.y + p.height * p.slot.k)) / 256) * 256;
    const [canvas, ctx] = createCanvas(ATLAS_WIDTH, atlasHeight);
    const [nightCanvas, night] = createCanvas(Math.round(ATLAS_WIDTH * NIGHT_SCALE), Math.round(atlasHeight * NIGHT_SCALE));
    night.fillStyle = '#000';
    night.fillRect(0, 0, nightCanvas.width, nightCanvas.height);
    const lights: NightLight[] = [];
    for (const p of placed) lights.push(...paintFacade(ctx, p.spec, p.width, p.slot, options.shopGoods));

    const map = toTexture(canvas, options.anisotropy);
    const nightTexture = toTexture(nightCanvas, options.anisotropy);
    const material = new THREE.MeshStandardMaterial({ map, emissiveMap: nightTexture, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.88, envMapIntensity: 0.4 });
    super(facadeGeometry(placed, ATLAS_WIDTH, atlasHeight), material);
    this.name = 'Buildings';
    this.castShadow = true;
    this.receiveShadow = true;
    this.lights = lights;
    this.on = lights.map(() => false);
    this.night = night;
    this.nightTexture = nightTexture;
    this.dayNight = dayNight;
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    const nightness = nightnessOf(s);
    const material = this.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = 1.3 * (0.03 + 0.97 * THREE.MathUtils.smoothstep(nightness, 0.1, 0.5));
    this.sinceUpload += dt;
    this.checkClock += dt;
    if (this.checkClock >= CHECK_EVERY) {
      this.checkClock = 0;
      this.relight(THREE.MathUtils.smoothstep(nightness, 0.15, 0.7), wakefulnessAt(s.hours));
    }
    if (this.dirty && this.sinceUpload >= UPLOAD_EVERY) {
      this.dirty = false;
      this.sinceUpload = 0;
      this.nightTexture.needsUpdate = true;
    }
  }

  /** Switches every light whose state changed on the night map (the upload waits for `update`). */
  private relight(dusk: number, wakefulness: number): void {
    const ctx = this.night;
    for (let i = 0; i < this.lights.length; i++) {
      const light = this.lights[i]!;
      const on = dusk > light.litAt && wakefulness >= light.curfew;
      if (on === this.on[i]) continue;
      this.on[i] = on;
      ctx.fillStyle = on ? light.color : '#000';
      ctx.fillRect(light.x, light.y, light.w, light.h);
      this.dirty = true;
    }
  }
}

/** Places every facade in the atlas: tallest first, left to right in shelves. */
function pack(facades: readonly FacadeSpec[], detailScale: number): Placed[] {
  const sized = facades.map((spec) => {
    const width = Math.hypot(spec.to[0] - spec.from[0], spec.to[1] - spec.from[1]);
    return { spec, width, height: facadeHeight(spec.storeys), k: spec.detail * detailScale };
  });
  const order = [...sized].sort((a, b) => b.height * b.k - a.height * a.k);
  const placed: Placed[] = [];
  let x = 0;
  let y = 0;
  let shelf = 0;
  for (const item of order) {
    const w = Math.ceil(item.width * item.k) + PADDING;
    const h = Math.ceil(item.height * item.k) + PADDING;
    if (x + w > ATLAS_WIDTH) {
      x = 0;
      y += shelf;
      shelf = 0;
    }
    placed.push({ spec: item.spec, width: item.width, height: item.height, slot: { x: x + PADDING / 2, y: y + PADDING / 2, k: item.k } });
    x += w;
    shelf = Math.max(shelf, h);
  }
  return placed;
}

/**
 * The quads and ledges of every facade in one geometry, uvs into the atlas. A face runs from
 * `from` to `to` (the left and right ends seen from the street) and faces the left-hand normal
 * (-dz, dx); the ledge is a box along its roofline whose faces all sample the painted cornice band.
 */
function facadeGeometry(placed: readonly Placed[], atlasW: number, atlasH: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const quad = (corners: number[], normal: [number, number, number], uv: number[]): void => {
    const base = positions.length / 3;
    positions.push(...corners);
    for (let i = 0; i < 4; i++) normals.push(...normal);
    uvs.push(...uv);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const { spec, width, height, slot } of placed) {
    const [ax, az] = spec.from;
    const [bx, bz] = spec.to;
    const nx = -(bz - az) / width;
    const nz = (bx - ax) / width;
    const u0 = slot.x / atlasW;
    const u1 = (slot.x + width * slot.k) / atlasW;
    const v = (y: number): number => 1 - (slot.y + (height - y) * slot.k) / atlasH;
    // The face itself.
    quad([ax, 0, az, bx, 0, bz, bx, height, bz, ax, height, az], [nx, 0, nz], [u0, v(0), u1, v(0), u1, v(height), u0, v(height)]);
    // The cornice ledge: front, underside and top, all in the cornice band.
    const y0 = height - PARAPET - 0.15;
    const y1 = y0 + LEDGE.height;
    const d = LEDGE.depth;
    const band = v(height - PARAPET + 0.05);
    const out = (x: number, z: number): [number, number] => [x + nx * d, z + nz * d];
    const [aox, aoz] = out(ax, az);
    const [box, boz] = out(bx, bz);
    const uvBand = [u0, band, u1, band, u1, band, u0, band];
    quad([aox, y0, aoz, box, y0, boz, box, y1, boz, aox, y1, aoz], [nx, 0, nz], uvBand);
    quad([ax, y0, az, bx, y0, bz, box, y0, boz, aox, y0, aoz], [0, -1, 0], uvBand);
    quad([aox, y1, aoz, box, y1, boz, bx, y1, bz, ax, y1, az], [0, 1, 0], uvBand);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  return geometry;
}
