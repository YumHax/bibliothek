import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { HEARING, loudness } from '@/audio/hearing';
import type { Furniture, OccupancyAware } from '../Furniture';
import type { DayNight, SkyState } from '../props/DayNight';
import { STAIRWELL_PLAN as plan } from './stairwellPlan';
import { STOREY, STOREYS, landingY } from '@/world/measures/building';
import { playRelay } from './stairSounds';
import { LAMP_GLOW, LAMP_LIGHT } from '../lighting/lampColours';
import { mainsOn } from '@/building/mains';
import { skyGlassColour } from '../materials/glass';
import { random } from '@/random';

interface StairLightsOptions {
  /** The eye: the sensors see it, and the real lights follow the lit globes nearest to it. */
  viewer: THREE.Object3D;
}

/**
 * How many real lights follow the player, their candela and reach: about a storey and a bit, so a landing's lamp lights
 * its landing and the flights off it, never the landing above or below through the stairs (lights ignore the slabs).
 */
const LIGHTS = 2;
const INTENSITY = 9;
const REACH = STOREY * 1.3;
const WARM = LAMP_LIGHT.incandescent.clone();
const TOP = landingY(0) + 2.8;
/** Seconds a globe stays lit once its sensor saw someone (the building's timer), and its bulb's warm-up and fade. */
const LIT_S = 45;
const WARM_UP_S = 0.25;
const COOL_S = 0.9;
/** A sensor sees the player (or a resident, the postman) this near across its landing (m) and this near in height (feet to its floor, m). */
const SENSOR_REACH = 3.9;
const SENSOR_HEIGHT = 1.9;
/** Seconds a real light takes to fade out of one globe and into another (it never jumps while lit). */
const SLOT_FADE_S = 0.3;
/** The globes over each floor: 2.35 m up the wall. */
const GLOBE_Y = 2.35;
const EYE = 1.7;
/** A power cut's candles (`setCandles`): the two real lights move to the nearest flames, this bright, this colour. */
const CANDLE_INTENSITY = 1.6;
const CANDLE = new THREE.Color(0xff9a48);
/** The endless stairs' globes (`setHaunted`): a faint, unsteady glow, whatever the sensors see. */
const HAUNT_GLOW = 0.18;

interface Slot {
  at: THREE.Vector3;
  /** The floor the sensor watches (local y). */
  floor: number;
  /** Seconds left lit (0: off). */
  left: number;
  /** 0 dark .. 1 lit, following `left`. */
  glow: number;
}

interface Bulb {
  light: THREE.PointLight;
  /** The globe it lights now, and the one it is fading over to. */
  slot: number;
  next: number;
  fade: number;
}

/**
 * The stairwell's light, the building's timer lights: a frosted globe on every landing's wall (floor and half
 * landings), over the hall and on our strip, each with its own sensor: the player coming onto a landing switches its
 * globe on (the relay's clack echoing down the stone), and it stays lit `LIT_S` seconds after they left it, then goes
 * out with a softer clack, so a climb leaves a trail of lit landings behind it going dark one by one, never the whole
 * building at once. Two real point lights (no shadow; never added or removed, dimmed with their intensity) light the
 * lit globes nearest the player, fading out of one globe and into the next rather than jumping; dimmed to 0 while
 * nobody is here (the lights ignore walls, so they must not shine into the flat); a hemisphere for the soft light
 * bouncing down the shaft, on only while occupied; and the skylight in the roof, the sky's colour through dusty glass
 * (grey under cloud, dark with rain, white with snow on it). `lightLevel` is what the reflections follow.
 */
