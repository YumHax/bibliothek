import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { IDLE_SHADOW_INTERVAL, type OccupancyAware } from './Furniture';
import { boxMesh } from './meshUtils';
import { parquetMaterial } from './Parquet';

/** Walls as seen from the default spawn: back = -z (shelves), front = +z, left = -x (TV), right = +x. */
export type Wall = 'front' | 'back' | 'left' | 'right';

/**
 * A door-sized hole in a wall, from the floor up. `along` is the world coordinate of its centre
 * along the wall (x for front/back, z for left/right), like `wallMount()`.
 */
export interface Doorway {
  wall: Wall;
  along: number;
  width: number;
  height: number;
  /**
   * Whether this room hangs the `Door` in the opening (default true). An opening shared with the
   * zone next door exists in both shells; only one of them hangs the leaf, the other says `door: false`.
   */
  door?: boolean;
  /**
   * Which side the leaf is hinged on, seen from the room that hangs it (default left). The leaf
   * swings away from that room and ends up almost flat against the far side of the wall, on the
   * hinge side: pick the side with the longer stretch of wall.
   */
  hinge?: 'left' | 'right';
  /** Id of the zone on the other side: the opening becomes a portal the view is culled through. */
  to?: string;
}

export interface RoomOptions {
  width: number;
  depth: number;
  height: number;
  /** Openings cut through the walls (the baseboard stops at them). The layout hangs a `Door` in each (see `Doorway.door`). */
  doorways?: Doorway[];
  /**
   * Walls that keep light in: an invisible shadow caster is laid just outside each (cut by its
   * doorways), so the room's lamps do not pour through the wall plane into the room next door and
   * that room's lamps do not pour in. Leave out walls with windows: the caster would shut their sun out.
   */
  opaqueWalls?: Wall[];
}

/** Hemisphere sky colour in full daylight (warm, lamp-like) and at night (cool, moonlit), when no sky hue is given. */
const DAY_SKY = new THREE.Color(0xfff6e6);
const NIGHT_SKY = new THREE.Color(0x6b7a9c);
/** How far the ambient follows the hue of the sky outside (the rest stays the neutral day/night blend). */
const SKY_HUE_WEIGHT = 0.7;
/** Ceiling lamp intensity for a room of `REFERENCE_AREA`; smaller rooms get proportionally less (a corridor would be blinding), down to `MIN_LAMP_SHARE` of it. */
const LAMP_INTENSITY = 22;
const REFERENCE_AREA = 36;
const MIN_LAMP_SHARE = 0.15;
/** Emissive of the ceiling standing in for the lamp's bounce off the walls, with the lamp on. */
const CEILING_BOUNCE = 0.3;
/** Thickness of the wall colliders, laid just outside each wall plane so nothing inside the room touches them. */
const WALL_COLLIDER = 0.05;
/** How far outside the wall plane an opaque wall's shadow caster stands: clear of the shadow bias, inside the gap between two rooms' shells. */
const OPAQUE_OFFSET = 0.02;
/** The ceiling lamp's shadow bias in metres (its `shadow.bias` is expressed in units of the shadow camera's `far`). */
const LAMP_SHADOW_BIAS_M = 0.005;

/**
 * Floor, ceiling, four walls and the base lighting rig.
 * The rig is driven from outside so nobody has to duplicate lights: `setDaylight` (0..1) follows
 * the time of day (see props/DayNight) and may bring the sky's hue with it, `setSkylight` (0..1) how open the curtains are, and
 * `setLampOn` is the switch of the ceiling lamp (its visible fixture is props/PendantLamp).
 * Several rooms are active at once, so what costs the whole scene is tied to `setOccupied()`: the sky
 * ambient (a scene-wide `HemisphereLight`, they would stack) only runs in the occupied room, and only
 * the occupied room's lamp re-renders its shadow map every frame; `main.ts` flips it on zone change.
 */
export class Room extends THREE.Group implements Updatable, OccupancyAware {
  readonly options: RoomOptions;

  private walls!: THREE.Mesh[];
  private readonly lampIntensity: number;
  private hemisphere!: THREE.HemisphereLight;
  private ceilingLamp!: THREE.PointLight;
  private ceilingMat!: THREE.MeshStandardMaterial;
  private daylight = 1;
  private skyHue: THREE.Color | null = null;
  private lampOn = true;
  private skylightOpen = 1;
  private occupied = false;
  /** Starts at a random phase so several idle rooms do not all refresh their shadows on the same frame. */
  private shadowTimer = Math.random() * IDLE_SHADOW_INTERVAL;

