import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { POINT_SCALE, scalesPoints } from '../particles/pointScale';
import { overKeepingAlpha } from '@/world/materials/blend';
import { currentSeason } from '@/time/season';
import { hashInts } from '@/random';
import { inHours } from '@/time/clock';
import FRAGMENT from './ChimneySmoke.frag.glsl?raw';
import VERTEX from './ChimneySmoke.vert.glsl?raw';

/** Puffs per smoking chimney, a puff's life (seconds), the share of chimneys with a fire lit. */
const PUFFS = 12;
const LIFE = 9;
const LIT = 0.4;

/**
 * Smoke from the roofs' chimneys on cold days (`Buildings.chimneyTops`): a few in winter, autumn's end and spring's
 * start, more of them in the morning and the evening when the stoves are lit; each chimney its puffs rising, drifting
 * downwind (`SkyState.wind`), growing and fading, grey by day and dark against the night. One draw call, no light.
 * Decoration: nothing collides.
 */
export class ChimneySmoke extends THREE.Points implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly uniforms: { time: { value: number }; amount: { value: number }; wind: { value: THREE.Vector2 }; color: { value: THREE.Color } };

  constructor(tops: readonly THREE.Vector3[], private readonly dayNight: DayNight) {
    const lit = tops.filter((_, i) => hashInts(i, 4243) % 1000 < LIT * 1000);
    const position = new Float32Array(lit.length * PUFFS * 3);
    const puff = new Float32Array(lit.length * PUFFS * 2);
    lit.forEach((top, c) => {
      for (let i = 0; i < PUFFS; i++) {
        const k = c * PUFFS + i;
        position.set([top.x, top.y, top.z], k * 3);
        puff.set([i / PUFFS + (hashInts(c) % 100) / 1000, (hashInts(c, i) % 1000) / 1000], k * 2);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
    geometry.setAttribute('puff', new THREE.BufferAttribute(puff, 2));
    const uniforms = { time: { value: 0 }, amount: { value: 0 }, wind: { value: new THREE.Vector2() }, color: { value: new THREE.Color() }, pointScale: POINT_SCALE, life: { value: LIFE } };
    const material = new THREE.ShaderMaterial({ uniforms, vertexShader: VERTEX, fragmentShader: FRAGMENT, transparent: true, depthWrite: false });
    super(geometry, overKeepingAlpha(material));
    this.uniforms = uniforms;
    this.name = 'ChimneySmoke';
    // The puffs rise and drift out of their chimneys' points.
    this.frustumCulled = false;
    this.visible = lit.length > 0;
    scalesPoints(this);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const s = this.dayNight.state;
    const u = this.uniforms;
    u.time.value = (u.time.value + dt) % 10000;
    u.amount.value = coldness() * stoves(s.hours) * (1 - 0.6 * s.rain);
    u.wind.value.set(0.35 + s.wind, 0.15 + s.wind * 0.4);
    // Grey under the sky by day, darker and bluer at night.
    u.color.value.setRGB(0.42 + 0.4 * s.daylight, 0.43 + 0.4 * s.daylight, 0.46 + 0.38 * s.daylight);
  }
}

/** How cold the time of year is for a fire: deep winter 1, late autumn and early spring less, summer none. */
function coldness(): number {
  const { name, depth } = currentSeason();
  if (name === 'winter') return 1;
  if (name === 'autumn') return THREE.MathUtils.smoothstep(depth, 0.3, 0.8);
  if (name === 'spring') return 1 - THREE.MathUtils.smoothstep(depth, 0.1, 0.5);
  return 0;
}

/** How many stoves are going at an hour: the morning and the evening most, the small hours least. */
function stoves(hours: number): number {
  if (inHours(hours, [6, 10])) return 1;
  if (inHours(hours, [17, 24])) return 0.9;
  if (inHours(hours, [0, 6])) return 0.35;
  return 0.55;
}
