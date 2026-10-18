import * as THREE from 'three';
import { currentSeason } from '@/time/season';
import { BANDSTAND, FOUNTAIN, PLAYGROUND, POND, WILLOWS } from '../city/park';
import { PARK_TREES } from '../city/trees';
import { TriBuilder } from './relief/TriBuilder';
import { snowCovered } from './snowCover';
import type { Vec2 } from './streetPlan';
import { BANDSTAND_WALK, FLAT_IN_STREET, LAWN_REACH, PARK_STREET, PARK_WALK, STREET_ENDS } from '@/world/measures/street';

type Area = (typeof BANDSTAND_WALK)[number];
import { standard } from '../materials/palette';
import { GROUND, onSurface } from '../surface/layers';
import { rippled, type RippleUniforms } from './waterRipples';
import { windSwayed } from './wind';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTexture, createCanvas } from '@/graphics/canvas';
import { damp } from '@/math/damp';
import { lcg } from '@/random';

/** A point of the park (`city/park`, the flat's frame) in the street's. */
function parkInStreet([x, z]: readonly [number, number]): Vec2 {
  return [x + FLAT_IN_STREET.x, z + FLAT_IN_STREET.z];
}

/** The pond's stone kerb: how wide, how high over the lawn; the water lies a hand under it. */
const KERB = { width: 0.45, height: 0.14 };
/** The fountain: the basin's radius and wall, the column, the bowl on it, the plume's height. */
const FOUNTAIN_SIZE = { basin: 2.6, wall: 0.5, column: 1.4, bowl: 0.9, plume: 2.6 };
/** The playground's pieces round its middle (metres off it, street frame), and its soft surface's radius. */
const PLAY = { surface: 9, swings: [-3.5, -2] as Vec2, slide: [3, -1.5] as Vec2, seesaw: [-1, 3.6] as Vec2, sandpit: [4.2, 3.6] as Vec2 };
/** The park's far shrubbery, closing the lawn where it ends (`LAWN_REACH`): a bush every so many metres, how big. */
const SHRUB = { every: 2.4, size: [1.3, 2.3] as [number, number], height: 1.35 };
/** The hoop-topped fence round the gardens one walks in (`PARK_WALK`): its height, a post every so many metres. */
const HOOPS = { height: 0.62, every: 1.1, collide: 1.2 };

/**
 * The bandstand's steps: the way they face (yaw, the railing's gap: -x and +z), how far out their upper and lower
 * treads' middles lie from its middle (m). The plinth stands 0.6 m over the lawn.
 */
const BANDSTAND_STEPS = { yaw: -Math.PI / 4, upper: 3.2, lower: 3.925 } as const;

/** The swings' beam over the playground (metres over the lawn), the chains' length to the seat. */
const SWING = { beam: 2.3, chain: 1.82, omega: Math.sqrt(9.81 / 1.82) };

/**
 * One of the playground's swings, hung from the beam: its seat and chains turn about it (`angle`, radians, the seat
 * towards -z for a positive one). `push` is how high a child on it swings it (0 empty: it settles, the wind barely
 * stirs it); `seat` is where its seat is now (the park's frame, the street's).
 */
export interface PlaygroundSwing {
  readonly seat: THREE.Vector3;
  readonly rest: THREE.Vector3;
  /** Where its chains hang from on the beam (the park's frame). */
  readonly hang: THREE.Vector3;
  angle: number;
  push: number;
  /** The player sits on it (`details/SwingSeat`): no child takes it. */
  player: boolean;
}

/** What the park adds besides its paths and beds: what moves (the fountain's plume, the swings) and what collides. */
export interface ParkFeatures {
  colliders: THREE.Box3[];
  /** The playground's swings, for a child to ride (`life/ParkLife`). */
  swings: readonly PlaygroundSwing[];
  update(dt: number): void;
}

/** A swing as built: what it hands out, its pivot, and how far through its swing it is. */
interface HungSwing extends PlaygroundSwing {
  pivot: THREE.Object3D;
  phase: number;
  amplitude: number;
}

/**
 * The park's things in 3D, where the window view paints them (`city/park`): the pond on the lawn
 * inside its stone kerb, the fountain in its middle (basin, column, bowl, a plume of spray that
 * sways), the bandstand (an octagonal plinth, slim iron posts, a railing, a copper roof and
 * finial), the playground on its soft red surface (swings, a slide, a see-saw, a sandpit), the
 * weeping willows over the banks, and the far shrubbery where the lawn ends. With `walkable` the
 * gardens behind the gate (`PARK_WALK`) are closed by a low hoop fence, and the trees, the
 * playground's frames and the fence collide. Painted per vertex, one mesh per material.
 */
