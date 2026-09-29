import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { SkyState } from '@/world/props/DayNight';
import type { LifeEvents } from '@/world/props/outdoors/lifeEvents';
import { wakefulnessAt } from '@/time/wakefulness';
import { proximityVolume } from '@/video/proximityVolume';
import { audioBus, audioContext } from './audioContext';
import { brownNoise, whiteNoise } from './noise';
import { ringTheHour } from './churchBells';
import { birdNote, horn, sirenVoice, twoTone } from './street/streetVoices';
import { BUS_STOP } from '@/world/city/frontage';

export interface StreetAmbienceOptions {
  /** Where the ears are (the camera). */
  listener: THREE.Object3D;
  /** The window panes the street is heard through, re-read now and then (rooms load and unload). */
  panes: () => readonly THREE.Object3D[];
  /** The sky: time of day, how awake the city is, the weather. */
  sky: () => SkyState;
  /** Walls between the listener and a pane (see `SoundOcclusion`). */
  wallsBetween?: (listener: THREE.Vector3, source: THREE.Vector3) => number;
  /** What the street's life is doing (the bus, the dogs, the ambulance, the dustcart; see `Life.events`). */
  life?: () => LifeEvents;
  /** Doors out to the open air (the balcony's): heard like a pane while shut, at the street's full level once open. */
  openings?: () => readonly StreetOpening[];
  /** Whether the listener is out in the open (on the balcony): the street at its full level, no glass between. */
  outside?: () => boolean;
  /**
   * Whether the listener is out in the open elsewhere (the walkable street, which has its own sound):
   * only the thunder is heard from here, at the open air's level.
   */
  open?: () => boolean;
  /** Whether the listener is under a roof that lets the thunder through like a pane (the flea market's hall). */
  underRoof?: () => boolean;
}

/** A door to the open air: where it is, and how open (0 shut .. 1). */
export interface StreetOpening {
  getWorldPosition(target: THREE.Vector3): THREE.Vector3;
  readonly openness: number;
}

/** Level of the whole bed in the open air, or at an open door to it (linear). */
const LEVEL = 0.32;
/** What a shut window lets through of that (about -14 dB): the street is a murmur behind the glass. */
const THROUGH_GLASS = 0.2;
/** How the street fades with the distance to the nearest pane. */
const FALLOFF = { referenceDistance: 0.8, rolloff: 0.55, maxDistance: 18, wallGain: 0.25 };
/** Seconds between re-reading the panes, and the loudness smoothing time constant. */
const PANE_REFRESH = 2;
const FOLLOW = 0.4;
/** Seconds between two loudness readings (each casts a ray per pane against the walls). */
const LISTEN_EVERY = 0.2;
/** Thunder carries through the whole flat: the least it is heard at, far from any window (relative to the street bed). */
const THUNDER_FLOOR = 0.06;
/** Speed of sound (m/s), for the thunder's delay and the siren's pitch shift. */
const SOUND_SPEED = 343;
/** The strikes land 400 m to 5 km out (see `Weather`): nearer ones crack, farther ones only rumble. */
const STRIKE_NEAR = 400;
const STRIKE_FAR = 5000;
/** How high the ears are over the street (a sixth floor), for the distance to what is down there. */
const EAR_HEIGHT = 18;
/** How much of the bus at its stop (by the shelter on Front Street's far pavement, ~50 m off) reaches the flat (see `reach`). */
const BUS_REACH = 14 / (14 + Math.hypot(BUS_STOP.stop[0], BUS_STOP.stop[1], EAR_HEIGHT));
/** The siren's two tones (hi-lo) and how long each is held. */
const SIREN_TONES: [number, number] = [880, 660];
const SIREN_STEP = 0.65;
/** Church bells strike the hour between these hours only. */
const BELL_HOURS: [number, number] = [8, 21];

