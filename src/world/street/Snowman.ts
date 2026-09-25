import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { cylinderMesh } from '../meshUtils';
import { markShared, matte, Prop } from '../props/Prop';
import { STREET_SNOW } from './snowCover';

const SNOW = markShared(new THREE.MeshStandardMaterial({ color: 0xf2f4f8, roughness: 0.95 }));
const COAL = markShared(matte(0x151515, 0.8));
const CARROT = markShared(matte(0xe0701c, 0.6));
const STICK = markShared(matte(0x4a3422, 0.9));
const SCARF = markShared(matte(0xc8243a, 0.8));
/** It is built once this much snow lies, and gone (melted, or kicked over) once it is under the second. */
const BUILT_AT = 0.45;
const GONE_AT = 0.2;

/**
 * A snowman someone built on the pavement, there only while the snow lies (`STREET_SNOW`, the
 * street's cover): three balls, coal eyes and buttons, a carrot, twig arms and a red scarf.
 * Standing on its base at local y = 0, facing +z. Decoration: never collides.
 */
export class Snowman extends Prop implements Updatable {
  constructor() {
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
    this.visible = STREET_SNOW.value >= BUILT_AT;
  }

  update(): void {
    const snow = STREET_SNOW.value;
    if (!this.visible && snow >= BUILT_AT) this.visible = true;
    else if (this.visible && snow < GONE_AT) this.visible = false;
  }
}
