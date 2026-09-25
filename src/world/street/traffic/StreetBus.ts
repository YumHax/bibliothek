import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { DayNight } from '../../props/DayNight';
import { BUS, busGeometries } from '../carModel';
import { nightnessOf } from '../streetAir';
import { snowCovered } from '../snowCover';
import type { Vec2 } from '../streetPlan';
import { ScriptedVehicle, type CollisionSet } from './ScriptedVehicle';
import type { StreetTraffic } from './StreetTraffic';

export interface StreetBusOptions {
  traffic: StreetTraffic;
  viewer: THREE.Object3D;
  /** The line it drives (route 0 of the traffic): it pulls in to `stop` on the way. */
  route: readonly Vec2[];
  stop: { at: Vec2; dwell: number };
  /** Game minutes between two buses by day, and at night. */
  every: number;
  nightEvery: number;
  /** The line's number, on the destination board. */
  line: string;
  stopFor: number;
  collisions?: CollisionSet;
}

/** Never closer than this (real seconds) between two buses, whatever the timetable says: a game day is only ten minutes. */
const MIN_GAP_S = 80;
const NIGHT_MIN_GAP_S = 160;
const CRUISE = 7;
/** How far the doors slide open along the side, and how long they take. */
const DOOR_SLIDE = 0.42;
const DOOR_TIME = 0.8;
/** How far before the stop the indicator starts blinking, and how long after pulling away it keeps on. */
const SIGNAL_BEFORE = 30;
const SIGNAL_AFTER = 3;
const LIVERY = 0xe9e6dc;
const STRIPE = 0x2f7a4a;

/**
 * The city bus (line `line`): comes up Park Street on the traffic's first route, turns into Front
 * Street, and pulls in at the shelter (`stop`, in the far parking lane) with its indicator
 * blinking; there the doors slide open, `traffic.busAtStop` goes true for the queue to board,
 * and after `dwell` seconds it closes up, indicates and pulls out, on towards the side street.
 * One every `every` game minutes by day, `nightEvery` at night (never closer than a minute and
 * a bit in real time). A single mesh set of its own (body with its livery stripe, glass, tyres,
 * lamps, the two door leaves, the lit destination board), solid while it stands.
 */
export class StreetBus extends ScriptedVehicle {
  private readonly lampMaterial: THREE.MeshBasicMaterial;
  private readonly indicatorMaterial: THREE.MeshBasicMaterial;
  private readonly signMaterial: THREE.MeshBasicMaterial;
  private readonly doors: THREE.Mesh[] = [];
  private doorOpen = 0;
  private waitClock = 6;
  private blink = 0;
  private sinceLeaving = Infinity;

