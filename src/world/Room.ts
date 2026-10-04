import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import type { Updatable } from '@/core/Engine';
import { IDLE_SHADOW_INTERVAL, type OccupancyAware } from './Furniture';
import { parquetMaterial } from './Parquet';
import { concreteMaterial } from './Concrete';
import { carpetMaterial } from './Carpet';
import { tiledFloorMaterial, type FloorTiles } from './TiledFloor';
import { avoidOnWall, edgeOcclusion, floorWearMap, wallMaterial, type WallRect } from './materials/surfaces';
import { COVE, mouldingGeometry, SKIRTING, type MouldingKind, type RunEnd } from './mouldings';
import { glossyFloor } from './materials/GlossyFloor';
import { basic, paint, scuffedPaint } from './materials/palette';
import type { DrawnAware } from './zone/Zone';
import { ShadowRefresh } from './lighting/shadowRefresh';
import { LAMP_BOUNCE, LAMP_LIGHT } from './lighting/lampColours';
import { floorBounce } from './lighting/floorBounce';
import { setContactShadowStrength } from './zone/ContactShadows';
import { CUBE_FACE_HALF_ANGLE, normalBiasAt } from './props/shadowTexels';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { patchShader, replaceChunk } from './materials/shaderPatch';
import type { ZoneId } from './zoneIds';
import { fnv1a, hashInts, random as liveRandom } from '@/random';
import { dampFactor } from '@/math/damp';

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
  to?: ZoneId;
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
  /** Surfaces: the flat's parquet and white paint unless told otherwise (a hall, a shop). */
  finish?: RoomFinish;
}

