import type { SessionActions } from '@/game/SessionActions';
import type { FamilyStory } from '@/family/FamilyStory';
import { inHours } from '@/time/clock';
import { markStreet, streetMarked } from '@/social/street/streetMarks';
import { UsableProp } from '../props/UsableProp';

/** The café's window, as a click target: width along the facade, height, depth out from it (m). */
const WINDOW = { width: 3.2, height: 2.0, depth: 0.4 };

/** Its owner's words through the glass, by how far the family's story has gone. */
const OWNER = {
  shut: 'LE TILLEUL is shut. The chairs are up on the tables, the coffee machine under its cover.',
  hello: [
    'The café’s owner waves through the glass. “Odette’s grandchild! She shows everyone your photo. The small one.”',
    '“Coffee? No? Tell Odette her table by the window is free on Thursdays, as always.”',
    '“Your uncle Félix had his crème here every Sunday after lunch. Two sugars, the paper, not a word.”',
  ],
  /** The sale seen in her album, not had out with Gaspard yet: what the café saw, once. */
  saw: '“Gaspard? He sat at that table by the door with a man in a camel coat, the week before the sale. Papers out. They shook hands like they’d sold a horse. I never told Odette. Maybe I should have.”',
  after: {
    apologised: '“Gaspard came in with Odette after lunch last Sunday. He paid. First time in twenty years.”',
    gone: '“Gaspard hasn’t been in since. Odette sits at her table all the same. Better company, if you ask me.”',
    silent: '“Odette was in this morning. Quiet. She said you’d understand. I said I didn’t, but I brought her a madeleine.”',
  },
} as const;

/** Its hours (game hours). */
const HOURS: [number, number] = [7, 22];

/**
 * LE TILLEUL, the café across the avenue from Mémé's (docs/grandma.md "Around her flat"): its window clicked, the
 * owner's word through the glass; once the sale is seen in her album, what the café saw the week before it (Gaspard
 * and Crane shaking hands at the table by the door), said once; after the reckoning, how it went. Zone-local at the
 * window's middle on the pavement, +z out from the facade.
 */
export class TilleulWindow extends UsableProp {
  private turn = 0;

  constructor({ family, hour }: { family: FamilyStory | null; hour: () => number }) {
    super({
      label: () => (inHours(hour(), HOURS) ? 'LE TILLEUL · look in' : 'LE TILLEUL · shut'),
      use: (session: SessionActions) => {
        if (!inHours(hour(), HOURS)) return void session.react(OWNER.shut);
        if (family?.reckoning && !streetMarked('tilleulTold')) {
          markStreet('tilleulTold');
          return void session.react(OWNER.saw);
        }
        // "He paid" is his return Sunday's, not the apology's: said once he has been back.
        const end = family?.gaspardEnd === 'apologised' && family.returning ? null : (family?.gaspardEnd ?? null);
        if (end && this.turn % 2 === 1) {
          this.turn++;
          return void session.react(OWNER.after[end]);
        }
        session.react(OWNER.hello[this.turn++ % OWNER.hello.length]!);
      },
    });
    this.name = 'TilleulWindow';
    this.target(WINDOW.width, WINDOW.height, WINDOW.depth, { y: WINDOW.height / 2 + 0.2, z: WINDOW.depth / 2 });
  }
}
