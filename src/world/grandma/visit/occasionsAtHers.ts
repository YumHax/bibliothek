import * as THREE from 'three';
import type { TalkExtra } from '@/social/talk';
import { pick, random } from '@/random';
import { nudge } from '@/social/standing';
import type { GrandmaRituals } from '@/grandma/GrandmaRituals';
import { OCCASION_LINES, chrysanthemumDays, occasionOf, treeSeason, type Occasion } from '@/grandma/occasions';
import { isBirthday } from '@/social/mood';
import { MEME_ID } from '@/social/people/family';
import { ChristmasTree } from '../../props/ChristmasTree';
import { placeWith } from '../../zone/attach';
import type { MemeScene } from '../memeScene';
import type { SundayTable } from '../SundayTable';
import { Chrysanthemums } from '../Chrysanthemums';
import { RITUALS_PLAN } from '../ritualsPlan';
import { GRANDMA_FLAT_PLAN } from '../grandmaFlatPlan';
import { Hotspot } from './Hotspot';

/** Seconds after a present on her birthday before she says what it is to her. */
const PRESENT_AFTER = 3.5;
/** The trip to the cemetery with her on All Saints: game minutes it takes (the 38 there and back), the fade (ms). */
const CEMETERY = { minutes: 100, outMs: 1100, darkMs: 2800, inMs: 1100 };
/** The click over her cake while its candles burn: a box round it (m). */
const CANDLES_SPOT: readonly [number, number, number] = [0.32, 0.25, 0.32];

/**
 * HER OCCASIONS AT HERS (docs/grandma.md "Sunday lunch, recipes and favours"): through the season her tree in the
 * corner (out of the picture while a memory plays), the chrysanthemums on her table round All Saints, her birthday's
 * cake with its candles; on the way in, the day's words once (`GrandmaRituals.keep`), and on her birthday what a present
 * means to her.
 */
export class OccasionsAtHers {
  private presentSaid = -1;
  /** Over her birthday cake while the candles burn ("Help me with the candles"). */
  private candles: Hotspot | null = null;

  constructor(
    private readonly scene: MemeScene,
    private readonly rituals: GrandmaRituals,
    private readonly table: SundayTable | null,
  ) {
    const { zone, ctx } = scene;
    const date = ctx.today.realDate();
    const kept: THREE.Object3D[] = [];
    if (treeSeason(date, rituals.forced)) {
      const { at, height, radius } = RITUALS_PLAN.tree;
      kept.push(zone.placeAt(new ChristmasTree({ height, radius, presents: 3, seed: 2026 }), at));
    }
    if (table && chrysanthemumDays(date, rituals.forced) && this.today() !== 'birthday') {
      const [x, z] = RITUALS_PLAN.chrysanthemums;
      kept.push(placeWith(zone, table, new Chrysanthemums(), new THREE.Vector3(x, 0, z)));
    }
    if (kept.length) ctx.memories?.markModern(zone, kept);
  }

  /** The day's occasion at hers, or null. */
  today(): Occasion | null {
    const { scene } = this;
    return occasionOf(scene.ctx.today.realDate(), isBirthday(MEME_ID, scene.day()), this.rituals.forced);
  }

  /** On the way in, `at` seconds on: her words for the day, the first visit of it. Returns how long they take (s). */
  arrived(at: number): number {
    const occasion = this.today();
    this.table?.setBirthday(occasion === 'birthday');
    if (occasion === 'birthday') this.spotCandles();
    if (!occasion || !this.rituals.keep(occasion, this.key(occasion))) return 0;
    const words = OCCASION_LINES;
    const lines: string[] = occasion === 'birthday' ? [words.birthday.hello, words.birthday.candles] : occasion === 'allSaints' ? [words.allSaints.hello, words.allSaints.chat] : [words.christmas.hello];
    this.scene.zone.after(at, () => {
      this.scene.meme.feel({ smile: 1, browsUp: 0.6 }, 3);
      this.scene.say(lines);
    });
    return lines.length * 3.4;
  }

  /** On All Saints, her conversation's entry to go and see Félix with her (once that year): told in a fade, the 38 there and back. */
  extras(): TalkExtra[] {
    const { scene, rituals } = this;
    if (this.today() !== 'allSaints') return [];
    const key = `cemetery:${this.key('allSaints')}`;
    if (rituals.kept(key)) return [];
    const words = OCCASION_LINES.allSaints;
    return [
      {
        id: 'memeCemetery',
        group: 'invite',
        label: words.go,
        run: () => {
          const pastimes = scene.ctx.home.household?.pastimes;
          if (!pastimes) return undefined;
          scene.zone.after(2.6, () => {
            void pastimes.run(CEMETERY, () => rituals.keep('allSaints', key)).then((ran) => {
              if (ran === null) return;
              scene.reseat();
              scene.say([pick(random, words.back)]);
              scene.ctx.family?.note(words.note, 'line');
              nudge(MEME_ID, { warmth: 6, trust: 4, why: 'you went to see Félix with her', day: scene.day(), memory: 'you came to see Félix with me', memoryWeight: 12 });
            });
          });
          return { line: words.ask, close: true };
        },
      },
    ];
  }

  /** The cake's candles, clickable while they burn: blown out, she claps and says her word. */
  private spotCandles(): void {
    const { table, scene } = this;
    if (!table || this.candles) return;
    const [x, z] = GRANDMA_FLAT_PLAN.dressing.lunch.cake;
    this.candles = new Hotspot(CANDLES_SPOT, {
      label: () => (table.candlesLit ? 'Her birthday cake · blow out the candles' : null),
      use: () => {
        if (!table.candlesLit) return;
        table.setCandles(false);
        scene.meme.gesture('clap');
        scene.meme.feel({ smile: 1, browsUp: 0.5 }, 3);
        scene.meme.speak(OCCASION_LINES.birthday.blown);
      },
    });
    placeWith(scene.zone, table, this.candles, new THREE.Vector3(x, 0, z));
  }

  /** Something given to her: on her birthday, what it means to her (once that day). */
  given(): void {
    const { scene } = this;
    const day = scene.day();
    if (this.today() !== 'birthday' || this.presentSaid === day) return;
    this.presentSaid = day;
    scene.zone.after(PRESENT_AFTER, () => {
      scene.meme.feel({ smile: 1, squint: 0.4 }, 3);
      scene.meme.speak(OCCASION_LINES.birthday.present);
    });
  }

  /** What keeps the day's words to once: the birthday by game day, the others by year (`?debug`'s by day). */
  private key(occasion: Occasion): string {
    const { scene } = this;
    if (this.rituals.forced) return `${occasion}:debug:${scene.day()}`;
    return occasion === 'birthday' ? `birthday:${scene.day()}` : `${occasion}:${scene.ctx.today.realDate().getFullYear()}`;
  }
}