  constructor(options: RoomOptions) {
    super();
    this.options = options;
    this.name = 'Room';
    this.lampIntensity = LAMP_INTENSITY * THREE.MathUtils.clamp((options.width * options.depth) / REFERENCE_AREA, MIN_LAMP_SHARE, 1);
    this.buildSurfaces();
    this.buildLights();
    this.applyLighting();
  }

  /**
   * 0 = night, 1 = full day. Scales and tints the ambient (hemisphere) light. `skyHue`, when given,
   * is the colour of the light the sky pours in (orange at sunset, blue at night) and tints the ambient.
   */
  setDaylight(value: number, skyHue?: THREE.Color): void {
    this.daylight = THREE.MathUtils.clamp(value, 0, 1);
    if (skyHue) (this.skyHue ??= new THREE.Color()).copy(skyHue);
    this.applyLighting();
  }

  /** 1 = curtains open, 0 = every curtain drawn. Scales the part of the ambient that comes in through the windows. */
  setSkylight(openness: number): void {
    this.skylightOpen = THREE.MathUtils.clamp(openness, 0, 1);
    this.applyLighting();
  }

  /** Switches the ceiling lamp; with it goes the part of the ambient that stands in for its bounce off the walls. */
  setLampOn(on: boolean): void {
    this.lampOn = on;
    this.applyLighting();
  }

