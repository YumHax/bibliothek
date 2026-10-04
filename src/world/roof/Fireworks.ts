import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { DayNight } from '../props/DayNight';
import { audioBus, startedAudioContext } from '@/audio/audioContext';
import { whiteNoise } from '@/audio/noise';
import { additive } from '@/world/materials/blend';
import { random } from '@/random';

/** Bursts in the air at once, the sparks each throws, how long a spark lives (s). */
const BURSTS = 6;
const SPARKS = 90;
const LIFE = 2.4;
/** Seconds between two shells, at random in this span. */
const EVERY: [number, number] = [0.5, 1.6];
const COLOURS = [0xff5a5a, 0xffd25a, 0x7aff8a, 0x6ab8ff, 0xff8aff, 0xffffff];
/** The nights there is a show (month 0-11, day), from 22:00 to past midnight. */
const SHOW_DAYS: readonly [number, number][] = [[6, 14], [11, 31], [0, 1]];
const SHOW_HOURS = { from: 22, to: 24.75 };

/**
 * The fireworks seen from the roof on the nights there are some (Bastille Day, New Year's Eve and its
 * small hours): shells rising over the park and bursting into sparks that fall and fade, their bangs
 * reaching the roof a moment later. Points, drawn additive on the colour only (the canvas's alpha
 * kept, docs/graphics.md); no light. Hidden every other night. Zone-local, the show's middle at its origin.
 */
export class Fireworks extends THREE.Points implements Updatable {
  readonly footprint = new THREE.Box3();
  readonly contactShadow = false;
  private readonly velocity: Float32Array;
  private readonly age: Float32Array;
  private readonly base: Float32Array;
  private next = 0;
  private burst = 0;
  private readonly bangs: number[] = [];
  private clock = 0;

  constructor(
    private readonly dayNight: DayNight,
    private readonly date: () => Date,
    private readonly spread: number,
    private readonly distance: number,
  ) {
    const count = BURSTS * SPARKS;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const material = new THREE.PointsMaterial({ size: 0.9, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true });
    additive(material);
    super(geometry, material);
    this.name = 'Fireworks';
    this.frustumCulled = false;
    this.velocity = new Float32Array(count * 3);
    this.age = new Float32Array(count).fill(LIFE);
    this.base = new Float32Array(count * 3);
    this.visible = false;
  }

  /** Whether tonight is a fireworks night, and it is the hour. */
  get showing(): boolean {
    const d = this.date();
    const hours = this.dayNight.state.hours;
    const night = hours >= SHOW_HOURS.from || hours + 24 < SHOW_HOURS.to;
    return night && SHOW_DAYS.some(([m, day]) => d.getMonth() === m && d.getDate() === day) && this.dayNight.state.daylight < 0.15;
  }

  update(dt: number): void {
    this.clock += dt;
    const on = this.showing;
    if (!on && !this.visible) return;
    this.visible = true;
    if (on) {
      this.next -= dt;
      if (this.next <= 0) {
        this.next = EVERY[0] + random() * (EVERY[1] - EVERY[0]);
        this.fire();
      }
    }
    const position = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    const colour = this.geometry.getAttribute('color') as THREE.BufferAttribute;
    let alive = false;
    for (let i = 0; i < this.age.length; i++) {
      const age = (this.age[i]! += dt);
      if (age >= LIFE) {
        colour.setXYZ(i, 0, 0, 0);
        continue;
      }
      alive = true;
      // Out from the burst, slowing in the air, falling.
      const drag = Math.exp(-1.2 * age);
      const travel = (1 - drag) / 1.2;
      position.setXYZ(i, this.base[i * 3]! + this.velocity[i * 3]! * travel, this.base[i * 3 + 1]! + this.velocity[i * 3 + 1]! * travel - 2.2 * age * age, this.base[i * 3 + 2]! + this.velocity[i * 3 + 2]! * travel);
      const fade = (1 - age / LIFE) ** 1.5 * (0.75 + 0.25 * Math.sin(this.clock * 30 + i));
      const c = COLOURS[Math.floor(i / SPARKS) % COLOURS.length]!;
      colour.setXYZ(i, (((c >> 16) & 255) / 255) * fade * 2, (((c >> 8) & 255) / 255) * fade * 2, ((c & 255) / 255) * fade * 2);
    }
    position.needsUpdate = true;
    colour.needsUpdate = true;
    // The bangs, a third of a second a hundred metres after the flash.
    for (let i = this.bangs.length - 1; i >= 0; i--) {
      if ((this.bangs[i]! -= dt) > 0) continue;
      this.bangs.splice(i, 1);
      bang(0.6 * Math.min(1, 80 / this.distance));
    }
    if (!on && !alive) this.visible = false;
  }

  /** A shell bursts somewhere over the show: its sparks start out from the same point. */
  private fire(): void {
    const b = this.burst++ % BURSTS;
    const x = (random() - 0.5) * this.spread;
    const y = (random() - 0.3) * this.spread * 0.3;
    const z = (random() - 0.5) * this.spread * 0.4;
    const speed = 9 + random() * 7;
    for (let s = 0; s < SPARKS; s++) {
      const i = b * SPARKS + s;
      const u = random() * 2 - 1;
      const a = random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      this.base.set([x, y, z], i * 3);
      this.velocity.set([r * Math.cos(a) * speed, u * speed, r * Math.sin(a) * speed], i * 3);
      this.age[i] = 0;
    }
    this.bangs.push(this.distance / 340);
  }
}

/** A distant bang: a low thump of noise, its crack lost on the way. */
function bang(level: number): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  const source = ctx.createBufferSource();
  source.buffer = whiteNoise(ctx, 1);
  const low = ctx.createBiquadFilter();
  low.type = 'lowpass';
  low.frequency.value = 260;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.18 * level, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  source.connect(low).connect(gain).connect(audioBus(ctx, 'world'));
  source.start(t);
  source.stop(t + 1);
}
