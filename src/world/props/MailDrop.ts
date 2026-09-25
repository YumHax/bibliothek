import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { invisibleHitbox } from '../meshUtils';
import { Prop, disposeTree } from './Prop';
import { Flyer } from './Flyer';

/** One flyer pushed under the door: what it says (read out on click), and its colour. */
export interface MailPiece {
  title: string;
  lines: string[];
  accent?: number;
  seed?: number;
}

/** Where the flyers land, local [x, z, yaw]: the first skids a little further than the second. */
const SPOTS: [number, number, number][] = [
  [-0.06, -0.05, 0.5],
  [0.08, 0.07, -0.35],
];
const SIZE = { width: 0.16, height: 0.22 };

/**
 * Mail on a doormat: up to two flyers lying flat where they came through the letterbox slot.
 * `deliver()` drops new ones; clicking reads the top one out (the Session's hint) and it goes in
 * the recycling. The hitbox covers the mat and shrinks away while there is nothing on it (the ray
 * does not care about `visible`). Floor placement: origin on the mat's top. Decoration: never collides.
 */
export class MailDrop extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  readonly contactShadow = false;
  private readonly pile: { piece: MailPiece; sheet: THREE.Object3D }[] = [];

  constructor() {
    super();
    this.name = 'MailDrop';
    const hitbox = invisibleHitbox(0.5, 0.06, 0.4, { y: 0.02 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
    this.refresh();
  }

  get count(): number {
    return this.pile.length;
  }

  /** Drops `pieces` on the mat (on top of what is there, at most two lie there at once). */
  deliver(pieces: readonly MailPiece[]): void {
    for (const piece of pieces) {
      if (this.pile.length >= SPOTS.length) break;
      const [x, z, yaw] = SPOTS[this.pile.length]!;
      const sheet = new THREE.Group();
      sheet.position.set(x, 0.001 + this.pile.length * 0.0015, z);
      sheet.rotation.y = yaw;
      const flyer = new Flyer({ style: 'paper', title: piece.title, lines: piece.lines, accent: piece.accent, seed: piece.seed, tilt: 0, ...SIZE });
      flyer.rotation.x = -Math.PI / 2;
      flyer.position.y = -0.004;
      sheet.add(flyer);
      this.add(sheet);
      this.pile.push({ piece, sheet });
    }
    this.refresh();
  }

  // --- Interactable -------------------------------------------------------------------------

  setHovered(_hovered: boolean): void {}

  label(): string | null {
    const n = this.pile.length;
    if (!n) return null;
    return n === 1 ? 'A flyer on the mat: click to read it' : `${n} flyers on the mat: click to read one`;
  }

  activate(session: SessionActions): void {
    const top = this.pile.pop();
    if (!top) return;
    this.remove(top.sheet);
    disposeTree(top.sheet);
    const { title, lines } = top.piece;
    session.hint(`${title}: ${lines.join(' · ')} (into the recycling)`);
    this.refresh();
  }

  private refresh(): void {
    this.hitboxes[0]?.scale.setScalar(this.pile.length ? 1 : 1e-4);
  }
}