  /** Whether the player is in this room: sky ambient and per-frame lamp shadows follow it (see the class doc). Off until told. */
  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.ceilingLamp.shadow.autoUpdate = occupied;
    this.ceilingLamp.shadow.needsUpdate = true;
    this.applyLighting();
  }

  /** Unoccupied: refresh the lamp's shadow map now and then instead of every frame. */
  update(dt: number): void {
    if (this.occupied) return;
    this.shadowTimer += dt;
    if (this.shadowTimer < IDLE_SHADOW_INTERVAL) return;
    this.shadowTimer = 0;
    this.ceilingLamp.shadow.needsUpdate = true;
  }

  private applyLighting(): void {
    const { daylight, lampOn, skylightOpen, occupied } = this;
    this.hemisphere.color.lerpColors(NIGHT_SKY, DAY_SKY, daylight);
    if (this.skyHue) this.hemisphere.color.lerp(this.skyHue, SKY_HUE_WEIGHT);
    // Ambient: the sky through the windows by day (less with the curtains drawn), plus the lamp's
    // bounce when it is on. After dark with the lamp off only a moonlit trace remains, so the room
    // reads as genuinely switched off.
    const skylight = THREE.MathUtils.lerp(0.12, 0.85, daylight) * THREE.MathUtils.lerp(0.3, 1, skylightOpen);
    this.hemisphere.intensity = occupied ? skylight + (lampOn ? THREE.MathUtils.lerp(0.23, 0.1, daylight) : 0) : 0;
    this.ceilingLamp.intensity = lampOn ? this.lampIntensity : 0;
    // The ceiling's fake bounce is the lamp's; with it off only a little daylight reaches up there.
    this.ceilingMat.emissiveIntensity = lampOn ? CEILING_BOUNCE : 0.08 * daylight * skylightOpen;
  }

  /** XZ interior bounds: where the cat lives and what its navigation grid covers. */
  get bounds(): THREE.Box2 {
    const { width, depth } = this.options;
    return new THREE.Box2(new THREE.Vector2(-width / 2, -depth / 2), new THREE.Vector2(width / 2, depth / 2));
  }

  /** A `Furniture` so a zone can `place()` it like anything else; the walls collide through `colliders`. */
  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** The walls stop the crosshair ray: nothing is clickable through them (the doorways are holes in the meshes). */
  get occluders(): readonly THREE.Object3D[] {
    return this.walls;
  }

  /**
   * What keeps the player in the room: one floor-to-ceiling slab per stretch of wall between the
   * doorways, just outside the wall plane (local space, room centred on its origin; the zone that
   * places it moves them to world space). The doorways are the only way out.
   */
  get colliders(): THREE.Box3[] {
    const { width, depth, height } = this.options;
    const doorways = this.options.doorways ?? [];
    const t = WALL_COLLIDER;
    const boxes: THREE.Box3[] = [];
    const wall = (name: Wall, length: number, slab: (from: number, to: number) => THREE.Box3): void => {
      const gaps = doorways.filter((d) => d.wall === name).map((d) => ({ centre: d.along, width: d.width }));
      for (const seg of trimSegments(length, gaps)) boxes.push(slab(seg.centre - seg.length / 2, seg.centre + seg.length / 2));
    };
    wall('back', width, (a, b) => new THREE.Box3(new THREE.Vector3(a, 0, -depth / 2 - t), new THREE.Vector3(b, height, -depth / 2)));
    wall('front', width, (a, b) => new THREE.Box3(new THREE.Vector3(a, 0, depth / 2), new THREE.Vector3(b, height, depth / 2 + t)));
    wall('left', depth, (a, b) => new THREE.Box3(new THREE.Vector3(-width / 2 - t, 0, a), new THREE.Vector3(-width / 2, height, b)));
    wall('right', depth, (a, b) => new THREE.Box3(new THREE.Vector3(width / 2, 0, a), new THREE.Vector3(width / 2 + t, height, b)));
    return boxes;
  }

  private buildSurfaces(): void {
    const { width, depth, height } = this.options;

    const floorMat = parquetMaterial(width, depth);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.add(floor);

    // The ceiling only sees the lamp at grazing angles and the hemisphere's ground tint, so a
    // touch of emissive stands in for the light the white walls would bounce back up onto it.
    const ceilingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xfff8f0, emissiveIntensity: CEILING_BOUNCE });
    this.ceilingMat = ceilingMat;
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = height;
    this.add(ceiling);

    // Walls, each with the doorways cut out of it. Every wall's plane has its local +x running
    // along the wall; the doorway's world coordinate is turned into that local x by `wallLocalX`.
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf3f0ea, roughness: 0.9, side: THREE.DoubleSide });
    const doorways = this.options.doorways ?? [];
    const wall = (name: Wall, length: number): THREE.Mesh => {
      const holes = doorways.filter((d) => d.wall === name).map((d) => ({ x: wallLocalX(name, d.along), width: d.width, height: d.height }));
      const mesh = new THREE.Mesh(wallGeometry(length, height, holes), wallMat);
      mesh.receiveShadow = true;
      return mesh;
    };
    const back = wall('back', width);
    back.position.set(0, height / 2, -depth / 2);
    const front = wall('front', width);
    front.position.set(0, height / 2, depth / 2);
    front.rotation.y = Math.PI;
    const left = wall('left', depth);
    left.position.set(-width / 2, height / 2, 0);
    left.rotation.y = Math.PI / 2;
    const right = wall('right', depth);
    right.position.set(width / 2, height / 2, 0);
    right.rotation.y = -Math.PI / 2;
    this.add(back, front, left, right);
    this.walls = [back, front, left, right];

    // Opaque walls: an invisible caster just outside the plane (same outline, same holes), so the
    // lamps stay in the room. Double-sided so it also stops the neighbour's lamps coming in.
    const opaque = this.options.opaqueWalls ?? [];
    if (opaque.length) {
      const casterMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
      const caster = (name: Wall, template: THREE.Mesh, outward: THREE.Vector3): void => {
        if (!opaque.includes(name)) return;
        const mesh = new THREE.Mesh(template.geometry, casterMat);
        mesh.position.copy(template.position).addScaledVector(outward, OPAQUE_OFFSET);
        mesh.rotation.copy(template.rotation);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        this.add(mesh);
      };
      caster('back', back, new THREE.Vector3(0, 0, -1));
      caster('front', front, new THREE.Vector3(0, 0, 1));
      caster('left', left, new THREE.Vector3(-1, 0, 0));
      caster('right', right, new THREE.Vector3(1, 0, 0));
    }

    // Baseboard trim helps read the floor/wall edge in first person; it stops at the doorways.
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xe4e0d8, roughness: 0.7 });
    const trimH = 0.08;
    const trimD = 0.02;
    const y = trimH / 2;
    const trim = (name: Wall, length: number, at: (along: number) => { x?: number; z?: number }): void => {
      const gaps = doorways.filter((d) => d.wall === name).map((d) => ({ centre: d.along, width: d.width }));
      for (const seg of trimSegments(length, gaps)) {
        const across = name === 'back' || name === 'front';
        this.add(boxMesh(across ? seg.length : trimD, trimH, across ? trimD : seg.length, trimMat, { y, ...at(seg.centre) }));
      }
    };
    trim('back', width, (x) => ({ x, z: -depth / 2 + trimD / 2 }));
    trim('front', width, (x) => ({ x, z: depth / 2 - trimD / 2 }));
    trim('left', depth, (z) => ({ x: -width / 2 + trimD / 2, z }));
    trim('right', depth, (z) => ({ x: width / 2 - trimD / 2, z }));

    // Crown moulding where the walls meet the ceiling: a finished room, not a box.
    const coveMat = new THREE.MeshStandardMaterial({ color: 0xfbf9f5, roughness: 0.8 });
    const cove = 0.07;
    const cy = height - cove / 2;
    this.add(
      boxMesh(width, cove, cove, coveMat, { y: cy, z: -depth / 2 + cove / 2 }),
      boxMesh(width, cove, cove, coveMat, { y: cy, z: depth / 2 - cove / 2 }),
      boxMesh(cove, cove, depth, coveMat, { x: -width / 2 + cove / 2, y: cy }),
      boxMesh(cove, cove, depth, coveMat, { x: width / 2 - cove / 2, y: cy }),
    );
  }

  private buildLights(): void {
    const { width, depth, height } = this.options;
    this.hemisphere = new THREE.HemisphereLight(DAY_SKY, 0x7a6450, 0.95);
    this.add(this.hemisphere);

    const ceilingLamp = new THREE.PointLight(0xffe9c9, this.lampIntensity, 0, 2);
    ceilingLamp.position.set(0, height - 0.2, 0);
    ceilingLamp.castShadow = true;
    ceilingLamp.shadow.mapSize.set(1024, 1024);
    // Point-light shadow depth is linear over [near, far]; the default far of 500 m makes any bias
    // huge (-0.002 was about 1 m, so low objects cast nothing). Bound it to the room (its farthest
    // floor corner, with room to spare through an open door): beyond `far` the light is dark, and
    // the shadow pass only renders what is within it, so a lamp never renders the whole flat.
    const far = 1.5 * Math.hypot(width / 2, depth / 2, height - 0.2);
    ceilingLamp.shadow.camera.far = far;
    ceilingLamp.shadow.camera.updateProjectionMatrix();
    ceilingLamp.shadow.bias = -LAMP_SHADOW_BIAS_M / far;
    ceilingLamp.shadow.normalBias = 0.02;
    // Rendered once now, then only while occupied or on `update()`'s slow tick; unoccupied until told
    // (see `setOccupied`). The zone that places the room restricts what it renders to the zone's own layer.
    ceilingLamp.shadow.autoUpdate = false;
    ceilingLamp.shadow.needsUpdate = true;
    this.ceilingLamp = ceilingLamp;
    this.add(ceilingLamp);
  }
}

