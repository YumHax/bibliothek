import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { bareMetal } from '../metals';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { snowCovered } from '../snowCover';
import { nightnessOf } from '../streetAir';
import { FRONT, KERB_HEIGHT, PARK_STREET, STREET_PLAN } from '../streetPlan';
import { groundHeight } from '../relief/ground';
import { TriBuilder } from '../relief/TriBuilder';
import { closures, closureBox, type Closure } from './roadworks';
import { GROUND, onSurface } from '../../surface/layers';

/* Where the little things stand: the street's plan (`STREET_PLAN.details`, which the window view paints too). */
const { manholes: MANHOLES, hydrants: HYDRANTS, bollards: BOLLARDS, column: { at: COLUMN, ...COLUMN_SIZE } } = STREET_PLAN.details;
/** Gutter drains along the kerbs every so many metres. */
const DRAIN_EVERY = 13;
/** A manhole cover's radius, and its cast-iron frame round it (outer radius, how far it stands proud). */
const COVER = 0.34;
const FRAME = { outer: 0.42, proud: 0.012 };
/** A traffic cone: its square rubber foot, its height, its radii at the foot and the tip. */
const CONE = { foot: 0.38, height: 0.5, base: 0.15, tip: 0.025 };
/**
 * Past each works' line (closure-local x along, z across): the trench on the far pavement (from `trench.from` to `to`
 * along, `inset` from the kerb side of the pavement and `width` wide), steel plates over part of it, the spoil heap and
 * the generator beyond, mesh fencing along the trench's kerb side.
 */
const WORKS_SITE = { trench: { from: 1.2, to: 8, inset: 2.1, width: 1 }, plates: [5, 7.5], spoil: 9.4, generator: 11.2, fence: { from: 0.8, panel: 3.4, height: 2, gap: 0.25 } };
/** The amber lamps on the barriers and the fence ends: how fast they blink (s a cycle), how bright at night (HDR, unlit). */
const BLINK = { period: 1.1, glow: 2.6 };
const AMBER = new THREE.Color(0xffa020);

/**
 * The street's small print, merged per material: cast-iron manhole covers in their raised frames on
 * the road and the pavements, gutter drains along the kerbs, red pillar hydrants with their caps and
 * nozzles, round bollards with a pale band and a domed cap, a Morris column with its posters at the
 * mouth of Park Street, and the two roadworks that close the walkable street (`closures()`, across
 * Front Street and across Park Street): a plywood hoarding across each pavement, red and white
 * water-filled barriers across the parking lanes with an amber lamp each, cones beyond, and past the
 * line the works themselves: the trench in the far pavement half under steel plates, the spoil heap,
 * a generator, mesh fencing on rubber feet, its end lamps blinking at night. Everything the player
 * can bump into within the walkable street collides, the works included; the snow settles on it.
 */
