import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { NoticeActions } from '@/notices';
import { markStreet, streetMarked } from '@/social/street/streetMarks';
import type { Furniture } from '../../Furniture';
import { frontWorksMoved } from './roadworks';

/**
 * The first time the player is out on Front Street after its works have moved on (`WORKS_LIFT`): a slip says the
 * pavements are open past them, once ever (`streetMarks` 'worksOpen'). Waits for the player to be in the street (it
 * may be built ahead from the stairs); the paper and the bar say it too for a few days (`shops/streetNews`).
 */
export class WorksOpened extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  private done = false;

  constructor(private readonly options: { occupied: () => boolean; notices: Pick<NoticeActions, 'slip'> }) {
    super();
    this.name = 'WorksOpened';
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(): void {
    if (this.done || !this.options.occupied()) return;
    this.done = true;
    if (!frontWorksMoved() || streetMarked('worksOpen')) return;
    markStreet('worksOpen');
    this.options.notices.slip({ title: 'The works have moved on', detail: 'Front Street is open past the butcher’s now, new shops all the way down to Mill Lane.' });
  }
}
