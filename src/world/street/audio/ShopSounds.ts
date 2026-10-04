import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { SpatialOut } from '@/audio/spatial';
import type { Furniture, OccupancyAware } from '../../Furniture';
import type { ActivityAware } from '../../zone/lifecycle';
import type { DayNight } from '../../props/DayNight';
import { terraceOut, type SeatedCount } from '../life/terraceWeather';
import { isShopOpen } from '../shops/shopHours';
import { STREET_PLAN, type ShopDoor, type ShopKind, type Vec2 } from '../streetPlan';
import { WALKABLE } from '@/world/measures/street';
import { shopDoors } from '@/world/city/facades';
import { BarMusic } from './BarMusic';
import { SoundGraph } from './soundGraph';
import { StreetEar } from './streetEar';
import { random } from '@/random';
import { loudness } from '@/audio/hearing';

interface ShopSoundsOptions {
  /** The ears (the camera). */
  listener: THREE.Object3D;
  /** How many sit at each terrace (`Terraces`): the chatter follows who is there; else the plan's count while the weather and hours say it is out. */
  seated?: SeatedCount;
}

const MASTER = 0.6;
/** Shops further along than this past the walkable street are not heard (the roadworks are in between). */
const HEARD_BEYOND = 6;
/** Speech bands the chatter's voices talk in (noise through each, switched on in phrases). */
const FORMANTS = [460, 640, 820, 1050, 1300];
/** A door spot this close to a shop's door is that shop's (its bell); further, a house door or the park's gate. */
const SHOP_DOOR_WITHIN = 1.6;
/** Kinds with no bell over the door: the arcade's swings, a shut shop's is shut. */
const NO_BELL: ReadonlySet<ShopKind> = new Set(['arcade', 'shut']);
/** The bars' music: from this hour (game) till they close; how much of it comes through the door. */
const MUSIC_FROM = 18;
const MUSIC_LEVEL = 0.5;

type SourceKind = 'arcade' | 'chatter' | 'laundry';

interface Voice {
  gain: GainNode;
  talking: boolean;
  phrase: number;
  syllable: number;
}

interface Source {
  kind: SourceKind;
  /** Zone-local, a little out on the pavement in front of the door. */
  at: THREE.Vector3;
  /** How loud it is right now (0..1), from the clock and the weather. */
  level: () => number;
  /** Loudness at 1 m and how far it carries (the distance at which it has halved). */
  loudness: number;
  reach: number;
  /** A bar's jukebox, heard through its door in the evening. */
  music: BarMusic | null;
  musicLevel: () => number;
  gain?: GainNode;
  musicGain?: GainNode;
  leg?: SpatialOut;
  voices: Voice[];
  /** Seconds to the next clink (a glass, a cup) or bleep (a cabinet). */
  next: number;
  now: number;
}

/**
 * What comes out of the shops onto the pavement (synthesised, positional: louder near, to the side
 * it is on, duller behind): the arcade's cabinets bleeping and its crowd murmuring through the
 * door at every hour; the chatter and the clink of cups and glasses from the cafés and bars while
 * they are open (`isShopOpen`), from their terraces too while their tables are out (the same rule
 * as the tables, `life/terraceWeather`, and as many voices as sit there), the bars livelier in the
 * evening with their jukebox's bass and kick through the door (`BarMusic`); the laundry's machines
 * humming; and a door when someone goes in or out (`ring`): a shop's bell, else a house door's
 * latch and thud. Only while the player is in the street (`setOccupied`); nothing before the page's
 * first gesture started the audio; let go while the zone is dormant.
 */
export class ShopSounds extends THREE.Group implements Furniture, Updatable, OccupancyAware, ActivityAware {
  readonly contactShadow = false;
  private graph: SoundGraph | null = null;
  private readonly sources: Source[] = [];
  private readonly doors: ShopDoor[];
  private occupied = false;
  private active = true;
  private readonly ear: StreetEar;
  private readonly spot = new THREE.Vector3();

