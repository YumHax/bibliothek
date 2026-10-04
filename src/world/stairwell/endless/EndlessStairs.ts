import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { NoticeActions } from '@/notices';
import { gameDayRandom } from '@/time/daily';
import { playHingeCreak } from '@/audio/furnitureSounds';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { OccupancyAware } from '../../Furniture';
import { Prop } from '../../props/Prop';
import { WALL, onSurface } from '../../surface/layers';
import type { Staircase } from '../Staircase';
import type { StairLights } from '../StairLights';
import { STAIRWELL_PLAN as stairs } from '../stairwellPlan';
import { landingY } from '@/world/measures/building';
import { ENDLESS_PLAN as plan } from './endlessPlan';
import { playBackwardsPiano } from './endlessSounds';
import { StrangeDoor } from './StrangeDoor';
import { loudness } from '@/audio/hearing';

interface EndlessStairsOptions {
  viewer: THREE.Object3D;
  stairs: Staircase;
  lights: StairLights;
  hours: () => number;
  gameDay: () => number;
  /** Whether anyone else is on the stairs (a resident, the postman): it only happens with the player alone. */
  someoneAbout: () => boolean;
  /** Whether the eye (zone-local) is in the lift's car. */
  inLift: (local: THREE.Vector3) => boolean;
  /** What the player thinks, under the crosshair. */
  notices?: NoticeActions;
}

/** The eye over the feet, standing (a crouch sits lower: the thresholds have room for it). */
const EYE = 1.7;
/** Seconds between two backwards phrases behind the nameless door. */
const PIANO_EVERY_S = 14;

type Phase = 'idle' | 'armed' | 'looping';

/**
 * The endless stairs: on one night in a few (`ENDLESS_PLAN.odds`, between `hours.from` and `hours.to`), the player
 * who set off down from our landing alone finds the flight under the 3rd floor leading onto the 4th's again. Nothing
 * is built for it: on that flight the player is moved up one storey, on the same tread (`shift`: the controller's
 * `shiftVertically`, wired by `bootstrap/world.ts` through the handle), and the building is the same storey after
 * storey but for the doors and the plates. As it goes on, the floor plates read wrong (over the real ones), the
 * timer globes only flicker (`StairLights.setHaunted`), every tread creaks, and a door with no name or colour stands
 * on the lower landing, a piano behind it playing backwards. Walking back up past the 4th, or taking the lift, ends
 * it until the next night. Costs nothing the rest of the time: two plates and a door, hidden.
 */
export class EndlessStairs extends Prop implements Updatable, OccupancyAware {
  readonly contactShadow = false;
  /** The nameless door, for the builder to place (it is clickable). */
  readonly door: StrangeDoor;
  private readonly plates: { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial; text: string }[] = [];
  private readonly eye = new THREE.Vector3();
  private phase: Phase = 'idle';
  /** The last night drawn (a night is the game day it ends in), and whether it was a loop night not yet walked. */
  private night = -1;
  private loopNight = false;
  /** `?debug`'s `bibliothek.endlessStairs()`: the next arming ignores the hour and the draw. */
  private forced = false;
  private wraps = 0;
  private occupied = false;
  private shift: ((dy: number) => void) | null = null;
  private lastTread = '';
  private piano = PIANO_EVERY_S / 2;

