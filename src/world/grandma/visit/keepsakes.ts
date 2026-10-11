import type { TalkExtra } from '@/social/talk';
import type { Keepsakes } from '@/grandma/Keepsakes';
import { ALL_LOTS_HOME, LOT_ENTRY, LOT_TOLD, keepsakeLine, keepsakeOf, type KeepsakeId } from '@/grandma/keepsakeLines';
import { FELIX_LOTS, lotsHome } from '@/economy/felixLots';
import type { MemeArrival, MemeFeature, MemeFeatureLive, MemeScene } from '../memeScene';

const OWNER = 'keepsakes';
/** Seconds back in the room after a memory before she gets its keepsake out (her `after` line first). */
const AFTER_FILM = 6;
/**
 * After the films that shake her (`memoryStage.backInTheRoom`'s hard and soft beats: a silence, then her line a
 * sentence at a time), a longer wait so the keepsake does not talk over her.
 */
const AFTER_SHAKEN: Readonly<Record<string, number>> = { row: 16, sale: 16, keys: 18, leaving: 11 };
/** Seconds after her hello before she gives one still owed (a memory seen before keepsakes were given, the stickers). */
const AFTER_HELLO = 5;
/** Seconds after the last lot is told before the stickers. */
const AFTER_LAST_LOT = 4;
/** Seconds before trying again when someone else has her. */
const RETRY = 3;

/**
 * WHAT THE MEMORIES LEAVE BEHIND, AT HERS (docs/grandma.md "What the memories leave behind"): a memory seen for the first
 * time, she gets out the thing it was about and gives it to the player (`Keepsakes`: it is at home at once, on Félix's
 * shelf); one owed from before is given on the next way in. Once the catalogue is given, "Lot 74 is home!" tells her of
 * each of his copies come home, her line for it; the last told, his roll of stickers.
 */
export const keepsakesAtHers: MemeFeature = {
  id: OWNER,
  start(scene) {
    const keepsakes = scene.ctx.keepsakes;
    return keepsakes ? new KeepsakesAtHers(scene, keepsakes) : {};
  },
};

class KeepsakesAtHers implements MemeFeatureLive {
  /** Seconds left before she hands what is owed; negative: nothing pending. */
  private wait = -1;

  constructor(
    private readonly scene: MemeScene,
    private readonly keepsakes: Keepsakes,
  ) {
    scene.zone.onUnload(
      scene.visits.subscribe((event) => {
        if (event.kind === 'memory' && keepsakeOf(event.id)) this.wait = AFTER_SHAKEN[event.id] ?? AFTER_FILM;
      }),
    );
  }

  arrived(arrival: MemeArrival): void {
    if (!arrival.first && this.owed()) this.wait = arrival.helloEnds + AFTER_HELLO;
  }

  update(dt: number): void {
    const { scene } = this;
    if (this.wait < 0 || scene.ctx.memories?.filming || !scene.playerIn) return;
    this.wait = Math.max(0, this.wait - dt);
    if (this.wait > 0 || scene.busyWith || scene.talking) return;
    this.wait = -1;
    const id = this.owed();
    if (id) this.hand(id);
  }

  extras(): TalkExtra[] {
    const { scene, keepsakes } = this;
    if (!keepsakes.has('catalogue')) return [];
    const lot = keepsakes.untold(lotsHome(scene.ctx.collection.games.games));
    if (lot === null) return [];
    return [
      {
        id: 'meme:lotHome',
        group: 'talk',
        label: LOT_ENTRY.replace('{lot}', String(lot)),
        tag: 'news',
        run: () => {
          keepsakes.tell(lot);
          scene.meme.gesture('clap');
          scene.meme.feel({ smile: 1, browsUp: 0.6 }, 3);
          if (keepsakes.allTold && !keepsakes.has('stickers')) this.wait = AFTER_LAST_LOT;
          return { line: FELIX_LOTS.find((l) => l.lot === lot)?.told ?? LOT_TOLD.replace('{lot}', String(lot)) };
        },
      },
    ];
  }

  /** What she owes the player now: the stickers once every lot is told, else the first keepsake of a memory seen. */
  private owed(): KeepsakeId | null {
    const { keepsakes, scene } = this;
    if (keepsakes.allTold && !keepsakes.has('stickers')) return 'stickers';
    return keepsakes.owed(scene.visits.seen.map((memory) => memory.id));
  }

  /** She says her piece over it, then it is the player's (at home at once), with a banner. */
  private hand(id: KeepsakeId): void {
    const { scene } = this;
    if (!scene.claim(OWNER)) {
      this.wait = RETRY;
      return;
    }
    const line = keepsakeLine(id);
    const { meme } = scene;
    meme.gesture('adjustGlasses');
    meme.feel({ smile: 0.6, browsUp: 0.3 }, 6);
    scene.say(id === 'stickers' ? [...ALL_LOTS_HOME, ...line.give] : line.give, () => {
      this.keepsakes.give(id);
      scene.ctx.notices.reward({ title: line.name, detail: line.detail });
      meme.gesture('nudge');
      scene.release(OWNER);
    });
  }
}