  constructor(private readonly dayNight: DayNight, private readonly options: ShopSoundsOptions) {
    super();
    this.name = 'ShopSounds';
    this.ear = new StreetEar(options.listener);
    this.doors = shopDoors();
    const hours = (): number => this.dayNight.state.hours;
    const out = (at: Vec2, yaw: number, by = 0.6): THREE.Vector3 => new THREE.Vector3(at[0] + Math.sin(yaw) * by, 1.4, at[1] + Math.cos(yaw) * by);
    for (const [i, door] of this.doors.entries()) {
      if (door.at[0] > WALKABLE.maxX + HEARD_BEYOND || door.at[0] < WALKABLE.minX - HEARD_BEYOND) continue;
      const kind: ShopKind = door.shop.kind;
      if (kind === 'arcade') {
        this.sources.push(source('arcade', out(door.at, door.yaw, 0.3), () => 1, 0.5, 5));
      } else if (kind === 'cafe' || kind === 'bar') {
        const bar = kind === 'bar';
        const open = (): boolean => isShopOpen(kind, hours());
        const s = source('chatter', out(door.at, door.yaw), () => (open() ? liveliness(bar, hours()) : 0), 0.35, 3.5);
        if (bar) {
          s.music = new BarMusic(1000 + i * 37);
          s.musicLevel = () => (open() && (hours() >= MUSIC_FROM || hours() < 6) ? MUSIC_LEVEL : 0);
        }
        this.sources.push(s);
      } else if (kind === 'laundry') {
        this.sources.push(source('laundry', out(door.at, door.yaw, 0.3), () => (isShopOpen(kind, hours()) ? 1 : 0), 0.25, 3));
      }
    }
    // The terraces: as many voices as customers sit there.
    for (const [i, terrace] of STREET_PLAN.terraces.entries()) {
      const mid = new THREE.Vector3((terrace.from[0] + terrace.to[0]) / 2, 1.1, (terrace.from[1] + terrace.to[1]) / 2);
      const level = (): number => {
        const seated = this.options.seated ? this.options.seated(i) : terraceOut(terrace.hours, this.dayNight.state) ? terrace.customers : 0;
        return seated > 0 ? 0.35 + 0.15 * seated : 0;
      };
      this.sources.push(source('chatter', mid, level, 0.3, 3));
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.graph?.setLevel(occupied ? MASTER : 0, 0.5);
  }

  setZoneActive(active: boolean): void {
    this.active = active;
    if (!active) this.teardown();
  }

  dispose(): void {
    this.teardown();
  }

  /** A door (zone-local floor point) someone went in or came out of: a shop's bell over it, or a house door's latch and thud. */
  ring(at: Vec2): void {
    const g = this.graph;
    if (!g || !this.occupied) return;
    this.ear.update();
    this.localToWorld(this.spot.set(at[0], 2.3, at[1]));
    const d = this.ear.distance(this.spot);
    const gain = 0.5 * loudness(d, { shape: 'inverseSquare', referenceDistance: 4, maxDistance: Infinity });
    if (gain < 0.004) return;
    const out = g.shot(this.ear.spatial(this.spot), 1.5);
    const t = g.now + 0.01;
    const door = this.doorAt(at);
    if (!door || NO_BELL.has(door.shop.kind)) {
      // A house door: the latch, then the door pulled to.
      g.burst(latch(g, out), t, 0.03, gain * 0.25);
      g.burst(thud(g, out), t + 0.5 + random() * 0.3, 0.16, gain * 0.6);
      return;
    }
    // Two strikes of a little brass bell: a bright partial and a lower one, each ringing out.
    for (const [i, delay] of [0, 0.16].entries()) {
      for (const [f, level, decay] of [[2350, 1, 0.9], [3720, 0.5, 0.5], [5480, 0.25, 0.3]] as const) {
        const osc = g.ctx.createOscillator();
        osc.frequency.value = f * (i ? 1.01 : 1);
        const env = g.gain();
        env.gain.setValueAtTime(0, t + delay);
        env.gain.linearRampToValueAtTime(gain * level * 0.12 * (i ? 0.7 : 1), t + delay + 0.004);
        env.gain.exponentialRampToValueAtTime(0.0001, t + delay + decay);
        osc.connect(env).connect(out);
        osc.start(t + delay);
        osc.stop(t + delay + decay + 0.05);
      }
    }
  }

  update(dt: number): void {
    if (!this.active) return;
    const g = this.graph ?? this.build();
    if (!g || !this.occupied) return;
    const now = g.now;
    this.ear.update();
    for (const s of this.sources) {
      if (!s.gain || !s.leg) continue;
      const level = s.level();
      this.localToWorld(this.spot.copy(s.at));
      const d = this.ear.distance(this.spot);
      const near = loudness(d, { shape: 'inverseSquare', referenceDistance: s.reach, maxDistance: s.reach * 8 });
      s.now = s.loudness * near * level;
      s.gain.gain.setTargetAtTime(s.now, now, 0.3);
      const side = this.ear.spatial(this.spot);
      s.leg.set(side.pan * 1.05, 0, false, side.rear ?? 0);
      if (s.music && s.musicGain) {
        const music = s.musicLevel() * near;
        s.musicGain.gain.setTargetAtTime(music, now, 0.5);
        s.music.update(dt, g, s.musicGain, music);
      }
      if (s.now < 0.003) continue;
      this.talk(g, s, dt);
      s.next -= dt;
      if (s.next > 0) continue;
      if (s.kind === 'chatter') {
        s.next = 0.8 + random() * 3.5 / Math.max(0.3, level);
        this.clink(g, s);
      } else if (s.kind === 'arcade') {
        s.next = 0.12 + random() * 0.6;
        this.bleep(g, s);
      }
    }
  }

  /** The shop whose door is at `at`, if any. */
  private doorAt([x, z]: Vec2): ShopDoor | null {
    let best: ShopDoor | null = null;
    let bestD = SHOP_DOOR_WITHIN;
    for (const door of this.doors) {
      const d = Math.hypot(door.at[0] - x, door.at[1] - z);
      if (d < bestD) {
        bestD = d;
        best = door;
      }
    }
    return best;
  }

  private teardown(): void {
    this.graph?.stop();
    this.graph = null;
    for (const s of this.sources) {
      s.gain = undefined;
      s.musicGain = undefined;
      s.leg = undefined;
      s.voices = [];
    }
  }

  private build(): SoundGraph | null {
    const g = SoundGraph.create(this.occupied ? MASTER : 0);
    if (!g) return null;
    this.graph = g;
    for (const s of this.sources) {
      s.leg = g.leg();
      s.gain = g.gain();
      s.gain.connect(s.leg.input);
      if (s.music) {
        // Through the door and the glass: the lows come through, the rest is a murmur.
        s.musicGain = g.gain();
        s.musicGain.connect(g.filter('lowpass', 520, 0.7)).connect(s.leg.input);
      }
      if (s.kind === 'laundry') this.hum(g, s.gain);
      else {
        // Voices talking over each other (the arcade's crowd is fewer and further in).
        const count = s.kind === 'arcade' ? 2 : 3;
        for (let i = 0; i < count; i++) {
          const band = g.filter('bandpass', FORMANTS[Math.floor(random() * FORMANTS.length)]! * (0.9 + random() * 0.2), 3);
          const gain = g.gain();
          g.loop().connect(band).connect(gain).connect(s.gain);
          s.voices.push({ gain, talking: false, phrase: random() * 2, syllable: 0 });
        }
        // A low bed of room noise under the voices.
        g.loop().connect(g.filter('lowpass', 300)).connect(g.gain(0.25)).connect(s.gain);
      }
    }
    return g;
  }

  /** The chatter's phrases and syllables (as `CrowdMurmur` does): each voice talks a while, pauses, talks again. */
  private talk(g: SoundGraph, s: Source, dt: number): void {
    for (const voice of s.voices) {
      voice.phrase -= dt;
      if (voice.phrase <= 0) {
        voice.talking = !voice.talking;
        voice.phrase = voice.talking ? 0.7 + random() * 2.4 : 0.5 + random() * 2.5;
        if (!voice.talking) voice.gain.gain.setTargetAtTime(0, g.now, 0.08);
      }
      if (!voice.talking) continue;
      voice.syllable -= dt;
      if (voice.syllable <= 0) {
        voice.syllable = 0.09 + random() * 0.15;
        voice.gain.gain.setTargetAtTime(0.3 + random() * 0.7, g.now, 0.03);
      }
    }
  }

  /** A cup on a saucer, a glass on a glass: two quick inharmonic pings. */
  private clink(g: SoundGraph, s: Source): void {
    if (!s.gain) return;
    const t = g.now + 0.01;
    const f = 2600 + random() * 1800;
    for (const [ratio, level] of [[1, 1], [2.76, 0.4]] as const) {
      const osc = g.ctx.createOscillator();
      osc.frequency.value = f * ratio;
      const env = g.gain();
      env.gain.setValueAtTime(0, t);
      env.gain.linearRampToValueAtTime(0.12 * level, t + 0.002);
      env.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(env).connect(s.gain);
      osc.start(t);
      osc.stop(t + 0.2);
    }
  }

  /** A cabinet's blip, a short square-wave arpeggio up or down. */
  private bleep(g: SoundGraph, s: Source): void {
    if (!s.gain) return;
    const t = g.now + 0.01;
    const notes = 1 + Math.floor(random() * 3);
    const base = 330 * 2 ** (Math.floor(random() * 12) / 12);
    const up = random() < 0.5;
    for (let i = 0; i < notes; i++) {
      const osc = g.ctx.createOscillator();
      osc.type = random() < 0.6 ? 'square' : 'triangle';
      osc.frequency.value = base * 2 ** (((up ? 1 : -1) * i * 4) / 12);
      const env = g.gain();
      const at = t + i * 0.07;
      env.gain.setValueAtTime(0.05, at);
      env.gain.exponentialRampToValueAtTime(0.0001, at + 0.065);
      osc.connect(env).connect(s.gain);
      osc.start(at);
      osc.stop(at + 0.07);
    }
  }

  /** The laundry's machines: a low motor hum and the drum's slow slosh. */
  private hum(g: SoundGraph, out: GainNode): void {
    g.oscillator('sawtooth', 98).connect(g.filter('lowpass', 260)).connect(g.gain(0.25)).connect(out);
    const sloshGain = g.gain(0.3);
    const wobble = g.oscillator('sine', 0.7);
    wobble.connect(g.gain(0.25)).connect(sloshGain.gain);
    g.loop().connect(g.filter('bandpass', 500, 0.8)).connect(sloshGain).connect(out);
  }
}

function source(kind: SourceKind, at: THREE.Vector3, level: () => number, loudness: number, reach: number): Source {
  return { kind, at, level, loudness, reach, music: null, musicLevel: () => 0, voices: [], next: random() * 2, now: 0 };
}

/** A door latch's click: a bright, short band. */
function latch(g: SoundGraph, out: AudioNode): AudioNode {
  const f = g.filter('bandpass', 2600, 4);
  f.connect(out);
  return f;
}

/** A door pulled to: a dull wooden thud. */
function thud(g: SoundGraph, out: AudioNode): AudioNode {
  const f = g.filter('lowpass', 240, 0.8);
  f.connect(out);
  return f;
}

/** How busy a café or bar sounds at `hours`: cafés at breakfast and lunch, bars in the evening and late. */
function liveliness(bar: boolean, hours: number): number {
  if (bar) return 0.45 + 0.55 * THREE.MathUtils.smoothstep(hours, 17, 21) + (hours < 3 ? 0.4 : 0);
  const breakfast = Math.exp(-(((hours - 8.5) / 1.5) ** 2));
  const lunch = Math.exp(-(((hours - 12.8) / 1.2) ** 2));
  return 0.35 + 0.5 * Math.max(breakfast, lunch);
}
