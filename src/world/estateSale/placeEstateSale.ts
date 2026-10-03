import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { BuildContext } from '../buildContext';
import { pinEstateNotes } from '@/building/estateSale';
import { STAIRWELL_PLAN } from '../stairwell/stairwellPlan';
import { EstateSale } from './EstateSale';

/**
 * Puts the estate sale into the stairwell's entrance hall (`STAIRWELL_PLAN.estateSale`): it lays itself out on its
 * days and hours and clears itself away after (`EstateSale`), and its notices go on the hall's board.
 */
export function placeEstateSale(zone: Zone, { covers, money, collection, market, listener, today, sky }: Pick<BuildContext, 'covers' | 'money' | 'collection' | 'market' | 'listener' | 'today' | 'sky'>): void {
  zone.place(
    new EstateSale({
      host: zone,
      spots: STAIRWELL_PLAN.estateSale,
      covers,
      wallet: money.wallet,
      isWanted: (id) => collection.isWanted(id),
      owns: (id) => collection.owns(id),
      pool: market.stock,
      viewer: listener,
      day: () => today.gameDay,
      hours: () => sky.dayNight.state.hours,
    }),
    new THREE.Vector3(),
  );
  zone.onUnload(pinEstateNotes());
}
