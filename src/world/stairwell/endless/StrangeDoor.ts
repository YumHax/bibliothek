import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { playKnock } from '@/audio/doorbell';
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

  constructor(private readonly caption: string, private readonly knockLine: string) {
    super({ style: 'panelled', leafColor: 0x8c8a86, mat: false });
    this.name = 'StrangeDoor';
    const hitbox = invisibleHitbox(0.95, 2.1, 0.1, { y: 1.05, z: 0.03 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    this.visible = false;
  }

  setShown(shown: boolean): void {
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
    session.react(this.knockLine);
  }

  update(dt: number): void {
    if (this.answer <= 0) return;
    this.answer -= dt;
    if (this.answer <= 0) playKnock(3, 0.18);
  }
}
