import * as THREE from 'three';
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

/** Seconds after a present on her birthday before she says what it is to her. */
const PRESENT_AFTER = 3.5;

/**
 * HER OCCASIONS AT HERS (docs/grandma.md "Sunday lunch, recipes and favours"): through the season her tree in the
 * corner (out of the picture while a memory plays), the chrysanthemums on her table round All Saints, her birthday's
 * cake with its candles; on the way in, the day's words once (`GrandmaRituals.keep`), and on her birthday what a present
 * means to her.
 */
export class OccasionsAtHers {
  private presentSaid = -1;

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
    if (!occasion || !this.rituals.keep(occasion, this.key(occasion))) return 0;
    const words = OCCASION_LINES;
    const lines: string[] = occasion === 'birthday' ? [words.birthday.hello, words.birthday.candles] : occasion === 'allSaints' ? [words.allSaints.hello, words.allSaints.chat] : [words.christmas.hello];
    this.scene.zone.after(at, () => {
      this.scene.meme.feel({ smile: 1, browsUp: 0.6 }, 3);
      this.scene.say(lines);
    });
    return lines.length * 3.4;
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
