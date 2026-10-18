import type { Updatable } from '@/core/Engine';
import type { SessionActions } from '@/game/SessionActions';
import type { FamilyStory } from '@/family/FamilyStory';
import type { MemoryProjector } from '@/memories/MemoryFilm';
import { closingReel, type ClosingFacts } from './closingReel';

/** Seconds between two looks for a quiet moment, and how many quiet looks in a row before the film starts. */
const LOOK_EVERY = 3;
const QUIET_LOOKS = 2;

interface ClosingDeps {
  memories: MemoryProjector;
  /** The Session (opens the film as a panel), once made; whether a panel is up now. */
  session(): (SessionActions & { readonly modalOpen: boolean }) | null;
  family: FamilyStory;
  /** How things went, read when it starts. */
  facts(): Omit<ClosingFacts, 'gaspardSorry' | 'gameBoy'>;
  /** The player is in the flat, and nobody is round (Mémé gone home on her 38). */
  quiet(): boolean;
}

/**
 * THE END PLAYED ONCE (docs/story.md "The end"): from the moment Mémé's photo is in her album, the first quiet moment
 * at home (nobody round, no panel up, a few seconds of it) plays the closing reel; played through or skipped, the story
 * is told for good and the journal says so. A save closed in between plays it on the next quiet moment. An
 * `Updatable` for the engine (its looks on the frame's clock).
 */
export function watchForTheEnd(deps: ClosingDeps): Updatable {
  let quiet = 0;
  let playing = false;
  let since = 0;
  const look = (): void => {
    const { family, memories } = deps;
    const session = deps.session();
    if (playing || !family.endingDue || !session || session.modalOpen || memories.filming || !deps.quiet()) {
      quiet = 0;
      return;
    }
    if (++quiet < QUIET_LOOKS) return;
    playing = true;
    const film = memories.film(
      closingReel({ ...deps.facts(), gaspardSorry: family.gaspardEnd === 'apologised', gameBoy: family.gameBoy === 'given' }),
      () => {
        family.storyEnded();
        family.note('The end of Félix’s story: the flat is yours now', 'headline');
      },
    );
    film.addOpenListener?.((open) => {
      if (open) return;
      playing = false;
      // Skipped before the end: told all the same (it never plays again).
      if (family.endingDue) {
        family.storyEnded();
        family.note('The end of Félix’s story: the flat is yours now', 'headline');
      }
    });
    session.openPanel(film);
  };
  return {
    update(dt: number): void {
      since += dt;
      if (since < LOOK_EVERY) return;
      since = 0;
      look();
    },
  };
}
