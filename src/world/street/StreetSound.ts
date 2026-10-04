import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { ringTheHour } from '@/audio/churchBells';
import { brownNoise } from '@/audio/noise';
import { sirenVoice, twoTone } from '@/audio/street/streetVoices';
import { currentSeason } from '@/time/season';
import type { Furniture, OccupancyAware } from '../Furniture';
import type { ActivityAware } from '../zone/lifecycle';
import type { DayNight } from '../props/DayNight';
import { wakefulnessAt } from '@/time/wakefulness';
import type { CarVoice } from './StreetCars';
import { STREET_PLAN } from './streetPlan';
import { RainOnRoofs } from './audio/RainOnRoofs';
import { SoundGraph } from './audio/soundGraph';
import { StreetBirds } from './audio/StreetBirds';
import { StreetEar } from './audio/streetEar';
import { VehicleVoice, type VehicleRole } from './audio/VehicleVoice';
import { random } from '@/random';

interface StreetSoundOptions {
  /** The ears (the camera). */
  listener: THREE.Object3D;
  /** Everything driving through (cars, the bus, the van, the bin lorry, bikes): each one is heard where it is. */
  cars: readonly CarVoice[];
  /** Which of `cars` are the scripted vehicles (their brakes, doors, crates, bins). */
  roles?: ReadonlyMap<CarVoice, VehicleRole>;
  /** The traffic's word on the bus standing at its stop, doors open (their psst). */
  traffic?: { readonly busAtStop: boolean };
  /** What keeps the rain off (zone-local boxes, `Precipitation`'s): its drumming overhead. */
  shelters?: readonly THREE.Box3[];
}

const MASTER = 0.5;
/** Game hours the church clock strikes between (inclusive), so nobody is woken. */
const BELL_HOURS = [8, 21] as const;
/** Real seconds between two distant sirens: by day, and at night (more often). */
const SIREN_EVERY = { day: [150, 420], night: [80, 240] } as const;
/** The distant siren's two tones (the French la, si) and how long each is held. */
const SIREN_TONES: [number, number] = [435, 488];
const SIREN_STEP = 0.55;

/** The graph's continuous beds (rebuilt with it). */
interface Beds {
  rumble: GainNode;
  rain: GainNode;
  rainTone: BiquadFilterNode;
  windBed: GainNode;
  windBand: BiquadFilterNode;
  whistle: GainNode;
  far: GainNode;
  farPan: StereoPannerNode;
  vehicles: VehicleVoice[];
}

/**
 * What the street sounds like out here (synthesised, like `StreetAmbience` through the windows,
 * but heard in the open): the city's distant traffic rumble following how awake it is; each road
 * user where it is (`audio/VehicleVoice`: its engine by what it is, through its gears, shifted by
 * its approach, its tyres, the bus's air brakes and doors, the van's crates, the lorry's bins, a
 * bike's freewheel and bell, horns); the rain's hiss, giving way under an awning or the shelter
 * to the drops drumming overhead (`audio/RainOnRoofs`); the wind (a whistle when it blows hard);
 * the birds by season and hour (`audio/StreetBirds`: a dawn chorus, swifts on summer evenings);
 * a siren far off now and then (more at night); and the church clock beyond the park striking
 * the hours from 8:00 to 21:00. Everything goes through the street's bus (`audio/streetBus`: the
 * facades' faint echo). Only while the player is in the street (`setOccupied`); nothing before the
 * page's first gesture started the audio; while the zone is dormant the whole graph is let go.
 */
export class StreetSound extends THREE.Group implements Furniture, Updatable, OccupancyAware, ActivityAware {
  readonly contactShadow = false;
  private graph: SoundGraph | null = null;
  private beds: Beds | null = null;
  private occupied = false;
  private active = true;
  private sirenClock = 40 + random() * 120;
  private lastHour = -1;
  private bellsUntil = 0;
  private readonly ear: StreetEar;
  private readonly local = new THREE.Vector3();
  private readonly church = new THREE.Vector3();
  private readonly birds = new StreetBirds(() => currentSeason().name);
  private readonly roofs: RainOnRoofs;
  private readonly toWorld = (v: THREE.Vector3): THREE.Vector3 => this.localToWorld(v);

  constructor(private readonly dayNight: DayNight, private readonly options: StreetSoundOptions) {
    super();
    this.name = 'StreetSound';
    this.ear = new StreetEar(options.listener);
    this.roofs = new RainOnRoofs(options.shelters ?? []);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.graph?.setLevel(occupied ? MASTER : 0);
    // Arriving mid-hour does not strike it.
    this.lastHour = Math.floor(this.dayNight.state.hours);
  }

  setZoneActive(active: boolean): void {
    this.active = active;
    if (!active) this.teardown();
  }

  dispose(): void {
    this.teardown();
  }