  constructor(private readonly dayNight: DayNight, private readonly bus: StreetBusOptions) {
    // The line through the stop: the first route's points, with the pull-in and pull-out spliced in around it.
    super({
      traffic: bus.traffic,
      viewer: bus.viewer,
      route: withStop(bus.route, bus.stop.at),
      cruise: CRUISE,
      size: { length: BUS.length, width: BUS.width, height: BUS.height },
      kind: 'bus',
      stops: [bus.stop],
      stopFor: bus.stopFor,
      collisions: bus.collisions,
      accel: 1.2,
    });
    this.name = 'StreetBus';
    const g = busGeometries();
    const body = new THREE.Mesh(g.body, snowCovered(new THREE.MeshStandardMaterial({ color: LIVERY, roughness: 0.4, metalness: 0.3 })));
    const stripe = new THREE.Mesh(g.stripe, new THREE.MeshStandardMaterial({ color: STRIPE, roughness: 0.45, metalness: 0.2 }));
    const glass = new THREE.Mesh(g.glass, new THREE.MeshStandardMaterial({ color: 0x18222a, roughness: 0.1, metalness: 0.6 }));
    const wheels = new THREE.Mesh(g.wheels, new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 }));
    this.lampMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x666666 });
    this.indicatorMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, color: 0x222222 });
    const lamps = new THREE.Mesh(g.lamps, this.lampMaterial);
    const indicators = new THREE.Mesh(g.indicators, this.indicatorMaterial);
    for (const mesh of [body, stripe, glass, wheels]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
    this.add(body, stripe, glass, wheels, lamps, indicators);

    // The door leaves: dark glass in a frame, on the kerb side (+z), sliding outwards and apart.
    const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x2a3438, roughness: 0.2, metalness: 0.5 });
    for (const x of BUS.doors) {
      for (const side of [-1, 1]) {
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(BUS.doorWidth / 2 - 0.02, BUS.doorHeight - 0.2, 0.04), leafMaterial);
        leaf.position.set(x + (side * BUS.doorWidth) / 4, 0.45 + (BUS.doorHeight - 0.2) / 2, BUS.width / 2 + 0.03);
        leaf.userData.closedX = leaf.position.x;
        leaf.userData.side = side;
        this.doors.push(leaf);
        this.add(leaf);
      }
    }

    // The destination board over the windscreen, front and back.
    this.signMaterial = new THREE.MeshBasicMaterial({ map: signTexture(bus.line), color: 0x999999 });
    const { y, width, height } = BUS.sign;
    for (const facing of [1, -1] as const) {
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(facing > 0 ? width : width * 0.5, height), this.signMaterial);
      sign.rotation.y = (facing * Math.PI) / 2;
      sign.position.set(facing * (BUS.length / 2 + 0.035), y, 0);
      this.add(sign);
    }
  }

  protected schedule(dt: number): void {
    if (this.active) return;
    this.waitClock -= dt;
    if (this.waitClock > 0) return;
    const night = this.dayNight.state.hours < 6 || this.dayNight.state.hours >= 22.5;
    const gameMinute = this.dayNight.dayLength / (24 * 60);
    this.waitClock = Math.max(night ? NIGHT_MIN_GAP_S : MIN_GAP_S, (night ? this.bus.nightEvery : this.bus.every) * gameMinute);
    this.depart();
  }

  protected arrived(): void {
    this.sinceLeaving = Infinity;
  }

  protected leaving(): void {
    this.sinceLeaving = 0;
    this.bus.traffic.busAtStop = false;
  }

  protected finished(): void {
    this.bus.traffic.busAtStop = false;
  }

  /** At the stop: stay till the doors have shut again after the dwell. */
  protected keepWaiting(index: number): boolean {
    return super.keepWaiting(index) || this.doorOpen > 0;
  }

  protected animate(dt: number): void {
    const s = this.dayNight.state;
    const night = THREE.MathUtils.smoothstep(nightnessOf(s), 0.2, 0.6);
    this.lampMaterial.color.setScalar(0.4 + 2.4 * night);
    this.signMaterial.color.setScalar(0.9 + 1.1 * night);

    // Doors: open once stood a moment, shut a moment before the dwell is up.
    const standing = this.state === 'stopped';
    const dwell = this.bus.stop.dwell;
    const wantOpen = standing && this.stoodFor > 0.8 && this.stoodFor < dwell - DOOR_TIME;
    this.doorOpen = THREE.MathUtils.clamp(this.doorOpen + (wantOpen ? dt : -dt) / DOOR_TIME, 0, 1);
    for (const leaf of this.doors) {
      const t = this.doorOpen;
      leaf.position.x = (leaf.userData.closedX as number) + (leaf.userData.side as number) * DOOR_SLIDE * Math.min(1, t * 1.4);
      leaf.position.z = BUS.width / 2 + 0.03 + 0.1 * Math.min(1, t * 3);
    }
    this.bus.traffic.busAtStop = standing && this.doorOpen >= 1;

    // The indicator: pulling in (the stop ahead) and pulling out again.
    this.sinceLeaving += dt;
    const indicating = (this.state === 'driving' && this.toNextStop < SIGNAL_BEFORE) || (standing && this.stoodFor > dwell - 2) || this.sinceLeaving < SIGNAL_AFTER;
    this.blink = (this.blink + dt) % 0.8;
    this.indicatorMaterial.color.setScalar(indicating && this.blink < 0.4 ? 2.4 : 0.15);
  }
}

/**
 * The route through the stop: the given points up to the straight stretch of Front Street the
 * stop is on, a pull-in to the stop (in the parking lane) and a pull-out back to the lane, then the rest.
 */
function withStop(route: readonly Vec2[], [sx, sz]: Vec2): Vec2[] {
  const i = route.findIndex((p, k) => k + 1 < route.length && p[0] <= sx - 14 && route[k + 1]![0] >= sx + 14 && p[1] === route[k + 1]![1]);
  if (i < 0) return [...route];
  const lane = route[i]![1];
  return [
    ...route.slice(0, i + 1),
    [sx - 12, lane], [sx - 5.5, sz - 0.3], [sx - 2, sz], [sx + 2, sz], [sx + 6.5, sz - 0.6], [sx + 12, lane],
    ...route.slice(i + 1),
  ];
}

/** The destination board: amber dot-matrix letters on black. */
function signTexture(line: string): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 36);
  ctx.fillStyle = '#0a0a08';
  ctx.fillRect(0, 0, 256, 36);
  ctx.fillStyle = '#ffb020';
  ctx.font = 'bold 26px "Courier New", monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(line, 8, 19);
  ctx.textAlign = 'center';
  ctx.fillText('GARE CENTRALE', 150, 19);
  // The dot matrix: a grid of dark lines over the letters.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  for (let x = 0; x < 256; x += 3) ctx.fillRect(x, 0, 1, 36);
  for (let y = 0; y < 36; y += 3) ctx.fillRect(0, y, 256, 1);
  return toTexture(canvas, 2);
}
