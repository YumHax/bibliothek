import type { TalkExtra } from '@/social/talk';
import type { SessionActions } from '@/game/SessionActions';
import type { GrandmaRituals } from '@/grandma/GrandmaRituals';
import { recipeOf } from '@/grandma/recipes';
import { pick, random } from '@/random';
import type { MemeArrival, MemeFeature, MemeFeatureLive, MemeScene } from '../memeScene';
import { SundayTable } from '../SundayTable';
import { LongcaseClock } from '../LongcaseClock';
import { LunchAtHers } from './lunchAtHers';
import { FavoursAtHers } from './favoursAtHers';
import { OccasionsAtHers } from './occasionsAtHers';

/** Seconds after her hello before her own news of the day (an occasion, lunch, a favour). */
const AFTER_HELLO = 0.6;

/**
 * MÉMÉ'S WAYS AT HERS (docs/grandma.md "Sunday lunch, recipes and favours"): the occasion of the day first (her tree,
 * her birthday, All Saints), then lunch on a lunch day in her hours, else (or once lunch is cleared) her favour; and
 * the portion of one of her recipes cooked at home, given in the conversation.
 */
export const ritualsAtHers: MemeFeature = {
  id: 'rituals',
  start(scene) {
    const rituals = scene.ctx.grandmaRituals;
    return rituals ? new Rituals(scene, rituals) : {};
  },
};

class Rituals implements MemeFeatureLive {
  private readonly lunch: LunchAtHers;
  private readonly favours: FavoursAtHers;
  private readonly occasions: OccasionsAtHers;

  constructor(
    private readonly scene: MemeScene,
    private readonly rituals: GrandmaRituals,
  ) {
    let table: SundayTable | null = null;
    let clock: LongcaseClock | null = null;
    scene.zone.forEachPlaced((item) => {
      if (item instanceof SundayTable) table = item;
      else if (item instanceof LongcaseClock) clock = item;
    });
    this.occasions = new OccasionsAtHers(scene, rituals, table);
    this.favours = new FavoursAtHers(scene, rituals, clock);
    this.lunch = new LunchAtHers(scene, rituals, table, () => this.favours.offer());
    scene.visits.holdEnvelope(() => this.lunch.holdsEnvelope());
    scene.zone.onUnload(
      scene.visits.subscribe((event) => {
        if (event.kind === 'gift') this.occasions.given();
      }),
    );
  }

  arrived(arrival: MemeArrival): void {
    let at = arrival.helloEnds + AFTER_HELLO;
    at += this.occasions.arrived(at);
    if (!this.lunch.arrived(at)) this.favours.arrived(at);
  }

  left(): void {
    this.lunch.left();
  }

  update(dt: number): void {
    this.lunch.update(dt);
  }

  extras(session: SessionActions): TalkExtra[] {
    return [...this.lunch.extras(session), ...this.favours.extras(), ...this.occasions.extras(), ...this.portion()];
  }

  /** A portion of her recipe cooked at home, in the bag: given, her verdict. */
  private portion(): TalkExtra[] {
    const id = this.rituals.portion;
    if (!id) return [];
    const recipe = recipeOf(id);
    return [
      {
        id: 'memePortion',
        group: 'give',
        label: `Give her ${recipe.portion}`,
        run: () => {
          if (!this.rituals.givePortion()) return undefined;
          this.scene.meme.gesture('clap');
          this.scene.meme.feel({ smile: 1, browsUp: 0.5 }, 2.5);
          this.occasions.given();
          return { line: pick(random, recipe.given) };
        },
      },
    ];
  }
}
