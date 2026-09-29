import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { cylinderMesh, invisibleHitbox } from '../meshUtils';
import { part } from '../props/Prop';
import { proud } from '../props/joinery';
import { paint } from '../materials/palette';
import { ClickSpot } from '../props/ClickSpot';
import { WaterStream } from './WaterStream';
import { WaterRipples, rippleNormals } from './WaterRipples';
import { Steam } from '../kitchen/Steam';
import { HoverGlint } from '../props/hoverGlint';
import { CERAMIC, CHROME, CLEAR_GLASS, STILL_WATER } from '../props/bathroomMaterials';

/** What the tub's water is doing, for the builder's sound: tap running, plug out, how full (0..1). */
export interface BathWater {
  running: boolean;
  draining: boolean;
  depth: number;
}

export interface BathtubOptions {
  /** Outer size. Default a standard 1.7 x 0.75 m tub, 0.55 m high. */
  length?: number;
  width?: number;
  height?: number;
  /** Which end (local x) the tap, the riser and the shower head are at. Default left. */
  tapEnd?: 'left' | 'right';
  /** A fixed glass screen on the rim at the tap end. Default true. */
  screen?: boolean;
  /** Called whenever the water changes (tap, plug, level): the builder runs the sound from it. */
  onWater?: (water: BathWater) => void;
  /** A click on the full bath: a soak (the builder's rules, `HomeLife.soak`); true lets the water out after it. Without it a full bath does nothing. */
  onSoak?: () => boolean;
}

/** Thickness of the shell's walls and height of the basin floor above the room floor (the skirt hides the feet). */
const SHELL = 0.06;
const BASIN_FLOOR = 0.12;
/** Where the wall-mounted mixer sits and how high the shower head hangs. */
const TAP_Y = 0.72;
const HEAD_Y = 2.0;
const HEAD_REACH = 0.36;
/** The glass screen: long enough to catch the shower, tall enough not to soak the room. */
const SCREEN_LENGTH = 0.8;
const SCREEN_HEIGHT = 1.4;
/** The spout's mouth, from the mixer's plate: where the stream falls from. */
const SPOUT_TIP = { y: TAP_Y - 0.034, z: 0.165 };
/** The water stops this far under the rim (the overflow), and takes this long to fill from empty, to drain from full. */
const FREEBOARD = 0.1;
const FILL_SECONDS = 45;
const DRAIN_SECONDS = 25;
/** The water is drawn once it is deeper than this. */
const WET = 0.004;
/** How fast the surface's ripples drift (uv per second): stirred by the tap, barely moving still. */
const RIPPLE_DRIFT = { running: 0.22, still: 0.012 };
/** A full bath steams: from this full, harder the fuller. */
const STEAM_FROM = 0.65;

const RUBBER = paint(0x1d1d1f, 0.7);

/**
 * A built-in bathtub: a white ceramic shell (skirt, back and end panels round a sunken basin),
 * a chrome mixer on the wall above one end with a riser up to a rain shower head, and a fixed
 * glass screen standing on the rim at that end. Clicking the mixer runs the bath: a stream
 * falls, the water rises until the tap is shut or it reaches the overflow; clicking the plug
 * (`plugSpot`, placed by the builder with `placeWith`) lets it out, and it goes back in once the
 * tub is empty. Wall-hung with `y: 0`: origin on the floor at the wall, the tub's length along
 * local x, +z into the room. Collides over its whole slab.
 */
