import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { IDLE_SHADOW_INTERVAL, type OccupancyAware } from '../Furniture';
import { invisibleHitbox } from '../meshUtils';
import { basic, paint } from '../materials/palette';
import { Prop, part } from './Prop';
import { Curtains } from './Curtains';
import { RollerBlind } from './RollerBlind';
import { SunShaft } from './SunShaft';
import type { DayNight, SkyState } from './DayNight';
import type { Outdoors } from './outdoors/Outdoors';
import type { DrawnAware } from '../zone/Zone';
import { ShadowRefresh } from '../lighting/shadowRefresh';
import { PaneReflection } from '../materials/paneReflection';
import { WALL, layMesh } from '../surface/layers';
import { markGlass, unmarkGlass } from '@/graphics/glassMask';
import type { OutlookLease } from '../outlook/sharedOutlook';
import { normalBiasAt, snapDirection, texelAngle } from './shadowTexels';
import { random } from '@/random';

interface WindowOptions {
  /** Size of the glazed opening in metres. The kick rail below it reaches the floor. */
  width?: number;
  height?: number;
  /**
   * Whether this window's `update()` ticks the shared `DayNight` clock and the traffic outside.
   * Exactly one window per `DayNight` must drive it: N driving windows would run the day N times
   * faster. Default false.
   */
  drivesClock?: boolean;
  /**
   * Sun/moon spot light with shadows (one shadow map per window, expensive). When false neither
   * the light nor its invisible shadow-mask slabs are created. Default true.
   */
  sunlight?: boolean;
  /** Curtain rod with two floor-length fabric panels flanking the opening (see `Curtains`). Default true. */
  curtains?: boolean;
  /**
   * A roller blind over the glass instead of the curtains (see `RollerBlind`): it hangs no lower
   * than the opening, for a window over a sink or a worktop. Default false; wins over `curtains`.
   */
  blind?: boolean;
  /**
   * How deep (m) the plaster returns round the opening stand out of the wall: the jambs and the head of a thick old
   * wall's reveal, so the steel frame reads as set back in it rather than hung on it. 0 (default): none (a shop's
   * window, a lodge's). Kept under the curtains' standoff, which hang in front of it.
   */
  reveal?: number;
  /** Called while the curtains move with how open they are (1 open, 0 drawn): the room dims its skylight from it. */
  onCurtainsChange?: (openness: number) => void;
  /**
   * What is seen through the glass instead of the shared panorama: e.g. an `OutlookView`'s panes, for a room far from
   * where the panorama's eye is (a neighbour's flat). Laid flush with the pane, local +z into the room.
   */
  glass?: THREE.Object3D;
  /**
   * The street itself through the glass (`outlook/sharedOutlook`: `homeOutlook` for the flat's rooms on medium and
   * high), instead of the painted panorama: a pane of that view, ticked, prefetched and released with the window.
   * Null or absent: the panorama (or `glass`).
   */
  outlook?: OutlookLease | null;
}

/** Height of the steel kick rail between the floor and the glass (hides the baseboard). */
const KICK = 0.1;
/** Face width of the frame rails and of the grid mullions. */
const RAIL = 0.05;
const MULLION = 0.028;
/** The reveal's plaster returns: how thick each stands beside the frame (m). */
const REVEAL_BOARD = 0.035;
/** Target pane size the mullion grid is fitted to. */
const PANE_WIDTH = 0.4;
const PANE_HEIGHT = 0.5;
/** How far the invisible shadow masks reach around the opening (must catch the whole sun cone). */
const MASK_REACH = 3;
/** Distance of the sun/moon spot from the window and its half-angle: the cone just covers the opening. */
const LIGHT_DISTANCE = 9;
const LIGHT_HALF_ANGLE = THREE.MathUtils.degToRad(9.5);
/** How far the sun's direction leans out of the wall's plane (sine of the angle) before it lights the room fully. */
const SUN_GRAZE = 0.12;
/** The weakest sun that still makes a patch worth lying in (the sun is 5 at its height; cloud and a low sun dim it). */
const SUN_SPOT_MIN = 0.6;
/** Soft light of the sky through the glass (a rect area light, `QUALITY.areaLights`): its brightness in full daylight. */
const SKY_PANEL_INTENSITY = 1.6;
/** The curtain hem hangs this far above the floor. */
const HEM_CLEARANCE = 0.015;
/** The widest the sun's penumbra opens across the room, in its map's texels (high: `graphics/softShadows`). */
const SUN_PENUMBRA_TEXELS = 10;
/**
 * Without the area lights (low, medium) the sky still comes in by the window: a wide shadowless
 * spot just inside the glass aimed down into the room, bright by the sill and falling off across
 * it (the room's hemisphere is the even part, `Room` `SKYLIGHT_DAY`). Its intensity in full
 * daylight, its reach (m: the depth of a room) and its half-angle.
 */
