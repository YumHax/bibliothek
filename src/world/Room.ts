import * as THREE from 'three';
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
}

export interface RoomOptions {
  width: number;
  depth: number;
  height: number;
  /** Openings cut through the walls (the baseboard stops at them). The layout hangs a `Door` in each. */
  doorways?: Doorway[];
}

/** Hemisphere sky colour in full daylight (warm, lamp-like) and at night (cool, moonlit), when no sky hue is given. */
const DAY_SKY = new THREE.Color(0xfff6e6);
const NIGHT_SKY = new THREE.Color(0x6b7a9c);
/** How far the ambient follows the hue of the sky outside (the rest stays the neutral day/night blend). */
const SKY_HUE_WEIGHT = 0.7;
const LAMP_INTENSITY = 22;
/** Emissive of the ceiling standing in for the lamp's bounce off the walls, with the lamp on. */
const CEILING_BOUNCE = 0.3;

/**
 * Floor, ceiling, four walls and the base lighting rig.
 * The rig is driven from outside so nobody has to duplicate lights: `setDaylight` (0..1) follows
 * the time of day (see props/DayNight) and may bring the sky's hue with it, `setSkylight` (0..1) how open the curtains are, and
 * `setLampOn` is the switch of the ceiling lamp (its visible fixture is props/PendantLamp).
 */
export class Room extends THREE.Group {
  readonly options: RoomOptions;

  private hemisphere!: THREE.HemisphereLight;
  private ceilingLamp!: THREE.PointLight;
  private ceilingMat!: THREE.MeshStandardMaterial;
  private daylight = 1;
  private skyHue: THREE.Color | null = null;
  private lampOn = true;
  private skylightOpen = 1;

  constructor(options: RoomOptions) {
    super();
    this.options = options;
    this.name = 'Room';
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

  private applyLighting(): void {
    const { daylight, lampOn, skylightOpen } = this;
    this.hemisphere.color.lerpColors(NIGHT_SKY, DAY_SKY, daylight);
    if (this.skyHue) this.hemisphere.color.lerp(this.skyHue, SKY_HUE_WEIGHT);
    // Ambient: the sky through the windows by day (less with the curtains drawn), plus the lamp's
    // bounce when it is on. After dark with the lamp off only a moonlit trace remains, so the room
    // reads as genuinely switched off.
    const skylight = THREE.MathUtils.lerp(0.12, 0.85, daylight) * THREE.MathUtils.lerp(0.3, 1, skylightOpen);
    this.hemisphere.intensity = skylight + (lampOn ? THREE.MathUtils.lerp(0.23, 0.1, daylight) : 0);
    this.ceilingLamp.intensity = lampOn ? LAMP_INTENSITY : 0;
    // The ceiling's fake bounce is the lamp's; with it off only a little daylight reaches up there.
    this.ceilingMat.emissiveIntensity = lampOn ? CEILING_BOUNCE : 0.08 * daylight * skylightOpen;
  }

  /** XZ interior bounds used to keep the player inside. */
  get bounds(): THREE.Box2 {
    const { width, depth } = this.options;
    return new THREE.Box2(new THREE.Vector2(-width / 2, -depth / 2), new THREE.Vector2(width / 2, depth / 2));
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
    const { height } = this.options;
    this.hemisphere = new THREE.HemisphereLight(DAY_SKY, 0x7a6450, 0.95);
    this.add(this.hemisphere);

    const ceilingLamp = new THREE.PointLight(0xffe9c9, LAMP_INTENSITY, 0, 2);
    ceilingLamp.position.set(0, height - 0.2, 0);
    ceilingLamp.castShadow = true;
    ceilingLamp.shadow.mapSize.set(1024, 1024);
    // Point-light shadow depth is linear over [near, far]; the default far of 500 m makes any bias
    // huge (-0.002 was about 1 m, so low objects cast nothing). Bound it to the room instead.
    ceilingLamp.shadow.camera.far = 12;
    ceilingLamp.shadow.camera.updateProjectionMatrix();
    ceilingLamp.shadow.bias = -0.0004; // ~5 mm
    ceilingLamp.shadow.normalBias = 0.01;
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