/**
 * The sound of the street through the windows, synthesised (no recordings, no network): a low
 * rumble of traffic that follows how awake the city is, cars swelling past now and then, a horn
 * once in a while, birdsong by day (a dawn chorus at sunrise, none in the rain), rain hissing on
 * the street and pattering on the glass, the wind whooshing and gusting, thunder rolling in after
 * each strike (late by the distance, cracking when near), the church bells counting the hours by
 * day, and what `Life` does: the bus's air brakes at the shelter and its engine pulling away, a
 * dog barking, the ambulance's siren (its pitch sliding as it passes), the dustcart's diesel and
 * compactor, the park's fountain faintly from the park side. Heard from the nearest pane, fainter
 * with distance and through walls, like the television's sound. The audio context only starts on
 * the first click or key press (browsers refuse sound before a gesture), so the street fades in then.
 */
export class StreetAmbience implements Updatable {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Thunder's own bus: like `master`, but never quite silent. */
  private loud: GainNode | null = null;
  private traffic: GainNode | null = null;
  private rainBed: GainNode | null = null;
  private windBed: GainNode | null = null;
  private windBand: BiquadFilterNode | null = null;
  private whistle: GainNode | null = null;
  private fountainBed: GainNode | null = null;
  private siren: { osc: OscillatorNode; gain: GainNode } | null = null;
  private diesel: { osc: OscillatorNode; gain: GainNode; whine: OscillatorNode; whineGain: GainNode } | null = null;
  private noise: AudioBuffer | null = null;
  /** Everything that runs as long as the street does (the beds, the siren, the diesel), stopped by `dispose`. */
  private sources: AudioScheduledSourceNode[] = [];
  private panes: readonly THREE.Object3D[] = [];
  private openings: readonly StreetOpening[] = [];
  private paneClock = PANE_REFRESH;
  private passClock = 4;
  private hornClock = 60;
  private birdClock = 3;
  private patterClock = 0;
  private clatterClock = 1;
  private listenClock = LISTEN_EVERY;
  private level = 0;
  /** Whether the nearest pane looks out over the park (Park Street side, -x). */
  private parkSide = false;
  /** What was last seen of the sky and the street, so a change is noticed once. */
  private strikes = -1;
  private hour = -1;
  private seen: { busStops: number; busDepartures: number; barks: number } | null = null;
  private sirenDistance = -1;
  private readonly ear = new THREE.Vector3();
  private readonly pane = new THREE.Vector3();

  constructor(private readonly options: StreetAmbienceOptions) {
    window.addEventListener('pointerdown', this.start);
    window.addEventListener('keydown', this.start);
  }

  /** Stops the street for good: its beds and engines, and the wait for the first gesture. */
  dispose(): void {
    this.stopListening();
    for (const source of this.sources) source.stop();
    this.sources = [];
    this.master?.disconnect();
    this.loud?.disconnect();
    this.master = null;
    this.loud = null;
    this.traffic = null;
    this.rainBed = null;
    this.windBed = null;
    this.windBand = null;
    this.whistle = null;
    this.fountainBed = null;
    this.siren = null;
    this.diesel = null;
    this.ctx = null;
  }

  private readonly start = (): void => {
    this.stopListening();
    this.build();
  };

  private stopListening(): void {
    window.removeEventListener('pointerdown', this.start);
    window.removeEventListener('keydown', this.start);
  }

