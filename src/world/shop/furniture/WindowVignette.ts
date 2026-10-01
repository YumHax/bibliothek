import * as THREE from 'three';
import { Prop } from '../../props/Prop';
import { displayPiece } from '../displayPieces';
import { ArmchairThrow } from './dressing';

export interface WindowVignetteOptions {
  /** The throw over the armchair's arm. Default bottle green. */
  throw?: number;
}

/**
 * SECOND HOME's window, dressed as the street sees it (docs/shops.md "The window"): an armchair turned a little to
 * the glass with a throw over its arm, the side table beside it with its mug and magazines, and the
 * floor lamp behind, lit (its glow worked by `ShowroomLamps` with the shop's switch). The flat's own pieces
 * (`displayPiece`, lights taken out), not for sale here: the ones on the floor are. Stands on the window's display bed
 * (`on: 'windowDisplay'`): origin at the middle of its top, x along the glass, +z into the shop, the chair facing
 * the street (-z). Decoration: never collides (the display bed does).
 */
export class WindowVignette extends Prop {
  constructor(options: WindowVignetteOptions = {}) {
    super();
    this.name = 'WindowVignette';
    const chair = displayPiece('armchair');
    const table = displayPiece('sideTable');
    const lamp = displayPiece('floorLamp');
    // Facing the street, turned a little towards the passer-by coming from the door's side.
    const seat = new THREE.Group();
    // Kept within the display bed's 0.8 depth, turned as it is.
    seat.position.set(-0.2, 0, -0.02);
    seat.rotation.y = Math.PI - 0.25;
    if (chair) seat.add(chair);
    seat.add(new ArmchairThrow({ side: -1, color: options.throw ?? 0x3f5a4a }));
    this.add(seat);
    if (table) {
      table.position.set(0.56, 0, -0.05);
      this.add(table);
    }
    if (lamp) {
      lamp.position.set(-0.88, 0, 0.12);
      this.add(lamp);
    }
  }
}