/** How a room's shell is finished; every field defaults to the flat's look. */
export interface RoomFinish {
  /**
   * `parquet`: oak strips (default); `concrete`: a poured slab with joints and stains; `carpet`: an arcade's black
   * neon-confetti carpet; `tiles`: ceramic tiles as `floorTiles` describes them (a bathroom, a kitchen).
   */
  floor?: 'parquet' | 'concrete' | 'carpet' | 'tiles';
  /** Pattern, size and colours of a `tiles` floor (`TiledFloor.ts`). */
  floorTiles?: FloorTiles;
  /** Paint colour of the walls (default off-white). */
  walls?: number;
  /** Colour of the ceiling (default white). */
  ceiling?: number;
  /** Colour of the baseboard (default a pale grey). */
  trim?: number;
  /** Crown moulding along the ceiling (default true; a hall has none). */
  moulding?: boolean;
  /**
   * A polished floor that mirrors the room at a grazing angle, 0..1 (default none). Only drawn
   * with `QUALITY.reflections` (a second render of the room while the floor is in view).
   */
  reflective?: number;
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
/**
 * Ground colour of the hemisphere ambient per floor, when its map cannot be read: the light the
 * floor bounces back up takes its colour (else worked out from the floor's albedo, `lighting/floorBounce`).
 */
const FLOOR_BOUNCE: Record<NonNullable<RoomFinish['floor']>, number> = { parquet: 0x7a6450, concrete: 0x6e6b66, carpet: 0x2c2436, tiles: 0x8a8984 };
/** Emissive of the ceiling standing in for the lamp's bounce off the walls, with the lamp on, right over it (it falls off towards the walls). */
const CEILING_BOUNCE = 0.3;
/** Share of the ceiling's bounce left in its corners, and how far out (m) from the lamp it has fallen to that. */
const CEILING_BOUNCE_EDGE = 0.35;
const CEILING_BOUNCE_REACH = 3.2;
/** The ceiling's emissive from daylight alone (lamp off, full day, curtains open). */
const CEILING_DAYLIGHT = 0.08;
/** The sky's part of the ambient: from night to full day, and the share left with every curtain drawn. */
const SKYLIGHT_NIGHT = 0.12;
const SKYLIGHT_DAY = 0.85;
const SKYLIGHT_DRAWN = 0.3;
/** The lamp's bounce off the walls, added to the ambient while it is lit: more at night, less by day (the sky dominates). */
const LAMP_BOUNCE_NIGHT = 0.23;
const LAMP_BOUNCE_DAY = 0.1;
/** Direct light next to the ambient, for the contact shadows' share (`ambientShare`): the lit ceiling lamp, and full sun through open curtains. */
const LAMP_DIRECT = 0.6;
const SUN_DIRECT = 0.5;
/** What a lit lamp adds to `lightLevel` on its own. */
const LAMP_LIGHT_LEVEL = 0.65;
/** Seconds the ceiling lamp takes to come up and to go dark after its switch (like the other lamps, `SwitchableLamp`). */
const LAMP_WARM_SECONDS = 0.14;
const LAMP_COOL_SECONDS = 0.09;
/** Time constant (s) of the ambient following a change (the player walks in, a curtain is drawn): settled in about 0.4 s. */
const AMBIENT_EASE = 0.13;
const WALLS: readonly Wall[] = ['back', 'front', 'left', 'right'];
/** Seconds the zone's contents must stay unchanged before the walls' ghosts of frames are placed round them, and how far from a wall (m) a thing counts as against it. */
const WALL_DETAIL_SETTLE = 0.5;
const WALL_DETAIL_REACH = 0.3;
/** Thickness of the wall colliders, laid just outside each wall plane so nothing inside the room touches them. */
const WALL_COLLIDER = 0.05;
/** How far outside the wall plane an opaque wall's shadow caster stands: clear of the shadow bias, inside the gap between two rooms' shells. */
const OPAQUE_OFFSET = 0.02;
/** The ceiling lamp's shadow bias in metres (its `shadow.bias` is expressed in units of the shadow camera's `far`). */
const LAMP_SHADOW_BIAS_M = 0.005;
/** The ceiling lamp's range (`PointLight.distance`) in multiples of the room's farthest corner from it (see `buildLights`). */
const LAMP_RANGE = 2.5;

/**
 * Floor, ceiling, four walls and the base lighting rig.
 * The rig is driven from outside so nobody has to duplicate lights: `setDaylight` (0..1) follows
 * the time of day (see props/DayNight) and may bring the sky's hue with it, `setSkylight` (0..1) how open the curtains are, and
 * `setLampOn` is the switch of the ceiling lamp (its visible fixture is props/PendantLamp).
 * Several rooms are active at once, so what costs the whole scene is tied to `setOccupied()`: the sky
 * ambient (a scene-wide `HemisphereLight`, they would stack) only runs in the occupied room, and only
 * the occupied room's lit lamp re-renders its shadow map regularly (`ShadowRefresh`); `bootstrap/world`
 * flips it on zone change.
 */
export class Room extends THREE.Group implements Updatable, OccupancyAware, DrawnAware {
  /** The shell: its floor is where contact shadows fall, not something standing on it. */
  readonly contactShadow = false;
  readonly options: RoomOptions;

  private walls!: THREE.Mesh[];
  private readonly lampIntensity: number;
  private hemisphere!: THREE.HemisphereLight;
  private ceilingLamp!: THREE.PointLight;
  private lampShadow!: ShadowRefresh;
  private ceilingMat!: THREE.MeshStandardMaterial;
  /** 0: the ceiling's emissive falls off round the lamp (its bounce); 1: even (daylight from the windows). */
  private readonly ceilingEven = { value: 0 };
  private daylight = 1;
  private skyHue: THREE.Color | null = null;
  private lampOn = true;
  /** The lamp's eased level, 0 dark .. 1 lit, following `lampOn`. */
  private lampLevel = 1;
  /** Where the hemisphere ambient is heading (`applyLighting`); `update` eases it there. */
  private readonly ambientColor = new THREE.Color();
  private ambientIntensity = 0;
  /**
   * The ambient's eased intensity: kept here, not read back from the light, whose intensity the
   * `LightCuller` scales while it fades it in or out.
   */
  private ambientNow = 0;
  /** The hemisphere's ground colour: the floor's bounce (`lighting/floorBounce`). */
  private readonly floorBounce = new THREE.Color();
  private skylightOpen = 1;
  private occupied = false;
  /** Whether the zone's meshes are drawn: while they are hidden a refresh would render an empty map (see `setZoneDrawn`). */
  private zoneDrawn = true;
  /** Starts at a random phase so several idle rooms do not all refresh their shadows on the same frame. */
  private shadowTimer = liveRandom() * IDLE_SHADOW_INTERVAL;
  /** How many things stood in the zone when the walls' ghosts of frames were last placed round them (see `settleWallDetail`). */
  private wallDetailCount = -1;
  private wallDetailWait = 0;