  update(dt: number): void {
    if (!this.active) return;
    const g = this.graph ?? this.build();
    const beds = this.beds;
    if (!g || !beds) return;
    const s = this.dayNight.state;
    const now = g.now;
    this.ear.update();
    const awake = wakefulnessAt(s.hours);
    beds.rumble.gain.setTargetAtTime(0.06 + 0.22 * awake, now, 2);
    // The rain: the open street's hiss, duller and quieter under a roof (where the drumming takes over).
    this.local.copy(this.ear.at);
    this.worldToLocal(this.local);
    this.roofs.update(dt, g, s.rain, this.local);
    const under = this.roofs.under;
    beds.rain.gain.setTargetAtTime((0.45 * s.rain + 0.08 * s.wetness * awake) * (1 - 0.55 * under), now, 0.6);
    beds.rainTone.frequency.setTargetAtTime(3000 - 1600 * under, now, 0.6);
    // The wind, as through the windows but in the open: a band of noise rising with it, a whistle round the corners when it blows hard.
    const wind = s.wind;
    beds.windBed.gain.setTargetAtTime(0.5 * wind * wind, now, 0.6);
    beds.windBand.frequency.setTargetAtTime(200 + 700 * wind, now, 0.8);
    beds.whistle.gain.setTargetAtTime(0.045 * THREE.MathUtils.smoothstep(wind, 0.55, 0.95), now, 1);

    const busAtStop = this.options.traffic?.busAtStop ?? false;
    for (const v of beds.vehicles) v.update(dt, this.ear, this.toWorld, s, this.occupied, busAtStop);

    if (!this.occupied) return;
    this.birds.update(dt, g, s, (pan, rear, seconds) => g.shot({ pan, rear, walls: 0 }, seconds));
    // A siren far off, now and then.
    this.sirenClock -= dt;
    if (this.sirenClock <= 0) {
      const [a, b] = s.night ? SIREN_EVERY.night : SIREN_EVERY.day;
      this.sirenClock = a + random() * (b - a);
      this.siren(g);
    }
    // The church clock on the full hour (never over the last hour's strokes).
    const hour = Math.floor(s.hours);
    if (hour !== this.lastHour) {
      const struck = this.lastHour >= 0 && hour === (this.lastHour + 1) % 24;
      this.lastHour = hour;
      if (struck && hour >= BELL_HOURS[0] && hour <= BELL_HOURS[1] && now >= this.bellsUntil) {
        this.localToWorld(this.church.set(STREET_PLAN.church[0], 20, STREET_PLAN.church[1]));
        beds.farPan.pan.setTargetAtTime(this.ear.spatial(this.church).pan, now, 0.05);
        this.bellsUntil = ringTheHour(g.ctx, beds.far, now + 0.05, hour, 0.05);
      }
    }
  }

  private teardown(): void {
    this.graph?.stop();
    this.graph = null;
    this.beds = null;
    this.roofs.reset();
  }

  private build(): SoundGraph | null {
    const g = SoundGraph.create(this.occupied ? MASTER : 0);
    if (!g) return null;
    this.graph = g;
    const ctx = g.ctx;
    const brown = brownNoise(ctx, 2);

    const rumble = g.gain();
    g.loop(brown).connect(g.filter('lowpass', 320)).connect(rumble).connect(g.master);

    const rain = g.gain();
    const rainTone = g.filter('bandpass', 3000, 0.35);
    g.loop().connect(rainTone).connect(rain).connect(g.master);

    // The wind: a low band of noise whose centre rises as it blows harder, and a thin whistle round the buildings' corners.
    const windBed = g.gain();
    const windBand = g.filter('bandpass', 400, 0.8);
    g.loop().connect(windBand).connect(windBed).connect(g.master);
    const whistle = g.gain();
    g.loop().connect(g.filter('bandpass', 980, 16)).connect(whistle).connect(g.master);

    // Far-off sounds (the bells, sirens) come through the air muffled: a lowpass and a pan of their own.
    const far = g.gain(1);
    const farPan = ctx.createStereoPanner();
    far.connect(g.filter('lowpass', 2400)).connect(farPan).connect(g.master);

    // One voice per road user that can drive through.
    const roles = this.options.roles;
    const vehicles = this.options.cars.map((voice, i) => new VehicleVoice(g, voice, roles?.get(voice) ?? null, ((i * 0.618) % 1 + 1) % 1));
    this.beds = { rumble, rain, rainTone, windBed, windBand, whistle, far, farPan, vehicles };
    this.roofs.build(g);
    return g;
  }

  /** A two-tone siren far off, drifting past: it swells, its pitch sags as it goes (a whiff of Doppler), it fades. */
  private siren(g: SoundGraph): void {
    const ctx = g.ctx;
    const t = ctx.currentTime + 0.05;
    const length = 9 + random() * 6;
    const panner = ctx.createStereoPanner();
    const from = random() * 1.6 - 0.8;
    panner.pan.setValueAtTime(from, t);
    panner.pan.linearRampToValueAtTime(-from * 0.6, t + length);
    panner.connect(g.master);
    const { osc, gain: env } = sirenVoice(ctx, panner, 1800);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.03, t + length * 0.45);
    env.gain.linearRampToValueAtTime(0, t + length);
    // The two-tone, half a second each, slipping down a little as it passes.
    for (let i = 0; i * SIREN_STEP < length; i++) {
      const bend = 1 - 0.03 * THREE.MathUtils.smoothstep((i * SIREN_STEP) / length, 0.4, 0.6);
      osc.frequency.setValueAtTime(twoTone(SIREN_TONES, SIREN_STEP, (i + 0.5) * SIREN_STEP) * bend, t + i * SIREN_STEP);
    }
    osc.start(t);
    osc.stop(t + length + 0.05);
    window.setTimeout(() => panner.disconnect(), (length + 1) * 1000);
  }
}