  constructor(private readonly options: EndlessStairsOptions) {
    super();
    this.name = 'EndlessStairs';
    // The plates hung over the real floor names of the two landings, a hair proud of them.
    const { shaft, floorLanding } = stairs;
    for (const k of [plan.upper, plan.lower]) {
      // A map from the start, so a new plate is a new texture, never a new shader at the moment of the wrap.
      // Over the real plate it covers, a wall layer's lift out and pulled forward by its rank: they never fight at a grazing angle.
      const material = onSurface(new THREE.MeshStandardMaterial({ roughness: 0.9, map: plateTexture('') }), WALL.overlay);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.24), material);
      mesh.position.set(shaft.x0 + stairs.floorNameOff + WALL.overlay.lift, landingY(k) + stairs.floorNameY, (floorLanding.z0 + floorLanding.z1) / 2);
      mesh.rotation.y = Math.PI / 2;
      mesh.visible = false;
      this.add(mesh);
      this.plates.push({ mesh, material, text: '' });
    }
    this.door = new StrangeDoor(plan.door.label, plan.door.knock);
  }

  /** Where the nameless door stands (zone-local), and its yaw: on the lower landing's north wall, facing the landing. */
  get doorPlace(): { at: THREE.Vector3; yaw: number } {
    return { at: new THREE.Vector3(plan.doorX, plan.lowerY, stairs.floorLanding.z1 - 0.005), yaw: Math.PI };
  }

  /** How the player is moved up a storey without a jolt (`FirstPersonController.shiftVertically`). */
  connectPlayer(shift: (dy: number) => void): void {
    this.shift = shift;
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    if (!occupied && this.phase === 'armed') this.phase = 'idle';
  }

  /** `?debug`: tonight is an endless night, whatever the hour (it arms on our landing as usual). */
  force(): void {
    this.forced = true;
  }

  update(dt: number): void {
    if (!this.occupied || !this.shift) return;
    const { viewer, inLift } = this.options;
    viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    const feet = this.eye.y - EYE;
    switch (this.phase) {
      case 'idle':
        if (this.mayArm() && Math.abs(feet - landingY(0)) < plan.armWithin) this.phase = 'armed';
        return;
      case 'armed':
        if (inLift(this.eye) || this.options.someoneAbout()) {
          this.phase = 'idle';
          return;
        }
        if (this.onWrapFlight(feet)) this.wrap();
        return;
      case 'looping':
        if (inLift(this.eye) || this.options.someoneAbout() || feet > plan.upperY + plan.exitAbove) {
          this.end();
          return;
        }
        if (this.onWrapFlight(feet)) this.wrap();
        this.creaks();
        this.pianoBehindDoor(dt);
        return;
    }
  }

  /** Tonight's draw, the hour, nobody about. A night is the game day it ends in (from 23:00 it is the next one's). */
  private mayArm(): boolean {
    if (this.options.someoneAbout()) return false;
    if (this.forced) return true;
    const hours = this.options.hours();
    if (!(hours >= plan.hours.from || hours < plan.hours.to)) return false;
    const night = this.options.gameDay() + (hours >= plan.hours.from ? 1 : 0);
    if (this.night !== night) {
      this.night = night;
      this.loopNight = gameDayRandom('endless-stairs', night)() < plan.odds;
    }
    return this.loopNight;
  }

  /** On flight A of the lower landing, past its first treads: the moment to be put back a storey up. */
  private onWrapFlight(feet: number): boolean {
    const { x, z } = this.eye;
    const { flightA, floorLanding, halfLanding } = stairs;
    return x > flightA.x0 && x < flightA.x1 && z < floorLanding.z0 - 0.3 && z > halfLanding.z1 && feet < plan.lowerY - plan.wrapBelow && feet > plan.lowerY - stairs.treads * 0.4;
  }

  private wrap(): void {
    this.shift!(plan.shift);
    this.phase = 'looping';
    this.wraps++;
    const names = plan.names[Math.min(this.wraps, plan.names.length) - 1]!;
    names.forEach((text, i) => this.paint(i, text));
    this.options.lights.setHaunted(true);
    this.door.setShown(this.wraps >= plan.doorFrom);
    const thought = plan.thoughts[this.wraps];
    if (thought) this.options.notices?.react(thought);
  }

  private end(): void {
    // Over for the night (and a forced one is spent).
    this.phase = 'idle';
    this.loopNight = false;
    this.forced = false;
    this.wraps = 0;
    for (const plate of this.plates) plate.mesh.visible = false;
    this.door.setShown(false);
    this.options.lights.setHaunted(false);
    this.options.notices?.react(plan.over);
  }

  /** Every tread creaks while it lasts, not only the 4th floor's third. */
  private creaks(): void {
    const tread = this.options.stairs.treadAt(this.eye.x, this.eye.z, this.eye.y - 1.2);
    const key = tread ? `${tread.k}${tread.flight}${tread.tread}` : '';
    if (key && key !== this.lastTread) playHingeCreak(0.035);
    this.lastTread = key;
  }

  /** Behind the nameless door, now and then, the piano's tune played backwards. */
  private pianoBehindDoor(dt: number): void {
    if (!this.door.visible) return;
    this.piano -= dt;
    if (this.piano > 0) return;
    this.piano = PIANO_EVERY_S;
    const d = this.eye.distanceTo(this.doorPlace.at.setY(plan.lowerY + 1.2));
    playBackwardsPiano(0.05 * loudness(d, { shape: 'inverseSquare', referenceDistance: Math.sqrt(6), maxDistance: Infinity }));
  }

  /** Plate `i` (0 the upper landing's, 1 the lower's) reads `text` ('' blank), shown over the real one. */
  private paint(i: number, text: string): void {
    const plate = this.plates[i]!;
    plate.mesh.visible = true;
    if (plate.text === text) return;
    plate.text = text;
    plate.material.map?.dispose();
    plate.material.map = plateTexture(text);
  }
}

/** A floor plate's paint: the wall's cream, the name in oxblood ('' blank), as the real ones. */
function plateTexture(text: string): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(128, 96);
  ctx.fillStyle = '#e6dcc6';
  ctx.fillRect(0, 0, 128, 96);
  if (text) {
    ctx.fillStyle = '#6a2a22';
    ctx.font = 'bold 58px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 52, 116);
  }
  return toTexture(canvas, 'facing');
}