const DAYLIGHT_SPOT = 2;
const DAYLIGHT_REACH = 5;
const DAYLIGHT_HALF_ANGLE = THREE.MathUtils.degToRad(62);
/**
 * The sun patch on the floor lights the room round it: a shadowless point light just above it,
 * the sun's colour times a floor's (warm wood), its share of the sun's intensity, and its reach (m).
 */
const BOUNCE_SHARE = 0.2;
const BOUNCE_TINT = new THREE.Color(0.78, 0.6, 0.44);
const BOUNCE_LIFT = 0.5;
const BOUNCE_REACH = 4;

/**
 * A loft window: a tall black steel frame rising from the floor, a grid of slim mullions, no
 * sill, and floor-length curtains. Its pane shows the shared `Outdoors` panorama (looked up along
 * the eye ray, so every window shows the same world from its own angle). A spot light outside
 * plays the sun, throwing a window-shaped patch across the floor: four invisible shadow-only
 * slabs around the opening block the rest of its cone, and the frame casts the grid's shadow.
 * The light comes from the panorama's sun direction, and goes out when that direction is behind
 * this wall (its shadow map stops updating too, so a dark window costs nothing).
 * Local +z faces into the room; the origin is the centre of the glass, `RoomWindow.mountY()`
 * gives the height to `place()` it at so the kick rail meets the floor.
 *
 * Several windows share one `DayNight`: only the one with `drivesClock` ticks it, the others
 * just listen.
 * Clicking the window draws or opens its curtains; drawn curtains shut the sun out (the spot fades
 * with them) and report their openness through `onCurtainsChange` so the room's skylight follows.
 */
export class RoomWindow extends Prop implements Updatable, Interactable, OccupancyAware, DrawnAware {
  readonly options: Required<Omit<WindowOptions, 'onCurtainsChange' | 'glass' | 'outlook'>> & Pick<WindowOptions, 'onCurtainsChange' | 'glass' | 'outlook'>;
  /** Local y of the floor (the bottom of the kick rail). */
  readonly floorY: number;
  private readonly unsubscribe: () => void;
  readonly hitboxes: THREE.Object3D[];
  /** The sun's shadow map is re-rendered regularly only in the player's room (`sunShadow`); now and then elsewhere (see `update`). */
  private occupied = false;
  /** Whether the zone's meshes are drawn: while they are hidden a refresh would render an empty map (see `setZoneDrawn`). */
  private zoneDrawn = true;
  private shadowTimer = random() * IDLE_SHADOW_INTERVAL;
  /** The sun's regular shadow refresh while the player is in this room and the sun comes in. */
  private sunShadow: ShadowRefresh | null = null;

