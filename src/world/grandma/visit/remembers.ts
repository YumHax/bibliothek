import { isMet } from '@/social/standing';
import { PRESENCE_TALK } from '@/grandma/presenceLines';
import { random, shuffled } from '@/random';
import type { MemeFeature, MemeScene } from '../memeScene';

/** Seconds after her hello before she asks after something. */
const ASK_AFTER = 1.5;
/** Days between two askings of a topic. */
const EVERY = { cat: 6, noCat: 12, neighbour: 8, noNeighbour: 10, shown: 9, scarf: 10 };
/** The building's residents she may have heard of, by their social ids (`social/people/building`). */
const NEIGHBOURS = Object.keys(PRESENCE_TALK.remember.neighbour);

const pick = <T>(list: readonly T[]): T | undefined => list[Math.floor(random() * list.length)];

/**
 * SHE REMEMBERS (docs/grandma.md "Her presence"): once her hello is out, she asks after one thing true in the save,
 * now and then each: a Sunday missed since the last visit, the scarf she knitted (worn or not), the cat (its name) or
 * the want of one, the game she was last shown, a neighbour the player has met (or none yet). She keeps the game
 * shown her (`GrandmaPresence.setShown`).
 */
export const remembers: MemeFeature = {
  id: 'remembers',
  start(scene) {
    const presence = scene.ctx.grandmaPresence;
    if (!presence) return {};
    const stop = scene.visits.subscribe((event) => {
      if (event.kind !== 'gift' || event.gift !== 'game') return;
      const title = scene.visits.latestTitle();
      if (title) presence.setShown(title);
    });
    scene.zone.onUnload(stop);
    return {
      arrived(arrival) {
        const { missedSunday } = presence.arrive(scene.day());
        if (arrival.first) return;
        const line = missedSunday ? pick(PRESENCE_TALK.remember.missedSunday) : asked(scene);
        if (line) scene.zone.after(arrival.helloEnds + ASK_AFTER, () => scene.say([line]));
      },
    };
  },
};

/** The one thing she asks after this visit, if any is due (each now and then). */
function asked(scene: MemeScene): string | null {
  const presence = scene.ctx.grandmaPresence!;
  const day = scene.day();
  const r = PRESENCE_TALK.remember;
  const household = scene.ctx.home.household;
  // The scarf she knitted: on, or left at home.
  if (scene.visits.scarfKnitted(false)) {
    const worn = household?.life.household.outfit === 'memeScarf';
    if (presence.ask('scarf', day, EVERY.scarf)) return worn ? r.scarf : r.noScarf;
  }
  const cat = scene.ctx.home.upgrades?.has('cat') ? (household?.catName() ?? null) : null;
  const shown = presence.shown;
  const met = NEIGHBOURS.filter((id) => isMet(id));
  // The rest in a shuffled order, the first due one said.
  const asks: (() => string | null)[] = [
    () => (cat ? (presence.ask('cat', day, EVERY.cat) ? (pick(r.cat)?.replace('{cat}', cat) ?? null) : null) : scene.visits.facts().visits >= 3 && presence.ask('noCat', day, EVERY.noCat) ? r.noCat : null),
    () => (shown && presence.ask('shown', day, EVERY.shown) ? (pick(r.shown)?.replace('{title}', shown) ?? null) : null),
    () => {
      if (!met.length) return presence.ask('noNeighbour', day, EVERY.noNeighbour) ? r.noNeighbour : null;
      const who = pick(met);
      return who && presence.ask('neighbour', day, EVERY.neighbour) ? (r.neighbour[who] ?? null) : null;
    },
  ];
  for (const ask of shuffled(random, asks)) {
    const line = ask();
    if (line) return line;
  }
  return null;
}
