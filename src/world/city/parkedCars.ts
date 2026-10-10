import { dailyRandom } from '@/time/daily';
import { STREET_PLAN, type Vec2 } from '../street/streetPlan';

/*
 * The cars parked along the kerbs (`STREET_PLAN.parked`) as they look: which shape each is and its
 * paint, drawn for the day, so the walkable street (`street/StreetCars`) and the window view
 * (`props/outdoors/Street`) show the same car in the same bay.
 */

export type ParkedShape = 'hatch' | 'city' | 'saloon' | 'estate' | 'van';

/** Car paints and the vans' (mostly white), as 0xRRGGBB. */
export const CAR_PAINTS = [0xb8322a, 0x2a4f8a, 0xe8e6e0, 0x2a2c30, 0x8a9096, 0x3f6b4f, 0xd9b44a, 0x6a2a4a, 0x9aa8b4, 0x1f3040];
export const VAN_PAINTS = [0xe8e6e0, 0xe8e6e0, 0x9aa8b4, 0x2a4f8a, 0xd9b44a];

export interface ParkedCar {
  /** Its middle (zone-local) and heading (yaw 0 = nose towards +x, -π/2 = towards +z). */
  at: Vec2;
  yaw: number;
  shape: ParkedShape;
  paint: number;
}

/** Whether the stray cat perches on the roof of the car in the bay at `at` (`STREET_PLAN.strayCat`): that car never leaves. */
export function catBay(at: Vec2): boolean {
  return STREET_PLAN.strayCat.perches.some((p) => p.y > 0.5 && Math.hypot(p.at[0] - at[0], p.at[1] - at[1]) < 1.5);
}

/** On some days a bay or two stands empty (someone drove off): how many at most, and how often any is. */
const GAPS = { most: 2, oneDayIn: 0.6 };

/**
 * Today's parked cars (the real day's: `time/daily`, so the window view painted at start and the
 * street built later agree, reloads too): each bay's shape and paint drawn afresh every day, and
 * on some days a gap or two. The bays a stray cat perches on (`STREET_PLAN.strayCat`, on a roof)
 * are never empty.
 */
export const PARKED_CARS: readonly ParkedCar[] = (() => {
  const pick = dailyRandom('parked-shapes');
  const shapes = STREET_PLAN.parked.map((): ParkedShape => {
    const r = pick();
    return r < 0.3 ? 'hatch' : r < 0.45 ? 'city' : r < 0.7 ? 'saloon' : r < 0.85 ? 'estate' : 'van';
  });
  const paint = dailyRandom('parked-paints');
  const gaps = new Set<number>();
  const perched = catBay;
  const gapDraw = dailyRandom('parked-gaps');
  if (gapDraw() < GAPS.oneDayIn) {
    const count = 1 + Math.floor(gapDraw() * GAPS.most);
    for (let k = 0; k < count; k++) {
      const i = Math.floor(gapDraw() * STREET_PLAN.parked.length);
      if (!perched(STREET_PLAN.parked[i]!.at)) gaps.add(i);
    }
  }
  return STREET_PLAN.parked.flatMap(({ at, yaw }, i) => {
    // A roof the cat sits on is a car's, never a van's (he would sit inside it).
    const shape = perched(at) && shapes[i] === 'van' ? 'saloon' : shapes[i]!;
    const palette = shape === 'van' ? VAN_PAINTS : CAR_PAINTS;
    const car: ParkedCar = { at, yaw, shape, paint: palette[Math.floor(paint() * palette.length)]! };
    return gaps.has(i) ? [] : [car];
  });
})();