  update(dt: number): void {
    const { ctx, master, loud } = this;
    if (!ctx || !master || !loud || !this.traffic || !this.rainBed) return;
    this.paneClock += dt;
    if (this.paneClock >= PANE_REFRESH) {
      this.paneClock = 0;
      this.panes = this.options.panes();
      this.openings = this.options.openings?.() ?? [];
    }
    const sky = this.options.sky();
    const now = ctx.currentTime;
    this.listenClock += dt;
    if (this.listenClock >= LISTEN_EVERY) {
      this.listenClock = 0;
      this.level = this.loudness();
      master.gain.setTargetAtTime(this.level, now, FOLLOW);
      // Thunder: in the open at full level, under a hall's roof as through a pane, anywhere else never below its floor.
      const thunder = this.options.open?.() ? LEVEL : this.options.underRoof?.() ? THROUGH_GLASS * LEVEL : THUNDER_FLOOR * LEVEL;
      loud.gain.setTargetAtTime(Math.max(this.level, thunder), now, FOLLOW);
    }
    // Thunder: heard wherever the listener is, so noticed before the silence check.
    if (this.strikes >= 0 && sky.strikes !== this.strikes) this.thunder(ctx, loud, sky.strikeDistance);
    this.strikes = sky.strikes;
    const life = this.options.life?.();
    const audible = this.level >= 0.002 || master.gain.value >= 0.002;
    this.listenToLife(ctx, master, life, dt, audible);
    this.bells(ctx, master, sky.hours, audible);
    if (!audible) return;

    const awake = wakefulnessAt(sky.hours);
    const day = sky.daylight;
    this.traffic.gain.setTargetAtTime(0.35 * awake * (0.55 + 0.45 * day) + 0.05, now, 2);
    this.rainBed.gain.setTargetAtTime(0.5 * sky.rain + 0.12 * sky.wetness * awake, now, 3);
    // The wind: a band of noise swelling with it (the gusts are in `sky.wind`), a thin whistle when it blows hard.
    const wind = sky.wind;
    this.windBed?.gain.setTargetAtTime(0.45 * wind * wind, now, 0.6);
    this.windBand?.frequency.setTargetAtTime(220 + 650 * wind, now, 0.8);
    this.whistle?.gain.setTargetAtTime(0.05 * THREE.MathUtils.smoothstep(wind, 0.55, 0.95), now, 1);
    this.fountainBed?.gain.setTargetAtTime(life?.fountain && this.parkSide ? 0.018 : 0, now, 2);

    // A car going past: a swell of tyre noise rising and falling over a few seconds.
    this.passClock -= dt;
    if (this.passClock <= 0) {
      this.passClock = (2 + Math.random() * 7) / Math.max(awake, 0.08);
      this.passingCar(ctx, master, sky.wetness);
    }
    this.hornClock -= dt;
    if (this.hornClock <= 0) {
      this.hornClock = 70 + Math.random() * 160;
      if (awake > 0.6 && day > 0.3) this.horn(ctx, master);
    }
    // Birds: sparrows and blackbirds by day, a chorus around sunrise, silent in the rain and at night.
    const dawn = 1 - Math.min(1, Math.abs(sky.hours - 6.5) / 1.5);
    const birdiness = day * (1 - sky.rain) * (1 - sky.snow * 0.7) * (0.35 + 1.2 * dawn);
    this.birdClock -= dt;
    if (this.birdClock <= 0) {
      this.birdClock = 0.8 + Math.random() * 4 / Math.max(birdiness, 0.05);
      if (birdiness > 0.05) this.birdPhrase(ctx, master, Math.min(1, birdiness));
    }
    // Drops tapping on the pane.
    if (sky.rain > 0.1) {
      this.patterClock -= dt;
      while (this.patterClock <= 0) {
        this.patterClock += (0.02 + Math.random() * 0.12) / sky.rain;
        this.patter(ctx, master, sky.rain);
      }
    }
  }

  /**
   * How loud the street is where the listener stands: full out in the open, else the loudest way in,
   * a shut pane (through the glass) or a door to the open air (the more open, the louder), by its
   * proximity with the walls counted. Notes which side that way in is on.
   */
  private loudness(): number {
    if (this.options.outside?.()) {
      this.parkSide = false;
      return LEVEL;
    }
    this.options.listener.getWorldPosition(this.ear);
    let best = 0;
    const hear = (at: THREE.Vector3, gain: number): void => {
      const distance = this.ear.distanceTo(at);
      if (distance > FALLOFF.maxDistance) return;
      const walls = this.options.wallsBetween?.(this.ear, at) ?? 0;
      const volume = (proximityVolume(distance, { ...FALLOFF, walls }) / 100) * gain;
      if (volume <= best) return;
      best = volume;
      const dx = at.x - this.ear.x;
      this.parkSide = dx < 0 && Math.abs(dx) > Math.abs(at.z - this.ear.z);
    };
    for (const pane of this.panes) hear(pane.getWorldPosition(this.pane), THROUGH_GLASS);
    for (const door of this.openings) hear(door.getWorldPosition(this.pane), THREE.MathUtils.lerp(THROUGH_GLASS, 1, door.openness));
    return best * LEVEL;
  }

