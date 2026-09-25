import type { ModalLike } from '@/game/SessionParts';
import type { MailPost } from '@/collection/MailPost';
import type { NeighbourTrades, Resident, TradeOffer } from '@/economy/NeighbourTrades';
import type { Doorstep } from '../hallway/Doorstep';
import { STAIRWELL_PLAN, STOREYS } from './stairwellPlan';

/** The neighbour's swap panel as a door opens it: shown the offer, then opened by the Session. */
export interface TradePanelLike extends ModalLike {
  prepare(offer: TradeOffer): void;
}

/**
 * The building's life the hallway and the stairwell share: the doorstep (who is at the door, the
 * notes under it), the post (mail orders on their way), the neighbours' swaps and the panel their
 * doors open. Built once at boot (`bootstrap/services.ts`), handed to the builders as `BuildContext.building`; every
 * part is optional but the doorstep, and the flat and the stairs work as before without it.
 */
export interface BuildingServices {
  doorstep: Doorstep;
  post?: MailPost;
  trades?: NeighbourTrades;
  tradePanel?: TradePanelLike;
}

/** The key of the neighbour's door `i` on landing `k` (`NeighbourTrades` and the doors agree on it). */
export function doorKey(k: number, i: number): string {
  return `${k}:${i}`;
}

/** Everyone behind a door on the stairs (not the flat, not the cellars), for the swaps. */
export function stairwellResidents(): Resident[] {
  const residents: Resident[] = [];
  for (let k = 0; k < STOREYS; k++) {
    const names = k === 0 ? [STAIRWELL_PLAN.ourNeighbour] : STAIRWELL_PLAN.neighbours[k - 1]!;
    names.forEach((who, i) => residents.push({ door: doorKey(k, i), who, floor: STAIRWELL_PLAN.floorNames[k]! }));
  }
  return residents;
}
