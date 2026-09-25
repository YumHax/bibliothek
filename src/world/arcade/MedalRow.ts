import * as THREE from 'three';
import { cylinderMesh } from '../meshUtils';
import { matte } from '../props/Prop';
import type { MedalBook, MedalTier } from './scoreTable';

const TIERS: MedalTier[] = ['bronze', 'silver', 'gold'];
const LIT: Record<MedalTier, number> = { bronze: 0xe0995a, silver: 0xe4e8f0, gold: 0xffd23a };
const RADIUS = 0.02;
const GAP = 0.052;
const UNLIT = matte(0x2a2630, 0.4);
const RIM = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.7, roughness: 0.3 });

/**
 * Three medal lamps in a row, bronze to gold, lit once the player has earned that medal on the
 * machine (`MedalBook`): a glance down the hall says where there is still something to win.
 * Follows the book live. Origin at the middle lamp, facing +z; ~0.15 m wide.
 */
export class MedalRow extends THREE.Group {
  private readonly lamps: THREE.Mesh[] = [];
  private readonly unsubscribe: () => void;

  constructor(
    private readonly book: MedalBook,
    private readonly gameId: string,
  ) {
    super();
    this.name = 'MedalRow';
    TIERS.forEach((tier, i) => {
      const x = (i - 1) * GAP;
      const rim = cylinderMesh(RADIUS + 0.004, 0.006, RIM, { x, z: 0.002 }, { segments: 18 });
      rim.rotation.x = Math.PI / 2;
      const lamp = cylinderMesh(RADIUS, 0.008, UNLIT, { x, z: 0.004 }, { segments: 18 });
      lamp.rotation.x = Math.PI / 2;
      lamp.userData.tier = tier;
      this.lamps.push(lamp);
      this.add(rim, lamp);
    });
    this.refresh();
    this.unsubscribe = book.subscribe(() => this.refresh());
  }

  dispose(): void {
    this.unsubscribe();
  }

  private refresh(): void {
    const earned = this.book.earned(this.gameId);
    for (const lamp of this.lamps) {
      const tier = lamp.userData.tier as MedalTier;
      lamp.material = earned.includes(tier) ? litMaterial(tier) : UNLIT;
    }
  }
}

const lit = new Map<MedalTier, THREE.MeshBasicMaterial>();
function litMaterial(tier: MedalTier): THREE.MeshBasicMaterial {
  let m = lit.get(tier);
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color: LIT[tier], toneMapped: false });
    lit.set(tier, m);
  }
  return m;
}
