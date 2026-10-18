import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { playKnock } from '@/audio/doorbell';
import { KEYS, PersistedStore } from '@/persistence';
import { invisibleHitbox } from '../../meshUtils';
import { ShutDoor } from '../../props/ShutDoor';

/** Seconds before the knock from the other side. */
const ANSWER_S = 1.6;

/**
 * The endless stairs' door with no name and no colour (a bare grey panelled leaf, no mat, no plate), on the lower
 * landing once the loop has gone on long enough. Hidden, it is neither drawn nor clickable (the ray ignores
 * `visible`, so its caption and its click say nothing then). Knocked on, it knocks back. Origin on the floor at the
 * door's foot, facing +z.
 */
export class StrangeDoor extends ShutDoor implements Interactable, Updatable {
  readonly hitboxes: THREE.Object3D[];
  private answer = 0;
  /** Knocks on it this loop. */
  private knocks = 0;
  /**
   * Once, past enough wraps (`answerFrom`, the loop's count told by `wraps`): a second knock is answered (`answered`
   * says it and the card it slides under), saved so it never comes again; after it the door is only wood.
   */
  answering: { wraps: () => number; from: number; answered: () => void; line: string; after: string } | null = null;
  private readonly store = new PersistedStore<{ answered: boolean }>({ key: KEYS.endlessDoor, version: 1, defaults: () => ({ answered: false }), read: (d) => (typeof d === 'object' && d !== null ? { answered: (d as { answered?: unknown }).answered === true } : null) });

  constructor(private readonly caption: string, private readonly knockLine: string) {
    super({ style: 'panelled', leafColor: 0x8c8a86, mat: false });
    this.name = 'StrangeDoor';
    const hitbox = invisibleHitbox(0.95, 2.1, 0.1, { y: 1.05, z: 0.03 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.visible = false;
  }

  setShown(shown: boolean): void {
    if (!shown) this.knocks = 0;
    this.visible = shown;
  }

  setHovered(): void {
    // Nothing glints on it.
  }

  label(): string | null {
    return this.visible ? this.caption : null;
  }

  activate(session: SessionActions): void {
    if (!this.visible) return;
    playKnock(3, 0.35);
    this.answer = ANSWER_S;
    this.knocks++;
    const answering = this.answering;
    if (answering && this.store.load().answered) return session.react(answering.after);
    if (answering && this.knocks >= 2 && answering.wraps() >= answering.from) {
      this.store.save({ answered: true });
      session.react(answering.line);
      answering.answered();
      return;
    }
    session.react(this.knockLine);
  }

  update(dt: number): void {
    if (this.answer <= 0) return;
    this.answer -= dt;
    if (this.answer <= 0) playKnock(3, 0.18);
  }
}