  private build(): void {
    if (this.ctx) return;
    const ctx = audioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.loud = ctx.createGain();
    this.loud.gain.value = 0;
    // Through glass: the highs are the first to go.
    const glass = ctx.createBiquadFilter();
    glass.type = 'lowpass';
    glass.frequency.value = 5200;
    this.master.connect(glass).connect(audioBus(ctx, 'world'));
    this.loud.connect(glass);

    // Two seconds of white noise, shared by every noisy thing.
    this.noise = whiteNoise(ctx, 2);

    // The traffic: brown noise (white integrated), deep and slow.
    this.traffic = ctx.createGain();
    this.traffic.gain.value = 0;
    const rumble = ctx.createBiquadFilter();
    rumble.type = 'lowpass';
    rumble.frequency.value = 380;
    this.loop(ctx, brownNoise(ctx, 2)).connect(rumble).connect(this.traffic).connect(this.master);

    // The rain: a band of hiss.
    this.rainBed = ctx.createGain();
    this.rainBed.gain.value = 0;
    const hiss = ctx.createBiquadFilter();
    hiss.type = 'bandpass';
    hiss.frequency.value = 2400;
    hiss.Q.value = 0.4;
    this.loop(ctx, this.noise).connect(hiss).connect(this.rainBed).connect(this.master);

    // The wind: a low band of noise whose centre rises as it blows harder, and a thin whistle round the frames.
    this.windBed = ctx.createGain();
    this.windBed.gain.value = 0;
    this.windBand = ctx.createBiquadFilter();
    this.windBand.type = 'bandpass';
    this.windBand.frequency.value = 400;
    this.windBand.Q.value = 0.8;
    this.loop(ctx, this.noise).connect(this.windBand).connect(this.windBed).connect(this.master);
    this.whistle = ctx.createGain();
    this.whistle.gain.value = 0;
    const whistleBand = ctx.createBiquadFilter();
    whistleBand.type = 'bandpass';
    whistleBand.frequency.value = 1150;
    whistleBand.Q.value = 18;
    this.loop(ctx, this.noise).connect(whistleBand).connect(this.whistle).connect(this.master);

    // The fountain, far off across the park: a soft splashing band.
    this.fountainBed = ctx.createGain();
    this.fountainBed.gain.value = 0;
    const splash = ctx.createBiquadFilter();
    splash.type = 'bandpass';
    splash.frequency.value = 1700;
    splash.Q.value = 0.6;
    this.loop(ctx, this.noise).connect(splash).connect(this.fountainBed).connect(this.master);

    // The siren and the dustcart run all the time, silent until they are on the streets.
    this.siren = sirenVoice(ctx, this.master, 2200);
    this.keep(this.siren.osc);
    const dieselGain = ctx.createGain();
    dieselGain.gain.value = 0;
    const dieselTone = ctx.createBiquadFilter();
    dieselTone.type = 'lowpass';
    dieselTone.frequency.value = 240;
    const dieselOsc = ctx.createOscillator();
    dieselOsc.type = 'sawtooth';
    dieselOsc.frequency.value = 42;
    dieselOsc.connect(dieselTone).connect(dieselGain).connect(this.master);
    this.keep(dieselOsc);
    const whineGain = ctx.createGain();
    whineGain.gain.value = 0;
    const whineTone = ctx.createBiquadFilter();
    whineTone.type = 'bandpass';
    whineTone.frequency.value = 600;
    whineTone.Q.value = 2;
    const whine = ctx.createOscillator();
    whine.type = 'sawtooth';
    whine.frequency.value = 190;
    whine.connect(whineTone).connect(whineGain).connect(this.master);
    this.keep(whine);
    this.diesel = { osc: dieselOsc, gain: dieselGain, whine, whineGain };
  }