  constructor(options: RoomOptions) {
    super();
    this.options = options;
    this.name = 'Room';
    this.lampIntensity = LAMP_INTENSITY * THREE.MathUtils.clamp((options.width * options.depth) / REFERENCE_AREA, MIN_LAMP_SHARE, 1);
    this.buildSurfaces();
    this.buildLights();
    this.applyLighting();
    this.settleAmbient();
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

  /** Repaints the four walls (one shell dressed for whoever lives there: the neighbours' flat). */
  paintWalls(color: number): void {
    for (const wall of this.walls) (wall.material as THREE.MeshStandardMaterial).color.setHex(color);
  }

  /** 1 = curtains open, 0 = every curtain drawn. Scales the part of the ambient that comes in through the windows. */
  setSkylight(openness: number): void {
    this.skylightOpen = THREE.MathUtils.clamp(openness, 0, 1);
    this.applyLighting();
  }

  /** Switches the ceiling lamp; with it goes the part of the ambient that stands in for its bounce off the walls. */
  setLampOn(on: boolean): void {
    this.lampOn = on;
    this.lampShadow.setLive(this.occupied && on);
    if (on) this.ceilingLamp.shadow.needsUpdate = true;
    // `update` brings the lamp up or down; the first call, before anything ticks, is shown at once.
    if (!this.parent) this.lampLevel = on ? 1 : 0;
    this.applyLighting();
  }

  /** Whether the player is in this room: sky ambient and the lamp's regular shadow refresh follow it (see the class doc). Off until told. */
  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    // Out of here: neutral until the next room (or none, outdoors) says otherwise.
    if (!occupied) setContactShadowStrength(1);
    this.lampShadow.setLive(occupied && this.lampOn);
    this.applyLighting();
  }

  /** Culled from view: the idle refresh waits (the room is hidden, its map would come out empty, the walls with it), and runs at once when drawn again. */
  setZoneDrawn(drawn: boolean): void {
    this.zoneDrawn = drawn;
    if (drawn) this.ceilingLamp.shadow.needsUpdate = true;
    // Hidden, the room ticks slowed: whatever it was fading to, it is there now.
    else this.settleAmbient();
  }

  /**
   * Eases the lamp towards its switch and the ambient towards its target; then the shadow refresh.
   * Occupied: the lamp's regular refresh; unoccupied: now and then, and never while the lamp is off (nothing to see).
   */
  update(dt: number): void {
    const lampTarget = this.lampOn ? 1 : 0;
    if (this.lampLevel !== lampTarget) {
      const step = dt / (this.lampOn ? LAMP_WARM_SECONDS : LAMP_COOL_SECONDS);
      this.lampLevel = this.lampOn ? Math.min(1, this.lampLevel + step) : Math.max(0, this.lampLevel - step);
      this.applyLighting();
    }
    this.easeAmbient(dt);
    this.settleWallDetail(dt);
    if (this.occupied) {
      setContactShadowStrength(this.ambientShare());
      return this.lampShadow.update(dt);
    }
    if (!this.zoneDrawn || !this.lampOn) return;
    this.shadowTimer += dt;
    if (this.shadowTimer < IDLE_SHADOW_INTERVAL) return;
    this.shadowTimer = 0;
    this.ceilingLamp.shadow.needsUpdate = true;
  }