  /** The sun/moon spot; null when `sunlight` is off. */
  private readonly light: THREE.SpotLight | null = null;
  private readonly curtains: Curtains | RollerBlind | null = null;
  /** The beam of sun and its dust (`QUALITY.lightShafts`). */
  private readonly shaft: SunShaft | null = null;
  /** The sky's soft light pouring through the whole opening (`QUALITY.areaLights`). */
  private readonly skyPanel: THREE.RectAreaLight | null = null;
  /** The sky's light pouring in where there is no area light (low, medium). */
  private readonly daylightSpot: THREE.SpotLight | null = null;
  /** The warm light the sun patch throws back up into the room (medium, high). */
  private readonly bounce: THREE.PointLight | null = null;
  private readonly steel: THREE.MeshStandardMaterial;
  /** The pane's reflection of the room, stronger as the outside darkens. */
  private readonly reflection = new PaneReflection();
  private sky: SkyState | null = null;
  private readonly worldQuaternion = new THREE.Quaternion();
  /** The pane of the street's 3D view (`outlook`), or of the painted panorama: one of them. */
  private readonly outlookPane: THREE.Mesh | null = null;
  private readonly panoramaPane: THREE.Mesh | null = null;
  private readonly lightDir = new THREE.Vector3();
  /** `lightDir` snapped to whole shadow texels: where the spot actually stands (see `apply`). */
  private readonly aimDir = new THREE.Vector3();

  /**
   * The reveal (`WindowOptions.reveal`): plaster returns standing `depth` out of the wall either side of the frame and
   * over its head, their inner faces against the rails, so the frame sits back in the wall's thickness. The jambs run
   * from the floor (through the skirting) to the head; they catch the sun and throw its shadow into the room.
   */
  private buildReveal(w: number, top: number, depth: number): void {
    const plaster = paint(0xefebe3, 0.92);
    const outer = w / 2 + RAIL;
    const height = top - this.floorY;
    for (const side of [-1, 1]) part(this, REVEAL_BOARD, height + REVEAL_BOARD, depth, plaster, { x: side * (outer + REVEAL_BOARD / 2), y: this.floorY + (height + REVEAL_BOARD) / 2, z: depth / 2 });
    part(this, 2 * outer, REVEAL_BOARD, depth, plaster, { y: top + REVEAL_BOARD / 2, z: depth / 2 });
  }

  /** Height at which to `place()` a window of glass height `height` so its kick rail stands on the floor. */
  static mountY(height: number): number {
    return KICK + height / 2;
  }