export function buildParkFeatures(parent: THREE.Group, lawnY: number, walkable: boolean, weather?: () => { wind: number; rain: number }): ParkFeatures {
  const colliders: THREE.Box3[] = [];
  const painted = new TriBuilder();
  const swings: HungSwing[] = [];
  const site: Site = {
    parent,
    lawnY,
    walkable,
    painted,
    colliders,
    swings,
    random: lcg(4242),
    season: currentSeason(),
    // Each shape is copied into the builder, then let go.
    add: (m, g, color) => {
      painted.geometry(m, g, color);
      g.dispose();
    },
    box: (x, z, hx, hz, h) => {
      colliders.push(new THREE.Box3(new THREE.Vector3(x - hx, 0, z - hz), new THREE.Vector3(x + hx, h, z + hz)));
    },
  };

  const pond = buildPond(site);
  const spray = buildFountain(site);
  buildBandstand(site);
  buildPlayground(site);
  buildWillows(site);
  buildShrubbery(site);
  // The gardens one walks in: their hoop fence, the trees in them.
  if (walkable) buildHoopFence(painted, colliders, lawnY);
  if (walkable) for (const tree of PARK_TREES) if (inWalk(...tree.at)) site.box(tree.at[0], tree.at[1], 0.35 * tree.scale, 0.35 * tree.scale, 2);

  const mesh = new THREE.Mesh(painted.build(), snowCovered(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);

  // The swings' seats and chains, each its own mesh on its pivot.
  const swingMaterial = snowCovered(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
  for (const swing of swings) {
    for (const o of swing.pivot.children) (o as THREE.Mesh).material = swingMaterial;
  }

  let time = 0;
  return {
    colliders,
    swings,
    update(dt: number): void {
      const wind = weather?.().wind ?? 0.3;
      for (const swing of swings) swingOn(swing, dt, time, wind);
      // The plume sways and breathes a little.
      time = (time + dt) % 1000;
      spray.scale.set(1 + 0.08 * Math.sin(time * 1.7), 0.94 + 0.06 * Math.sin(time * 2.3 + 1), 1 + 0.08 * Math.sin(time * 1.3 + 2));
      // The pond's ripples run on, the wind and the rain on the water with the weather.
      if (pond) {
        pond.time.value = time;
        const w = weather?.();
        pond.wind.value = damp(pond.wind.value, w?.wind ?? 0.3, 1, dt);
        pond.rain.value = damp(pond.rain.value, w?.rain ?? 0, 1, dt);
      }
    },
  };
}

/** What every feature of the park builds with: the lawn's height, the one painted mesh, the colliders, the seeded stream, the season. */
interface Site {
  parent: THREE.Group;
  lawnY: number;
  walkable: boolean;
  painted: TriBuilder;
  colliders: THREE.Box3[];
  swings: HungSwing[];
  random: () => number;
  season: ReturnType<typeof currentSeason>;
  /** Copies a shape into the painted mesh under `m`, then lets it go. */
  add(m: THREE.Matrix4, g: THREE.BufferGeometry, color: string): void;
  /** A collider box `hx` by `hz` round (x, z), `h` high. */
  box(x: number, z: number, hx: number, hz: number, h: number): void;
}

/** What the pond's water moves with (null under ice). */
type PondUniforms = RippleUniforms;

/**
 * The pond on the lawn: its water (ice in deep winter), and a ring of stone round the ellipse, its inner face down to
 * the water. Open water ripples (`waterRipples`): small waves running with the wind, rings where the rain falls, so the
 * sky it gives back is broken up as on real water.
 */
function buildPond({ parent, lawnY, painted, season }: Site): PondUniforms | null {
  const [px, pz] = parkInStreet([POND.x, POND.z]);
  const frozen = season.name === 'winter' && season.depth > 0.5;
  const uniforms: PondUniforms = { time: { value: 0 }, wind: { value: 0.3 }, rain: { value: 0 } };
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2).scale(POND.rx, 1, POND.rz).translate(px, lawnY + GROUND.puddle.lift, pz),
    frozen
      ? onSurface(standard({ color: 0x9fb2b8, roughness: 0.35, metalness: 0.1 }), GROUND.puddle)
      : onSurface(rippled(new THREE.MeshStandardMaterial({ color: 0x2f4a4e, roughness: 0.06, metalness: 0.1 }), uniforms, 'pond'), GROUND.puddle),
  );
  water.receiveShadow = true;
  parent.add(water);
  const segments = 96;
  const ring = (t: number, grow: number): THREE.Vector3Tuple => [px + Math.cos(t) * (POND.rx + grow), 0, pz + Math.sin(t) * (POND.rz + grow)];
  const identity = new THREE.Matrix4();
  for (let i = 0; i < segments; i++) {
    const t0 = (i / segments) * Math.PI * 2;
    const t1 = ((i + 1) / segments) * Math.PI * 2;
    const at = (t: number, grow: number, y: number): THREE.Vector3Tuple => {
      const p = ring(t, grow);
      return [p[0], lawnY + y, p[2]];
    };
    const stone = i % 2 ? '#a8a49a' : '#b4afa4';
    painted.quad(identity, at(t0, 0, KERB.height), at(t1, 0, KERB.height), at(t1, KERB.width, KERB.height), at(t0, KERB.width, KERB.height), stone, true);
    painted.quad(identity, at(t0, KERB.width, KERB.height), at(t1, KERB.width, KERB.height), at(t1, KERB.width, -0.02), at(t0, KERB.width, -0.02), '#9a968c', true);
    painted.quad(identity, at(t0, 0, -0.02), at(t1, 0, -0.02), at(t1, 0, KERB.height), at(t0, 0, KERB.height), '#8a867c', true);
  }
  return frozen ? null : uniforms;
}