export class Bathtub extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly footprint: THREE.Box3;
  readonly hitboxes: THREE.Object3D[];
  /** The click target on the drain that pulls the plug or puts it back. */
  readonly plugSpot: ClickSpot;
  /** Tub-local point of the spout's mouth: where the builder puts the sound of the running water. */
  readonly tapPoint: THREE.Vector3;
  private readonly stream = new WaterStream(0.008);
  private readonly surface: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private readonly plug: THREE.Mesh;
  private readonly drain: THREE.Vector3;
  private readonly capacity: number;
  private readonly water: BathWater = { running: false, draining: false, depth: 0 };
  /** Where a cat curls up in the dry tub (tub-local), the floor in front it hops in from, and the rim it clears. */
  private readonly catSpot: THREE.Vector3;
  private readonly catApproach: THREE.Vector3;
  private readonly rim: THREE.Vector3;
  /** The surface's normal map, drifted each frame, and the rings spreading where the stream lands. */
  private readonly ripples: THREE.Texture;
  private readonly rings = new WaterRipples(0.16);
  private readonly steam = new Steam({ count: 14, life: 4.5, rise: 0.07, startSize: 0.12, endSize: 0.5, opacity: 0.07 });
  /** The two cross handles glint on hover. */
  private glint: HoverGlint | null = null;

  constructor(private readonly options: BathtubOptions = {}) {
    super();
    this.name = 'Bathtub';
    const length = options.length ?? 1.7;
    const width = options.width ?? 0.75;
    const height = options.height ?? 0.55;
    const end = options.tapEnd === 'right' ? 1 : -1;
    const tapX = end * (length / 2 - 0.3);
    const inner = length - 2 * SHELL;
    this.capacity = height - FREEBOARD - BASIN_FLOOR;
    this.drain = new THREE.Vector3(end * (inner / 2 - 0.12), BASIN_FLOOR, width / 2);

    this.buildShell(length, width, height, end);
    this.buildTap(tapX);
    if (options.screen ?? true) this.buildScreen(end, length, width, height);

    // The water: one sheet at the level, as big as the basin (the inner faces hide its edges).
    const material = STILL_WATER.clone();
    // Not the palette's any more: this copy wears the bath's own drifting ripples.
    material.userData = {};
    this.ripples = rippleNormals();
    this.ripples.repeat.set(inner / 0.35, (width - 2 * SHELL) / 0.35);
    material.normalMap = this.ripples;
    material.normalScale.set(0.35, 0.35);
    this.surface = new THREE.Mesh(new THREE.PlaneGeometry(inner - 0.004, width - 2 * SHELL - 0.004).rotateX(-Math.PI / 2), material);
    this.surface.position.set(0, BASIN_FLOOR, width / 2);
    this.surface.visible = false;
    this.tapPoint = new THREE.Vector3(tapX, SPOUT_TIP.y, SPOUT_TIP.z);
    this.stream.position.copy(this.tapPoint);
    this.plug = cylinderMesh(0.03, 0.012, RUBBER, { x: this.drain.x, y: BASIN_FLOOR + 0.006, z: this.drain.z }, { radiusBottom: 0.026, segments: 14 });
    // The rings under the spout, and the steam over the middle of the basin, both riding the water's level.
    this.rings.position.set(tapX, BASIN_FLOOR, SPOUT_TIP.z);
    this.steam.position.set(0, BASIN_FLOOR, width / 2);
    this.add(this.surface, this.stream, this.plug, this.rings, this.steam);
    this.showWater();

    const hitbox = invisibleHitbox(0.24, 0.16, 0.22, { x: tapX, y: TAP_Y, z: 0.1 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
    this.plugSpot = new ClickSpot({
      size: [0.16, 0.1, 0.16],
      label: () => (this.water.draining ? 'Plug · put in' : this.water.depth > 0 ? 'Plug · pull' : null),
      onClick: () => this.setDraining(!this.water.draining),
    });
    this.plugSpot.position.set(this.drain.x, BASIN_FLOOR + 0.05, this.drain.z);

    this.footprint = new THREE.Box3(new THREE.Vector3(-length / 2, 0, 0), new THREE.Vector3(length / 2, height, width));
    // A cat's spot: on the basin floor a little way from the middle, away from the tap and the drain.
    this.catSpot = new THREE.Vector3(-end * 0.2, BASIN_FLOOR, width / 2);
    this.catApproach = new THREE.Vector3(this.catSpot.x, 0, width + 0.3);
    this.rim = new THREE.Vector3(0, height, 0);
  }

  /** No water in it and none running: dry enough for a cat. */
  get isEmpty(): boolean {
    return this.water.depth <= 0 && !this.water.running;
  }

  /** World point on the basin floor where a cat curls up; `approachPoint` is the floor in front it hops in from. */
  restingSpot(out: THREE.Vector3): THREE.Vector3 {
    return this.localToWorld(out.copy(this.catSpot));
  }

  approachPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.localToWorld(out.copy(this.catApproach));
  }

  /** World height of the rim a hop in or out must clear. */
  get rimHeight(): number {
    return this.localToWorld(this.rim.clone()).y;
  }

  update(dt: number): void {
    this.stream.update(dt);
    this.stir(dt);
    const { running, draining } = this.water;
    if (!running && !draining) return;
    const rate = (running ? 1 / FILL_SECONDS : 0) - (draining ? 1 / DRAIN_SECONDS : 0);
    const depth = THREE.MathUtils.clamp(this.water.depth + rate * dt, 0, 1);
    const changed = depth !== this.water.depth;
    this.water.depth = depth;
    // Full: the tap is shut (the overflow would take the rest). Empty and not running: the plug goes back in.
    if (depth >= 1 && running) this.water.running = false;
    if (depth <= 0 && draining && !running) this.water.draining = false;
    if (changed || this.water.running !== running || this.water.draining !== draining) {
      this.showWater();
      this.options.onWater?.({ ...this.water });
    }
  }

  // --- Interactable -------------------------------------------------------------------------

  /** The surface's ripples drift (quicker under the running tap), the rings spread where the stream lands, a full bath steams. */
  private stir(dt: number): void {
    const wet = this.surface.visible;
    if (wet) {
      const drift = (this.water.running ? RIPPLE_DRIFT.running : RIPPLE_DRIFT.still) * dt;
      this.ripples.offset.x = (this.ripples.offset.x + drift) % 1;
      this.ripples.offset.y = (this.ripples.offset.y + drift * 0.6) % 1;
    }
    this.rings.running = wet && this.water.running;
    this.rings.update(dt);
    this.steam.rate = wet ? 0.6 * THREE.MathUtils.smoothstep(this.water.depth, STEAM_FROM, 1) : 0;
    this.steam.update(dt);
  }

  setHovered(hovered: boolean): void {
    this.glint?.set(hovered);
  }

  label(): string {
    if (this.water.running) return 'Bath tap · turn off';
    if (this.water.depth >= 1) return this.options.onSoak ? 'Bath · take a bath' : 'The bath is full';
    return 'Bath · run';
  }

  activate(_session: SessionActions): void {
    if (!this.water.running && this.water.depth >= 1) {
      if (this.options.onSoak?.()) this.setDraining(true);
      return;
    }
    this.water.running = !this.water.running;
    this.showWater();
    this.options.onWater?.({ ...this.water });
  }

  private setDraining(draining: boolean): void {
    if (draining && this.water.depth <= 0 && !this.water.running) return;
    this.water.draining = draining;
    this.showWater();
    this.options.onWater?.({ ...this.water });
  }

  /** The sheet at its level (deeper water a little less clear), the stream down to it, the plug in or beside the drain. */
  private showWater(): void {
    const level = BASIN_FLOOR + this.water.depth * this.capacity;
    this.surface.position.y = level;
    this.surface.visible = level - BASIN_FLOOR > WET;
    this.rings.position.y = level;
    this.steam.position.y = level;
    this.surface.material.opacity = 0.35 + 0.35 * this.water.depth;
    this.stream.visible = this.water.running;
    this.stream.setLength(SPOUT_TIP.y - level);
    if (this.water.draining) {
      this.plug.position.set(this.drain.x - Math.sign(this.drain.x) * 0.1, BASIN_FLOOR + 0.008, this.drain.z + 0.12);
      this.plug.rotation.z = 0.25;
    } else {
      this.plug.position.set(this.drain.x, BASIN_FLOOR + 0.006, this.drain.z);
      this.plug.rotation.z = 0;
    }
  }

  /** Four panels round a basin floor; the inner faces are what one sees looking down into it. */
  private buildShell(length: number, width: number, height: number, end: number): void {
    const inner = length - 2 * SHELL;
    part(this, length, height, SHELL, CERAMIC, { y: height / 2, z: width - SHELL / 2 });
    part(this, length, height, SHELL, CERAMIC, { y: height / 2, z: SHELL / 2 });
    for (const side of [-1, 1]) part(this, SHELL, height, width - 2 * SHELL, CERAMIC, { x: side * (length / 2 - SHELL / 2), y: height / 2, z: width / 2 });
    part(this, inner, BASIN_FLOOR, width - 2 * SHELL, CERAMIC, { y: BASIN_FLOOR / 2, z: width / 2 });
    // The drain at the tap end and the overflow above it on the end panel.
    this.add(cylinderMesh(0.035, 0.004, CHROME, { x: this.drain.x, y: BASIN_FLOOR + 0.002, z: this.drain.z }, { segments: 16 }));
    const overflow = cylinderMesh(0.028, 0.004, CHROME, { x: end * (inner / 2 - 0.002), y: height - 0.12, z: width / 2 }, { segments: 16 });
    overflow.rotation.z = Math.PI / 2;
    this.add(overflow);
  }

  /** Wall-mounted mixer with two cross handles and a spout, the riser to the shower arm and its head. */
  private buildTap(x: number): void {
    part(this, 0.18, 0.1, 0.012, CHROME, { x, y: TAP_Y, z: 0.006 });
    const spout = cylinderMesh(0.014, 0.16, CHROME, { x, y: TAP_Y - 0.02, z: 0.09 }, { segments: 12 });
    spout.rotation.x = Math.PI / 2;
    this.add(spout);
    const handles = [-0.065, 0.065].map((dx) => {
      const handle = cylinderMesh(0.022, 0.03, CHROME, { x: x + dx, y: TAP_Y, z: 0.027 }, { segments: 12 });
      handle.rotation.x = Math.PI / 2;
      this.add(handle);
      return handle;
    });
    this.glint = HoverGlint.of(...handles);
    const riserH = HEAD_Y - TAP_Y;
    this.add(cylinderMesh(0.011, riserH, CHROME, { x, y: TAP_Y + riserH / 2, z: 0.03 }, { segments: 10 }));
    const arm = cylinderMesh(0.01, HEAD_REACH, CHROME, { x, y: HEAD_Y, z: HEAD_REACH / 2 }, { segments: 10 });
    arm.rotation.x = Math.PI / 2;
    this.add(arm);
    this.add(cylinderMesh(0.1, 0.018, CHROME, { x, y: HEAD_Y - 0.02, z: HEAD_REACH }, { segments: 24 }));
    // Keep the hand shower's cradle too: a small hook on the riser, the handset in it.
    part(this, 0.03, 0.02, 0.05, CHROME, { x, y: 1.25, z: 0.045 });
    this.add(cylinderMesh(0.018, 0.22, CHROME, { x, y: 1.14, z: 0.07 }, { radiusBottom: 0.012, segments: 10 }));
  }

  /** A clear pane standing on the rim, hinged to a chrome profile against the wall. */
  private buildScreen(end: number, length: number, width: number, height: number): void {
    const z = width - SHELL / 2;
    // The pane and its rail stop inside the wall profile, and the rail runs 2 mm past the pane's
    // free edge (`PROUD`): no end face shares a plane with another (they would z-fight).
    const pane = SCREEN_LENGTH - 0.01;
    const rail = proud(pane, 1);
    const glass = part(this, pane, SCREEN_HEIGHT, 0.006, CLEAR_GLASS, { x: end * (length / 2 - 0.01 - pane / 2), y: height + SCREEN_HEIGHT / 2, z });
    glass.castShadow = false;
    part(this, 0.02, SCREEN_HEIGHT + 0.004, 0.03, CHROME, { x: end * (length / 2 - 0.01), y: height + SCREEN_HEIGHT / 2 + 0.002, z });
    part(this, rail, 0.012, 0.02, CHROME, { x: end * (length / 2 - 0.01 - rail / 2), y: height + 0.006, z });
  }
}