export class StreetDetails extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[] = [];
  /** The works' lamps, blinking in turn (two sets half a cycle apart). */
  private readonly lamps = [new THREE.MeshBasicMaterial({ color: 0x000000 }), new THREE.MeshBasicMaterial({ color: 0x000000 })];
  private clock = 0;

  constructor(anisotropy: number, private readonly dayNight?: DayNight) {
    super();
    this.name = 'StreetDetails';
    const random = seededRandom(2718);
    const painted = new TriBuilder();
    const iron = new TriBuilder();

    // Manholes and drains: textured discs and grates on the ground (`GROUND.grate`), one textured mesh; the
    // manholes' cast frames stand round them, a centimetre proud.
    const ironMap = ironTexture(anisotropy);
    const covers: THREE.BufferGeometry[] = [];
    const frame = new THREE.LatheGeometry(
      [new THREE.Vector2(COVER, -0.01), new THREE.Vector2(COVER, FRAME.proud), new THREE.Vector2(COVER + 0.04, FRAME.proud), new THREE.Vector2(FRAME.outer, 0.002), new THREE.Vector2(FRAME.outer + 0.01, -0.01)],
      24,
    );
    for (const [x, z] of MANHOLES) {
      const y = groundHeight(x, z);
      const g = new THREE.CircleGeometry(COVER, 20).rotateX(-Math.PI / 2).translate(x, y + GROUND.grate.lift, z);
      // The cover is the texture's left half.
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5);
      covers.push(g);
      iron.geometry(new THREE.Matrix4().makeTranslation(x, y, z), frame, '#34353a');
    }
    frame.dispose();
    const grate = (x: number, z: number, yaw: number): void => {
      const g = new THREE.PlaneGeometry(0.55, 0.3).rotateX(-Math.PI / 2).rotateY(yaw).translate(x, groundHeight(x, z) + GROUND.grate.lift, z);
      // The grate is the texture's right half.
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 0.5 + uv.getX(i) * 0.5);
      covers.push(g);
    };
    for (const side of [-1, 1]) {
      for (let x = PARK_STREET.farKerb + 4; x < 100; x += DRAIN_EVERY) {
        if (STREET_PLAN.crossings.some((c) => x > c.from - 1 && x < c.to + 1)) continue;
        grate(x, side * (FRONT.farKerb - 0.2), 0);
      }
    }
    for (let z = -20; z > -90; z -= DRAIN_EVERY) {
      grate(PARK_STREET.nearKerb - 0.2, z, Math.PI / 2);
      grate(PARK_STREET.farKerb + 0.2, z - 6, Math.PI / 2);
    }
    this.addMesh(merge(covers), onSurface(bareMetal({ map: ironMap, roughness: 0.6 }, 0.22), GROUND.grate), false);

    // Hydrants: a red pillar on its flange, a domed bonnet with the operating nut, two hose nozzles and the pumper's
    // bigger one to the road, each capped, a chain from the caps.
    const pillar = new THREE.LatheGeometry(
      [[0, 0], [0.15, 0], [0.15, 0.05], [0.11, 0.07], [0.1, 0.5], [0.125, 0.53], [0.125, 0.58], [0.1, 0.6], [0.085, 0.68], [0.05, 0.73], [0, 0.745]].map(([r, y]) => new THREE.Vector2(r, y)),
      18,
    );
    const nut = new THREE.CylinderGeometry(0.025, 0.03, 0.05, 5).translate(0, 0.765, 0);
    const nozzle = new THREE.CylinderGeometry(0.035, 0.035, 0.08, 12).rotateZ(Math.PI / 2);
    const pumper = new THREE.CylinderGeometry(0.05, 0.05, 0.08, 14).rotateX(Math.PI / 2);
    for (const [x, z] of HYDRANTS) {
      const m = new THREE.Matrix4().makeTranslation(x, 0, z);
      // Its pumper faces the road: across Park Street's pavement (x), or Front Street's (z).
      const onPark = x < PARK_STREET.line && z < FRONT.ourLine;
      const yaw = onPark ? (x < PARK_STREET.farKerb ? Math.PI / 2 : -Math.PI / 2) : z < 0 ? 0 : Math.PI;
      m.multiply(new THREE.Matrix4().makeRotationY(yaw));
      painted.geometry(m, pillar, '#b8261e');
      painted.geometry(m, nut, '#8a8c8e');
      for (const side of [-1, 1]) painted.geometry(m.clone().multiply(new THREE.Matrix4().makeTranslation(side * 0.13, 0.4, 0)), nozzle, '#c9302a');
      painted.geometry(m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.34, 0.12)), pumper, '#c9302a');
      painted.box(m, 0, 0.012, 0, 0.34, 0.024, 0.34, '#5a5c5e');
      this.collide(x, z, 0.22, 0.8);
    }
    for (const g of [pillar, nut, nozzle, pumper]) g.dispose();

    // Bollards: dark green round posts, a pale band near the top, a domed cap on a collar.
    const post = new THREE.CylinderGeometry(0.06, 0.065, 0.86, 14).translate(0, 0.43, 0);
    const band = new THREE.CylinderGeometry(0.063, 0.063, 0.05, 14).translate(0, 0.74, 0);
    const collar = new THREE.CylinderGeometry(0.072, 0.072, 0.035, 14).translate(0, 0.875, 0);
    const cap = new THREE.SphereGeometry(0.066, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.892, 0);
    for (const [x, z] of BOLLARDS) {
      const m = new THREE.Matrix4().makeTranslation(x, 0, z);
      painted.geometry(m, post, '#1f2a24').geometry(m, band, '#d8d4c8').geometry(m, collar, '#1f2a24').geometry(m, cap, '#1f2a24');
      this.collide(x, z, 0.1, 0.95);
    }
    for (const g of [post, band, collar, cap]) g.dispose();

    this.buildColumn(anisotropy);
    this.buildRoadworks(painted, random, anisotropy);
    this.addMesh(painted.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }), true);
    this.addMesh(iron.build(), bareMetal({ vertexColors: true, roughness: 0.55 }, 0.2), false);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** The works' amber lamps: dark by day, blinking in turn from dusk (unlit HDR colour: no light of their own). */
  update(dt: number): void {
    if (!this.dayNight) return;
    this.clock = (this.clock + dt) % BLINK.period;
    const night = THREE.MathUtils.smoothstep(nightnessOf(this.dayNight.state), 0.15, 0.55);
    const on = this.clock < BLINK.period / 2;
    for (const [i, lamp] of this.lamps.entries()) {
      const lit = (i === 0) === on ? BLINK.glow * night + 0.25 : 0.12;
      lamp.color.copy(AMBER).multiplyScalar(lit);
    }
  }

  private addMesh(geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, casts: boolean): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, snowCovered(material));
    mesh.castShadow = casts;
    mesh.receiveShadow = true;
    this.add(mesh);
    return mesh;
  }

  /** A box collider `half` either side of (x, z), `height` tall. */
  private collide(x: number, z: number, half: number, height: number): void {
    this.colliders.push(new THREE.Box3(new THREE.Vector3(x - half, 0, z - half), new THREE.Vector3(x + half, height, z + half)));
  }

  /** The Morris column: a plinth, the drum pasted with posters, a fluted collar and a little dome. */
  private buildColumn(anisotropy: number): void {
    const [x, z] = COLUMN;
    const { radius, height } = COLUMN_SIZE;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height - 0.9, 28, 1, true).translate(x, 0.35 + (height - 0.9) / 2, z), snowCovered(new THREE.MeshStandardMaterial({ map: postersTexture(anisotropy), roughness: 0.85 })));
    const green = new THREE.MeshStandardMaterial({ color: 0x24392e, roughness: 0.5 });
    const trim = new THREE.Mesh(
      merge([
        new THREE.CylinderGeometry(radius + 0.05, radius + 0.1, 0.35, 28).translate(x, 0.175, z),
        new THREE.CylinderGeometry(radius + 0.12, radius + 0.04, 0.22, 28).translate(x, height - 0.44, z),
        new THREE.SphereGeometry(radius + 0.05, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(x, height - 0.33, z),
        new THREE.SphereGeometry(0.08, 10, 6).translate(x, height - 0.33 + (radius + 0.05) * 0.6 + 0.05, z),
      ]),
      snowCovered(green),
    );
    for (const mesh of [drum, trim]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
    }
    this.collide(x, z, radius + 0.08, 2);
  }

  /**
   * The roadworks closing the walkable street (`closures()`: across Front Street and across Park
   * Street): a hoarding across each pavement (its panels the texture) on concrete feet, red and
   * white barriers across both parking lanes with a lamp on each, cones along the lane lines beyond,
   * and past the line the works (`buildSite`). They collide; the traffic lanes' gap between the
   * barriers is the roadworker's (`Flagger`).
   */
  private buildRoadworks(painted: TriBuilder, random: () => number, anisotropy: number): void {
    const { depth, height } = STREET_PLAN.roadworks;
    const panels: THREE.BufferGeometry[] = [];
    const lamps: THREE.BufferGeometry[][] = [[], []];
    const road = -KERB_HEIGHT;
    const lamp = (frame: THREE.Matrix4, x: number, y: number, z: number, set: number): void => lampAt(lamps, frame, x, y, z, set);
    // A cone: its foot, the tapered body, a reflective white band a hair proud of it.
    const body = new THREE.CylinderGeometry(CONE.tip, CONE.base, CONE.height - 0.03, 16).translate(0, 0.03 + (CONE.height - 0.03) / 2, 0);
    const radiusAt = (y: number): number => CONE.base - ((CONE.base - CONE.tip) * (y - 0.03)) / (CONE.height - 0.03);
    const stripe = new THREE.CylinderGeometry(radiusAt(0.33) + 0.003, radiusAt(0.24) + 0.003, 0.09, 16).translate(0, 0.285, 0);
    for (const closure of closures()) {
      const { frame } = closure;
      for (const [z0, z1] of closure.pavements) {
        const w = z1 - z0;
        panels.push(new THREE.BoxGeometry(depth, height, w).translate(0, height / 2, (z0 + z1) / 2).applyMatrix4(frame));
        // Feet: two concrete blocks.
        for (const f of [0.2, 0.8]) painted.box(frame, 0, 0.08, z0 + w * f, 0.6, 0.16, 0.35, '#8a8a86');
        this.colliders.push(closureBox(closure, -depth, depth, z0 - 0.05, z1 + 0.05, 0, height));
      }
      // Barriers across the parking lanes, alternately red and white, an amber lamp on each.
      for (const [z0, z1] of closure.parking) {
        const n = 2;
        const w = (z1 - z0) / n;
        for (let i = 0; i < n; i++) {
          const m = frame.clone().multiply(new THREE.Matrix4().makeTranslation(0.2, road, z0 + w * (i + 0.5)));
          painted.box(m, 0, 0.4, 0, 0.45, 0.8, w - 0.04, i % 2 ? '#e8e6e0' : '#c8281e');
          painted.box(m, 0, 0.84, 0, 0.3, 0.08, w - 0.2, i % 2 ? '#d8d6d0' : '#b8241c');
          painted.box(m, 0, 0.92, 0, 0.06, 0.08, 0.06, '#1a1a1a');
          lamp(frame, 0.2, road + 1.02, z0 + w * (i + 0.5), i % 2);
        }
        // As tall as the player: no stepping over the barrier either.
        this.colliders.push(closureBox(closure, -0.05, 0.45, z0 - 0.05, z1 + 0.05, road, 2));
      }
      const cone = (x: number, z: number): void => {
        const m = frame.clone().multiply(new THREE.Matrix4().makeTranslation(x, road, z));
        painted.box(m, 0, 0.015, 0, CONE.foot, 0.03, CONE.foot, '#1a1a1a');
        painted.geometry(m, body, '#f06a1a').geometry(m, stripe, '#f4f4f0');
      };
      for (const line of closure.coneLines) for (let cx = 1.2; cx < 12; cx += 2.2) cone(cx + (random() - 0.5) * 0.2, line);
      // And across the lanes' gap on the works' line itself, clear of where the cars drive: the line the roadworker
      // keeps walkers behind (`Flagger`'s collider) shows.
      const [l0, l1] = closure.lanes;
      for (let z = l0 + 0.35; z <= l1 - 0.35; z += 0.7) {
        if (closure.carLines.some((line: number) => Math.abs(z - line) < 1.15)) continue;
        cone(0.05 + (random() - 0.5) * 0.06, z);
      }
      this.buildSite(closure, painted, lamps, random, anisotropy);
    }
    body.dispose();
    stripe.dispose();
    const hoarding = new THREE.Mesh(merge(panels), snowCovered(new THREE.MeshStandardMaterial({ map: hoardingTexture(anisotropy), roughness: 0.8 })));
    hoarding.castShadow = true;
    hoarding.receiveShadow = true;
    this.add(hoarding);
    for (const [i, set] of lamps.entries()) if (set.length) this.add(new THREE.Mesh(merge(set), this.lamps[i]!));
  }

  /**
   * The works past a closure's line, on its far pavement (`WORKS_SITE`): the trench dug along it (a dark pit with its
   * lips of broken ground), two steel road plates over part of it, the spoil heap and a generator beyond, and mesh
   * fencing panels on rubber feet along its kerb side, an amber lamp on the end panels. Past the line, nothing collides.
   */
  private buildSite(closure: Closure, painted: TriBuilder, lamps: THREE.BufferGeometry[][], random: () => number, anisotropy: number): void {
    const { frame } = closure;
    const { trench, plates, spoil, generator, fence } = WORKS_SITE;
    const [p0, p1] = closure.pavements[1]!;
    // The kerb side of the far pavement is its low end on Front Street (z +8..12), its high end on Park Street (x -40..-36).
    const kerbLow = Math.abs(p0) < Math.abs(p1);
    const across = (d: number): number => (kerbLow ? p0 + d : p1 - d);
    const zA = across(trench.inset);
    const zB = across(trench.inset + trench.width);
    const tz0 = Math.min(zA, zB);
    const tz1 = Math.max(zA, zB);
    const length = trench.to - trench.from;
    // The pit: a dark floor a hand under the slabs' top, walls down to it; its lips of churned earth.
    const pit = new THREE.MeshStandardMaterial({ color: 0x17120e, roughness: 1 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(length, tz1 - tz0).rotateX(-Math.PI / 2).translate((trench.from + trench.to) / 2, GROUND.marking.lift, (tz0 + tz1) / 2).applyMatrix4(frame), onSurface(pit, GROUND.marking));
    floor.receiveShadow = true;
    this.add(floor);
    for (let x = trench.from; x < trench.to; x += 0.45) {
      for (const z of [tz0 - 0.08, tz1 + 0.08]) painted.box(frame, x + 0.22, 0.03, z, 0.46 + random() * 0.1, 0.04 + random() * 0.04, 0.14 + random() * 0.06, random() < 0.5 ? '#4a3a2c' : '#5a4836');
    }
    // Steel plates over the trench's far half: thick, dull, their edges standing up a little from the slabs.
    for (const [i, x] of plates.entries()) painted.box(frame, x + i * 0.05, 0.015, (tz0 + tz1) / 2, 2.4, 0.03, tz1 - tz0 + 0.5, i % 2 ? '#4e5054' : '#5a5c60');
    // The spoil: a lumpy heap of earth and broken slab beyond the trench.
    const heap = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const pos = heap.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const k = 0.82 + random() * 0.3;
      pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * (0.85 + random() * 0.3), pos.getZ(i) * k);
    }
    heap.computeVertexNormals();
    painted.geometry(frame.clone().multiply(new THREE.Matrix4().makeTranslation(spoil, 0, (tz0 + tz1) / 2).scale(new THREE.Vector3(1.1, 0.55, 0.7))), heap, '#5a4632');
    heap.dispose();
    for (let i = 0; i < 4; i++) painted.box(frame.clone().multiply(new THREE.Matrix4().makeRotationY(random() * 3)), spoil + (random() - 0.5) * 1.6, 0.03, (tz0 + tz1) / 2 + (random() - 0.5) * 0.9, 0.4, 0.05, 0.3, '#8e8c86');
    // The generator: a yellow box on skids, its panel and exhaust.
    const gm = frame.clone().multiply(new THREE.Matrix4().makeTranslation(generator, 0, (tz0 + tz1) / 2));
    painted.box(gm, 0, 0.04, 0, 1.0, 0.06, 0.62, '#2a2a2a').box(gm, 0, 0.4, 0, 0.95, 0.66, 0.58, '#e8b81e').box(gm, 0.2, 0.45, 0.295, 0.32, 0.26, 0.01, '#2a2d30').box(gm, -0.35, 0.83, -0.15, 0.06, 0.18, 0.06, '#3a3a3a');
    // Mesh fencing along the trench's kerb side: galvanised frames on rubber feet, the mesh a cut-out texture.
    const fz = kerbLow ? tz0 - fence.gap : tz1 + fence.gap;
    const panels = Math.ceil((spoil + 1 - fence.from) / fence.panel);
    const meshes: THREE.BufferGeometry[] = [];
    for (let i = 0; i < panels; i++) {
      const x0 = fence.from + i * fence.panel;
      const x1 = x0 + fence.panel - 0.04;
      const mid = (x0 + x1) / 2;
      painted.box(frame, x0 + 0.02, 0.1 + fence.height / 2, fz, 0.035, fence.height, 0.035, '#a8acae').box(frame, x1 - 0.02, 0.1 + fence.height / 2, fz, 0.035, fence.height, 0.035, '#a8acae');
      painted.box(frame, mid, 0.12, fz, fence.panel - 0.04, 0.03, 0.03, '#a8acae').box(frame, mid, 0.08 + fence.height, fz, fence.panel - 0.04, 0.03, 0.03, '#a8acae');
      painted.box(frame, x0, 0.07, fz, 0.6, 0.14, 0.16, '#d8501a');
      meshes.push(new THREE.PlaneGeometry(fence.panel - 0.08, fence.height - 0.06).translate(mid, 0.1 + fence.height / 2, fz).applyMatrix4(frame));
      if (i === 0 || i === panels - 1) lampAt(lamps, frame, i === 0 ? x0 + 0.02 : x1 - 0.02, 0.18 + fence.height, fz, i % 2);
    }
    painted.box(frame, fence.from + panels * fence.panel, 0.07, fz, 0.6, 0.14, 0.16, '#d8501a');
    const mesh = new THREE.Mesh(merge(meshes), fenceMesh(anisotropy));
    mesh.castShadow = true;
    this.add(mesh);
  }
}

