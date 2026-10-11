import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import type { PaintedFront } from '../Buildings';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { snowCovered } from '../snowCover';
import { nightnessOf } from '../streetAir';
import { FacadeFrame } from './facadeFrame';
import { TriBuilder } from './TriBuilder';
import { TexQuads, type UvRect } from '../shopfronts/TexQuads';
import { PRINT_COUNT, paintPoster } from './posterArt';
import { WALL, layMesh } from '../../surface/layers';
import { hashInts, lcg } from '@/random';

/** Facades painted at least this finely (px per metre, the near rows) carry the small things fixed to their walls. */
const NEAR = 20;
/** A lantern on its bracket over a residents' door: how far over the door's head, its body, its arm's reach. */
const LANTERN = { over: 0.42, body: 0.2, height: 0.32, reach: 0.3 };
/** The burglar alarm's box high on a shop's pier, the shares of shops that have one. */
const ALARM = { y: 4.35, w: 0.26, h: 0.34, d: 0.09, share: 0.6 };
const ALARM_PAINTS = ['#c83a2a', '#2a4ab8', '#e8e6e0', '#e8c43a'];
/** The cables run along under the first floor's course, a share of fronts: their radius, how far off the wall, clips every so often. */
const CABLE = { radius: 0.009, out: 0.02, clip: 0.6, share: 0.7, under: 0.18, pair: 0.035, clipOut: 0.01 };
/** An air-conditioning unit under the odd window (its share), on its brackets. */
const AC = { w: 0.78, h: 0.52, d: 0.3, share: 0.07 };
/** Pigeon spikes along the odd sill (their share): the spikes' pitch and height. */
const SPIKES = { share: 0.28, pitch: 0.045, height: 0.11, base: 0.012, foot: 0.004 };
/** The poster atlas: a print per column, its torn copy under it, this many pixels a cell. */
const CELL = { w: 216, h: 302 };
const CABLE_GEOMETRY = new THREE.CylinderGeometry(1, 1, 1, 5).rotateZ(Math.PI / 2);
const LANTERN_GLASS = new THREE.Color('#ffd9a0');
const IRON = '#26282a';

const at = new THREE.Matrix4();
const scale = new THREE.Matrix4();

/**
 * The small things fixed to the near facades' walls, built from what `paintFacade` left (`Buildings.fronts`): a
 * lantern on a bracket over each residents' door (lit at dusk), a burglar alarm's box high on most shops' piers, the
 * telephone and power cables clipped along under the first floor's course (dropping down at one end), the odd
 * air-conditioning unit under a window, pigeon spikes along some sills, and the fly-posters pasted as sheets of their
 * own (`features.posters`, `posterArt`: sharp, where a far front keeps them painted). One mesh of vertex colours, the
 * lanterns' glass, the posters: three draw calls for the street. Decoration: nothing collides.
 */
export class WallMounts extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly glass: THREE.MeshBasicMaterial | null = null;

  constructor(
    fronts: readonly PaintedFront[],
    private readonly dayNight: DayNight,
  ) {
    super();
    this.name = 'WallMounts';
    const b = new TriBuilder();
    const lamps = new TriBuilder();
    const posters = new TexQuads();
    for (const front of fronts) {
      if (front.spec.detail < NEAR) continue;
      const frame = new FacadeFrame(front.spec);
      const m = frame.matrix(0, 0);
      const random = lcg(front.spec.seed * 389 + 11);
      // What is fixed to the wall loses the faces pressed on it (never seen).
      b.hideAgainst(...frame.wall(front.height));
      mounts(b, lamps, m, front, random);
      for (const p of front.features.posters) {
        const w = p.s1 - p.s0;
        const h = p.y1 - p.y0;
        posters.quad(m, (p.s0 + p.s1) / 2, (p.y0 + p.y1) / 2, WALL.paper.lift, w, h, posterCell(p.print, p.torn));
      }
    }
    if (!b.isEmpty) {
      const mesh = new THREE.Mesh(b.build(), snowCovered(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
    }
    if (!lamps.isEmpty) {
      this.glass = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xffffff });
      this.add(new THREE.Mesh(lamps.build(), this.glass));
    }
    if (!posters.isEmpty) {
      const map = posterAtlas();
      const mesh = new THREE.Mesh(posters.build(), new THREE.MeshStandardMaterial({ map, roughness: 0.88, alphaTest: 0.5 }));
      mesh.receiveShadow = true;
      mesh.name = 'Posters';
      this.add(layMesh(mesh, WALL.paper));
    }
    this.update();
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** The lanterns glow from dusk. */
  update(): void {
    if (!this.glass) return;
    const night = THREE.MathUtils.smoothstep(nightnessOf(this.dayNight.state), 0.15, 0.6);
    this.glass.color.setScalar(0.35 + 1.4 * night);
  }
}

