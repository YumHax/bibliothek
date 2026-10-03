import { STORY, type FacadeWindow, type WindowClaim, type WindowLife, type WindowStory } from '@/world/street/windowLife';
import { wakefulnessAt } from '@/time/wakefulness';
import { REAR_WINDOWS_PLAN as plan, type StoryWindow } from './rearWindowsPlan';
import { isHomeAt, movedAway, residentAt } from './residentsHome';

/*
 * The building's windows at night (`REAR_WINDOWS_PLAN`), handed to a facade painter as its `windowLife`: our
 * building's lit windows follow the residents (a window is lit while its resident is in and up: their day from
 * `STAIRWELL_PLAN.residents`), the stairwell's on our back light on its timer as people go up and down, and the
 * windows across the courtyard each have a life of their own that goes on from one game day to the next: a couple's
 * dinners, a painter's canvas filling up, the squats, a party night, a tenancy ending in boxes and the next one moving
 * in, a cat on the sill, a night owl at a monitor, and the trader's shelves (the street's collector, who lives across
 * the yard) filling up as the days go by. Pure: what a window shows is the clock's.
 */

/** What the windows read the time from: the game day (`Today.gameDay`) and the game hour. */
export interface BuildingClock {
  day(): number;
  hours(): number;
}

/** The windows' claims, for `BuildingsOptions.windowLife`. */
export function buildingWindowLife(clock: BuildingClock): WindowLife {
  return { claim: (windows) => claimWindows(windows, clock) };
}

/** What the trader's window reads of him (`economy/rivalCollector`'s `view()`, read only): the copies he got first. */
let rivalTook: () => number = () => 0;

/** The rival collector's record, for his window across the courtyard (wired once, by the stairwell's builder). */
export function followRival(took: () => number): void {
  rivalTook = took;
}

/**
 * How full the trader's shelves across the courtyard are on game day `day` (0..1): filling with the days, and a shelf
 * more for every few copies he got before the player (`plan.trader.perTaken`), so his window tells the same story.
 */
export function traderShelves(day: number): number {
  const { start, fillDays, perTaken } = plan.trader;
  const days = start + (1 - start) * (1 - Math.exp(-Math.max(0, day) / fillDays));
  return Math.min(1, days + perTaken * rivalTook());
}

function claimWindows(windows: readonly FacadeWindow[], clock: BuildingClock): (WindowClaim | null)[] {
  const claims: (WindowClaim | null)[] = windows.map(() => null);
  windows.forEach((w, j) => {
    if (w.floor < 1 || !plan.ours.includes(w.facade.id)) return;
    const mid = (w.along[0] + w.along[1]) / 2;
    const stretch = plan.residents.find((s) => s.facade === w.facade.id && mid >= s.along[0] && mid < s.along[1] && s.floors.includes(w.floor));
    if (stretch) {
      const k = 5 - w.floor;
      const resident = residentAt(k, stretch.i);
      if (resident) claims[j] = { lit: () => !movedAway(k, stretch.i) && inAndUp(resident, k * 2 + stretch.i, clock.hours()) };
      return;
    }
    const { stairwell } = plan;
    if (w.facade.id === stairwell.facade && mid >= stairwell.along[0] && mid < stairwell.along[1]) claims[j] = { lit: () => stairsLit(w.floor, clock.hours()) };
  });
  // Each story goes to the free window of its facade and floor nearest the spot it names.
  for (const spot of plan.stories) {
    let best = -1;
    let bestGap = Infinity;
    windows.forEach((w, j) => {
      if (claims[j] || w.facade.id !== spot.facade || w.floor !== spot.floor) return;
      const length = Math.hypot(w.facade.to[0] - w.facade.from[0], w.facade.to[1] - w.facade.from[1]);
      const gap = Math.abs((w.along[0] + w.along[1]) / 2 / length - spot.at);
      if (gap < bestGap) {
        bestGap = gap;
        best = j;
      }
    });
    if (best < 0) continue;
    claims[best] = { lit: () => storyNow(spot, clock.day(), clock.hours()).lit, story: () => storyNow(spot, clock.day(), clock.hours()) };
  }
  return claims;
}

/** Whether `h` (game hours) is in [from, to), the span wrapping past midnight when `to` < `from`. */
function within(h: number, from: number, to: number): boolean {
  return from <= to ? h >= from && h < to : h >= from || h < to;
}

/** A steady 0..1 draw for `n`. */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** A resident's window: lit while they are in, from getting up to their bedtime (each their own, by `seed`). */
function inAndUp(resident: { out: number; back: number }, seed: number, h: number): boolean {
  if (!isHomeAt(resident, h)) return false;
  const [early, late] = plan.bedtime;
  const bed = (early + (late + 24 - early) * hash01(seed)) % 24;
  return !within(h, bed, plan.wakeUp);
}

/** The stairwell's window on floor `floor`: lit for a timer's while now and then, more often while the building is up. */
function stairsLit(floor: number, h: number): boolean {
  const { slot, chance } = plan.stairTimer;
  return hash01(Math.floor(h / slot) * 13 + floor * 7) < chance * wakefulnessAt(h);
}

/** What a story window shows now: whether it is lit, and the story (`STORY` kind, -1 just a lit room) and its parameter. */
export function storyNow(spot: StoryWindow, day: number, h: number): WindowStory & { lit: boolean } {
  const show = (lit: boolean, kind: number, param = 0) => ({ lit, kind, param });
  switch (spot.life) {
    case 'trader':
      return show(within(h, 18, 0.75) || within(h, 7, 8.5), STORY.shelves, traderShelves(day));
    case 'couple':
      return show(within(h, 18, 23.5), within(h, 19, 21) ? STORY.dinner : STORY.reader);
    case 'painter': {
      const n = plan.painterCanvas;
      return show(within(h, 17, 1), STORY.painter, ((day % n) + h / 24) / n);
    }
    case 'sporty':
      return show(within(h, 18, 23) || within(h, 6.5, 8), within(h, 18.5, 19.3) || within(h, 7, 7.6) ? STORY.workout : -1);
    case 'partyFlat':
      return day % plan.partyEvery === plan.partyEvery - 1 ? show(within(h, 20, 2.5), STORY.party) : show(within(h, 18, 22.5), -1);
    case 'movers': {
      const { cycle, moving, empty } = plan.movers;
      const c = day % cycle;
      // Gone: the flat stands empty and dark. Packing up (and, the first day of a tenancy, unpacking): the boxes.
      if (c >= cycle - empty) return show(false, -1);
      if (c >= cycle - empty - moving || c === 0) return show(within(h, 8, 23), STORY.removal, c === 0 ? 1 : 0);
      // Every other tenant has a cat; the others read.
      return show(within(h, 17, 23.5), Math.floor(day / cycle) % 2 === 0 ? STORY.cat : STORY.reader);
    }
    case 'catLady':
      return show(within(h, 16, 23.5), STORY.cat);
    case 'nightOwl':
      return show(within(h, 20, 3.5), STORY.gamer);
  }
}