/** A works lamp (a short amber cylinder, its lens to either side along the line) for blinking set `set`, in `frame`. */
function lampAt(lamps: THREE.BufferGeometry[][], frame: THREE.Matrix4, x: number, y: number, z: number, set: number): void {
  lamps[set]!.push(new THREE.CylinderGeometry(0.065, 0.065, 0.1, 12).rotateZ(Math.PI / 2).translate(x, y, z).applyMatrix4(frame));
}

/** The fencing's wire mesh: a cut-out (alpha-tested) grid, both sides. */
function fenceMesh(anisotropy: number): THREE.MeshStandardMaterial {
  const [canvas, ctx] = createCanvas(128, 128);
  ctx.clearRect(0, 0, 128, 128);
  ctx.strokeStyle = '#b8bcbe';
  ctx.lineWidth = 2;
  for (let i = 0; i <= 128; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 128);
    ctx.moveTo(0, i);
    ctx.lineTo(128, i);
    ctx.stroke();
  }
  const texture = toTexture(canvas, anisotropy);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(14, 8);
  return new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.4, transparent: false, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.4 });
}

/** Merges plain geometries (position, normal, uv), indexed or not, into one non-indexed geometry. */
function merge(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = geometries.map((g) => {
    const out = g.index ? g.toNonIndexed() : g;
    if (out !== g) g.dispose();
    return out;
  });
  const count = flat.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let offset = 0;
  for (const g of flat) {
    const n = g.getAttribute('position').count;
    position.set(g.getAttribute('position').array as Float32Array, offset * 3);
    normal.set(g.getAttribute('normal').array as Float32Array, offset * 3);
    const u = g.getAttribute('uv');
    if (u) uv.set(u.array as Float32Array, offset * 2);
    offset += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

/** Cast iron: a manhole cover's rings and studs (left half), a drain's grate (right half). */
function ironTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 128);
  const random = seededRandom(31);
  ctx.fillStyle = '#3a3b3d';
  ctx.fillRect(0, 0, 256, 128);
  // Cover: concentric rings, a studded field, the maker's band.
  ctx.strokeStyle = '#26272a';
  ctx.lineWidth = 3;
  for (const r of [60, 44, 30]) {
    ctx.beginPath();
    ctx.arc(64, 64, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#4a4b4e';
  for (let y = 10; y < 118; y += 8) for (let x = 10; x < 118; x += 8) if (Math.hypot(x - 64, y - 64) < 28) ctx.fillRect(x, y, 3, 3);
  ctx.fillStyle = '#2a2b2e';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CITY', 64, 56);
  ctx.fillText('WATER', 64, 78);
  // Grate: slots.
  ctx.fillStyle = '#4a4b4d';
  ctx.fillRect(128, 0, 128, 128);
  ctx.fillStyle = '#0e0f10';
  for (let x = 138; x < 250; x += 12) ctx.fillRect(x, 12, 6, 104);
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(120,90,60,0.2)' : 'rgba(0,0,0,0.2)';
    ctx.fillRect(random() * 256, random() * 128, 2, 2);
  }
  return toTexture(canvas, anisotropy);
}

/** The Morris column's drum: posters pasted all round (a play, a concert, a games fair, a circus), a little torn and weathered. */
function postersTexture(anisotropy: number): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const [canvas, ctx] = createCanvas(w, h);
  const random = seededRandom(1872);
  ctx.fillStyle = '#e8dcc0';
  ctx.fillRect(0, 0, w, h);
  const bills = [
    { bg: '#1a2a4a', fg: '#f0c94a', title: 'CONCERT', sub: 'The Old Hall · 9 pm' },
    { bg: '#f0e8d0', fg: '#8a2a2a', title: 'THEATRE', sub: 'The Rogue’s Tricks' },
    { bg: '#2a1f4a', fg: '#5fe6ff', title: 'GAME FAIR', sub: 'Retro · Consoles · Cartridges' },
    { bg: '#c8281e', fg: '#f4f0e0', title: 'CIRCUS', sub: 'Under the big top' },
    { bg: '#3f6b4f', fg: '#f0e8c8', title: 'EXPO', sub: 'Pixel Art 1985-1995' },
    { bg: '#f6d23a', fg: '#1a1a22', title: 'CINEMA', sub: 'Cult film night' },
  ];
  const pw = w / bills.length;
  bills.forEach((b, i) => {
    const x = i * pw + 6;
    ctx.fillStyle = b.bg;
    ctx.fillRect(x, 20, pw - 12, h - 40);
    ctx.fillStyle = b.fg;
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px Georgia, serif';
    ctx.fillText(b.title, x + (pw - 12) / 2, 110);
    ctx.font = '18px sans-serif';
    ctx.fillText(b.sub, x + (pw - 12) / 2, 150);
    for (let l = 0; l < 6; l++) ctx.fillRect(x + 20, 200 + l * 32, (pw - 52) * (0.5 + random() * 0.5), 6);
    // Torn strips.
    ctx.fillStyle = 'rgba(232,220,192,0.9)';
    if (random() < 0.6) ctx.fillRect(x + random() * (pw - 60), h - 60 - random() * 80, 40 + random() * 40, 30);
  });
  ctx.fillStyle = 'rgba(60,50,40,0.12)';
  for (let i = 0; i < 600; i++) ctx.fillRect(random() * w, random() * h, 3, 3);
  return toTexture(canvas, anisotropy);
}

