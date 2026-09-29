import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { outdoorsInput, startedAudioContext } from '@/audio/audioContext';
import { whiteNoise } from '@/audio/noise';
import { sirenVoice, twoTone } from '@/audio/street/streetVoices';
import type { Furniture, OccupancyAware } from '../../Furniture';
import type { Vec2 } from '../streetPlan';

/** Someone on the street who barks now and then (a counter that only goes up) where they are (zone-local). */
export interface Barker {
  readonly barks: number;
  readonly position: THREE.Vector3;
}

/** A vehicle with a siren on (the ambulance): heard two-tone and doppler-shifted while `sirenOn`. */
export interface SirenVoice {
  readonly position: THREE.Vector3;
  readonly sirenOn: boolean;
}

export interface StreetCuesOptions {
  listener: THREE.Object3D;
  /** The crossing's lights: the beeper sounds while the green man is lit (quicker while he flashes). */
  crossing: { readonly walkersGreen: boolean; readonly walkersFlashing: boolean };
  /** Where the beeper boxes are (the signal posts, zone-local). */
  beepers: readonly Vec2[];
  barkers: readonly Barker[];
  sirens: readonly SirenVoice[];
}

const MASTER = 0.55;
/** A sound this far off is at half its level (metres), per kind. */
const HALF = { flutter: 7, bark: 14, beep: 5, rattle: 9, siren: 28 } as const;
/** The beeper's pitch and its pulse (seconds between beeps) while green, and while flashing. */
const BEEP = { hz: 2400, every: 0.9, flashing: 0.3 };
/** The near siren (hi-lo, like the window's) and the speed of sound for its doppler. */
const SIREN_TONES: [number, number] = [880, 660];
const SIREN_STEP = 0.65;
const SOUND_SPEED = 343;

/**
 * The street's one-off sounds, where they happen (synthesised, through `outdoorsInput`, so the sas's
 * door muffles them like the rest): pigeons' wings clattering as a flock takes off (`flutter`), a
 * dog's bark, the crossing's beeper while the green man is lit, a roller shutter's rattle as it
 * rolls (`rattle`), and a passing ambulance's siren, louder and higher coming, lower going. Each is
 * louder the nearer and panned to its side. Only while the player is in the street (`setOccupied`).
 */
export class StreetCues extends THREE.Group implements Furniture, Updatable, OccupancyAware {
  readonly contactShadow = false;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private siren: { osc: OscillatorNode; gain: GainNode; pan: StereoPannerNode } | null = null;
  private occupied = false;
  private beepClock = 0;
  private sirenDistance = -1;
  private readonly heard: number[];
  private readonly ear = new THREE.Vector3();
  private readonly facing = new THREE.Vector3();
  private readonly point = new THREE.Vector3();

  constructor(private readonly options: StreetCuesOptions) {
    super();
    this.name = 'StreetCues';
    this.heard = options.barkers.map((b) => b.barks);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(occupied ? MASTER : 0, this.ctx.currentTime, 0.3);
  }

  dispose(): void {
    this.siren?.osc.stop();
    this.master?.disconnect();
    this.ctx = null;
  }

  /** A flock of pigeons taking off at `at`: a flurry of wing claps. */
  flutter([x, z]: Vec2): void {
    const ctx = this.ready();
    if (!ctx) return;
    const { level, pan } = this.at(x, 0.3, z, HALF.flutter);
    if (level < 0.01) return;
    const out = this.panner(ctx, pan, 2);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1400;
    band.Q.value = 0.9;
    band.connect(out);
    const t = ctx.currentTime + 0.02;
    // Wing claps: a dozen short noise bursts, quick at first, thinning out as the flock climbs away.
    for (let i = 0, when = 0; i < 14; i++, when += 0.035 + i * 0.012 + Math.random() * 0.03) {
      this.burst(ctx, band, t + when, 0.05, 0.22 * level * (1 - i / 16));
    }
  }

  /** A roller shutter rolling at `at`: a ratcheting rattle for the few seconds it takes. */
  rattle([x, z]: Vec2): void {
    const ctx = this.ready();
    if (!ctx) return;
    const { level, pan } = this.at(x, 2, z, HALF.rattle);
    if (level < 0.01) return;
    const out = this.panner(ctx, pan, 5);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 700;
    band.Q.value = 1.4;
    band.connect(out);
    const t = ctx.currentTime + 0.02;
    // The slats clacking over the drum, 22 a second, a little uneven.
    for (let when = 0; when < 3.6; when += 0.045 + Math.random() * 0.012) this.burst(ctx, band, t + when, 0.02, 0.1 * level);
  }

  update(dt: number): void {
    const ctx = this.ctx ?? this.build();
    if (!ctx || !this.master) return;
    const now = ctx.currentTime;
    this.options.listener.getWorldPosition(this.ear);
    this.options.listener.getWorldDirection(this.facing);
    const { barkers, crossing } = this.options;
    for (let i = 0; i < barkers.length; i++) {
      const b = barkers[i]!;
      if (b.barks !== this.heard[i] && this.occupied) this.bark(ctx, b.position);
      this.heard[i] = b.barks;
    }
    // The beeper: from whichever post is nearer.
    if (crossing.walkersGreen || crossing.walkersFlashing) {
      this.beepClock -= dt;
      if (this.beepClock <= 0) {
        this.beepClock = crossing.walkersFlashing ? BEEP.flashing : BEEP.every;
        if (this.occupied) this.beep(ctx);
      }
    } else this.beepClock = 0;
    this.updateSiren(now, dt);
  }