/** One front's lanterns, alarm boxes, cables, units and spikes. */
function mounts(b: TriBuilder, lamps: TriBuilder, m: THREE.Matrix4, front: PaintedFront, random: () => number): void {
  const { features, width, spec } = front;
  for (const door of features.doors) {
    if (door.shop || !door.leaf) continue;
    // Not over the sas's way in: it has a lamp of its own inside.
    if ((spec.openings ?? []).some((o) => Math.abs(o.at - door.s) < o.width)) continue;
    lantern(b, lamps, m, door.s, door.height + 0.14 + LANTERN.over);
  }
  for (const shop of features.shopfronts) {
    if (shop.kind === 'shut' || random() > ALARM.share) continue;
    const s = random() < 0.5 ? shop.s0 + 0.35 : shop.s1 - 0.35;
    const paint = ALARM_PAINTS[hashInts(spec.seed, Math.round(shop.s0 * 10)) % ALARM_PAINTS.length]!;
    b.box(m, s, ALARM.y, ALARM.d / 2, ALARM.w, ALARM.h, ALARM.d, paint);
    b.box(m, s, ALARM.y - ALARM.h / 2 - 0.03, ALARM.d * 0.5, ALARM.w * 0.5, 0.04, ALARM.d * 0.6, '#f0f0ea');
  }
  const first = features.floors[0];
  if (first !== undefined && random() < CABLE.share && width > 3) {
    // Two cables side by side along the wall under the course, clipped, one dropping to the pavement at an end.
    const y = first - CABLE.under;
    for (const dy of [0, -CABLE.pair]) cable(b, m, 0.2, width - 0.2, y + dy, null);
    const drop = random() < 0.5 ? 0.35 : width - 0.35;
    cable(b, m, drop, drop, 0.6, y);
    for (let s = 0.5; s < width - 0.3; s += CABLE.clip) b.box(m, s, y - CABLE.pair / 2, (CABLE.out + CABLE.clipOut) / 2, 0.025, 0.07, CABLE.out + CABLE.clipOut, '#3a3a3a');
  }
  for (const c of features.casements) {
    if (c.y0 < 3.9 || !c.sill) continue;
    const mid = (c.s0 + c.s1) / 2;
    const r = random();
    if (r < AC.share && !c.flowers) {
      // On two brackets under the sill, its fan's grille facing out.
      const y = c.y0 - 0.2 - AC.h / 2;
      b.box(m, mid, y, AC.d / 2 + 0.06, AC.w, AC.h, AC.d, '#d8dad6');
      b.box(m, mid + AC.w * 0.18, y, AC.d + 0.065, AC.h * 0.7, AC.h * 0.7, 0.01, '#4a4c4e');
      for (const ds of [-0.28, 0.28]) b.box(m, mid + ds, y - AC.h / 2 - 0.02, (AC.d + 0.06) / 2, 0.03, 0.04, AC.d + 0.06, IRON);
    } else if (r < AC.share + SPIKES.share && !c.flowers) {
      spikes(b, m, c.s0 - 0.06, c.s1 + 0.06, c.y0);
    }
  }
}

