import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import type { CoproMeeting } from '@/building/coproMeeting';
import { COPRO_PLAN } from '@/building/coproPlan';
import type { OccupancyAware } from '../../Furniture';
import { randomLook, type PersonLook } from '../../people/looks';
import { Prop } from '../../props/Prop';
import { paint } from '../../materials/palette';
import { StairWalker, type StairWalkerOptions } from '../StairWalker';
import { STAIRWELL_PLAN as plan } from '../stairwellPlan';

/** The syndic's look: a grey suit, white hair, glasses. */
function syndicLook(): PersonLook {
  return {
    ...randomLook(COPRO_PLAN.syndicSeed, 'shopper'),
    figure: 'straight',
    hairStyle: 'short',
    hair: 0xd9d3c8,
    hat: undefined,
    beard: undefined,
    glasses: 0x1a1a1a,
    top: 'jacket',
    topColor: 0x3a3c42,
    topAccent: 0xf2efe8,
    longSleeves: true,
    apron: undefined,
    trousers: 0x3a3c42,
    shorts: false,
    shoes: 'loafer',
    shoeColor: 0x1a1a1a,
    bag: 'tote',
    bagColor: 0x2f2f33,
    height: 1.76,
  };
}

interface MeetingSetupOptions extends Omit<StairWalkerOptions, 'look' | 'seed' | 'label' | 'speaker' | 'lines'> {
  meeting: CoproMeeting;
  hours: () => number;
}

/**
 * The co-owners' meeting set out in the entrance hall on its day (`COPRO_PLAN.syndicHours`): six folding chairs facing
 * the syndic, who stands by the stairs with his papers and has a word for whoever asks (vote in the box, the agenda).
 * Seen only then, and only while the player is in the stairwell. Zone-local, placed at the origin.
 */
export class MeetingSetup extends Prop implements Updatable, OccupancyAware {
  readonly contactShadow = false;
  readonly syndic: StairWalker;
  private readonly chairs = new THREE.Group();
  private occupied = false;
  private clock = 0;

  constructor(private readonly options: MeetingSetupOptions) {
    super();
    this.name = 'MeetingSetup';
    this.syndic = new StairWalker({ ...options, seed: COPRO_PLAN.syndicSeed, look: syndicLook(), speaker: COPRO_PLAN.syndic, label: `${COPRO_PLAN.syndic}, the syndic · chat`, lines: COPRO_PLAN.syndicLines });
    const seats: THREE.BufferGeometry[] = [];
    const frames: THREE.BufferGeometry[] = [];
    const [sx, sz] = plan.meeting.syndic;
    for (const [x, z] of plan.meeting.chairs) {
      // Facing the syndic (towards -z): the back on the far side.
      const yaw = Math.atan2(sx - x, sz - z);
      const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0, z);
      seats.push(new THREE.BoxGeometry(0.4, 0.025, 0.38).translate(0, 0.45, 0).applyMatrix4(m));
      seats.push(new THREE.BoxGeometry(0.4, 0.22, 0.02).translate(0, 0.72, -0.19).applyMatrix4(m));
      for (const lx of [-0.18, 0.18]) for (const lz of [-0.17, 0.17]) frames.push(new THREE.CylinderGeometry(0.01, 0.01, lz < 0 ? 0.85 : 0.45, 5).translate(lx, lz < 0 ? 0.425 : 0.225, lz).applyMatrix4(m).toNonIndexed());
    }
    const seatMesh = new THREE.Mesh(mergeGeometries(seats)!, paint(0x8a6a44, 0.55));
    const frameMesh = new THREE.Mesh(mergeGeometries(frames)!, paint(0x3a3c40, 0.4));
    for (const mesh of [seatMesh, frameMesh]) {
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      this.chairs.add(mesh);
    }
    this.chairs.visible = false;
    this.add(this.chairs);
  }

  override get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.clock = 0;
  }

  update(dt: number): void {
    this.clock -= dt;
    if (this.clock > 0) return;
    this.clock = 1;
    const on = this.options.meeting.syndicHere(this.options.hours());
    this.chairs.visible = on;
    const here = on && this.occupied;
    if (here && !this.syndic.isPresent) {
      const [x, z] = plan.meeting.syndic;
      this.syndic.appear(new THREE.Vector3(x, 0, z), 0);
      this.syndic.stand(0, 'read');
      this.syndic.hold('book');
    } else if (!here && this.syndic.isPresent) this.syndic.away();
  }
}