  private updateSiren(now: number, dt: number): void {
    const siren = this.siren;
    if (!siren) return;
    let on: SirenVoice | null = null;
    for (const s of this.options.sirens) if (s.sirenOn) on = s;
    if (!on) {
      this.sirenDistance = -1;
      siren.gain.gain.setTargetAtTime(0, now, 0.4);
      return;
    }
    this.localToWorld(this.point.copy(on.position));
    const d = this.point.distanceTo(this.ear);
    const closing = this.sirenDistance < 0 || dt <= 0 ? 0 : (d - this.sirenDistance) / dt;
    this.sirenDistance = d;
    const doppler = SOUND_SPEED / (SOUND_SPEED + THREE.MathUtils.clamp(closing, -40, 40));
    siren.osc.frequency.setTargetAtTime(twoTone(SIREN_TONES, SIREN_STEP, now) * doppler, now, 0.015);
    siren.gain.gain.setTargetAtTime(0.16 * half(d, HALF.siren), now, 0.15);
    siren.pan.pan.setTargetAtTime(this.panOf(this.point), now, 0.1);
  }

  /** A dog's bark or two at `position` (zone-local): a gruff voiced yelp falling in pitch. */
  private bark(ctx: AudioContext, position: THREE.Vector3): void {
    const { level, pan } = this.at(position.x, 0.5, position.z, HALF.bark);
    if (level < 0.01) return;
    const out = this.panner(ctx, pan, 2);
    const t = ctx.currentTime + 0.02;
    const times = Math.random() < 0.5 ? 1 : 2;
    const pitch = 330 + Math.random() * 180;
    for (let i = 0; i < times; i++) {
      const at = t + i * 0.28;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(pitch * 1.25, at);
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.7, at + 0.13);
      const formant = ctx.createBiquadFilter();
      formant.type = 'bandpass';
      formant.frequency.value = 900;
      formant.Q.value = 1.6;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.28 * level, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.16);
      osc.connect(formant).connect(gain).connect(out);
      osc.start(at);
      osc.stop(at + 0.18);
      // The breathy edge of it.
      this.burst(ctx, formant, at, 0.08, 0.12 * level);
    }
  }

  /** One pip of the crossing's beeper, from the nearer post. */
  private beep(ctx: AudioContext): void {
    let best = { level: 0, pan: 0 };
    for (const [x, z] of this.options.beepers) {
      const heard = this.at(x, 1.2, z, HALF.beep);
      if (heard.level > best.level) best = heard;
    }
    if (best.level < 0.01) return;
    const out = this.panner(ctx, best.pan, 0.5);
    const t = ctx.currentTime + 0.01;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = BEEP.hz;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.05 * best.level, t + 0.004);
    gain.gain.setValueAtTime(0.05 * best.level, t + 0.05);
    gain.gain.linearRampToValueAtTime(0, t + 0.06);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  /** How loud (0..1) and to which side (-1..1) a sound at zone-local (x, y, z) is, half as loud at `halfAt` metres. */
  private at(x: number, y: number, z: number, halfAt: number): { level: number; pan: number } {
    this.localToWorld(this.point.set(x, y, z));
    return { level: half(this.point.distanceTo(this.ear), halfAt), pan: this.panOf(this.point) };
  }

  private panOf(world: THREE.Vector3): number {
    const dx = world.x - this.ear.x;
    const dz = world.z - this.ear.z;
    const d = Math.hypot(dx, dz) || 1;
    const rightX = -this.facing.z;
    const rightZ = this.facing.x;
    const len = Math.hypot(rightX, rightZ) || 1;
    return ((dx * rightX + dz * rightZ) / (d * len)) * 0.85;
  }

  /** A panner into the master for a one-off sound, let go `seconds` later. */
  private panner(ctx: AudioContext, pan: number, seconds: number): StereoPannerNode {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(this.master!);
    window.setTimeout(() => panner.disconnect(), (seconds + 1) * 1000);
    return panner;
  }

  /** A short burst of the shared noise into `out`. */
  private burst(ctx: AudioContext, out: AudioNode, at: number, length: number, level: number): void {
    if (!this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + Math.min(0.006, length / 4));
    gain.gain.exponentialRampToValueAtTime(0.0005, at + length);
    source.connect(gain).connect(out);
    source.start(at, Math.random() * 1.5, length + 0.02);
  }

  /** The context once started and this in the street, else null (nothing to hear). */
  private ready(): AudioContext | null {
    if (!this.occupied) return null;
    return this.ctx ?? this.build();
  }

  private build(): AudioContext | null {
    const ctx = startedAudioContext();
    if (!ctx) return null;
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.occupied ? MASTER : 0;
    this.master.connect(outdoorsInput(ctx));
    this.noise = whiteNoise(ctx, 2);
    const pan = ctx.createStereoPanner();
    pan.connect(this.master);
    const { osc, gain } = sirenVoice(ctx, pan, 2600);
    osc.start();
    this.siren = { osc, gain, pan };
    return ctx;
  }
}

/** 1 close by, 0.5 at `halfAt` metres, fading beyond. */
function half(distance: number, halfAt: number): number {
  return 1 / (1 + (distance / halfAt) ** 2);
}
