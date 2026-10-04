import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { QUALITY } from '@/graphics/quality';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { ROAD_Y } from './driving';
import type { StreetTraffic } from './StreetTraffic';
import { RENDER_ORDER } from '../../surface/layers';
import { POINT_SCALE, scalesPoints } from '../../particles/pointScale';
import { overKeepingAlpha } from '@/world/materials/blend';
import { assemble } from '@/graphics/glslAssemble';
import sprayVertex from './Spray.vert.glsl?raw';
import FRAGMENT from './Spray.frag.glsl?raw';
import { random } from '@/random';

/** How long a droplet flies (s), gravity on it, and how wet the road must be before anything throws spray. */
const LIFE = 0.9;
const GRAVITY = -5;
const WET_FROM = 0.3;
/** Droplets thrown per second per metre per second of speed, for a car; a bus or lorry throws twice that, a bike a tenth. */
const RATE = 3.2;
const FAST_ENOUGH = 3;
const WHITE = new THREE.Color(1, 1, 1);

/** The droplets' flight, with the constants above written in. */
const VERTEX = assemble(sprayVertex, { defines: { TS_LIFE: LIFE.toFixed(2), TS_GRAVITY: GRAVITY.toFixed(1), TS_ROAD_Y: ROAD_Y.toFixed(3) } });

/**
 * The spray a vehicle throws off a wet road: fine droplets kicked up behind its rear wheels, more
 * the faster it goes (none below a walking pace, from nothing on a damp road to a mist in a
 * downpour), rising a little and falling back. One `Points` mesh with a ring of droplets: each is
 * written once when thrown (where, how fast, when) and flown by the vertex shader; hidden while
 * the road is dry. Blends over the scene and keeps the canvas alpha.
 */
export class Spray extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly points: THREE.Points;
  private readonly material: THREE.ShaderMaterial;
  private readonly start: THREE.BufferAttribute;
  private readonly velocity: THREE.BufferAttribute;
  private readonly birth: THREE.BufferAttribute;
  private readonly count: number;
  private next = 0;
  private time = 0;
  private lastThrown = -Infinity;
  private readonly owed = new Map<object, number>();

  constructor(private readonly traffic: StreetTraffic, private readonly dayNight: DayNight) {
    super();
    this.name = 'Spray';
    this.count = QUALITY.level === 'low' ? 240 : 700;
    const geometry = new THREE.BufferGeometry();
    this.start = new THREE.BufferAttribute(new Float32Array(this.count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.velocity = new THREE.BufferAttribute(new Float32Array(this.count * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.birth = new THREE.BufferAttribute(new Float32Array(this.count).fill(-100), 1).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.start);
    geometry.setAttribute('velocity', this.velocity);
    geometry.setAttribute('birth', this.birth);
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: { time: { value: 0 }, size: { value: 0.22 }, tint: { value: new THREE.Color(0.8, 0.82, 0.85) }, strength: { value: 0 }, pointScale: POINT_SCALE },
      depthWrite: false,
    });
    overKeepingAlpha(this.material);
    this.points = new THREE.Points(geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = RENDER_ORDER.particles;
    this.points.visible = false;
    scalesPoints(this.points);
    this.add(this.points);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    this.time += dt;
    const s = this.dayNight.state;
    const wet = THREE.MathUtils.smoothstep(s.wetness, WET_FROM, 0.9) * (1 - s.snowCover);
    const uniforms = this.material.uniforms;
    uniforms.time!.value = this.time;
    uniforms.strength!.value = 0.35 * (0.4 + 0.6 * s.daylight) * (0.5 + 0.5 * wet);
    (uniforms.tint!.value as THREE.Color).copy(s.ambient).lerp(WHITE, 0.5).multiplyScalar(0.35 + 0.65 * s.daylight);
    if (wet > 0) this.throwFrom(dt, wet);
    this.points.visible = this.time - this.lastThrown < LIFE;
  }

  private throwFrom(dt: number, wet: number): void {
    let wrote = false;
    for (const v of this.traffic.vehicles) {
      if (!v.active || v.speed < FAST_ENOUGH) continue;
      const scale = v.length > 7 ? 2 : v.length < 2.5 ? 0.1 : 1;
      const owed = (this.owed.get(v) ?? 0) + RATE * v.speed * scale * wet * dt;
      const n = Math.floor(owed);
      this.owed.set(v, owed - n);
      const hx = Math.cos(v.yaw);
      const hz = -Math.sin(v.yaw);
      for (let i = 0; i < n; i++) {
        // Behind a rear wheel, either side.
        const side = (random() < 0.5 ? -1 : 1) * (v.width / 2 - 0.15);
        const back = -v.length / 2 + 0.6 + random() * 0.3;
        const k = this.next;
        this.next = (this.next + 1) % this.count;
        this.start.setXYZ(k, v.position.x + hx * back - hz * side, ROAD_Y + 0.15, v.position.z + hz * back + hx * side);
        // Thrown backwards and up, at a fraction of the vehicle's speed, fanning out.
        const out = side > 0 ? 1 : -1;
        const speed = v.speed * (0.18 + random() * 0.12);
        this.velocity.setXYZ(k, -hx * speed - hz * out * random() * 1.2, 0.8 + random() * 1.4, -hz * speed + hx * out * random() * 1.2);
        this.birth.setX(k, this.time - random() * dt);
        wrote = true;
      }
    }
    if (!wrote) return;
    this.lastThrown = this.time;
    this.start.needsUpdate = true;
    this.velocity.needsUpdate = true;
    this.birth.needsUpdate = true;
  }
}
