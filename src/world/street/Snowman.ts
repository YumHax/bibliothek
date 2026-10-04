import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { cylinderMesh } from '../meshUtils';
import { Prop } from '../props/Prop';
import { paint } from '../materials/palette';
import { STREET_SNOW } from './snowCover';
import { outOfSight } from './life/sight';

const SNOW = paint(0xf2f4f8, 0.95);
const COAL = paint(0x151515, 0.8);
const CARROT = paint(0xe0701c, 0.6);
const STICK = paint(0x4a3422, 0.9);
const SCARF = paint(0xc8243a, 0.8);
/** It is built once this much snow lies, and gone (melted, or kicked over) once it is under the second. */
const BUILT_AT = 0.45;
const GONE_AT = 0.2;
/** Melting (the cover under `BUILT_AT`) it sags to this much of its size by the time it is gone. */
const MELTED = 0.72;

interface SnowmanOptions {
  /** The camera: it is built and melts away only while nobody is looking. */
  viewer: THREE.Object3D;
  /** The zone's collision set (world boxes): a small collider round its base while it stands. */
  collisions?: { add(box: THREE.Box3): void; remove(box: THREE.Box3): void };
}

/**
 * A snowman someone built on the pavement, there only while the snow lies (`STREET_SNOW`, the
 * street's cover): three balls, coal eyes and buttons, a carrot, twig arms and a red scarf.
 * Standing on its base at local y = 0, facing +z. It turns up and goes only while out of the
 * player's sight (`outOfSight`), sagging as the snow melts; a small collider round its base while it stands.
 */
export class Snowman extends Prop implements Updatable {
  private collider: THREE.Box3 | null = null;
  private fresh = true;
  private readonly here = new THREE.Vector3();

  constructor(private readonly options: SnowmanOptions) {
    super();
    this.name = 'Snowman';
    const balls = [0.3, 0.22, 0.15];
    let y = 0;
    const centres: number[] = [];
    for (const r of balls) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), SNOW);
      ball.position.y = y + r * 0.9;
      ball.castShadow = true;
      centres.push(ball.position.y);
      y += r * 1.7;
      this.add(ball);
    }
    const head = centres[2]!;
    const headR = balls[2]!;
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 5), COAL);
      eye.position.set(sx * 0.05, head + 0.04, headR * 0.93);
      this.add(eye);
      const arm = cylinderMesh(0.008, 0.42, STICK, {}, { segments: 5 });
      arm.position.set(sx * (balls[1]! + 0.14), centres[1]! + 0.1, 0);
      arm.rotation.z = sx * 1.0;
      this.add(arm);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.12, 8), CARROT);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, head, headR + 0.05);
    this.add(nose);
    for (let i = 0; i < 3; i++) {
      const button = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), COAL);
      const by = centres[1]! + 0.1 - i * 0.1;
      const r = balls[1]!;
      button.position.set(0, by, Math.sqrt(Math.max(0, r * r - (by - centres[1]!) ** 2)) * 0.98);
      this.add(button);
    }
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(headR * 0.85, 0.035, 6, 16), SCARF);
    scarf.rotation.x = Math.PI / 2;
    scarf.position.y = head - headR * 0.75;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.02), SCARF);
    tail.position.set(0.08, head - headR * 0.75 - 0.1, headR * 0.7);
    tail.rotation.z = 0.2;
    this.add(scarf, tail);
    this.visible = false;
  }

  setZoneActive(active: boolean): void {
    if (active) this.fresh = true;
  }

  dispose(): void {
    if (this.collider && this.visible) this.options.collisions?.remove(this.collider);
  }

  update(): void {
    const snow = STREET_SNOW.value;
    if (!this.collider) {
      this.updateWorldMatrix(true, false);
      this.collider = new THREE.Box3(new THREE.Vector3(-0.3, 0, -0.3), new THREE.Vector3(0.3, 1.2, 0.3)).applyMatrix4(this.matrixWorld);
    }
    const want = this.visible ? snow >= GONE_AT : snow >= BUILT_AT;
    if (want !== this.visible && (this.fresh || outOfSight(this.options.viewer, this.getWorldPosition(this.here)))) {
      this.visible = want;
      if (want) this.options.collisions?.add(this.collider);
      else this.options.collisions?.remove(this.collider);
    }
    this.fresh = false;
    // Sagging as it melts.
    const melt = THREE.MathUtils.clamp((BUILT_AT - snow) / (BUILT_AT - GONE_AT), 0, 1);
    this.scale.set(1 + melt * 0.08, 1 - melt * (1 - MELTED), 1 + melt * 0.08);
  }
}