  private loop(ctx: AudioContext, buffer: AudioBuffer): AudioBufferSourceNode {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.start(0, Math.random() * buffer.duration);
    this.sources.push(source);
    return source;
  }

  /** Starts `source` for as long as the street runs. */
  private keep(source: AudioScheduledSourceNode): void {
    source.start();
    this.sources.push(source);
  }

  /** A burst of the shared noise through `filter`, shaped by `envelope` (gain at times from its start), starting `delay` seconds from now. */
  private burst(ctx: AudioContext, out: AudioNode, filter: BiquadFilterNode, envelope: [number, number][], length: number, delay = 0): void {
    if (!this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    const gain = ctx.createGain();
    const start = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.setValueAtTime(0, start);
    for (const [t, v] of envelope) gain.gain.linearRampToValueAtTime(v, start + t);
    source.connect(filter).connect(gain).connect(out);
    source.start(start, Math.random() * 1.5);
    source.stop(start + length);
  }

  /** A filter of `type` at `frequency` (Q `q`). */
  private filter(ctx: AudioContext, type: BiquadFilterType, frequency: number, q = 1): BiquadFilterNode {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = q;
    return f;
  }

  /** How much of a sound made at street level at (x, z) (metres from the building's corner) reaches the flat. */
  private reach(x: number, z: number): number {
    return 14 / (14 + Math.hypot(x, z, EAR_HEIGHT));
  }

  /**
   * Thunder `distance` metres off, arriving distance / 343 s after the flash: a near strike cracks
   * sharp then rolls long and loud; a far one is only a low grumble.
   */
  private thunder(ctx: AudioContext, out: AudioNode, distance: number): void {
    const delay = distance / SOUND_SPEED;
    const near = 1 - THREE.MathUtils.clamp((distance - STRIKE_NEAR) / (STRIKE_FAR - STRIKE_NEAR), 0, 1);
    if (near > 0.45) {
      const crack = (near - 0.45) / 0.55;
      this.burst(ctx, out, this.filter(ctx, 'highpass', 900), [[0.005, 0.9 * crack], [0.06, 0.35 * crack], [0.35, 0]], 0.4, delay);
      this.burst(ctx, out, this.filter(ctx, 'bandpass', 380, 0.7), [[0.02, 0.9 * crack], [0.5, 0.3 * crack], [1.2, 0]], 1.3, delay);
    }
    // The roll: low noise building over a moment, then a few swells dying away over seconds.
    const level = 0.5 + 0.9 * near;
    const length = 4 + 5 * near + Math.random() * 3;
    const envelope: [number, number][] = [[0.25 + 0.6 * (1 - near), level]];
    for (let t = 1, k = 0.8; t < length - 1; t += 0.6 + Math.random() * 1.2, k *= 0.72) envelope.push([t, level * k * (0.6 + Math.random() * 0.6)]);
    envelope.push([length, 0]);
    this.burst(ctx, out, this.filter(ctx, 'lowpass', 90 + 180 * near, 0.9), envelope, length + 0.1, delay);
  }

  /**
   * The church across the rooftops strikes the hour by day: the same tower as out on Front Street (`ringTheHour`: the
   * quarter chime, then the hour's strokes), heard from the flat through the glass, dull and far.
   */
  private bells(ctx: AudioContext, out: AudioNode, hours: number, audible: boolean): void {
    const hour = Math.floor(hours);
    const last = this.hour;
    this.hour = hour;
    if (last < 0 || hour === last || !audible || hour < BELL_HOURS[0] || hour > BELL_HOURS[1]) return;
    const tone = this.filter(ctx, 'lowpass', 1800);
    const gain = ctx.createGain();
    gain.gain.value = 0.4;
    tone.connect(gain).connect(out);
    const done = ringTheHour(ctx, tone, ctx.currentTime + 0.3, hour, 0.05);
    // Let the nodes go once the last stroke has died away.
    window.setTimeout(() => gain.disconnect(), (done - ctx.currentTime + 8) * 1000);
  }

  /** Reacts to what the street's life did since the last frame (sounds only when the street is heard); keeps the siren and the dustcart going. */
  private listenToLife(ctx: AudioContext, out: AudioNode, life: LifeEvents | undefined, dt: number, audible: boolean): void {
    const now = ctx.currentTime;
    if (!life) return;
    const seen = this.seen ?? { ...life };
    if (audible) {
      if (life.busStops !== seen.busStops) this.airBrakes(ctx, out, BUS_REACH);
      if (life.busDepartures !== seen.busDepartures) this.pullAway(ctx, out);
      if (life.barks !== seen.barks) this.bark(ctx, out, this.reach(life.bark.x, life.bark.z));
    }
    this.seen = { busStops: life.busStops, busDepartures: life.busDepartures, barks: life.barks };

    // The siren: hi-lo two-tone, louder and higher coming in, lower going away.
    const siren = this.siren;
    if (siren) {
      if (life.siren.active) {
        const d = Math.hypot(life.siren.x, life.siren.z, EAR_HEIGHT);
        const closing = this.sirenDistance < 0 || dt <= 0 ? 0 : (d - this.sirenDistance) / dt;
        this.sirenDistance = d;
        const doppler = SOUND_SPEED / (SOUND_SPEED + THREE.MathUtils.clamp(closing, -40, 40));
        const pitch = twoTone(SIREN_TONES, SIREN_STEP, now);
        siren.osc.frequency.setTargetAtTime(pitch * doppler, now, 0.015);
        siren.gain.gain.setTargetAtTime(0.14 * this.reach(life.siren.x, life.siren.z), now, 0.2);
      } else {
        this.sirenDistance = -1;
        siren.gain.gain.setTargetAtTime(0, now, 0.4);
      }
    }
    // The dustcart: its diesel idling while it is out, the compactor whining and the bins clattering at each stop.
    const diesel = this.diesel;
    if (diesel) {
      const g = life.garbage;
      const reach = g.active ? this.reach(g.x, g.z) : 0;
      diesel.gain.gain.setTargetAtTime(0.16 * reach, now, 0.8);
      diesel.osc.frequency.setTargetAtTime(g.working ? 55 : 42, now, 0.6);
      diesel.whineGain.gain.setTargetAtTime(life.garbageWorking ? 0.05 * reach : 0, now, 0.5);
      diesel.whine.frequency.setTargetAtTime(170 + 70 * (0.5 + 0.5 * Math.sin(now * 0.8)), now, 0.3);
      if (life.garbageWorking && audible) {
        this.clatterClock -= dt;
        if (this.clatterClock <= 0) {
          this.clatterClock = 0.4 + Math.random() * 1.6;
          this.burst(ctx, out, this.filter(ctx, 'bandpass', 500 + Math.random() * 900, 1.2), [[0.01, 0.22 * reach], [0.12, 0.06 * reach], [0.3, 0]], 0.35);
        }
      }
    }
  }

  /** The bus pulling up at the shelter: a brake squeal, then the air brakes' hiss. */
  private airBrakes(ctx: AudioContext, out: AudioNode, reach: number): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2600, now);
    osc.frequency.linearRampToValueAtTime(2350, now + 0.7);
    const vibrato = ctx.createOscillator();
    vibrato.frequency.value = 23;
    const depth = ctx.createGain();
    depth.gain.value = 30;
    vibrato.connect(depth).connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.05 * reach, now + 0.15);
    gain.gain.linearRampToValueAtTime(0, now + 0.8);
    osc.connect(gain).connect(out);
    for (const node of [osc, vibrato]) {
      node.start(now);
      node.stop(now + 0.85);
    }
    this.burst(ctx, out, this.filter(ctx, 'highpass', 3200), [[0.04, 0.45 * reach], [0.5, 0.2 * reach], [1.2, 0]], 1.3, 0.9);
  }

  /** The bus pulling away: the brakes released with a short psst, the diesel revving up and fading off. */
  private pullAway(ctx: AudioContext, out: AudioNode): void {
    this.burst(ctx, out, this.filter(ctx, 'highpass', 2800), [[0.02, 0.3 * BUS_REACH], [0.25, 0]], 0.3);
    const now = ctx.currentTime + 0.3;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(48, now);
    osc.frequency.linearRampToValueAtTime(95, now + 2.2);
    osc.frequency.linearRampToValueAtTime(70, now + 3.2);
    const tone = this.filter(ctx, 'lowpass', 380);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.22 * BUS_REACH, now + 0.6);
    gain.gain.linearRampToValueAtTime(0, now + 3.5);
    osc.connect(tone).connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + 3.6);
  }

  /** A dog's bark or two: a short falling growl-tone through a throaty band, with a puff of breath. */
  private bark(ctx: AudioContext, out: AudioNode, reach: number): void {
    const woofs = 1 + Math.floor(Math.random() * 3);
    const pitch = 380 + Math.random() * 300;
    for (let i = 0; i < woofs; i++) {
      const t = ctx.currentTime + i * (0.22 + Math.random() * 0.12);
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(pitch * 1.25, t);
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.6, t + 0.13);
      const band = this.filter(ctx, 'bandpass', 900, 1.4);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.35 * reach, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(band).connect(gain).connect(out);
      osc.start(t);
      osc.stop(t + 0.18);
      this.burst(ctx, out, this.filter(ctx, 'bandpass', 1200, 0.8), [[0.01, 0.12 * reach], [0.1, 0]], 0.12, t - ctx.currentTime);
    }
  }

  private passingCar(ctx: AudioContext, out: AudioNode, wetness: number): void {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    // Wet roads hiss: the tyres sound higher and louder.
    filter.frequency.value = 500 + 900 * wetness + Math.random() * 300;
    filter.Q.value = 0.8;
    const peak = (0.12 + Math.random() * 0.12) * (1 + wetness * 0.6);
    const rise = 1.5 + Math.random() * 1.5;
    this.burst(ctx, out, filter, [[rise, peak], [rise + 1.5 + Math.random() * 2, 0]], rise + 4);
  }

  /** A car's horn somewhere down the street: one toot, muffled. */
  private horn(ctx: AudioContext, out: AudioNode): void {
    const toot = 0.18 + Math.random() * 0.3;
    horn(ctx, out, { pitches: [410, 515], detune: 20, blasts: 1, length: toot + 0.05, gap: 0, level: 0.05, attack: 0.02, release: 0.05, filter: { type: 'lowpass', frequency: 1400 } });
  }

  /** A few quick chirps sweeping up or down, like a sparrow or a tit, sometimes a blackbird's fluting. */
  private birdPhrase(ctx: AudioContext, out: AudioNode, strength: number): void {
    const now = ctx.currentTime;
    const blackbird = Math.random() < 0.25;
    const notes = blackbird ? 3 + Math.floor(Math.random() * 4) : 2 + Math.floor(Math.random() * 5);
    const base = blackbird ? 1400 + Math.random() * 800 : 3200 + Math.random() * 1600;
    let t = now + Math.random() * 0.2;
    for (let i = 0; i < notes; i++) {
      const length = blackbird ? 0.12 + Math.random() * 0.18 : 0.04 + Math.random() * 0.06;
      const f0 = base * (0.85 + Math.random() * 0.3);
      const to = f0 * (Math.random() < 0.5 ? 1.35 : 0.75);
      birdNote(ctx, out, { at: t, from: f0, to, sweep: length, attack: length * 0.2, length, level: (blackbird ? 0.035 : 0.022) * strength });
      t += length + (blackbird ? 0.05 + Math.random() * 0.12 : 0.03 + Math.random() * 0.08);
    }
  }

  private patter(ctx: AudioContext, out: AudioNode, rain: number): void {
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 2500 + Math.random() * 2500;
    const level = (0.03 + Math.random() * 0.05) * rain;
    this.burst(ctx, out, filter, [[0.002, level], [0.03, 0]], 0.05);
  }
}