/** The fountain in the pond's middle: basin, column, bowl, and the plume of spray, returned for its sway. */
function buildFountain({ parent, lawnY, add }: Site): THREE.Mesh {
  const [fx, fz] = parkInStreet([FOUNTAIN.x, FOUNTAIN.z]);
  const f = new THREE.Matrix4().makeTranslation(fx, lawnY, fz);
  const { basin, wall, column, bowl, plume } = FOUNTAIN_SIZE;
  add(f, new THREE.CylinderGeometry(basin, basin + 0.1, wall, 28, 1, true).translate(0, wall / 2, 0), '#b8b2a6');
  add(f, new THREE.TorusGeometry(basin, 0.12, 6, 28).rotateX(Math.PI / 2).translate(0, wall, 0), '#c4beb2');
  add(f, new THREE.CircleGeometry(basin - 0.05, 28).rotateX(-Math.PI / 2).translate(0, wall - 0.12, 0), '#3a5a60');
  add(f, new THREE.CylinderGeometry(0.22, 0.32, column, 12).translate(0, column / 2, 0), '#b0aa9e');
  add(f, new THREE.SphereGeometry(bowl, 18, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).translate(0, column + 0.25, 0), '#b8b2a6');
  const spray = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.5, plume, 14, 4, true).translate(0, plume / 2, 0),
    standard({ color: 0xe8f2f6, roughness: 0.2, transparent: true, opacity: 0.38, depthWrite: false }),
  );
  spray.position.set(fx, lawnY + column + 0.3, fz);
  parent.add(spray);
  return spray;
}