/** A carriage lantern at (s, y) on its iron arm: a cap, the glass (lit at night: `lamps`), a finial. */
function lantern(b: TriBuilder, lamps: TriBuilder, m: THREE.Matrix4, s: number, y: number): void {
  const { body, height, reach } = LANTERN;
  b.box(m, s, y - 0.05, reach / 2, 0.025, 0.025, reach, IRON);
  b.box(m, s, y + 0.06, 0.02, 0.1, 0.22, 0.04, IRON);
  // Its foot plate, cap and finial; the glass between them, clear of both.
  b.box(m, s, y - height + 0.1, reach, body + 0.04, 0.04, body + 0.04, IRON);
  b.box(m, s, y + 0.02, reach, body + 0.06, 0.05, body + 0.06, IRON);
  b.box(m, s, y + 0.08, reach, 0.04, 0.06, 0.04, IRON);
  lamps.box(m, s, y - height / 2 + 0.0525, reach, body, height - 0.13, body, LANTERN_GLASS);
}

/** A cable from s0 to s1 at y (a drop when `top` is given: from y up to `top`, at s0). */
function cable(b: TriBuilder, m: THREE.Matrix4, s0: number, s1: number, y: number, top: number | null): void {
  if (top !== null) {
    at.makeTranslation(s0, (y + top) / 2, CABLE.out).premultiply(m).multiply(scale.makeRotationZ(Math.PI / 2)).multiply(new THREE.Matrix4().makeScale(top - y, CABLE.radius, CABLE.radius));
  } else {
    at.makeTranslation((s0 + s1) / 2, y, CABLE.out).premultiply(m).multiply(scale.makeScale(s1 - s0, CABLE.radius, CABLE.radius));
  }
  b.geometry(at, CABLE_GEOMETRY, '#1c1c1e');
}

/** A strip of pigeon spikes along a sill from s0 to s1, its top at y: a steel base and a row of fine points. */
function spikes(b: TriBuilder, m: THREE.Matrix4, s0: number, s1: number, y: number): void {
  const out = 0.07;
  // The base half sunk in the sill (its foot never in the sill's top's plane).
  b.box(m, (s0 + s1) / 2, y + SPIKES.base / 4, out, s1 - s0, SPIKES.base, 0.03, '#9a9ea2');
  const top = y + (SPIKES.base * 3) / 4;
  for (let s = s0 + 0.02; s < s1 - 0.02; s += SPIKES.pitch) {
    const lean = ((Math.round(s * 100) % 3) - 1) * 0.03;
    b.triangle(m, [s - SPIKES.foot, top, out], [s + SPIKES.foot, top, out], [s + lean, y + SPIKES.height, out + lean], '#b8bcc0');
    b.triangle(m, [s + SPIKES.foot, top, out], [s - SPIKES.foot, top, out], [s + lean, y + SPIKES.height, out + lean], '#b8bcc0');
  }
}

/** A print's cell in the poster atlas (its torn copy in the second row). */
function posterCell(print: number, torn: boolean): UvRect {
  const i = ((print % PRINT_COUNT) + PRINT_COUNT) % PRINT_COUNT;
  const u0 = i / PRINT_COUNT;
  const u1 = (i + 1) / PRINT_COUNT;
  return torn ? { u0, v0: 0, u1, v1: 0.5 } : { u0, v0: 0.5, u1, v1: 1 };
}

/** Every print, whole on the top row and torn on the bottom, painted once for the street. */
function posterAtlas(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(CELL.w * PRINT_COUNT, CELL.h * 2);
  for (let i = 0; i < PRINT_COUNT; i++) {
    paintPoster(ctx, i, i * CELL.w + 2, 2, CELL.w - 4, CELL.h - 4);
    paintPoster(ctx, i, i * CELL.w + 2, CELL.h + 2, CELL.w - 4, CELL.h - 4, true);
  }
  return toTexture(canvas, 'facing');
}
