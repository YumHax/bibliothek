import type * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { collectPost, postCollected } from '@/building/postCollected';
import { Prop } from '../../props/Prop';
import { invisibleHitbox } from '../../meshUtils';
import type { MailPiece } from '../../props/MailDrop';

interface OurMailboxOptions {
  /** The game's day now (the post is one round a day). */
  day: () => number;
  /** The day's post (`hallway/mail`'s `mailFor`, with the flyers' sources). */
  post: (day: number) => MailPiece[];
  /** The flap's size on the cabinet's face (m). */
  width: number;
  height: number;
}

/**
 * Our flap in the hall's mailboxes ("5TH · YOU"): opened on the way past, it hands over the day's post, read on the
 * spot, and the mat at home then gets none that day (`building/postCollected`: whichever comes first). An invisible
 * hitbox over the painted flap. Wall-hung on the cabinet's face: origin at the flap's middle, +z out of it.
 */
export class OurMailbox extends Prop implements Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];

  constructor(private readonly options: OurMailboxOptions) {
    super();
    this.name = 'OurMailbox';
    const hit = invisibleHitbox(options.width, options.height, 0.04, { z: 0.02 });
    this.add(hit);
    this.hitboxes = [hit];
  }

  setHovered(): void {}

  label(): string {
    return postCollected(this.options.day()) ? 'Your mailbox · emptied today' : 'Your mailbox · open';
  }

  activate(session: SessionActions): void {
    const day = this.options.day();
    if (!collectPost(day)) {
      session.react('Empty. You took the post already today.');
      return;
    }
    const pieces = this.options.post(day);
    if (!pieces.length) {
      session.react('Nothing but dust and a rubber band.');
      return;
    }
    const text = pieces.map((piece) => [piece.title, ...piece.lines].join('\n')).join('\n\n');
    session.read({
      title: pieces.length === 1 ? 'In your mailbox' : `In your mailbox: ${pieces.length} things`,
      text,
      effect: 'Read on the way past, and into the recycling bin by the door.',
      look: 'letter',
    });
  }
}