/** The bandstand: an octagonal plinth, slim iron posts, a railing (not on the steps' side), a copper roof and finial. */
function buildBandstand({ lawnY, painted, add, walkable, box }: Site): void {
  const [bx, bz] = parkInStreet([BANDSTAND.x, BANDSTAND.z]);
  const b = new THREE.Matrix4().makeTranslation(bx, lawnY, bz);
  const r = BANDSTAND.width / 2;
  add(b, new THREE.CylinderGeometry(r + 0.2, r + 0.3, 0.6, 8).translate(0, 0.3, 0), '#a8a094');
  // Two stone steps up to the railing's gap (between the third and fourth posts, looking out north-west), to sit on.
  const steps = b.clone().multiply(new THREE.Matrix4().makeRotationY(BANDSTAND_STEPS.yaw));
  painted.box(steps, 0, 0.2, BANDSTAND_STEPS.upper, 1.6, 0.4, 1.05, '#a8a094').box(steps, 0, 0.1, BANDSTAND_STEPS.lower, 1.6, 0.2, 0.4, '#9e968a');
  // Walked round once the lane reaches it: the plinth and its steps collide.
  if (walkable) {
    // The octagon (corners on the axes and the diagonals) as a square and a cross of boxes inside it.
    const inner = (r + 0.3) * Math.SQRT1_2;
    box(bx, bz, inner, inner, 3.2);
    box(bx, bz, r - 0.2, 1, 3.2);
    box(bx, bz, 1, r - 0.2, 3.2);
    box(bx + Math.sin(BANDSTAND_STEPS.yaw) * BANDSTAND_STEPS.lower, bz + Math.cos(BANDSTAND_STEPS.yaw) * BANDSTAND_STEPS.lower, 0.55, 0.55, 0.4);
  }
  add(b, new THREE.CylinderGeometry(r + 0.05, r + 0.05, 0.06, 8).translate(0, 0.63, 0), '#7a5a3a');
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const m = b.clone().multiply(new THREE.Matrix4().makeTranslation(Math.cos(a) * r, 0, Math.sin(a) * r));
    add(m, new THREE.CylinderGeometry(0.06, 0.07, 2.7, 8).translate(0, 0.6 + 1.35, 0), '#2a3a32');
    if (i !== 2) {
      const a1 = ((i + 1) / 8) * Math.PI * 2 + Math.PI / 8;
      const mid = new THREE.Vector3((Math.cos(a) + Math.cos(a1)) * r * 0.5, 0, (Math.sin(a) + Math.sin(a1)) * r * 0.5);
      const len = 2 * r * Math.sin(Math.PI / 8);
      const rm = b.clone().multiply(new THREE.Matrix4().makeTranslation(mid.x, 0, mid.z).multiply(new THREE.Matrix4().makeRotationY(-(a + a1) / 2 + Math.PI / 2)));
      painted.box(rm, 0, 1.55, 0, len, 0.05, 0.05, '#2a3a32').box(rm, 0, 0.75, 0, len, 0.04, 0.04, '#2a3a32');
      for (let k = 1; k < 6; k++) painted.box(rm, -len / 2 + (k * len) / 6, 1.15, 0, 0.02, 0.8, 0.02, '#2a3a32');
    }
  }
  add(b, new THREE.ConeGeometry(r + 0.6, 1.5, 8).translate(0, 0.6 + 2.7 + 0.75, 0), '#4f8a72');
  add(b, new THREE.CylinderGeometry(r + 0.62, r + 0.62, 0.18, 8).translate(0, 0.6 + 2.7, 0), '#e8e2d0');
  add(b, new THREE.SphereGeometry(0.16, 10, 6).translate(0, 0.6 + 2.7 + 1.62, 0), '#c8a040');
}

