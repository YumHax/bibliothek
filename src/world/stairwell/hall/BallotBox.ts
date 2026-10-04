import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { CoproMeeting } from '@/building/coproMeeting';
import { nextMeetingDay } from '@/building/coproMeeting';
import { Prop, part } from '../../props/Prop';
import { METAL, paint } from '../../materials/palette';
import { invisibleHitbox } from '../../meshUtils';
import type { CoproPanelLike } from '../building';

const WOOD = paint(0x5a3a22, 0.5);

interface BallotBoxOptions {
  meeting: CoproMeeting;
  /** The postal vote's panel (none: the box only tells when the next meeting is). */
  panel?: CoproPanelLike;
  /** The player's coins, to pay for extra votes. */
  purse?: { readonly coins: number; spend(coins: number): boolean };
  /** The game day now. */
  day: () => number;
}

/**
 * The co-owners' ballot box under the hall's notice board: a varnished box with a brass slot. While a meeting's ballot
 * is open it opens the postal vote (`CoproPanel`); otherwise it says when the next one sits. Wall-hung: origin at its
 * middle, +z into the hall.
 */
export class BallotBox extends Prop implements Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly lid: THREE.MeshStandardMaterial;

  constructor(private readonly options: BallotBoxOptions) {
    super();
    this.name = 'BallotBox';
    this.lid = new THREE.MeshStandardMaterial({ color: 0x6a4428, roughness: 0.45 });
    part(this, 0.26, 0.2, 0.16, WOOD, { z: 0.08 });
    part(this, 0.28, 0.02, 0.18, this.lid, { y: 0.11, z: 0.08 });
    part(this, 0.12, 0.012, 0.02, METAL.brass(), { y: 0.121, z: 0.08 });
    const hit = invisibleHitbox(0.32, 0.28, 0.22, { z: 0.1 });
    this.add(hit);
    this.hitboxes = [hit];
    this.traverse((o) => (o.castShadow = false));
  }

  setHovered(hovered: boolean): void {
    this.lid.emissive.setHex(hovered ? 0x2a160a : 0x000000);
  }

  label(): string {
    return this.options.meeting.openMeeting !== null ? 'Ballot box · vote (the co-owners’ meeting)' : 'Ballot box · the next meeting';
  }

  activate(session: SessionActions): void {
    const { meeting, panel, purse } = this.options;
    if (meeting.openMeeting === null || !panel) {
      session.react(`The next meeting of the co-owners sits on day ${nextMeetingDay(this.options.day())}. The agenda goes up on the board a few days before.`);
      return;
    }
    panel.prepare({
      view: () => meeting.ballotView(),
      cast: (votes, bought) =>
        meeting.cast(votes, bought, (coins) => {
          if (!purse?.spend(coins)) return false;
          session.reward({ title: 'Paid towards the works', detail: 'Your extra votes are in the box.', coins: -coins });
          return true;
        }),
      coins: () => purse?.coins ?? 0,
      done: (text) => session.react(text),
    });
    session.openPanel(panel);
  }
}
