import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { playSoftThud } from '@/audio/furnitureSounds';
import { invisibleHitbox } from '../meshUtils';
import { paint } from '../materials/palette';
import { Prop } from '../props/Prop';

const RADIUS = 0.1;
/** The kick's speed (m/s), the grass's drag (1/s), how far from its spot the lawn lets it roll (m). */
const KICK = { speed: 3.2, drag: 1.6, reach: 1.6 };
const LINES = ['A good kick: the ball rolls off across the lawn and stops by the airer.', 'You dribble it a bit. Nobody saw. Probably.', 'Thunk. It bounces off the curb and comes back to your feet.'];

/**
 * The kids' ball left on the lawn (`COURTYARD_PLAN.dressing.ball`): a click kicks it away from the player; it rolls,
 * slows on the grass, turns back at the lawn's edge (`KICK.reach` round where it lay). Origin on the lawn at its spot.
 */
export class YardBall extends Prop implements Interactable, Updatable {
  readonly hitboxes: THREE.Object3D[];
  readonly contactShadow = false;
  private readonly ball: THREE.Mesh;
  private readonly velocity = new THREE.Vector2();
  private readonly eye = new THREE.Vector3();
  private readonly here = new THREE.Vector3();
  private kicks = 0;

  constructor(private readonly viewer: THREE.Object3D, lawnY: number) {
    super();
    this.name = 'YardBall';
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 18, 12), paint(0xe8b820, 0.5));
    this.ball.position.y = lawnY + RADIUS;
    this.ball.castShadow = true;
    const hit = invisibleHitbox(0.3, 0.3, 0.3, { y: 0.15 });
    this.ball.add(hit);
    hit.position.y = 0;
    this.hitboxes = [hit];
    this.add(this.ball);
  }

  setHovered(): void {}

  label(): string {
    return 'A ball on the lawn · kick it';
  }

  activate(session: SessionActions): void {
    this.viewer.getWorldPosition(this.eye);
    this.ball.getWorldPosition(this.here);
    const away = new THREE.Vector2(this.here.x - this.eye.x, this.here.z - this.eye.z);
    if (away.lengthSq() < 1e-4) away.set(0, 1);
    // Into the prop's frame (it is placed unturned in the zone, so only the zone's own turn counts: none in the yard).
    this.velocity.copy(away.normalize().multiplyScalar(KICK.speed));
    playSoftThud(0.12);
    session.react(LINES[this.kicks++ % LINES.length]!);
  }

  update(dt: number): void {
    if (this.velocity.lengthSq() < 1e-4) return;
    const p = this.ball.position;
    p.x += this.velocity.x * dt;
    p.z += this.velocity.y * dt;
    // The lawn's edge: back the way it came, a little slower.
    const off = Math.hypot(p.x, p.z);
    if (off > KICK.reach) {
      p.x *= KICK.reach / off;
      p.z *= KICK.reach / off;
      this.velocity.multiplyScalar(-0.6);
    }
    const speed = this.velocity.length();
    this.ball.rotation.x += (this.velocity.y / RADIUS) * dt;
    this.ball.rotation.z -= (this.velocity.x / RADIUS) * dt;
    this.velocity.multiplyScalar(Math.exp(-KICK.drag * dt));
    if (speed < 0.05) this.velocity.set(0, 0);
  }
}