/** The playground on its soft red surface: swings, a slide, a see-saw, a sandpit; their frames collide where one walks. */
function buildPlayground(site: Site): void {
  const { parent, lawnY, walkable, painted, box } = site;
  const [cx, cz] = parkInStreet([PLAYGROUND.x, PLAYGROUND.z]);
  // Laid over the paths that run to it (`GROUND.patch`, a rank over theirs).
  const soft = new THREE.Mesh(new THREE.CircleGeometry(PLAY.surface, 40).rotateX(-Math.PI / 2).translate(cx, lawnY + GROUND.patch.lift, cz), onSurface(standard({ color: 0x8a3a2e, roughness: 0.95 }), GROUND.patch));
  soft.receiveShadow = true;
  parent.add(soft);
  const piece = ([dx, dz]: Vec2): THREE.Matrix4 => new THREE.Matrix4().makeTranslation(cx + dx, lawnY, cz + dz);
  // Swings: an A-frame either end, the beam, two seats on their chains.
  {
    const m = piece(PLAY.swings);
    for (const side of [-1.6, 1.6]) {
      for (const lean of [-1, 1]) {
        const leg = m.clone().multiply(new THREE.Matrix4().makeTranslation(side, 1.15, lean * 0.45).multiply(new THREE.Matrix4().makeRotationX(lean * 0.36)));
        painted.box(leg, 0, 0, 0, 0.08, 2.45, 0.08, '#2a6a9a');
      }
      if (walkable) box(cx + PLAY.swings[0] + side, cz + PLAY.swings[1], 0.15, 0.9, 2.4);
    }
    painted.box(m, 0, SWING.beam, 0, 3.4, 0.09, 0.09, '#2a6a9a');
    // The seats on their chains hang from pivots on the beam, to be swung.
    for (const x of [-0.7, 0.7]) {
      const pivot = new THREE.Group();
      pivot.name = 'PlaygroundSwing';
      pivot.position.set(cx + PLAY.swings[0] + x, lawnY + SWING.beam, cz + PLAY.swings[1]);
      const parts = new TriBuilder();
      const here = new THREE.Matrix4();
      for (const dz of [-0.2, 0.2]) parts.box(here, 0, -0.9, dz, 0.015, 1.8, 0.015, '#8a8c8e');
      parts.box(here, 0, -SWING.chain, 0, 0.45, 0.04, 0.2, '#1a1a1a');
      const mesh = new THREE.Mesh(parts.build());
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      pivot.add(mesh);
      parent.add(pivot);
      const rest = new THREE.Vector3(pivot.position.x, pivot.position.y - SWING.chain, pivot.position.z);
      site.swings.push({ pivot, seat: rest.clone(), rest, hang: pivot.position, angle: 0, push: 0, player: false, phase: site.random() * 6, amplitude: 0 });
    }
  }
  // The slide: a ladder up to a platform, the chute down.
  {
    const m = piece(PLAY.slide);
    for (const x of [-0.35, 0.35]) for (const z of [-0.35, 0.35]) painted.box(m, x, 0.85, z, 0.07, 1.7, 0.07, '#d8a020');
    painted.box(m, 0, 1.4, 0, 0.8, 0.06, 0.8, '#d8a020');
    for (let k = 0; k < 5; k++) painted.box(m, 0, 0.25 + k * 0.25, -0.62, 0.6, 0.04, 0.05, '#b88a1a');
    const chute = m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.78, 1.45).multiply(new THREE.Matrix4().makeRotationX(0.62)));
    painted.box(chute, 0, 0, 0, 0.55, 0.04, 2.3, '#c8302a').box(chute, -0.3, 0.08, 0, 0.04, 0.16, 2.3, '#c8302a').box(chute, 0.3, 0.08, 0, 0.04, 0.16, 2.3, '#c8302a');
    if (walkable) box(cx + PLAY.slide[0], cz + PLAY.slide[1] + 0.6, 0.45, 1.3, 1.6);
  }
  // The see-saw on its pivot.
  {
    const m = piece(PLAY.seesaw);
    painted.box(m, 0, 0.25, 0, 0.3, 0.5, 0.3, '#3a3a3a');
    const beam = m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.5, 0).multiply(new THREE.Matrix4().makeRotationZ(0.16)));
    painted.box(beam, 0, 0, 0, 3.2, 0.07, 0.24, '#2a8a4a');
    for (const x of [-1.4, 1.4]) painted.box(beam, x, 0.18, 0, 0.04, 0.3, 0.3, '#2a8a4a');
    if (walkable) box(cx + PLAY.seesaw[0], cz + PLAY.seesaw[1], 1.6, 0.2, 0.7);
  }
  // The sandpit: a timber frame round its sand.
  {
    const m = piece(PLAY.sandpit);
    for (const [x, z, w, d] of [[0, -1.4, 3, 0.2], [0, 1.4, 3, 0.2], [-1.4, 0, 0.2, 2.6], [1.4, 0, 0.2, 2.6]] as const) painted.box(m, x, 0.15, z, w, 0.3, d, '#8a6a42');
    painted.box(m, 0, 0.06, 0, 2.6, 0.08, 2.6, '#d8c48a');
    if (walkable) for (const [x, z, hx, hz] of [[0, -1.4, 1.5, 0.1], [0, 1.4, 1.5, 0.1], [-1.4, 0, 0.1, 1.3], [1.4, 0, 0.1, 1.3]] as const) box(cx + PLAY.sandpit[0] + x, cz + PLAY.sandpit[1] + z, hx, hz, 0.35);
  }
}

/** A willow's crown: the canopy's radius and its top over the lawn, its strands (how many, how wide each), winter's share of them. */
const WILLOW = { reach: 5.2, top: 7.6, shoulder: 5.4, strands: 120, strandWidth: 0.5, winter: 0.6 };
/** The willows' leaves by season, and their bare golden twigs in winter. */
const WILLOW_GREEN = { spring: '#a6c860', summer: '#86ad4e', autumn: '#c4b048', winter: '#b49a4a' } as const;

