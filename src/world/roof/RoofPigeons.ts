import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { DayNight } from '../props/DayNight';
import { audioBus, startedAudioContext } from '@/audio/audioContext';
import { whiteNoise } from '@/audio/noise';
import { seededRandom } from '@/covers/generated/canvasUtils';

/** A bird takes off when the player comes this close (m), and is back this long after (s, if the player is away). */
const SCARE = 2.6;
const BACK_AFTER: [number, number] = [35, 80];
const FLIGHT_S = 3.2;
/** Below this daylight they are gone to roost under the eaves. */
const ROOST_BELOW = 0.12;
const GREYS = [0x8a8e96, 0x7a7e86, 0x9a9ca2, 0x6a6e76, 0xb0aca4];
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

interface Bird {
  perch: THREE.Vector3;
  yaw: number;
  /** Seconds into its flight away (-1: sitting), seconds before it is back (while away). */
  flight: number;
  away: number;
  /** Where it flies off to. */
  to: THREE.Vector3;
  bob: number;
}

/**
 * The roof's pigeons on the chimney tops and the zinc's edge: each sits bobbing its head, and goes
 * up in a clatter of wings when the player comes near, wheeling off over the street; back a while
 * later, once nobody is about. Gone at night. Two `InstancedMesh`es (bodies, heads). Zone-local.
 */
export class RoofPigeons extends THREE.Group implements Updatable {
  readonly footprint = new THREE.Box3();
  readonly contactShadow = false;
  private readonly bodies: THREE.InstancedMesh;
  private readonly heads: THREE.InstancedMesh;
  private readonly birds: Bird[];
  private readonly eye = new THREE.Vector3();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  /** Scratch for the body's and the head's spot (no allocation per bird per frame). */
  private readonly at = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly random = seededRandom(404);
  private clock = 0;

  constructor(perches: readonly [number, number, number][], private readonly dayNight: DayNight, private readonly viewer: THREE.Object3D) {
    super();
    this.name = 'RoofPigeons';
    const material = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    this.bodies = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 10, 7), material, perches.length);
    this.heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 6), material, perches.length);
    const c = new THREE.Color();
    this.birds = perches.map(([x, y, z], i) => {
      c.setHex(GREYS[i % GREYS.length]!);
      this.bodies.setColorAt(i, c);
      this.heads.setColorAt(i, c.multiplyScalar(0.8));
      return { perch: new THREE.Vector3(x, y, z), yaw: this.random() * Math.PI * 2, flight: -1, away: 0, to: new THREE.Vector3(), bob: this.random() * 10 };
    });
    for (const mesh of [this.bodies, this.heads]) {
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.add(mesh);
    }
  }

  update(dt: number): void {
    this.clock += dt;
    this.viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    const night = this.dayNight.state.daylight < ROOST_BELOW;
    this.birds.forEach((bird, i) => {
      if (bird.flight >= 0) {
        bird.flight += dt;
        if (bird.flight >= FLIGHT_S) {
          bird.flight = -1;
          bird.away = BACK_AFTER[0] + this.random() * (BACK_AFTER[1] - BACK_AFTER[0]);
        }
      } else if (bird.away > 0) {
        bird.away -= dt;
        // Back only with nobody near its perch.
        if (bird.away <= 0 && this.eye.distanceTo(bird.perch) < SCARE * 2) bird.away = 5;
      } else if (!night && Math.hypot(this.eye.x - bird.perch.x, this.eye.z - bird.perch.z) < SCARE) {
        // Off, away from the player and up.
        const away = this.p.set(bird.perch.x - this.eye.x, 0, bird.perch.z - this.eye.z).normalize();
        bird.to.copy(bird.perch).addScaledVector(away, 18 + this.random() * 10);
        bird.to.y += 8 + this.random() * 6;
        bird.flight = 0;
        bird.yaw = Math.atan2(away.x, away.z);
        if (i === 0 || this.random() < 0.4) flutter();
      }
      const shown = !night && (bird.flight >= 0 || bird.away <= 0);
      if (!shown) {
        this.bodies.setMatrixAt(i, HIDDEN);
        this.heads.setMatrixAt(i, HIDDEN);
        return;
      }
      // Sitting: a bob of the head now and then. Flying: along an arc, wings a blur (a flattened body).
      let flap = 1;
      if (bird.flight >= 0) {
        const t = bird.flight / FLIGHT_S;
        this.p.lerpVectors(bird.perch, bird.to, t);
        this.p.y += Math.sin(t * Math.PI) * 2;
        flap = 0.6 + 0.4 * Math.abs(Math.sin(this.clock * 40));
      } else {
        this.p.copy(bird.perch);
      }
      this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, bird.yaw);
      this.s.set(0.13 / flap, 0.11 * flap, 0.22);
      this.m.compose(this.at.copy(this.p).setY(this.p.y + 0.06), this.q, this.s);
      this.bodies.setMatrixAt(i, this.m);
      const bob = bird.flight < 0 ? Math.max(0, Math.sin(this.clock * 3 + bird.bob)) * 0.03 : 0;
      const head = this.at.set(0, 0.13 - bob, 0.1).applyQuaternion(this.q).add(this.p);
      this.m.compose(head, this.q, this.s.set(0.07, 0.07, 0.08));
      this.heads.setMatrixAt(i, this.m);
    });
    this.bodies.instanceMatrix.needsUpdate = true;
    this.heads.instanceMatrix.needsUpdate = true;
  }
}

/** Wings clattering up: a few short bursts of filtered noise. */
function flutter(): void {
  const ctx = startedAudioContext();
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 6; i++) {
    const source = ctx.createBufferSource();
    source.buffer = whiteNoise(ctx, 1);
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 900 + Math.random() * 600;
    band.Q.value = 1.2;
    const gain = ctx.createGain();
    const at = t + i * 0.07;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.05, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    source.connect(band).connect(gain).connect(audioBus(ctx, 'world'));
    source.start(at, Math.random() * 0.5);
    source.stop(at + 0.07);
  }
}