/**
 * Local x, on a wall's plane, of the world coordinate `along` the wall (x for front/back, z for
 * left/right): the planes of the front and left walls are turned so their +x runs against it.
 */
export function wallLocalX(wall: Wall, along: number): number {
  return wall === 'back' || wall === 'right' ? along : -along;
}

interface Hole {
  /** Local x of the centre of the hole. */
  x: number;
  width: number;
  height: number;
}

/**
 * A wall plane of `length` x `height` centred on the origin, with `holes` cut from its bottom edge.
 * The outline simply walks round each opening (one simple polygon, no `Shape.holes`): a hole path
 * touching the outer edge confuses the triangulation into overlapping triangles that z-fight.
 */
function wallGeometry(length: number, height: number, holes: Hole[]): THREE.BufferGeometry {
  if (!holes.length) return new THREE.PlaneGeometry(length, height);
  const bottom = -height / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-length / 2, bottom);
  for (const hole of [...holes].sort((a, b) => a.x - b.x)) {
    shape.lineTo(hole.x - hole.width / 2, bottom);
    shape.lineTo(hole.x - hole.width / 2, bottom + hole.height);
    shape.lineTo(hole.x + hole.width / 2, bottom + hole.height);
    shape.lineTo(hole.x + hole.width / 2, bottom);
  }
  shape.lineTo(length / 2, bottom);
  shape.lineTo(length / 2, height / 2);
  shape.lineTo(-length / 2, height / 2);
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

/** The stretches of baseboard left along a wall of `length` (coordinates centred on the wall) once the `gaps` are taken out. */
function trimSegments(length: number, gaps: { centre: number; width: number }[]): { centre: number; length: number }[] {
  const cuts = gaps.map((g) => [g.centre - g.width / 2, g.centre + g.width / 2] as const).sort((a, b) => a[0] - b[0]);
  const segments: { centre: number; length: number }[] = [];
  let from = -length / 2;
  for (const [a, b] of cuts) {
    if (a > from) segments.push({ centre: (from + a) / 2, length: a - from });
    from = Math.max(from, b);
  }
  if (length / 2 > from) segments.push({ centre: (from + length / 2) / 2, length: length / 2 - from });
  return segments;
}