/** Roadworks hoarding: white plywood panels, a red and white band, ROADWORKS and PAVEMENT CLOSED, the contractor's board. */
function hoardingTexture(anisotropy: number): THREE.CanvasTexture {
  const w = 512;
  const h = 288;
  const [canvas, ctx] = createCanvas(w, h);
  ctx.fillStyle = '#e8e6e0';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let x = 0; x < w; x += 128) ctx.fillRect(x, 0, 2, h);
  for (let x = 0; x < w; x += 32) {
    ctx.fillStyle = (x / 32) % 2 ? '#e8e6e0' : '#c8281e';
    ctx.beginPath();
    ctx.moveTo(x, h - 40);
    ctx.lineTo(x + 32, h - 40);
    ctx.lineTo(x + 16, h);
    ctx.lineTo(x - 16, h);
    ctx.fill();
  }
  ctx.fillStyle = '#f0c020';
  ctx.fillRect(40, 30, 190, 120);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ROADWORKS', 135, 105, 176);
  // A no-entry sign.
  ctx.fillStyle = '#c8281e';
  ctx.beginPath();
  ctx.arc(360, 90, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4f4f0';
  ctx.fillRect(318, 80, 84, 20);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('PAVEMENT CLOSED', 360, 180);
  ctx.font = '16px sans-serif';
  ctx.fillText('Pedestrians: please turn back', 256, 215);
  flyPosters(ctx);
  return toTexture(canvas, anisotropy);
}

