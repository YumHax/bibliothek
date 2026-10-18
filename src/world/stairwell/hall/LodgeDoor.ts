import type * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { hasKey } from '@/building/keys';
import { conciergeState, saveConcierge } from '@/building/conciergeState';
import { nudge } from '@/social/standing';
import { playLatchClick } from '@/audio/furnitureSounds';
import { invisibleHitbox } from '../../meshUtils';
import { Prop } from '../../props/Prop';
import { STAIRWELL_PLAN as plan } from '../stairwellPlan';

interface LodgeDoorOptions {
  /** Whether she is behind her glass. */
  inLodge: () => boolean;
  day: () => number;
}

/** Her person in the social layer. */
const PERSON = 'pereira';

/**
 * The concierge's glazed door, clickable (the leaf itself is `Lodge`'s): shut while she is out, and with the lodge's
 * spare key (`building/keys` 'lodge', hers to give at Friend) the player lets themself in to water her geranium, as
 * she asked, once a game day; she is warmer for it. An invisible hitbox over the door, origin on the floor at its
 * middle, +z into the hall.
 */
export class LodgeDoor extends Prop implements Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];

  constructor(private readonly options: LodgeDoorOptions) {
    super();
    this.name = 'LodgeDoor';
    const hit = invisibleHitbox(0.9, 2.05, 0.1, { y: 1.025, z: 0.05 });
    this.add(hit);
    this.hitboxes = [hit];
  }

  setHovered(): void {}

  label(): string {
    const { label } = plan.concierge.lodgeKey;
    if (this.options.inLodge()) return label.in;
    if (!hasKey('lodge')) return label.locked;
    return conciergeState().watered === this.options.day() ? label.watered : label.key;
  }

  activate(session: SessionActions): void {
    const key = plan.concierge.lodgeKey;
    if (this.options.inLodge()) return session.react(key.inLine);
    playLatchClick(0.1);
    if (!hasKey('lodge')) return session.react(key.lockedLine);
    const state = conciergeState();
    const day = this.options.day();
    if (state.watered === day) return session.react('Her geranium has had its water today.');
    const first = state.watered < 0;
    state.watered = day;
    saveConcierge();
    session.react(first ? key.watered[0]! : key.watered[1 + (day % (key.watered.length - 1))]!);
    nudge(PERSON, { warmth: key.warmth, day, why: 'you watered my geranium', reason: 'lodge', ...(first ? { memory: 'you watered my geranium while I was out' } : {}) });
  }
}
