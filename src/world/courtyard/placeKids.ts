import * as THREE from 'three';
import { KIDS, type KidId } from '@/building/kids/kidsPlan';
import { kidsOut } from '@/building/kids/yardKids';
import { seasonOf } from '@/time/season';
import type { BuildContext } from '../buildContext';
import type { Zone } from '../zone/Zone';
import type { Vec2 } from '../street/streetPlan';
import { COURTYARD_PLAN as plan } from './courtyardPlan';
import { YardKids, type KidSpot } from './YardKids';

/**
 * The building's kids in the courtyard (`YardKids`, docs/building.md "The kids in the yard"): their spots from the
 * plan (`COURTYARD_PLAN.kids`), who is down read from the game day, the hour and the sky (`yardKids.kidsOut`), their
 * pencil cases drawn from the market's index, the panels they open. `at` turns a street-frame spot zone-local.
 */
export function placeKids(zone: Zone, ctx: Pick<BuildContext, 'sky' | 'listener' | 'today' | 'panels' | 'market' | 'notices' | 'social'>, at: (p: Vec2, y?: number) => THREE.Vector3): YardKids {
  const { sky, today, market } = ctx;
  const spots = Object.fromEntries(
    KIDS.map((kid) => {
      const spot = plan.kids[kid.id];
      const placed: KidSpot = { at: at(spot.at), yaw: spot.yaw, seat: spot.seat, ...('lean' in spot ? { lean: spot.lean } : {}) };
      return [kid.id, placed];
    }),
  ) as Record<KidId, KidSpot>;
  return zone.place(
    new YardKids({
      host: zone,
      viewer: ctx.listener,
      spots,
      out: () => kidsOut(today.gameDay, sky.dayNight.state.hours, sky.dayNight.state, today.realDate()),
      day: () => today.gameDay,
      date: () => today.realDate(),
      season: () => seasonOf(today.realDate()).name,
      carts: (seed, count, platforms) => market.stock.randomGames(seed, count, platforms),
      ...(ctx.panels.kids ? { panels: ctx.panels.kids } : {}),
      notices: ctx.notices,
      ...(ctx.social ? { social: ctx.social } : {}),
    }),
    new THREE.Vector3(),
  );
}