/** What gets pasted on any hoarding left up a week: a gig bill askew in the margin, a torn one under it, a tag. */
function flyPosters(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.translate(462, 96);
  ctx.rotate(0.05);
  ctx.fillStyle = '#1e1a3a';
  ctx.fillRect(-36, -74, 72, 148);
  ctx.fillStyle = '#ff4fa0';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('CHIPTUNE', 0, -46);
  ctx.fillText('NIGHT', 0, -28);
  ctx.fillStyle = '#39e0ff';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) ctx.rect(-26 + i * 11, 2 - ((i * 7) % 20), 8, 18 + ((i * 7) % 20));
  ctx.fill();
  ctx.fillStyle = '#f4f0e0';
  ctx.font = '10px sans-serif';
  ctx.fillText('THE ANCHOR', 0, 48);
  ctx.fillText('SAT 9PM', 0, 62);
  ctx.restore();
  // An older one, mostly torn off: its corner and the paste's stain.
  ctx.fillStyle = 'rgba(120,110,80,0.25)';
  ctx.fillRect(6, 40, 30, 96);
  ctx.fillStyle = '#d8c070';
  ctx.beginPath();
  ctx.moveTo(6, 40);
  ctx.lineTo(36, 40);
  ctx.lineTo(30, 78);
  ctx.lineTo(18, 64);
  ctx.lineTo(6, 92);
  ctx.closePath();
  ctx.fill();
  // A tag, sprayed fast across the lower panel.
  ctx.strokeStyle = 'rgba(40,60,160,0.75)';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(392, 238);
  ctx.bezierCurveTo(404, 222, 414, 250, 426, 232);
  ctx.bezierCurveTo(436, 218, 444, 246, 458, 228);
  ctx.moveTo(470, 226);
  ctx.lineTo(478, 244);
  ctx.stroke();
}
