import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import type { PaintedFront } from './Buildings';
import type { Holiday } from '@/time/season';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { snowCovered } from './snowCover';
import { nightnessOf } from './streetAir';
import { FacadeFrame } from './relief/facadeFrame';
import { TriBuilder } from './relief/TriBuilder';
import { TexQuads, type UvRect } from './shopfronts/TexQuads';
import { hasShopfront } from './shopfronts/shopfrontPlan';
import { LETTERING, letteringFont } from '../city/shopLooks';
import { FACADE, layMesh } from '../surface/layers';
import { lcg } from '@/random';

/** Facades painted at least this finely (the near rows) are dressed. */
const NEAR = 20;
/** A wreath on a door: its ring, its height on the door, how far out (a residents' door's leaves, a shop's glass). */
const WREATH = { radius: 0.2, tube: 0.06, y: 1.7, outResidents: 0.08, outShop: 0.05 };
/** A pumpkin on a doorstep: its size, how far either side of the door's middle, how far out on the step. */
const PUMPKIN = { radius: 0.15, aside: 0.58, out: 0.2, step: 0.14 };
const WREATH_GEOMETRY = new THREE.TorusGeometry(WREATH.radius, WREATH.tube, 6, 18);
const BERRY = new THREE.SphereGeometry(0.018, 5, 4);
const PUMPKIN_GEOMETRY = (() => {
  // Ribbed: the radius dipping between each of the ten ribs.
  const g = new THREE.SphereGeometry(1, 20, 10);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const rib = 1 - 0.08 * Math.abs(Math.sin(Math.atan2(v.z, v.x) * 5));
    p.setXYZ(i, v.x * rib * 1.15, v.y * 0.82, v.z * rib * 1.15);
  }
  g.computeVertexNormals();
  return g;
})();
const STEM = new THREE.CylinderGeometry(0.12, 0.18, 1, 6);

const m = new THREE.Matrix4();
const s = new THREE.Matrix4();

/**
 * The holidays on the near facades (`currentHoliday`), besides the lights over the street and round the trees
 * (`StreetChristmas`, `STREET_PLAN.decor`): at Christmas a wreath with its red bow and berries on every residents' door
 * and most shop doors, sprayed snow and stars in the shops' windows; at Halloween a carved pumpkin or two on the
 * residents' steps, grinning at night, and paper bats and a cobweb in the shops' windows. Decoration: nothing collides.
 */
