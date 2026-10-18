import type { MemoryLine, MemoryReel } from '@/memories/memoryReel';
import { CLOSING_PLAN as PLAN } from './closingReelPlan';
import { stageFelixFlat } from './felixFlat';

/** How the story went, for the credits' dedications. */
export interface ClosingFacts {
  /** Gaspard said sorry at her table. */
  gaspardSorry: boolean;
  /** MOONPOST ran to its credits on the TV. */
  prototype: boolean;
  /** The Christmas Game Boy put back in her hands. */
  gameBoy: boolean;
}

/** The reel's id: not one of `MEMORIES` (it is not in her album), its still kept apart. */
const CLOSING_ID = 'closing';

/**
 * THE END OF THE STORY (docs/story.md "The end"): once Mémé's photo is on her album's last page and she has gone home,
 * a last film in the collection room, played like her memories (`MemoryFilm`): the flat as the player has made it,
 * the dream of it as Félix had it (the opening's `DreamFlat`), the flat again under the credits, dedicated by how
 * things went. Then the room as it is, and the game goes on: the shelves never end.
 */
export function closingReel(facts: ClosingFacts): MemoryReel {
  const credits = [
    'For Félix Aubry, who kept everything.',
    'For Odette, who kept the album.',
    ...(facts.gameBoy ? ['And the Game Boy, back by her bed.'] : []),
    ...(facts.prototype ? ['For Hana B., who kept the music.'] : []),
    ...(facts.gaspardSorry ? ['For Gaspard, who said sorry in the end.'] : []),
    'Bibliothek. The shelves go on.',
  ];
  const lines: MemoryLine[] = [
    ...PLAN.lines,
    ...credits.map((text, i) => ({ at: PLAN.creditsAt + i * PLAN.creditGap, seconds: PLAN.creditSeconds, text })),
  ];
  let today: { hold(): void; release(): void } | null = null;
  return {
    id: CLOSING_ID,
    title: 'Félix’s flat',
    tagline: 'The end. The shelves go on.',
    back: 'Carry on',
    lines,
    score: 'waltz',
    scenes: [
      { zone: 'living', shots: PLAN.shots.now, light: { curtains: 'open', lamps: 'on' }, stage: () => {} },
      {
        zone: 'living',
        shots: PLAN.shots.dream,
        light: { curtains: 'open', lamps: 'on' },
        stage: (set) => {
          today = stageFelixFlat(set);
        },
        beat: () => today?.hold(),
        strike: () => {
          today?.release();
          today = null;
        },
      },
      { zone: 'living', shots: PLAN.shots.again, light: { lamps: 'on' }, stage: () => {} },
    ],
    after: { zone: 'living', at: PLAN.after.at, yaw: PLAN.after.yaw },
  };
}