  /**
   * Once the zone's furniture is placed (and again whenever something is added or taken away, half
   * a second after the count settles), moves each wall's ghosts of frames clear of what hangs or
   * stands against it: a pale frame behind a real picture, or peeking out round the TV, would read
   * as a glitch. Only drawn meshes count (not the windows' shadow-only masks).
   */
  private settleWallDetail(dt: number): void {
    const zone = this.parent;
    if (!zone || !QUALITY.detailedMaterials || zone.children.length === this.wallDetailCount) return;
    this.wallDetailWait += dt;
    if (this.wallDetailWait < WALL_DETAIL_SETTLE) return;
    this.wallDetailWait = 0;
    this.wallDetailCount = zone.children.length;
    zone.updateWorldMatrix(true, true);
    const toWall = new THREE.Matrix4();
    const box = new THREE.Box3();
    for (const wall of this.walls) {
      toWall.copy(wall.matrixWorld).invert();
      const blocked: WallRect[] = [];
      for (const item of zone.children) {
        if (item === this) continue;
        item.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh || !mesh.layers.isEnabled(0) || !obj.visible) return;
          const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
          if (!material?.visible || !material.colorWrite) return;
          if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
          box.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld).applyMatrix4(toWall);
          // Against the wall: within a hand's depth of its plane, on the room side.
          if (box.isEmpty() || box.min.z > WALL_DETAIL_REACH || box.max.z < -0.02) return;
          blocked.push({ x: (box.min.x + box.max.x) / 2, y: (box.min.y + box.max.y) / 2, halfWidth: (box.max.x - box.min.x) / 2, halfHeight: (box.max.y - box.min.y) / 2 });
        });
      }
      avoidOnWall(wall.material as THREE.Material, blocked);
    }
  }

  /**
   * How lit the room is, 0 (night, lamp off) .. 1 (lamp on or full sun): what the reflections and
   * the haze of the player's room follow (see `graphics/`).
   */
  get lightLevel(): number {
    return THREE.MathUtils.clamp(this.skylight() / SKYLIGHT_DAY + this.lampLevel * LAMP_LIGHT_LEVEL, 0, 1);
  }

  /** The lamp's eased level (0..1) and how open the curtains are (0..1): what the street sees of this room (`city/flatWindows`). */
  get lampShown(): number {
    return this.lampLevel;
  }

  get curtainsOpen(): number {
    return this.skylightOpen;
  }

  /**
   * The share of the room's light that is ambient (sky and bounce, which contact shadows stand in
   * for the occlusion of) rather than direct (the lamp, the sun through the windows, which cast real
   * shadows): 1 at dusk with the lamp off, lower under the lamp or in full sun.
   */
  private ambientShare(): number {
    const ambient = this.skylight();
    const direct = this.lampLevel * LAMP_DIRECT + this.daylight * this.daylight * this.skylightOpen * SUN_DIRECT;
    return ambient / Math.max(1e-3, ambient + direct);
  }

  /** The sky's part of the ambient: through the windows by day, less with the curtains drawn. */
  private skylight(): number {
    return THREE.MathUtils.lerp(SKYLIGHT_NIGHT, SKYLIGHT_DAY, this.daylight) * THREE.MathUtils.lerp(SKYLIGHT_DRAWN, 1, this.skylightOpen);
  }

  private applyLighting(): void {
    const { daylight, lampLevel, skylightOpen, occupied } = this;
    this.ambientColor.lerpColors(NIGHT_SKY, DAY_SKY, daylight);
    if (this.skyHue) this.ambientColor.lerp(this.skyHue, SKY_HUE_WEIGHT);
    // Ambient: the sky, plus the lamp's bounce while it is lit. After dark with the lamp off only a
    // moonlit trace remains, so the room reads as genuinely switched off. `update` eases it there.
    this.ambientIntensity = occupied ? this.skylight() + lampLevel * THREE.MathUtils.lerp(LAMP_BOUNCE_NIGHT, LAMP_BOUNCE_DAY, daylight) : 0;
    this.ceilingLamp.intensity = lampLevel * this.lampIntensity;
    // The ceiling's fake bounce is the lamp's; with it off only a little daylight reaches up there.
    // That daylight comes in by the windows, not from the lamp: the sky's colour, spread evenly
    // (the lamp's part keeps its falloff round the rose and its LED white).
    const day = CEILING_DAYLIGHT * daylight * skylightOpen * (1 - lampLevel);
    const lamp = CEILING_BOUNCE * lampLevel;
    const dayShare = day / Math.max(1e-4, day + lamp);
    this.ceilingMat.emissiveIntensity = day + lamp;
    this.ceilingMat.emissive.lerpColors(LAMP_BOUNCE.led, this.ambientColor, dayShare);
    this.ceilingEven.value = dayShare;
  }

  /** Moves the hemisphere a step towards `ambientColor` / `ambientIntensity` (time constant `AMBIENT_EASE`). */
  private easeAmbient(dt: number): void {
    const light = this.hemisphere;
    if (this.ambientNow === this.ambientIntensity && light.color.equals(this.ambientColor)) return;
    const t = dampFactor(1 / AMBIENT_EASE, dt);
    this.ambientNow += (this.ambientIntensity - this.ambientNow) * t;
    light.intensity = this.ambientNow;
    light.color.lerp(this.ambientColor, t);
    if (Math.abs(this.ambientNow - this.ambientIntensity) < 1e-3) this.settleAmbient();
  }

  /** Puts the hemisphere where it is heading at once. */
  private settleAmbient(): void {
    this.ambientNow = this.ambientIntensity;
    this.hemisphere.intensity = this.ambientIntensity;
    this.hemisphere.color.copy(this.ambientColor);
  }

  /** Zone-local floor spots (x, z) just inside each doorway: where the walking lanes lead. */
  private doorSpots(): THREE.Vector2[] {
    const { width, depth } = this.options;
    return (this.options.doorways ?? []).map((d) => {
      const inset = 0.4;
      switch (d.wall) {
        case 'back':
          return new THREE.Vector2(d.along, -depth / 2 + inset);
        case 'front':
          return new THREE.Vector2(d.along, depth / 2 - inset);
        case 'left':
          return new THREE.Vector2(-width / 2 + inset, d.along);
        case 'right':
          return new THREE.Vector2(width / 2 - inset, d.along);
        default: {
          // Every wall is a case above; this says so to the array-callback-return rule (and fails loudly if one is added).
          const wall: never = d.wall;
          throw new Error(`doorway on an unknown wall: ${String(wall)}`);
        }
      }
    });
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

    const finish = this.options.finish ?? {};
    const floorMat =
      finish.floor === 'concrete'
        ? concreteMaterial(width, depth)
        : finish.floor === 'carpet'
          ? carpetMaterial(width, depth)
          : finish.floor === 'tiles'
            ? tiledFloorMaterial(width, depth, finish.floorTiles)
            : parquetMaterial(width, depth);
    // Where the floor meets the walls it darkens; the varnish or the slab is dulled along the walking lanes.
    edgeOcclusion(floorMat, new THREE.Vector2(width / 2, depth / 2), 0.3, 0.22);
    // `low` has no grain pass: the big plain surfaces dither themselves against banding.
    floorMat.dithering = !QUALITY.postFx;
    if (finish.floor !== 'carpet') {
      const wear = floorWearMap(width, depth, this.doorSpots(), Math.round(width * 1000 + depth * 10));
      if (wear) {
        floorMat.roughnessMap = wear;
        floorMat.roughness = Math.min(1, floorMat.roughness * 1.3);
      }
    }
    floorBounce(floorMat, FLOOR_BOUNCE[finish.floor ?? 'parquet'], this.floorBounce);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.add(floor);
    if (finish.reflective && QUALITY.reflections) this.add(glossyFloor(width, depth, finish.reflective));

    // The ceiling only sees the lamp at grazing angles and the hemisphere's ground tint, so a
    // touch of emissive stands in for the light the white walls would bounce back up onto it.
    const ceilingMat = new THREE.MeshStandardMaterial({
      color: finish.ceiling ?? 0xffffff,
      roughness: 1,
      emissive: LAMP_BOUNCE.led,
      emissiveIntensity: CEILING_BOUNCE,
      emissiveMap: bounceFalloff(width, depth),
      dithering: !QUALITY.postFx,
    });
    const even = this.ceilingEven;
    patchShader(ceilingMat, 'ceilingEven', (shader) => {
      shader.uniforms.ceilingEven = even;
      shader.fragmentShader = 'uniform float ceilingEven;\n' + replaceChunk(shader.fragmentShader, 'emissivemap_fragment', /* glsl */ `
        #ifdef USE_EMISSIVEMAP
          totalEmissiveRadiance *= mix(texture2D(emissiveMap, vEmissiveMapUv).rgb, vec3(1.0), ceilingEven);
        #endif
      `);
    });
    edgeOcclusion(ceilingMat, new THREE.Vector2(width / 2, depth / 2), 0.2, 0.3);
    this.ceilingMat = ceilingMat;
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = height;
    this.add(ceiling);

    // Walls, each with the doorways cut out of it. Every wall's plane has its local +x running
    // along the wall; the doorway's world coordinate is turned into that local x by `wallLocalX`.
    // One material per wall: each has its own corners and its own ghosts of frames (see `wallMaterial`).
    const doorways = this.options.doorways ?? [];
    const wall = (name: Wall, length: number): THREE.Mesh => {
      const holes = doorways.filter((d) => d.wall === name).map((d) => ({ x: wallLocalX(name, d.along), width: d.width, height: d.height }));
      const seed = hashInts(width * 1000, depth * 1000, fnv1a(name));
      const mesh = new THREE.Mesh(wallGeometry(length, height, holes), wallMaterial(finish.walls ?? 0xf3f0ea, { length, height, seed, openings: holes }));
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
      const casterMat = basic({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
      const caster = (name: Wall, template: THREE.Mesh, outward: THREE.Vector3): void => {
        if (!opaque.includes(name)) return;
        const mesh = new THREE.Mesh(template.geometry, casterMat);
        mesh.position.copy(template.position).addScaledVector(outward, OPAQUE_OFFSET);
        mesh.rotation.copy(template.rotation);
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        // Shadow passes only: the camera would draw it for nothing (it writes neither colour nor depth).
        mesh.layers.disable(0);
        this.add(mesh);
      };
      caster('back', back, new THREE.Vector3(0, 0, -1));
      caster('front', front, new THREE.Vector3(0, 0, 1));
      caster('left', left, new THREE.Vector3(-1, 0, 0));
      caster('right', right, new THREE.Vector3(1, 0, 0));
    }

    // Baseboard (an ogee-topped skirting, `mouldings.ts`) helps read the floor/wall edge in first
    // person; it stops at the doorways (capped there) and is mitred into the corners.
    const trimMat = scuffedPaint(finish.trim ?? 0xe4e0d8, 0.7);
    for (const name of WALLS) this.addRuns('skirting', name, trimMat, 0, doorways.filter((d) => d.wall === name));

    // Crown moulding where the walls meet the ceiling (a hollow cove): a finished room, not a box.
    if (finish.moulding === false) return;
    const coveMat = paint(0xfbf9f5, 0.8);
    for (const name of WALLS) this.addRuns('cove', name, coveMat, height, []);
  }

  /**
   * The runs of `kind` moulding along wall `name` at height `y` (the floor for the skirting, the
   * ceiling for the cove), cut round `gaps`: each run mitred where it meets a corner, capped at a doorway.
   */
  private addRuns(kind: MouldingKind, name: Wall, material: THREE.Material, y: number, gaps: readonly Doorway[]): void {
    const { width, depth } = this.options;
    const length = name === 'back' || name === 'front' ? width : depth;
    const eps = 1e-6;
    for (const seg of trimSegments(length, gaps.map((d) => ({ centre: d.along, width: d.width })))) {
      // In world order along the wall; the front and left walls run the other way in their own frame.
      const atLow: RunEnd = seg.centre - seg.length / 2 <= -length / 2 + eps ? 'mitre' : 'cap';
      const atHigh: RunEnd = seg.centre + seg.length / 2 >= length / 2 - eps ? 'mitre' : 'cap';
      const flipped = wallLocalX(name, 1) < 0;
      const mesh = new THREE.Mesh(mouldingGeometry(kind, seg.length, flipped ? atHigh : atLow, flipped ? atLow : atHigh), material);
      // Turned so its local +z points into the room (like the wall planes).
      switch (name) {
        case 'back':
          mesh.position.set(seg.centre, y, -depth / 2);
          break;
        case 'front':
          mesh.position.set(seg.centre, y, depth / 2);
          mesh.rotation.y = Math.PI;
          break;
        case 'left':
          mesh.position.set(-width / 2, y, seg.centre);
          mesh.rotation.y = Math.PI / 2;
          break;
        case 'right':
          mesh.position.set(width / 2, y, seg.centre);
          mesh.rotation.y = -Math.PI / 2;
          break;
      }
      // Like `boxMesh`: a caster when its longest side is (the run's length).
      mesh.castShadow = Math.max(seg.length, kind === 'skirting' ? SKIRTING.height : COVE.size) >= QUALITY.minShadowCaster;
      mesh.receiveShadow = true;
      this.add(mesh);
    }
  }

  private buildLights(): void {
    const { width, depth, height } = this.options;
    this.hemisphere = new THREE.HemisphereLight(DAY_SKY, this.floorBounce, 0.95);
    this.add(this.hemisphere);

    // Farthest point of the room from the lamp (a floor corner).
    const reach = Math.hypot(width / 2, depth / 2, height - 0.2);
    // A finite range: beyond `distance` a fragment skips this light, cube-shadow lookup included (with
    // distance 0 every fragment of the flat paid for it). three's window is (1 - (d/distance)^4)^2:
    // at LAMP_RANGE x reach it costs the farthest corner under 5 % and the rest of the room nothing visible.
    const range = LAMP_RANGE * reach;
    const ceilingLamp = new THREE.PointLight(LAMP_LIGHT.led, this.lampIntensity, range, 2);
    ceilingLamp.position.set(0, height - 0.2, 0);
    ceilingLamp.castShadow = true;
    ceilingLamp.shadow.mapSize.setScalar(QUALITY.shadowMapSize);
    // Point-light shadow depth is linear over [near, far]; the default far of 500 m makes any bias
    // huge (-0.002 was about 1 m, so low objects cast nothing). Bound it to the lamp's range: three
    // leaves a fragment beyond `far` unshadowed (it would shine through the walls), and the range
    // ends the light there; the shadow pass only renders what is within it (the zone's own layer and
    // the shells), so a lamp never renders the whole flat.
    const far = range;
    ceilingLamp.shadow.camera.far = far;
    ceilingLamp.shadow.camera.updateProjectionMatrix();
    ceilingLamp.shadow.bias = -LAMP_SHADOW_BIAS_M / far;
    // The normal offset in texels of the cube's faces, at the farthest corner (the coarsest texel it lays down).
    ceilingLamp.shadow.normalBias = normalBiasAt(reach, CUBE_FACE_HALF_ANGLE, QUALITY.shadowMapSize);
    // Rendered once now, then only while occupied or on `update()`'s slow tick; unoccupied until told
    // (see `setOccupied`). The zone that places the room restricts what it renders to the zone's own layer.
    this.lampShadow = new ShadowRefresh(ceilingLamp);
    ceilingLamp.shadow.needsUpdate = true;
    this.ceilingLamp = ceilingLamp;
    this.add(ceilingLamp);
  }
}

/**
 * The ceiling's bounce, strongest over the lamp (the plane's middle) and falling off towards the
 * walls, round in metres whatever the room's proportions: the plane's emissive map.
 */
function bounceFalloff(width: number, depth: number): THREE.CanvasTexture {
  const px = 64;
  const [canvas, ctx] = createCanvas(px, px);
  ctx.setTransform(px / width, 0, 0, px / depth, px / 2, px / 2);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, CEILING_BOUNCE_REACH);
  const edge = Math.round(255 * CEILING_BOUNCE_EDGE);
  glow.addColorStop(0, '#ffffff');
  glow.addColorStop(0.45, `rgb(${Math.round(255 * 0.8)},${Math.round(255 * 0.8)},${Math.round(255 * 0.8)})`);
  glow.addColorStop(1, `rgb(${edge},${edge},${edge})`);
  ctx.fillStyle = glow;
  ctx.fillRect(-width / 2, -depth / 2, width, depth);
  return toTexture(canvas);
}

/**
 * Local x, on a wall's plane, of the world coordinate `along` the wall (x for front/back, z for
 * left/right): the planes of the front and left walls are turned so their +x runs against it.
 */
function wallLocalX(wall: Wall, along: number): number {
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
  if (!holes.length) {
    // uvs in metres, like the ShapeGeometry below (its uvs are its coordinates): the plaster tiles alike on every wall.
    const plane = new THREE.PlaneGeometry(length, height);
    const position = plane.getAttribute('position');
    const uv = plane.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setXY(i, position.getX(i), position.getY(i));
    return plane;
  }
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
