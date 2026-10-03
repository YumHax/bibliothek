import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import type { PaintedFront } from '../Buildings';
import { FacadeFrame } from '../relief/facadeFrame';
import type { Vec2 } from '../streetPlan';

/** Doors swinging at once, at most (the crowd's and the standing people's comings and goings). */
const POOL = 4;
/** Seconds the leaf takes to swing in, stays open, takes to swing to. */
const OPENING = 0.35;
const OPEN = 0.9;
const CLOSING = 0.45;
/** A door is the one used when someone goes in or out this close to its middle (metres along the pavement). */
const NEAR = 1.6;
/** Just in front of the painted door, inside its stone surround. */
const OUT = 0.012;
/** What shows through the gap: a dark hallway, a shop lit inside (by day, open), a hall's light on at night. */
const HALL = new THREE.Color(0x15110e);
const HALL_LIT = new THREE.Color(0x3a2c1e);
const SHOP_LIT = new THREE.Color(0x6a5640);

interface Door {
  at: Vec2;
  frame: FacadeFrame;
  s: number;
  shop: boolean;
  /** The opening a leaf leaves (one leaf of a house's double door, a shop's glazed door). */
  width: number;
  height: number;
  bottom: number;
  /** A door built in 3D stands in front of this painted one: it has no gap of its own. */
  built: boolean;
}

interface Swing {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  door: Door | null;
  t: number;
}

/**
 * The street's doors opening for whoever goes in or comes out (`open`): the painted doors on the facades
 * (`Buildings.fronts`) are flat, so a gap the shape of a leaf swung inwards opens over the door, from its hinge,
 * dark (a hallway) or warm (a shop lit inside), stays a moment while they pass, and closes. A few at a time, from
 * a pool of quads; nothing drawn while every door is shut.
 */
export class DoorGaps extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly doors: Door[] = [];
  private readonly swings: Swing[] = [];

  /** `real`: the doors built in 3D in front of their painted ones (the travel doors: the arcade, RETRO GAMES, the walk-in shops): never a gap there. */
  constructor(fronts: readonly PaintedFront[], private readonly dayNight: DayNight, real: readonly Vec2[] = []) {
    super();
    this.name = 'DoorGaps';
    for (const front of fronts) {
      const frame = new FacadeFrame(front.spec);
      for (const door of front.features.doors) {
        // A hole in the wall (our own door, the sas's real one) is not painted.
        if (front.spec.openings?.some((o) => Math.abs(o.at - door.s) < 0.5)) continue;
        const p = frame.point(door.s, 0);
        const width = door.shop ? door.width - 0.2 : door.width / 2 - 0.04;
        const built = real.some(([x, z]) => Math.hypot(x - p.x, z - p.z) < 0.9);
        this.doors.push({ at: [p.x, p.z], frame, s: door.s, shop: door.shop, width, height: door.shop ? 2.4 : 2.6, bottom: door.shop ? 0.15 : 0.05, built });
      }
    }
    // A unit quad with its hinge edge at x 0, opening along +x, bottom at y 0.
    const quad = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);
    for (let i = 0; i < POOL; i++) {
      const material = new THREE.MeshBasicMaterial({ color: HALL });
      const mesh = new THREE.Mesh(quad, material);
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.add(mesh);
      this.swings.push({ mesh, material, door: null, t: 0 });
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /**
   * Where the painted door nearest `at` along the same building line really is (the painter places a shop's door
   * somewhere along its front, the plan says its middle), within `range` metres; null when none is.
   */
  snap([x, z]: Vec2, range: number): Vec2 | null {
    let best: Door | null = null;
    let bestD = range;
    for (const door of this.doors) {
      const [dx, dz] = door.at;
      // On the same line: along x (Front Street's rows) or along z (Park Street's).
      if (Math.abs(dz - z) > 0.3 && Math.abs(dx - x) > 0.3) continue;
      const d = Math.hypot(dx - x, dz - z);
      if (d < bestD) {
        bestD = d;
        best = door;
      }
    }
    return best ? [best.at[0], best.at[1]] : null;
  }

  /** Whether the door at (or nearest) `at` is a shop's; null when no painted door is there. */
  isShopDoor(at: Vec2): boolean | null {
    return this.nearest(at)?.shop ?? null;
  }

  /** Someone goes through the door at `at` (zone-local, on the building line): it opens and closes after them. */
  open(at: Vec2): void {
    const door = this.nearest(at);
    if (!door || door.built) return;
    const busy = this.swings.find((s) => s.door === door);
    if (busy) {
      // Held open for the next one through.
      busy.t = Math.min(busy.t, OPENING);
      return;
    }
    const swing = this.swings.find((s) => !s.door);
    if (!swing) return;
    swing.door = door;
    swing.t = 0;
    const s = this.dayNight.state;
    swing.material.color.copy(door.shop ? (s.daylight > 0.1 ? SHOP_LIT : HALL_LIT) : s.daylight < 0.2 ? HALL_LIT : HALL);
    // The hinge on the door's left as the street sees it; a house's left leaf.
    const left = door.shop ? door.s - door.width / 2 : door.s - door.width - 0.02;
    door.frame.matrix(left, door.bottom, OUT, swing.mesh.matrix);
    swing.mesh.matrix.decompose(swing.mesh.position, swing.mesh.quaternion, swing.mesh.scale);
    swing.mesh.scale.set(0.001, door.height, 1);
    swing.mesh.visible = true;
  }

  update(dt: number): void {
    for (const swing of this.swings) {
      const door = swing.door;
      if (!door) continue;
      swing.t += dt;
      const t = swing.t;
      // The leaf's swing in, seen face on: the gap widens as the sine of its angle.
      const open = t < OPENING ? Math.sin((t / OPENING) * (Math.PI / 2)) : t < OPENING + OPEN ? 1 : Math.cos(Math.min(1, (t - OPENING - OPEN) / CLOSING) * (Math.PI / 2));
      swing.mesh.scale.x = Math.max(0.001, door.width * open);
      if (t >= OPENING + OPEN + CLOSING) {
        swing.door = null;
        swing.mesh.visible = false;
      }
    }
  }

  private nearest([x, z]: Vec2): Door | null {
    let best: Door | null = null;
    let bestD = NEAR;
    for (const door of this.doors) {
      const d = Math.hypot(door.at[0] - x, door.at[1] - z);
      if (d < bestD) {
        bestD = d;
        best = door;
      }
    }
    return best;
  }
}