/**
 * The weeping willows over the banks: a stooping trunk and its limbs (in the painted mesh), and, apart, what the wind
 * moves: a canopy over the limbs (not in winter) and the strands hanging from it nearly to the lawn, ribbons of
 * leaves on threads (bare golden twigs in winter, fewer), each swinging from where it hangs (`windSwayed` with each
 * vertex's own reach below its top), the inner ones shorter. Both meshes go straight into the park.
 */
function buildWillows({ parent, lawnY, walkable, random, season, add, box }: Site): void {
  const winter = season.name === 'winter';
  const leafy = WILLOW_GREEN[season.name];
  const strands = new StrandBuilder();
  const canopies: THREE.BufferGeometry[] = [];
  for (const [wx, wz] of WILLOWS) {
    const [x, z] = parkInStreet([wx, wz]);
    if (x < LAWN_REACH.x + 4) continue;
    const m = new THREE.Matrix4().makeTranslation(x, lawnY, z);
    add(m, new THREE.CylinderGeometry(0.28, 0.45, 3.6, 9).translate(0, 1.8, 0), '#4a3a2a');
    // The limbs out of the trunk's head, arching up and out: what holds the strands (seen bare in winter).
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + random() * 0.6;
      const limb = new THREE.CylinderGeometry(0.07, 0.16, 3.4, 6).translate(0, 1.7, 0).rotateZ(-0.75 - random() * 0.25).rotateY(a);
      add(m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 3.4, 0)), limb, '#4a3a2a');
    }
    if (!winter) {
      const canopy = new THREE.SphereGeometry(WILLOW.reach * 0.72, 16, 10).scale(1.15, 0.5, 1.15);
      canopy.translate(x, lawnY + WILLOW.shoulder + 1.2, z);
      canopies.push(canopy);
    }
    const n = Math.round(WILLOW.strands * (winter ? WILLOW.winter : 1));
    for (let i = 0; i < n; i++) {
      const a = random() * Math.PI * 2;
      const r = WILLOW.reach * (0.3 + 0.7 * Math.sqrt(random()));
      // Hung from the dome of the canopy; the outer ones nearly to the lawn, the inner ones shorter.
      const top = lawnY + WILLOW.shoulder + (WILLOW.top - WILLOW.shoulder) * Math.sqrt(Math.max(0, 1 - (r / WILLOW.reach) ** 2));
      const outer = r / WILLOW.reach;
      const length = Math.min(top - lawnY - 0.4 - random() * 1.2, (1.5 + random() * 2.5) + 3 * outer);
      strands.strand(x + Math.cos(a) * r, top, z + Math.sin(a) * r, a + (random() - 0.5) * 1.2, length, WILLOW.strandWidth * (winter ? 0.7 : 1) * (0.7 + random() * 0.6), Math.cos(a), Math.sin(a));
    }
    if (walkable && inWalk(x, z)) box(x, z, 0.5, 0.5, 2);
  }
  if (strands.isEmpty) return;
  const strandMaterial = windSwayed(
    snowCovered(new THREE.MeshStandardMaterial({ color: leafy, roughness: 0.85, map: strandTexture(winter), alphaTest: 0.4, side: THREE.DoubleSide })),
    'willowStrands',
    { pivotY: 0, give: 2.2, flutter: 0.015, reachAttribute: 'aHang' },
  );
  const strandMesh = new THREE.Mesh(strands.build(), strandMaterial);
  strandMesh.castShadow = true;
  strandMesh.receiveShadow = true;
  parent.add(strandMesh);
  if (canopies.length === 0) return;
  const canopy = new THREE.Mesh(mergeGeometryList(canopies), windSwayed(snowCovered(new THREE.MeshStandardMaterial({ color: new THREE.Color(leafy).multiplyScalar(0.8), roughness: 0.9 })), 'willowCanopy', { pivotY: lawnY + 3.4, give: 0.6 }));
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  parent.add(canopy);
}

/** Merges `parts` into one geometry and frees them. */
function mergeGeometryList(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const painted = new TriBuilder();
  const identity = new THREE.Matrix4();
  for (const g of parts) {
    painted.geometry(identity, g, '#ffffff');
    g.dispose();
  }
  return painted.build();
}

/**
 * The willows' strands as one geometry: each a ribbon hung from (x, top, z), `length` down, turned to `yaw`, curving
 * a little outwards as it falls (`out`), in three bands; `aHang` each vertex's drop below the strand's top (what the
 * wind swings by), uvs over the strand texture.
 */
class StrandBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly hang: number[] = [];

  get isEmpty(): boolean {
    return this.positions.length === 0;
  }

  strand(x: number, top: number, z: number, yaw: number, length: number, width: number, outX: number, outZ: number): void {
    const ax = Math.cos(yaw) * width * 0.5;
    const az = -Math.sin(yaw) * width * 0.5;
    const nx = Math.sin(yaw);
    const nz = Math.cos(yaw);
    const bands = 3;
    for (let b = 0; b < bands; b++) {
      const t0 = b / bands;
      const t1 = (b + 1) / bands;
      const at = (t: number, side: number): [number, number, number] => {
        const drift = 0.18 * length * t * t;
        return [x + side * ax + outX * drift, top - length * t, z + side * az + outZ * drift];
      };
      const corners: [number, number][] = [[t0, -1], [t0, 1], [t1, 1], [t0, -1], [t1, 1], [t1, -1]];
      for (const [t, side] of corners) {
        this.positions.push(...at(t, side));
        this.normals.push(nx, 0, nz);
        this.uvs.push((side + 1) / 2, 1 - t);
        this.hang.push(length * t);
      }
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('aHang', new THREE.Float32BufferAttribute(this.hang, 1));
    return g;
  }
}

/** A strand's picture: a few threads hanging down, slim leaves along them (bare twigs with buds in winter), on clear. */
function strandTexture(winter: boolean): THREE.CanvasTexture {
  const w = 64;
  const h = 256;
  const [canvas, ctx] = createCanvas(w, h);
  const random = lcg(winter ? 3313 : 3311);
  ctx.clearRect(0, 0, w, h);
  const threads = winter ? 3 : 4;
  for (let k = 0; k < threads; k++) {
    let x = 8 + ((w - 16) * (k + 0.5)) / threads + (random() - 0.5) * 6;
    ctx.strokeStyle = winter ? 'rgb(220,200,140)' : 'rgb(200,215,170)';
    ctx.lineWidth = winter ? 1.6 : 1.2;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    for (let y = 0; y < h; y += 8) {
      x += (random() - 0.5) * 1.5;
      ctx.lineTo(x, y);
      if (!winter && random() < 0.85) {
        // A slim leaf hanging off the thread, either side.
        const g = Math.round(200 + random() * 55);
        ctx.fillStyle = `rgb(${g},${g},${g})`;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((random() < 0.5 ? -1 : 1) * (0.2 + random() * 0.4));
        ctx.beginPath();
        ctx.ellipse(0, 6, 2 + random() * 1.5, 7 + random() * 4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (winter && random() < 0.3) {
        ctx.fillStyle = 'rgb(230,210,150)';
        ctx.fillRect(x - 1, y, 2.5, 2.5);
      }
    }
    ctx.stroke();
  }
  return canvasTexture(canvas, { anisotropy: 'facing' });
}

/** The far shrubbery where the lawn ends: bushes along its far side and both its ends, one instanced mesh. */
function buildShrubbery({ parent, lawnY, random }: Site): void {
  // Corners shared (merged), so the snow standing on a bush's top (`depth`) does not split its faces; still drawn faceted.
  const bush = mergeVertices(new THREE.IcosahedronGeometry(1, 1).deleteAttribute('uv').deleteAttribute('normal'));
  bush.computeVertexNormals();
  const bushes: THREE.Matrix4[] = [];
  const edge = (from: Vec2, to: Vec2): void => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    for (let d = 0; d < length; d += SHRUB.every) {
      const t = d / length;
      const s = SHRUB.size[0] + random() * (SHRUB.size[1] - SHRUB.size[0]);
      bushes.push(new THREE.Matrix4().compose(
        new THREE.Vector3(from[0] + (to[0] - from[0]) * t + (random() - 0.5), lawnY + s * 0.45, from[1] + (to[1] - from[1]) * t + (random() - 0.5)),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * 6),
        new THREE.Vector3(s, s * SHRUB.height * 0.6, s),
      ));
    }
  };
  const south = STREET_ENDS.south + 0.8;
  const west = LAWN_REACH.x + 1.2;
  edge([west, south], [west, LAWN_REACH.z - 1]);
  edge([PARK_STREET.hedge - 2, south], [west, south]);
  edge([west, LAWN_REACH.z - 1], [PARK_STREET.hedge - 2, LAWN_REACH.z - 1]);
  const shrubs = new THREE.InstancedMesh(bush, windSwayed(snowCovered(new THREE.MeshStandardMaterial({ color: 0x3a5a2e, roughness: 0.95, flatShading: true }), { depth: 0.06 }), 'parkShrubs', { pivotY: -0.6, give: 0.45, flutter: 0.01 }), bushes.length);
  bushes.forEach((matrix, i) => shrubs.setMatrixAt(i, matrix));
  shrubs.castShadow = true;
  shrubs.receiveShadow = true;
  shrubs.computeBoundingSphere();
  parent.add(shrubs);
}

