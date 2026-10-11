import type { TalkExtra } from '@/social/talk';
import { MEME_ID } from '@/social/people/family';
import { nudge } from '@/social/standing';
import type { FamilyStory } from '@/family/FamilyStory';
import { EPILOGUE_TALK } from '@/grandma/epilogueLines';
import { memeLook } from '../familyLooks';
import { GRANDMA_FLAT_PLAN as PLAN } from '../grandmaFlatPlan';
import { holdHandheld, type HeldHandheld } from '../memoryStage';
import type { MemeArrival, MemeFeature, MemeFeatureLive, MemeScene } from '../memeScene';

/** Seconds after her hello before she tells what weighs on her, and between her lines holding the Game Boy. */
const AFTER_HELLO = 1.4;
const HOLDING_GAP = 3.6;

/**
 * THE CHRISTMAS GAME BOY, AT HERS (docs/grandma.md "The end of the story"): once the sale is seen in her album, she
 * tells the player on the way in where it went (lot one, Victor Crane); once it is home (bought back from him,
 * `family/craneGameBoy`), "Give her the Game Boy": she holds it up as the child did in 1995, says her piece, and gives
 * it back for good; then she announces her visit to the flat (also once the keys are given in the album, if the Game
 * Boy never came).
 */
export const gameBoyReturn: MemeFeature = {
  id: 'gameBoy',
  start(scene) {
    const family = scene.ctx.family;
    return family ? new GameBoyReturn(scene, family) : {};
  },
};

class GameBoyReturn implements MemeFeatureLive {
  private held: HeldHandheld | null = null;

  constructor(
    private readonly scene: MemeScene,
    private readonly family: FamilyStory,
  ) {}

  arrived(arrival: MemeArrival): void {
    const { scene, family } = this;
    if (arrival.first || (!family.trailDue && !family.announceDue)) return;
    scene.zone.after(arrival.helloEnds + AFTER_HELLO, () => {
      if (!scene.playerIn || scene.busyWith || scene.ctx.memories?.filming) return;
      if (family.trailDue) {
        family.tellTrail();
        family.note(EPILOGUE_TALK.trailNote, 'line');
        scene.meme.feel({ frown: 0.5, browsUp: 0.4 }, 4);
        scene.say(EPILOGUE_TALK.trail);
      } else if (family.announceDue) this.announce();
    });
  }

  extras(): TalkExtra[] {
    const { family, scene } = this;
    return [
      {
        id: 'meme:gameBoy',
        group: 'give',
        label: EPILOGUE_TALK.give,
        disabled: () => (family.gameBoy === 'home' && !scene.busyWith ? null : 'not now'),
        run: () => {
          scene.zone.after(0.8, () => this.giveBack());
          return { close: true };
        },
      },
    ];
  }

  update(dt: number): void {
    this.held?.tick(dt);
  }

  left(): void {
    this.putDown();
  }

  /** In her hands: her lines, then given back to the player for good; then her visit announced. */
  private giveBack(): void {
    const { scene, family } = this;
    if (family.gameBoy !== 'home' || !scene.claim('gameBoy')) return;
    const { meme } = scene;
    const atTable = Math.hypot(meme.position.x - PLAN.memeDay.table.at[0], meme.position.z - PLAN.memeDay.table.at[1]) < 0.3;
    const seat = atTable ? PLAN.memeDay.table.seat : PLAN.seatHeight;
    const held = holdHandheld(meme, memeLook().height, seat);
    this.held = held;
    meme.sit(meme.rotation.y, seat, 'lap', held.screen, held.hands);
    meme.feel({ smile: 0.7, browsUp: 0.8 }, HOLDING_GAP * 3);
    EPILOGUE_TALK.holding.forEach((line, i) => scene.zone.after(i * HOLDING_GAP, () => meme.speak(line)));
    scene.zone.after(EPILOGUE_TALK.holding.length * HOLDING_GAP, () => {
      this.putDown();
      scene.reseat();
      scene.release('gameBoy');
      family.givenBack();
      family.note(EPILOGUE_TALK.givenNote, 'headline');
      nudge(MEME_ID, { warmth: 10, trust: 8, why: 'you brought the Game Boy back', day: scene.day(), memory: 'you brought me Félix’s Christmas Game Boy', memoryWeight: 25 });
      scene.zone.after(HOLDING_GAP * 0.6, () => {
        if (scene.playerIn && !scene.busyWith && family.announceDue) this.announce();
      });
    });
  }

  /** "I'm coming to see the flat. Saturday." */
  private announce(): void {
    const { scene, family } = this;
    family.planVisit(scene.day());
    scene.meme.gesture('point');
    scene.say(EPILOGUE_TALK.announce);
  }

  private putDown(): void {
    if (!this.held) return;
    this.held.show(false);
    this.held.dispose();
    this.held = null;
  }
}
