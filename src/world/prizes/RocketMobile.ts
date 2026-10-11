import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { getPrize } from '@/economy/Prizes';
import { cylinderMesh } from '../meshUtils';
import { paint, standard } from '../materials/palette';
import { Prop } from '../props/Prop';
import { prizeModel } from './prizeModel';
import { type OwnedPrizes, showWhenOwned } from './ownedPrize';

interface RocketMobileOptions {
  prizes: OwnedPrizes;
  /** From the ceiling to the rocket's nose (m). Default 0.9. */
  drop?: number;
  /** The prize that brings it home. Default 'rocket'. */
  prizeId?: string;
}

const THREAD = paint(0xeeeeee, 0.7);
const WIRE = standard({ color: 0xc4c7cc, metalness: 1, roughness: 0.3 });
/** The wire arm the rocket hangs from (m), and its two little tin stars at the other end. */
const ARM = 0.34;

/**
 * The tin rocket won at the arcade, hung from the bedroom ceiling over the bed as a mobile: a thread to a wire arm, the
 * rocket on one end nose up, two tin stars to balance it on the other, turning slowly in the air the room never quite
 * stills, the rocket rocking a little. Hidden until the prize is owned. Origin at the ceiling; decoration, never collides.
 */
export class RocketMobile extends Prop implements Updatable {
  private readonly body = new THREE.Group();
  private readonly arm = new THREE.Group();
  private readonly rocket: THREE.Group;
  private readonly unsubscribe: () => void;
  private owned = false;
  private clock = 0;

  constructor(options: RocketMobileOptions) {
    super();
    this.name = 'RocketMobile';
    const drop = options.drop ?? 0.9;
    const prize = getPrize(options.prizeId ?? 'rocket')!;
    this.body.add(cylinderMesh(0.0008, drop - 0.2, THREAD, { y: -(drop - 0.2) / 2 }, { segments: 4 }));
    this.arm.position.y = -(drop - 0.2);
    const bar = cylinderMesh(0.0012, ARM, WIRE, {}, { segments: 4 });
    bar.rotation.z = Math.PI / 2;
    this.arm.add(bar);
    // The rocket on its own thread at one end, nose up.
    this.arm.add(cylinderMesh(0.0008, 0.06, THREAD, { x: ARM * 0.4, y: -0.03 }, { segments: 4 }));
    this.rocket = prizeModel(prize.kind, prize.color);
    this.rocket.position.set(ARM * 0.4, -0.06 - 0.16, 0);
    this.arm.add(this.rocket);
    // Two tin stars balancing it, at the other end.
    const tin = standard({ color: 0xd4a52a, metalness: 0.9, roughness: 0.35 });
    for (const [x, y] of [[-ARM * 0.45, -0.09], [-ARM * 0.3, -0.14]] as const) {
      this.arm.add(cylinderMesh(0.0008, -y, THREAD, { x, y: y / 2 }, { segments: 4 }));
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), tin);
      star.scale.z = 0.25;
      star.position.set(x, y - 0.02, 0);
      this.arm.add(star);
    }
    this.body.add(this.arm);
    this.add(this.body);
    this.unsubscribe = showWhenOwned(options.prizes, prize.id, this.body, null, (owned) => (this.owned = owned));
  }

  update(dt: number): void {
    if (!this.owned) return;
    this.clock += dt;
    this.arm.rotation.y = this.clock * 0.18 + Math.sin(this.clock * 0.4) * 0.3;
    this.rocket.rotation.z = Math.sin(this.clock * 0.9) * 0.06;
  }

  dispose(): void {
    this.unsubscribe();
  }
}