export class StreetHolidays extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly glow: THREE.MeshBasicMaterial | null = null;
  /** The candles' flicker's phase (seconds). */
  private flicker = 0;

  constructor(
    fronts: readonly PaintedFront[],
    private readonly holiday: Holiday,
    private readonly dayNight: DayNight,
  ) {
    super();
    this.name = 'StreetHolidays';
    const b = new TriBuilder();
    const faces = new TriBuilder();
    const decals = new TexQuads();
    const random = lcg(holiday === 'christmas' ? 1225 : 3110);
    for (const front of fronts) {
      if (front.spec.detail < NEAR) continue;
      const frame = new FacadeFrame(front.spec);
      const f = frame.matrix(0, 0);
      for (const door of front.features.doors) {
        // Not a way in the player walks through (the sas's): nothing on it or before it.
        if ((front.spec.openings ?? []).some((o) => Math.abs(o.at - door.s) < o.width)) continue;
        if (holiday === 'christmas' && (!door.shop || random() < 0.7)) wreath(b, f, door.s, door.shop ? WREATH.outShop : WREATH.outResidents);
        if (holiday === 'halloween' && door.step) {
          pumpkin(b, faces, f, door.s - PUMPKIN.aside, PUMPKIN.radius * (0.9 + random() * 0.3), random);
          if (random() < 0.6) pumpkin(b, faces, f, door.s + PUMPKIN.aside, PUMPKIN.radius * (0.7 + random() * 0.3), random);
        }
      }
      for (const w of front.features.windows) {
        if (w.kind === 'shut' || hasShopfront(w.kind) || w.s1 - w.s0 < 1.1 || random() < 0.35) continue;
        decals.quad(f, (w.s0 + w.s1) / 2, (w.y0 + w.y1) / 2, FACADE.lettering.lift, w.s1 - w.s0, w.y1 - w.y0, decalCell(holiday, random() < 0.5 ? 0 : 1));
      }
    }
    if (!b.isEmpty) {
      const mesh = new THREE.Mesh(b.build(), snowCovered(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
    }
    if (!faces.isEmpty) {
      this.glow = new THREE.MeshBasicMaterial({ vertexColors: true });
      this.add(new THREE.Mesh(faces.build(), this.glow));
    }
    if (!decals.isEmpty) {
      const mesh = new THREE.Mesh(decals.build(), new THREE.MeshStandardMaterial({ map: decalAtlas(holiday), roughness: 0.6, transparent: true, depthWrite: false }));
      this.add(layMesh(mesh, FACADE.lettering));
    }
    this.update(0);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** The pumpkins' candles: dark by day, flickering at night. */
  update(dt: number): void {
    if (!this.glow) return;
    this.flicker = (this.flicker + dt) % 1000;
    const night = THREE.MathUtils.smoothstep(nightnessOf(this.dayNight.state), 0.15, 0.6);
    const flicker = 0.85 + 0.15 * Math.sin(this.flicker * 13) * Math.sin(this.flicker * 7.1);
    this.glow.color.setScalar(this.holiday === 'halloween' ? 0.12 + 1.6 * night * flicker : 0);
  }
}

/** A wreath at door `s`, `out` from the wall: the green ring, a red bow at its foot, berries round it. */
function wreath(b: TriBuilder, f: THREE.Matrix4, at: number, out: number): void {
  m.makeTranslation(at, WREATH.y, out + WREATH.tube).premultiply(f);
  b.geometry(m, WREATH_GEOMETRY, '#2a5a32');
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    s.makeTranslation(at + Math.cos(a) * WREATH.radius, WREATH.y + Math.sin(a) * WREATH.radius, out + WREATH.tube * 2.1).premultiply(f);
    b.geometry(s, BERRY, '#c8201e');
  }
  b.box(f, at - 0.06, WREATH.y - WREATH.radius, out + WREATH.tube * 2.2, 0.1, 0.07, 0.03, '#b81a1a');
  b.box(f, at + 0.06, WREATH.y - WREATH.radius, out + WREATH.tube * 2.25, 0.1, 0.07, 0.03, '#b81a1a');
}

/** A carved pumpkin on the step at s: its ribbed body, its stem, its face (eyes and a grin, lit from inside at night). */
function pumpkin(b: TriBuilder, faces: TriBuilder, f: THREE.Matrix4, at: number, r: number, random: () => number): void {
  const y = PUMPKIN.step + r * 0.8;
  const turn = (random() - 0.5) * 0.6;
  const base = new THREE.Matrix4().makeTranslation(at, y, PUMPKIN.out).premultiply(f).multiply(new THREE.Matrix4().makeRotationY(turn));
  m.copy(base).multiply(s.makeScale(r, r, r));
  b.geometry(m, PUMPKIN_GEOMETRY, '#e0741e');
  m.copy(base).multiply(s.makeTranslation(0, r * 0.88, 0)).multiply(new THREE.Matrix4().makeScale(r * 0.25, r * 0.4, r * 0.25));
  b.geometry(m, STEM, '#4a5a2a');
  // The face, just proud of the front: two triangle eyes and a jagged grin.
  const z = r * 1.08;
  const glow = '#ffb040';
  faces.triangle(base, [-r * 0.42, r * 0.12, z], [-r * 0.14, r * 0.12, z], [-r * 0.28, r * 0.4, z * 0.97], glow);
  faces.triangle(base, [r * 0.14, r * 0.12, z], [r * 0.42, r * 0.12, z], [r * 0.28, r * 0.4, z * 0.97], glow);
  const grin: [number, number][] = [[-0.5, -0.12], [-0.3, -0.3], [-0.12, -0.18], [0, -0.36], [0.12, -0.18], [0.3, -0.3], [0.5, -0.12]];
  for (let i = 0; i < grin.length - 1; i++) {
    const [x0, y0] = grin[i]!;
    const [x1, y1] = grin[i + 1]!;
    faces.triangle(base, [x0 * r, y0 * r, z * 0.98], [x1 * r, y1 * r, z * 0.98], [(x0 + x1) * 0.5 * r, -0.08 * r, z * 0.99], glow);
  }
}

/** A window's decal: its holiday's cell (two of each). */
function decalCell(holiday: Holiday, which: number): UvRect {
  const i = (holiday === 'christmas' ? 0 : 2) + which;
  return { u0: i / 4, v0: 0, u1: (i + 1) / 4, v1: 1 };
}

/** The windows' decals: sprayed snow in the corners with stars, the season's greetings; paper bats and a cobweb, BOO. */
function decalAtlas(holiday: Holiday): THREE.CanvasTexture {
  const w = 256;
  const h = 256;
  const [canvas, ctx] = createCanvas(w * 4, h);
  const random = lcg(holiday === 'christmas' ? 77 : 31);
  for (let c = 0; c < 4; c++) {
    const x = c * w;
    if (c < 2) {
      // Sprayed snow drifting up from the bottom corners, a few stars and flakes.
      for (const [cx, cy] of [[x, h], [x + w, h]] as const) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, w * 0.45);
        g.addColorStop(0, 'rgba(250,250,255,0.95)');
        g.addColorStop(0.6, 'rgba(250,250,255,0.6)');
        g.addColorStop(1, 'rgba(250,250,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x, 0, w, h);
      }
      ctx.fillStyle = 'rgba(250,250,255,0.85)';
      for (let i = 0; i < 9; i++) star(ctx, x + 30 + random() * (w - 60), 20 + random() * h * 0.5, 5 + random() * 8);
      if (c === 1) {
        ctx.font = letteringFont(LETTERING.script, 30);
        ctx.textAlign = 'center';
        ctx.fillText('Season’s Greetings', x + w / 2, h * 0.32);
      }
    } else {
      // Paper bats flying across; a cobweb in the top corner; BOO in orange on one.
      ctx.fillStyle = '#141414';
      for (let i = 0; i < 5; i++) bat(ctx, x + 30 + random() * (w - 60), 30 + random() * h * 0.6, 12 + random() * 10);
      ctx.strokeStyle = 'rgba(240,240,240,0.8)';
      ctx.lineWidth = 1.5;
      const ox = c === 2 ? x : x + w;
      const dir = c === 2 ? 1 : -1;
      for (let a = 0; a <= 4; a++) {
        ctx.beginPath();
        ctx.moveTo(ox, 0);
        ctx.lineTo(ox + dir * Math.cos((a / 4) * Math.PI * 0.5) * 90, Math.sin((a / 4) * Math.PI * 0.5) * 90);
        ctx.stroke();
      }
      for (let r = 20; r <= 90; r += 18) {
        ctx.beginPath();
        ctx.arc(ox, 0, r, c === 2 ? 0 : Math.PI / 2, c === 2 ? Math.PI / 2 : Math.PI);
        ctx.stroke();
      }
      if (c === 3) {
        ctx.fillStyle = '#f07a1a';
        ctx.font = letteringFont(LETTERING.condensed, 52);
        ctx.textAlign = 'center';
        ctx.fillText('BOO!', x + w / 2, h * 0.82);
      }
    }
  }
  return toTexture(canvas, 'facing');
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

function bat(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x - r * 0.6, y - r * 0.6, x - r * 1.6, y - r * 0.3);
  ctx.quadraticCurveTo(x - r * 1.1, y, x - r * 1.2, y + r * 0.3);
  ctx.quadraticCurveTo(x - r * 0.6, y + r * 0.05, x, y + r * 0.35);
  ctx.quadraticCurveTo(x + r * 0.6, y + r * 0.05, x + r * 1.2, y + r * 0.3);
  ctx.quadraticCurveTo(x + r * 1.1, y, x + r * 1.6, y - r * 0.3);
  ctx.quadraticCurveTo(x + r * 0.6, y - r * 0.6, x, y);
  ctx.fill();
}