  constructor(
    readonly outdoors: Outdoors,
    options: WindowOptions = {},
  ) {
    super();
    this.name = 'Window';
    this.options = { width: 1.2, height: 2.4, drivesClock: false, sunlight: true, curtains: true, blind: false, reveal: 0, ...options };
    const { width: w, height: h } = this.options;
    this.floorY = -h / 2 - KICK;

    // The pane, flush with the wall: the outside, seen through it (the panorama, the street's 3D view, or the caller's own).
    // The panorama's material is the panes' alone (the balcony's surround has its own on the same uniforms): its layer is theirs.
    const pane = layMesh(new THREE.Mesh(new THREE.PlaneGeometry(w, h), outdoors.material), WALL.pane);
    pane.position.z = WALL.pane.lift;
    const lease = options.outlook;
    if (lease) {
      this.outlookPane = lease.view.pane(w, h, lease.toOutlook);
      this.outlookPane.position.z = WALL.pane.lift;
      // The street is heard through it (`Outdoors.panesIn`).
      this.outlookPane.userData.streetPane = true;
      this.add(this.outlookPane);
    } else if (options.glass) {
      options.glass.position.z = WALL.pane.lift;
      this.add(options.glass);
    } else {
      this.add(pane);
      markGlass(pane);
      this.panoramaPane = pane;
    }
    // Over it, the room given back by the glass: faint by day, the lit room in the dark pane at night.
    this.add(this.reflection.over(pane.geometry));

    // Black steel frame: side rails from the floor to the head, a head rail, a kick rail down to
    // the floor (tall enough to swallow the baseboard), then the grid of mullions.
    // Painted steel: a dielectric (metalness 0), the paint's sheen in its roughness.
    const steel = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.45, metalness: 0 });
    this.steel = steel;
    const frameDepth = 0.06;
    const top = h / 2 + RAIL;
    const frameHeight = top - this.floorY;
    part(this, RAIL, frameHeight, frameDepth, steel, { x: -w / 2 - RAIL / 2, y: (top + this.floorY) / 2, z: frameDepth / 2 });
    part(this, RAIL, frameHeight, frameDepth, steel, { x: w / 2 + RAIL / 2, y: (top + this.floorY) / 2, z: frameDepth / 2 });
    part(this, w, RAIL, frameDepth, steel, { y: h / 2 + RAIL / 2, z: frameDepth / 2 });
    part(this, w, KICK, frameDepth, steel, { y: -h / 2 - KICK / 2, z: frameDepth / 2 });
    const columns = Math.max(1, Math.round(w / PANE_WIDTH));
    const rows = Math.max(1, Math.round(h / PANE_HEIGHT));
    for (let i = 1; i < columns; i++) part(this, MULLION, h, 0.04, steel, { x: -w / 2 + (w * i) / columns, z: 0.02 });
    for (let j = 1; j < rows; j++) part(this, w, MULLION, 0.04, steel, { y: -h / 2 + (h * j) / rows, z: 0.02 });
    if (this.options.reveal > 0) this.buildReveal(w, top, this.options.reveal);

    if (QUALITY.areaLights) {
      // Lights look down their local -z: turned round, it faces into the room.
      this.skyPanel = new THREE.RectAreaLight(0xffffff, 0, w, h);
      this.skyPanel.position.z = 0.02;
      this.skyPanel.rotation.y = Math.PI;
      this.add(this.skyPanel);
    } else {
      // From just under the head of the glass, down into the room (local +z).
      this.daylightSpot = new THREE.SpotLight(0xffffff, 0, DAYLIGHT_REACH, DAYLIGHT_HALF_ANGLE, 1, 2);
      this.daylightSpot.position.set(0, h * 0.3, 0.12);
      this.daylightSpot.target.position.set(0, this.floorY, DAYLIGHT_REACH * 0.45);
      this.add(this.daylightSpot, this.daylightSpot.target);
    }

    if (this.options.blind) {
      this.curtains = new RollerBlind({ width: w, height: h, frame: RAIL });
      this.add(this.curtains);
    } else if (this.options.curtains) {
      this.curtains = new Curtains({ width: w, height: h, frame: RAIL, hemY: this.floorY + HEM_CLEARANCE });
      this.add(this.curtains);
    }

    // Over the glass and its frame: the click target for the curtains.
    const hitbox = invisibleHitbox(w + 2 * RAIL, frameHeight, 0.12, { y: (top + this.floorY) / 2, z: 0.06 });
    if (!this.curtains) hitbox.layers.disableAll(); // nothing to do here without curtains
    this.hitboxes = [hitbox];
    this.add(hitbox);

    if (this.options.sunlight) {
      // Shadow-only slabs outside the wall: they cast into the shadow map but draw nothing.
      const maskMat = basic({ colorWrite: false, depthWrite: false });
      const masks = [
        part(this, w + 2 * MASK_REACH, MASK_REACH, 0.02, maskMat, { y: h / 2 + MASK_REACH / 2, z: -0.03 }),
        part(this, w + 2 * MASK_REACH, MASK_REACH, 0.02, maskMat, { y: -h / 2 - MASK_REACH / 2, z: -0.03 }),
        part(this, MASK_REACH, h, 0.02, maskMat, { x: -w / 2 - MASK_REACH / 2, z: -0.03 }),
        part(this, MASK_REACH, h, 0.02, maskMat, { x: w / 2 + MASK_REACH / 2, z: -0.03 }),
      ];
      for (const m of masks) {
        m.receiveShadow = false;
        // Shadow passes only: the camera would draw them for nothing.
        m.layers.disable(0);
      }

      // Sun / moon: a narrow spot with no distance falloff, aimed at the centre of the glass.
      this.light = new THREE.SpotLight(0xffffff, 0, 0, LIGHT_HALF_ANGLE, 0.35, 0);
      this.light.castShadow = true;
      this.light.shadow.mapSize.setScalar(QUALITY.sunShadowMapSize);
      this.light.shadow.camera.near = LIGHT_DISTANCE - 2;
      this.light.shadow.camera.far = LIGHT_DISTANCE + 12;
      this.light.shadow.bias = -0.0003;
      // High: contact-hardening penumbra up to this many texels (`graphics/softShadows`; elsewhere the radius means nothing to a spot).
      if (QUALITY.level === 'high') this.light.shadow.radius = SUN_PENUMBRA_TEXELS;
      // In texels of the map, at the far end of the patch it throws (the floor a few metres in).
      this.light.shadow.normalBias = normalBiasAt(LIGHT_DISTANCE + MASK_REACH, LIGHT_HALF_ANGLE, QUALITY.sunShadowMapSize);
      this.light.target.position.set(0, 0, 0);
      this.add(this.light, this.light.target);
      this.sunShadow = new ShadowRefresh(this.light);
      if (QUALITY.detailedMaterials) {
        this.bounce = new THREE.PointLight(0xffffff, 0, BOUNCE_REACH, 2);
        this.add(this.bounce);
      }

      if (QUALITY.lightShafts) {
        this.shaft = new SunShaft({ width: w, height: h, columns, rows, floorY: this.floorY });
        this.add(this.shaft);
      }
    }

    this.unsubscribe = this.dayNight.onChange((sky) => this.apply(sky));
  }

  /** Stops following the clock (the zone unloading it calls this), lets go of the street's view. */
  dispose(): void {
    this.unsubscribe();
    if (this.outlookPane) this.options.outlook?.view.release(this.outlookPane);
    this.options.outlook?.release();
    if (this.panoramaPane) unmarkGlass(this.panoramaPane);
  }

  get dayNight(): DayNight {
    return this.outdoors.dayNight;
  }

  /** 1 with the curtains open (or none), 0 once they are drawn across the pane. */
  get curtainOpenness(): number {
    return this.curtains?.currentOpenness ?? 1;
  }

  /** Whether the curtains (or the blind) are drawn, or on their way there. */
  get curtainsDrawn(): boolean {
    return this.curtains?.isDrawn ?? false;
  }

  /** Draws or opens the curtains (or the blind) as a click would, without one (a memory's evening, `memories/pastLight`). */
  setCurtainsDrawn(drawn: boolean): void {
    this.curtains?.setDrawn(drawn);
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    if (this.sky) this.apply(this.sky);
    // Walked in: the street through the glass is built now, at the next idle moment.
    if (occupied) this.options.outlook?.view.prefetch();
  }

  /** Culled from view: the idle refresh waits (the room is hidden, its map would come out empty), and runs at once when drawn again. */
  setZoneDrawn(drawn: boolean): void {
    this.zoneDrawn = drawn;
    if (drawn && this.light) this.light.shadow.needsUpdate = true;
  }

  /**
   * Ticks the shared clock and the life outside (only when this window `drivesClock`), eases the
   * curtains, and refreshes the sun's shadow map now and then when the player is in another room.
   */
  update(dt: number): void {
    if (this.options.drivesClock) {
      this.dayNight.update(dt);
      this.outdoors.update(dt);
    }
    this.options.outlook?.view.update(dt);
    if (this.curtains?.update(dt)) {
      if (this.sky) this.apply(this.sky);
      this.options.onCurtainsChange?.(this.curtains.currentOpenness);
    }
    this.shaft?.update(dt);
    this.sunShadow?.update(dt);
    if (this.occupied || !this.zoneDrawn || !this.light || this.light.intensity <= 0) return;
    this.shadowTimer += dt;
    if (this.shadowTimer < IDLE_SHADOW_INTERVAL) return;
    this.shadowTimer = 0;
    this.light.shadow.needsUpdate = true;
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(hovered: boolean): void {
    this.steel.emissive.setHex(hovered ? 0x3a352c : 0x000000);
  }

  label(): string | null {
    if (!this.curtains) return null;
    if (this.curtains instanceof RollerBlind) return this.curtains.isDrawn ? 'Blind · raise' : 'Blind · lower';
    return this.curtains.isDrawn ? 'Curtains · open' : 'Curtains · draw';
  }

  activate(_session: SessionActions): void {
    this.curtains?.toggle();
  }

  /** World floor point 0.35 m inside the room from the glass centre: where a cat sits to look out. */
  lookoutSpot(out: THREE.Vector3): THREE.Vector3 {
    return this.localToWorld(out.set(0, this.floorY, 0.35));
  }

  /**
   * Where this window's sun patch lands on the floor (world), or null when it throws no sun right
   * now (no sun light, sun behind the wall or clouds, curtains drawn, night) or the patch would fall more
   * than 3 m from the window. The caller checks the point against the room and its furniture.
   */
  sunSpotOnFloor(out: THREE.Vector3): THREE.Vector3 | null {
    if (!this.light || !this.sky || this.sky.night || this.light.intensity < SUN_SPOT_MIN) return null;
    // `lightDir` points from the glass towards the sun (local frame); the rays travel the other way.
    const dir = this.lightDir;
    if (dir.y <= 0.02) return null;
    const t = -this.floorY / dir.y;
    out.set(-dir.x * t, this.floorY, -dir.z * t);
    if (Math.hypot(out.x, out.z) > 3) return null;
    return this.localToWorld(out);
  }

  private apply(sky: SkyState): void {
    this.sky = sky;
    this.reflection.set(sky.daylight);
    // The fabric in front of the glass glows with the sky behind it.
    this.curtains?.setBacklight(sky.ambient, sky.daylight);
    if (this.skyPanel) {
      this.skyPanel.color.copy(sky.ambient);
      this.skyPanel.intensity = SKY_PANEL_INTENSITY * sky.daylight * THREE.MathUtils.lerp(0.15, 1, this.curtainOpenness);
    }
    if (this.daylightSpot) {
      this.daylightSpot.color.copy(sky.ambient);
      this.daylightSpot.intensity = DAYLIGHT_SPOT * sky.daylight * THREE.MathUtils.lerp(0.15, 1, this.curtainOpenness);
    }
    if (!this.light) return;
    // The panorama's light direction, brought into this window's frame (outward is local -z).
    // Behind the wall: no light. The first call runs before `place()`, the per-frame ones after.
    this.getWorldQuaternion(this.worldQuaternion).invert();
    this.outdoors.lightDirection(sky, this.lightDir).applyQuaternion(this.worldQuaternion);
    // The spot moves in whole texels of its map as the sun crosses the sky: the window's shadow hops
    // a texel now and then instead of its edges crawling every frame.
    snapDirection(this.lightDir, texelAngle(LIGHT_HALF_ANGLE, this.light.shadow.mapSize.x), this.aimDir);
    this.light.position.copy(this.aimDir).multiplyScalar(LIGHT_DISTANCE);
    this.light.color.copy(sky.lightColor);
    // Drawn curtains shut the sun out; the light fades with the panels. As the sun comes round into
    // the wall's plane it fades out over the last few degrees rather than going off at once.
    const facing = THREE.MathUtils.smoothstep(-this.lightDir.z, 0, SUN_GRAZE);
    this.light.intensity = sky.lightIntensity * this.curtainOpenness * facing;
    // A dark light still gets its shadow map rendered unless told otherwise: skip the pass while the
    // sun is behind this wall (or the curtains drawn), and while the player is in another room
    // (`update` refreshes it now and then). Toggling `castShadow` instead would recompile every
    // material, so the light stays a shadow caster and only stops updating.
    this.sunShadow?.setLive(this.occupied && this.light.intensity > 0);
    this.shaft?.setSun(this.lightDir, sky.lightColor, sky.night ? 0 : this.light.intensity);
    this.placeBounce(sky);
  }

  /** The bounce light over this window's sun patch (local frame), dark when no patch lies on the floor near the window. */
  private placeBounce(sky: SkyState): void {
    const bounce = this.bounce;
    if (!bounce || !this.light) return;
    const dir = this.lightDir;
    const t = dir.y > 0.02 ? -this.floorY / dir.y : Infinity;
    const x = -dir.x * t;
    const z = -dir.z * t;
    const near = Number.isFinite(t) && Math.hypot(x, z) <= 3.5;
    if (!near || sky.night) {
      bounce.intensity = 0;
      return;
    }
    // Halfway between the glass and the patch's far end: the patch's middle, roughly.
    bounce.position.set(x * 0.6, this.floorY + BOUNCE_LIFT, z * 0.6);
    bounce.color.copy(sky.lightColor).multiply(BOUNCE_TINT);
    bounce.intensity = BOUNCE_SHARE * this.light.intensity;
  }
}