export class StairLights extends THREE.Group implements Furniture, Updatable, OccupancyAware {
  readonly contactShadow = false;
  private readonly slots: Slot[] = [];
  private readonly bulbs: Bulb[] = [];
  private readonly globes: THREE.InstancedMesh;
  private readonly sky: THREE.MeshBasicMaterial;
  private readonly ambient: THREE.HemisphereLight;
  private readonly eye = new THREE.Vector3();
  private readonly ear = new THREE.Vector3();
  private readonly colour = new THREE.Color();
  private readonly order: number[];
  private occupied = false;
  /** The people on the stairs the sensors see too (zone-local, feet at `position.y`), while they are about. */
  private walkers: readonly { readonly isPresent: boolean; readonly position: THREE.Vector3 }[] = [];
  /** 0 .. 1: the stairwell's real lights allowed on (the player in it), eased. */
  private on = 0;
  private chooseClock = 0;
  /** The flames a power cut lit on the landings (zone-local), the real lights' places while the mains are off. */
  private candles: readonly THREE.Vector3[] = [];
  private candleTime = 0;
  /** The endless stairs: the globes only flicker. */
  private haunted = false;
  /** Whether the last frame was in a power cut. */
  private cut = false;

  constructor(private readonly dayNight: DayNight, private readonly options: StairLightsOptions) {
    super();
    this.name = 'StairLights';
    const half = STOREY / 2;
    const { shaft, hall, floorLanding, halfLanding, strip } = plan;
    const mid = (shaft.x0 + shaft.x1) / 2 - 0.4;
    const slot = (at: THREE.Vector3, floor: number): Slot => ({ at, floor, left: 0, glow: 0 });
    for (let k = 0; k <= STOREYS; k++) this.slots.push(slot(new THREE.Vector3(mid, landingY(k) + GLOBE_Y, floorLanding.z1 - 0.07), landingY(k)));
    for (let k = 0; k < STOREYS; k++) this.slots.push(slot(new THREE.Vector3(mid, landingY(k) - half + GLOBE_Y, halfLanding.z0 + 0.07), landingY(k) - half));
    this.slots.push(slot(new THREE.Vector3((hall.x0 + hall.x1) / 2, hall.height - 0.12, (hall.z0 + hall.z1) / 2), landingY(STOREYS)));
    this.slots.push(slot(new THREE.Vector3((strip.x0 + strip.x1) / 2, landingY(0) + strip.ceiling - 0.1, (strip.z0 + strip.z1) / 2), landingY(0)));
    this.order = this.slots.map((_, i) => i);

    // One draw for every globe, each lit on its own (an instance colour).
    this.globes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.11, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), this.slots.length);
    this.slots.forEach((s, i) => {
      this.globes.setMatrixAt(i, new THREE.Matrix4().makeTranslation(s.at.x, s.at.y, s.at.z));
      this.globes.setColorAt(i, this.colour.copy(WARM).multiplyScalar(0.12));
    });
    this.globes.castShadow = false;
    this.globes.computeBoundingSphere();
    this.add(this.globes);

    // The skylight over the well.
    this.sky = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const skylight = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4).rotateX(Math.PI / 2), this.sky);
    skylight.position.set((plan.well.x0 + plan.well.x1) / 2, TOP - 0.01, (plan.well.z0 + plan.well.z1) / 2);
    this.add(skylight);

    for (let i = 0; i < LIGHTS; i++) {
      const light = new THREE.PointLight(WARM, 0, REACH, 2);
      light.castShadow = false;
      light.position.copy(this.slots[i]!.at);
      this.bulbs.push({ light, slot: i, next: i, fade: 0 });
      this.add(light);
    }
    this.ambient = new THREE.HemisphereLight(LAMP_GLOW.led, 0x7a6a58, 0);
    this.add(this.ambient);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** The residents and the postman: they trip a landing's sensor as the player does. */
  watch(walkers: readonly { readonly isPresent: boolean; readonly position: THREE.Vector3 }[]): void {
    this.walkers = walkers;
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
  }

  /**
   * A timer button pressed (`TimerButton`, on every landing): the old minuterie, every globe of the building on for
   * the timer's time at once (each relay clacks as it switches), over the sensors. Returns false when nothing lit
   * (no power).
   */
  pressTimer(): boolean {
    if (!mainsOn()) return false;
    this.slots.forEach((slot) => {
      if (slot.left <= 0) this.relay(slot, true);
      slot.left = Math.max(slot.left, LIT_S);
    });
    return true;
  }

  /** How lit floor landing `k`'s globe is now, 0 .. 1 (its timer button's pilot glows while it is dark). */
  landingGlow(k: number): number {
    return this.slots[k]?.glow ?? 0;
  }

  /** How lit the stairwell is where the player is, 0 dark .. 1 bright: the lit globes near them, a little daylight from the roof. */
  lightLevel(): number {
    return THREE.MathUtils.clamp(0.25 + 0.5 * this.litNear() + 0.25 * this.dayNight.state.daylight, 0, 1);
  }

  /** A power cut's flames on the landings (zone-local; none: the power is back): the real lights go to the nearest. */
  setCandles(spots: readonly THREE.Vector3[]): void {
    this.candles = spots;
  }

  /** The endless stairs (`endless/EndlessStairs`): the globes no longer answer the sensors, they flicker faintly. */
  setHaunted(haunted: boolean): void {
    this.haunted = haunted;
  }

  update(dt: number): void {
    this.on += THREE.MathUtils.clamp((this.occupied ? 1 : 0) - this.on, -dt / COOL_S, dt / WARM_UP_S);
    this.options.viewer.getWorldPosition(this.ear);
    this.eye.copy(this.ear);
    this.worldToLocal(this.eye);
    this.sensors(dt);
    if (!mainsOn()) {
      this.byCandlelight(dt);
      this.cut = true;
      return;
    }
    if (this.cut) {
      // The power is back: the real lights leave the flames for their globes.
      this.cut = false;
      for (const bulb of this.bulbs) bulb.light.position.copy(this.slots[bulb.slot]!.at);
    }
    this.chooseClock -= dt;
    if (this.chooseClock <= 0 && this.occupied) {
      this.chooseClock = 0.25;
      this.choose();
    }
    for (const bulb of this.bulbs) {
      if (bulb.next !== bulb.slot) {
        bulb.fade = Math.max(0, bulb.fade - dt / SLOT_FADE_S);
        if (bulb.fade === 0) {
          bulb.slot = bulb.next;
          bulb.light.position.copy(this.slots[bulb.slot]!.at);
        }
      } else {
        bulb.fade = Math.min(1, bulb.fade + dt / SLOT_FADE_S);
      }
      bulb.light.color.copy(WARM);
      bulb.light.intensity = INTENSITY * this.on * bulb.fade * this.slots[bulb.slot]!.glow;
    }
    const lit = this.litNear();
    const s = this.dayNight.state;
    this.ambient.intensity = this.occupied ? 0.1 + 0.45 * lit * this.on + 0.2 * s.daylight : 0;
    this.paintSky(s);
  }

  /** Every landing's sensor: the player on it keeps its globe lit; the timer runs down once they left; the relay clacks at each switch. */
  private sensors(dt: number): void {
    const feet = this.eye.y - EYE;
    let changed = false;
    // No power: every globe goes out (no relay heard, there is nothing to switch). Haunted: they only flicker.
    const powered = mainsOn();
    this.slots.forEach((slot, i) => {
      if (!powered || this.haunted) {
        slot.left = 0;
        const target = powered && random() < 0.92 ? HAUNT_GLOW * (0.6 + 0.4 * random()) : 0;
        if (Math.abs(slot.glow - target) < 1e-3) return;
        slot.glow = THREE.MathUtils.clamp(slot.glow + THREE.MathUtils.clamp(target - slot.glow, -dt / COOL_S, dt / WARM_UP_S), 0, 1);
        this.globes.setColorAt(i, this.colour.copy(WARM).multiplyScalar(0.12 + 1.6 * slot.glow));
        changed = true;
        return;
      }
      const seen = this.occupied && (sees(slot, this.eye.x, this.eye.z, feet) || this.walkers.some((w) => w.isPresent && sees(slot, w.position.x, w.position.z, w.position.y)));
      if (seen) {
        if (slot.left <= 0) this.relay(slot, true);
        slot.left = LIT_S;
      } else if (slot.left > 0) {
        slot.left -= dt;
        if (slot.left <= 0) this.relay(slot, false);
      }
      const target = slot.left > 0 ? 1 : 0;
      if (slot.glow === target) return;
      slot.glow = THREE.MathUtils.clamp(slot.glow + (target > slot.glow ? dt / WARM_UP_S : -dt / COOL_S), 0, 1);
      this.globes.setColorAt(i, this.colour.copy(WARM).multiplyScalar(0.12 + 1.6 * slot.glow));
      changed = true;
    });
    if (changed && this.globes.instanceColor) this.globes.instanceColor.needsUpdate = true;
  }

  /** The two real lights go to the lit globes nearest the player (a bulb already on one of them stays). */
  private choose(): void {
    const { slots, eye } = this;
    this.order.sort((a, b) => rank(slots[a]!, eye) - rank(slots[b]!, eye));
    const wanted = this.order.slice(0, this.bulbs.length);
    const free = wanted.filter((i) => !this.bulbs.some((b) => b.next === i));
    for (const bulb of this.bulbs) {
      if (wanted.includes(bulb.next)) continue;
      const next = free.shift();
      if (next !== undefined) bulb.next = next;
    }
  }

  /**
   * The power is off: the two real lights stand over the flames nearest the player, a candle's dim orange that
   * wavers; none lit, they are dark. The hemisphere keeps only what comes down from the roof light.
   */
  private byCandlelight(dt: number): void {
    this.candleTime += dt;
    const nearest = [...this.candles].sort((a, b) => a.distanceToSquared(this.eye) - b.distanceToSquared(this.eye));
    this.bulbs.forEach((bulb, i) => {
      const flame = nearest[i];
      if (!flame) {
        bulb.light.intensity = 0;
        return;
      }
      bulb.light.position.copy(flame);
      bulb.light.color.copy(CANDLE);
      const flicker = 0.82 + 0.1 * Math.sin(this.candleTime * 11 + i * 2.1) + 0.08 * Math.sin(this.candleTime * 23.7 + i);
      bulb.light.intensity = CANDLE_INTENSITY * this.on * flicker;
    });
    const s = this.dayNight.state;
    this.ambient.intensity = this.occupied ? 0.04 + 0.12 * s.daylight : 0;
    this.paintSky(s);
  }

  /** The glow the player stands in: the brightest real light's globe, as lit as it is. */
  private litNear(): number {
    let lit = 0;
    for (const bulb of this.bulbs) lit = Math.max(lit, bulb.fade * this.slots[bulb.slot]!.glow);
    return lit;
  }

  /** A relay clacks at `slot`, heard from where the player is (only while they are in the stairwell). */
  private relay(slot: Slot, on: boolean): void {
    if (!this.occupied) return;
    const distance = this.eye.distanceTo(slot.at);
    playRelay(0.12 * loudness(distance, HEARING.landing), on);
  }

  /** The roof light: the sky's colour, greyed by cloud, darkened by rain, white with snow lying on it, a lightning flash. */
  private paintSky(s: SkyState): void {
    this.sky.color.copy(skyGlassColour(this.colour, s));
  }
}

/** Whether `slot`'s sensor sees feet at (x, y, z), local. */
function sees(slot: Slot, x: number, z: number, y: number): boolean {
  return Math.abs(y - slot.floor) < SENSOR_HEIGHT && Math.hypot(x - slot.at.x, z - slot.at.z) < SENSOR_REACH;
}

/** Where a globe comes in the choice for the real lights: lit ones first, nearest first. */
function rank(slot: Slot, eye: THREE.Vector3): number {
  return slot.at.distanceToSquared(eye) + (slot.glow > 0.02 || slot.left > 0 ? 0 : 1000);
}
