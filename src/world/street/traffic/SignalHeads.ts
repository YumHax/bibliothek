import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import { createCanvas } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { nightnessOf } from '../streetAir';
import { snowCovered } from '../snowCover';
import type { Spot } from '../streetPlan';
import type { StreetTraffic } from './StreetTraffic';

const POLE = { height: 3.3, radius: 0.06 };
/** The drivers' head: three lamps one over the other, red on top, facing the oncoming traffic. */
const CAR_HEAD = { y: 2.85, width: 0.34, height: 0.96, depth: 0.24, lamp: 0.1, pitch: 0.3 };
/** The walkers' head: red man over green man, facing across the road. */
const WALK_HEAD = { y: 2.0, width: 0.3, height: 0.6, depth: 0.2, lamp: 0.22 };
const RED = new THREE.Color(1, 0.08, 0.04);
const AMBER = new THREE.Color(1, 0.55, 0.04);
const GREEN = new THREE.Color(0.1, 1, 0.45);
/** Unlit lamps keep this much of their colour (the lens under daylight). */
const OFF = 0.07;

type Lamp = 'red' | 'amber' | 'green' | 'stop' | 'walk';

/**
 * The lights at the signalled crossing, one post on each kerb (`STREET_PLAN.signals.posts`): a
 * pole, the drivers' head (red, amber, green) facing the traffic it stops, the walkers' head (the
 * red man, the green man, flashing before the red) facing the people across the road, and a push
 * button. They show `StreetTraffic`'s phase; the lamps are unlit colour (no light of their own),
 * brighter than white so they bloom. Merged per material: six draw calls for both posts.
 */
export class SignalHeads extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[] = [];
  private readonly lamps: Record<Lamp, THREE.MeshBasicMaterial>;
  private readonly base: Record<Lamp, THREE.Color>;
  private blink = 0;

  constructor(private readonly traffic: StreetTraffic, private readonly dayNight: DayNight, posts: readonly Spot[]) {
    super();
    this.name = 'SignalHeads';
    this.base = { red: RED, amber: AMBER, green: GREEN, stop: RED, walk: GREEN };
    this.lamps = {
      red: new THREE.MeshBasicMaterial({ color: RED.clone() }),
      amber: new THREE.MeshBasicMaterial({ color: AMBER.clone() }),
      green: new THREE.MeshBasicMaterial({ color: GREEN.clone() }),
      stop: new THREE.MeshBasicMaterial({ map: figureTexture(false), color: RED.clone() }),
      walk: new THREE.MeshBasicMaterial({ map: figureTexture(true), color: GREEN.clone() }),
    };
    const metal: THREE.BufferGeometry[] = [];
    const lenses: Record<Lamp, THREE.BufferGeometry[]> = { red: [], amber: [], green: [], stop: [], walk: [] };
    const post = new THREE.Matrix4();
    const head = new THREE.Matrix4();
    for (const { at, yaw } of posts) {
      post.makeRotationY(yaw).setPosition(at[0], 0, at[1]);
      metal.push(new THREE.CylinderGeometry(POLE.radius, POLE.radius * 1.2, POLE.height, 10).translate(0, POLE.height / 2, 0).applyMatrix4(post));
      // The drivers' head, in front of the pole.
      const c = CAR_HEAD;
      metal.push(new THREE.BoxGeometry(c.width, c.height, c.depth).translate(0, c.y, c.depth / 2 + POLE.radius).applyMatrix4(post));
      (['red', 'amber', 'green'] as const).forEach((lamp, i) => {
        const y = c.y + (1 - i) * c.pitch;
        lenses[lamp].push(new THREE.CircleGeometry(c.lamp, 16).translate(0, y, c.depth + POLE.radius + 0.004).applyMatrix4(post));
        // A visor over each lamp.
        metal.push(new THREE.BoxGeometry(c.lamp * 2.4, 0.02, 0.12).translate(0, y + c.lamp + 0.03, c.depth + POLE.radius + 0.06).applyMatrix4(post));
      });
      // The walkers' head faces across the road: +z on our side's kerb, -z on the far one.
      const across = at[1] < 0 ? 0 : Math.PI;
      head.makeRotationY(across).setPosition(at[0], 0, at[1]);
      const w = WALK_HEAD;
      metal.push(new THREE.BoxGeometry(w.width, w.height, w.depth).translate(0, w.y, w.depth / 2 + POLE.radius).applyMatrix4(head));
      lenses.stop.push(new THREE.PlaneGeometry(w.lamp, w.lamp).translate(0, w.y + 0.14, w.depth + POLE.radius + 0.004).applyMatrix4(head));
      lenses.walk.push(new THREE.PlaneGeometry(w.lamp, w.lamp).translate(0, w.y - 0.14, w.depth + POLE.radius + 0.004).applyMatrix4(head));
      // The push button box, at hand height on the walkers' side.
      metal.push(new THREE.BoxGeometry(0.12, 0.18, 0.08).translate(0, 1.1, POLE.radius + 0.04).applyMatrix4(head));
      this.colliders.push(new THREE.Box3(new THREE.Vector3(at[0] - 0.12, 0, at[1] - 0.12), new THREE.Vector3(at[0] + 0.12, 2, at[1] + 0.12)));
    }
    const poles = new THREE.Mesh(mergeGeometries(metal.map((g) => g.toNonIndexed()))!, snowCovered(new THREE.MeshStandardMaterial({ color: 0x2a2e30, roughness: 0.5, metalness: 0.5 })));
    for (const g of metal) g.dispose();
    poles.castShadow = true;
    poles.receiveShadow = true;
    this.add(poles);
    for (const lamp of Object.keys(lenses) as Lamp[]) {
      const mesh = new THREE.Mesh(mergeGeometries(lenses[lamp])!, this.lamps[lamp]);
      for (const g of lenses[lamp]) g.dispose();
      this.add(mesh);
    }
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const phase = this.traffic.phase;
    this.blink = (this.blink + dt) % 0.8;
    const lit: Record<Lamp, boolean> = {
      green: phase === 'carsGreen',
      amber: phase === 'amber',
      red: phase !== 'carsGreen' && phase !== 'amber',
      walk: phase === 'walkersGreen' || (phase === 'walkersFlash' && this.blink < 0.4),
      stop: phase !== 'walkersGreen' && phase !== 'walkersFlash',
    };
    // Lit lamps brighter at night (they would glare), dim ones barely there.
    const on = 1.6 + 1.2 * THREE.MathUtils.smoothstep(nightnessOf(this.dayNight.state), 0.2, 0.6);
    for (const lamp of Object.keys(lit) as Lamp[]) this.lamps[lamp].color.copy(this.base[lamp]).multiplyScalar(lit[lamp] ? on : OFF);
  }
}

/** A lamp's glass: the standing red man or the walking green man, white on black (the colour tints it). */
function figureTexture(walking: boolean): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(64, 64);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(32, 12, 6, 0, Math.PI * 2);
  ctx.fill();
  const limbs = walking
    ? [[32, 20, 30, 38], [31, 24, 20, 32], [31, 24, 42, 30], [30, 38, 20, 56], [30, 38, 42, 54]]
    : [[32, 20, 32, 40], [32, 23, 24, 38], [32, 23, 40, 38], [32, 40, 27, 57], [32, 40, 37, 57]];
  for (const [x0, y0, x1, y1] of limbs) {
    ctx.beginPath();
    ctx.moveTo(x0!, y0!);
    ctx.lineTo(x1!, y1!);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