/** Whether (x, z) is in the walked gardens. */
function inWalk(x: number, z: number): boolean {
  return [PARK_WALK, ...BANDSTAND_WALK].some((a) => x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ);
}

/**
 * The low fence closing the walked gardens on the lawn's side (`PARK_WALK`: its far side and its
 * two ends, the railings being the fourth): iron posts with a hoop between each two, a rail along
 * the top, no gap. It collides higher than it stands (nobody hops over a park's fence).
 */
function buildHoopFence(painted: TriBuilder, colliders: THREE.Box3[], lawnY: number): void {
  const { minX, maxX, minZ, maxZ } = PARK_WALK;
  // The lane to the bandstand leaves the gardens' far corner (`BANDSTAND_WALK`): their west fence runs on along it, the
  // round of lawn about the bandstand is fenced the same, and the gardens' north fence starts past the lane.
  const [lane, round] = BANDSTAND_WALK as [Area, Area];
  const runs: [Vec2, Vec2][] = [
    [[maxX + 0.3, minZ], [minX, minZ]],
    [[minX, minZ], [minX, lane.maxZ]],
    [[lane.maxX, maxZ], [maxX + 0.3, maxZ]],
    [[lane.maxX, maxZ], [lane.maxX, round.maxZ]],
    [[lane.minX, round.minZ], [round.minX, round.minZ]],
    [[round.minX, round.minZ], [round.minX, round.maxZ]],
    [[round.minX, round.maxZ], [round.maxX, round.maxZ]],
  ];
  const hoop = new THREE.TorusGeometry(HOOPS.every / 2, 0.012, 4, 10, Math.PI);
  for (const [a, b] of runs) {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const yaw = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    const n = Math.max(1, Math.round(length / HOOPS.every));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const m = new THREE.Matrix4().makeTranslation(a[0] + (b[0] - a[0]) * t, lawnY, a[1] + (b[1] - a[1]) * t).multiply(new THREE.Matrix4().makeRotationY(yaw));
      painted.box(m, 0, HOOPS.height / 2, 0, 0.03, HOOPS.height, 0.03, '#26302a');
      if (i < n) {
        const step = length / n;
        painted.geometry(m.clone().multiply(new THREE.Matrix4().makeTranslation(step / 2, HOOPS.height - 0.32, 0).scale(new THREE.Vector3(step / HOOPS.every, 0.62, 1))), hoop, '#26302a');
        painted.box(m, step / 2, HOOPS.height - 0.02, 0, step, 0.02, 0.02, '#26302a');
      }
    }
    colliders.push(new THREE.Box3(new THREE.Vector3(Math.min(a[0], b[0]) - 0.08, 0, Math.min(a[1], b[1]) - 0.08), new THREE.Vector3(Math.max(a[0], b[0]) + 0.08, HOOPS.collide, Math.max(a[1], b[1]) + 0.08)));
  }
  hoop.dispose();
}

/**
 * A swing's frame: its swing eases towards what it is pushed to (a child pumping it higher, or settling once empty)
 * at the chains' own pendulum rate, the wind stirring it a little; its pivot turned, its seat's point moved.
 */
function swingOn(swing: HungSwing, dt: number, time: number, wind: number): void {
  swing.amplitude = damp(swing.amplitude, swing.push, swing.push > swing.amplitude ? 0.5 : 0.25, dt);
  swing.phase = (swing.phase + dt * SWING.omega) % (Math.PI * 2);
  const stir = 0.015 * wind * Math.sin(time * 0.9 + swing.rest.x);
  swing.angle = swing.amplitude * Math.sin(swing.phase) + stir;
  swing.pivot.rotation.x = swing.angle;
  swing.seat.set(swing.rest.x, swing.pivot.position.y - SWING.chain * Math.cos(swing.angle), swing.pivot.position.z - SWING.chain * Math.sin(swing.angle));
}