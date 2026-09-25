import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { IDLE_SHADOW_INTERVAL, type OccupancyAware } from '../Furniture';
import { invisibleHitbox } from '../meshUtils';
import { Prop, part } from './Prop';
import { Curtains } from './Curtains';
import { RollerBlind } from './RollerBlind';
import { SunShaft } from './SunShaft';
import type { DayNight, SkyState } from './DayNight';
import type { Outdoors } from './outdoors/Outdoors';
import type { DrawnAware } from '../zone/Zone';

export interface WindowOptions {
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
  /** Called while the curtains move with how open they are (1 open, 0 drawn): the room dims its skylight from it. */
  onCurtainsChange?: (openness: number) => void;
}

/** Height of the steel kick rail between the floor and the glass (hides the baseboard). */
const KICK = 0.1;
/** Face width of the frame rails and of the grid mullions. */
const RAIL = 0.05;
const MULLION = 0.028;
/** Target pane size the mullion grid is fitted to. */
const PANE_WIDTH = 0.4;
const PANE_HEIGHT = 0.5;
/** How far the invisible shadow masks reach around the opening (must catch the whole sun cone). */
const MASK_REACH = 3;
/** Distance of the sun/moon spot from the window and its half-angle: the cone just covers the opening. */
const LIGHT_DISTANCE = 9;
const LIGHT_HALF_ANGLE = THREE.MathUtils.degToRad(9.5);
/** Soft light of the sky through the glass (a rect area light, `QUALITY.areaLights`): its brightness in full daylight. */
const SKY_PANEL_INTENSITY = 1.6;
/** The curtain hem hangs this far above the floor. */
const HEM_CLEARANCE = 0.015;

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
  readonly options: Required<Omit<WindowOptions, 'onCurtainsChange'>> & Pick<WindowOptions, 'onCurtainsChange'>;
  /** Local y of the floor (the bottom of the kick rail). */
  readonly floorY: number;
  private readonly unsubscribe: () => void;
  readonly hitboxes: THREE.Object3D[];
  /** The sun's shadow map is re-rendered every frame only in the player's room; now and then elsewhere (see `update`). */
  private occupied = false;
  /** Whether the zone's meshes are drawn: while they are hidden a refresh would render an empty map (see `setZoneDrawn`). */
  private zoneDrawn = true;
  private shadowTimer = Math.random() * IDLE_SHADOW_INTERVAL;

  /** The sun/moon spot; null when `sunlight` is off. */
  private readonly light: THREE.SpotLight | null = null;
  private readonly curtains: Curtains | RollerBlind | null = null;
  /** The beam of sun and its dust (`QUALITY.lightShafts`). */
  private readonly shaft: SunShaft | null = null;
  /** The sky's soft light pouring through the whole opening (`QUALITY.areaLights`). */
  private readonly skyPanel: THREE.RectAreaLight | null = null;
  private readonly steel: THREE.MeshStandardMaterial;
  private sky: SkyState | null = null;
  private readonly worldQuaternion = new THREE.Quaternion();
  private readonly lightDir = new THREE.Vector3();

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
    this.options = { width: 1.2, height: 2.4, drivesClock: false, sunlight: true, curtains: true, blind: false, ...options };
    const { width: w, height: h } = this.options;
    this.floorY = -h / 2 - KICK;

    // The pane, flush with the wall: the outside, seen through it.
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), outdoors.material);
    pane.position.z = 0.004;
    this.add(pane);

    // Black steel frame: side rails from the floor to the head, a head rail, a kick rail down to
    // the floor (tall enough to swallow the baseboard), then the grid of mullions.
    const steel = new THREE.MeshStandardMaterial({ color: 0x2b2b2e, roughness: 0.5, metalness: 0.35 });
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

    if (QUALITY.areaLights) {
      // Lights look down their local -z: turned round, it faces into the room.
      this.skyPanel = new THREE.RectAreaLight(0xffffff, 0, w, h);
      this.skyPanel.position.z = 0.02;
      this.skyPanel.rotation.y = Math.PI;
      this.add(this.skyPanel);
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
      const maskMat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
      const masks = [
        part(this, w + 2 * MASK_REACH, MASK_REACH, 0.02, maskMat, { y: h / 2 + MASK_REACH / 2, z: -0.03 }),
        part(this, w + 2 * MASK_REACH, MASK_REACH, 0.02, maskMat, { y: -h / 2 - MASK_REACH / 2, z: -0.03 }),
        part(this, MASK_REACH, h, 0.02, maskMat, { x: -w / 2 - MASK_REACH / 2, z: -0.03 }),
        part(this, MASK_REACH, h, 0.02, maskMat, { x: w / 2 + MASK_REACH / 2, z: -0.03 }),
      ];
      for (const m of masks) m.receiveShadow = false;

      // Sun / moon: a narrow spot with no distance falloff, aimed at the centre of the glass.
      this.light = new THREE.SpotLight(0xffffff, 0, 0, LIGHT_HALF_ANGLE, 0.35, 0);
      this.light.castShadow = true;
      this.light.shadow.mapSize.setScalar(QUALITY.shadowMapSize);
      this.light.shadow.camera.near = LIGHT_DISTANCE - 2;
      this.light.shadow.camera.far = LIGHT_DISTANCE + 12;
      this.light.shadow.bias = -0.0003;
      this.light.shadow.normalBias = 0.02;
      this.light.target.position.set(0, 0, 0);
      this.add(this.light, this.light.target);

      if (QUALITY.lightShafts) {
        this.shaft = new SunShaft({ width: w, height: h, columns, rows, floorY: this.floorY });
        this.add(this.shaft);
      }
    }

    this.unsubscribe = this.dayNight.onChange((sky) => this.apply(sky));
  }

  /** Stops following the clock (the zone unloading it calls this). */
  dispose(): void {
    this.unsubscribe();
  }

  get dayNight(): DayNight {
    return this.outdoors.dayNight;
  }

  /** 1 with the curtains open (or none), 0 once they are drawn across the pane. */
  get curtainOpenness(): number {
    return this.curtains?.currentOpenness ?? 1;
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    if (this.sky) this.apply(this.sky);
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
    if (this.curtains?.update(dt)) {
      if (this.sky) this.apply(this.sky);
      this.options.onCurtainsChange?.(this.curtains.currentOpenness);
    }
    this.shaft?.update(dt);
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
    if (this.curtains instanceof RollerBlind) return this.curtains.isDrawn ? 'Click to raise the blind' : 'Click to lower the blind';
    return this.curtains.isDrawn ? 'Click to open the curtains' : 'Click to draw the curtains';
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
   * now (no sun light, sun behind the wall, curtains drawn, night) or the patch would fall more
   * than 3 m from the window. The caller checks the point against the room and its furniture.
   */
  sunSpotOnFloor(out: THREE.Vector3): THREE.Vector3 | null {
    if (!this.light || !this.sky || this.sky.night || this.light.intensity <= 0) return null;
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
    if (this.skyPanel) {
      this.skyPanel.color.copy(sky.ambient);
      this.skyPanel.intensity = SKY_PANEL_INTENSITY * sky.daylight * THREE.MathUtils.lerp(0.15, 1, this.curtainOpenness);
    }
    if (!this.light) return;
    // The panorama's light direction, brought into this window's frame (outward is local -z).
    // Behind the wall: no light. The first call runs before `place()`, the per-frame ones after.
    this.getWorldQuaternion(this.worldQuaternion).invert();
    this.outdoors.lightDirection(sky, this.lightDir).applyQuaternion(this.worldQuaternion);
    this.light.position.copy(this.lightDir).multiplyScalar(LIGHT_DISTANCE);
    this.light.color.copy(sky.lightColor);
    // Drawn curtains shut the sun out; the light fades with the panels.
    this.light.intensity = this.lightDir.z < 0 ? sky.lightIntensity * this.curtainOpenness : 0;
    // A dark light still gets its shadow map rendered every frame unless told otherwise: skip the
    // pass while the sun is behind this wall (or the curtains drawn), and while the player is in
    // another room (`update` refreshes it now and then). Toggling `castShadow` instead would
    // recompile every material, so the light stays a shadow caster and only stops updating.
    this.light.shadow.autoUpdate = this.occupied && this.light.intensity > 0;
    this.shaft?.setSun(this.lightDir, sky.lightColor, sky.night ? 0 : this.light.intensity);
  }
}
