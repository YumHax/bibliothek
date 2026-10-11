import { EPILOGUE_PRINT, PRINT_ROOM } from '@/grandma/albumPrints';
import { PRINT_WORDS, SNAPSHOTS } from '@/grandma/snapshots';
import type { MemeFeature } from '../memeScene';

/** Seconds after her hello (and a hint, if she lets one slip) before she mentions the album's photos. */
const AFTER_HELLO = 4.6;
/** Seconds after her thanks for a game before the photo it brings back to her. */
const AFTER_THANKS = 3.4;
/** She asks for photos of the flat on these visits (the third, then every fifth), while she has none of the player's. */
const ASK_FROM = 3;
const ASK_EVERY = 5;

/**
 * HER ALBUM'S OTHER PHOTOS AT HERS (docs/grandma.md "The album's other photos"): the player's shots given her (the
 * photo roll, an entry of her conversation once there are some), glued in after Félix's pages; on the way in, a word
 * when a snapshot has turned up in the album, or now and then a wish for photos of the flat; a game of Félix's
 * notebook shown to her that brings a photo back to her mind.
 */
export const albumGifts: MemeFeature = {
  id: 'albumGifts',
  start(scene) {
    const { ctx, visits, meme } = scene;
    const roll = ctx.photoRoll;
    const prints = ctx.albumPrints;
    const finds = ctx.albumFinds;
    let said = 0;
    const next = <T>(lines: readonly T[]): T => lines[said++ % lines.length]!;

    // A game shown to her that rings a bell: the photo it brings back (`AlbumFinds` puts it in the album).
    scene.zone.onUnload(
      visits.subscribe((event) => {
        if (event.kind !== 'gift' || event.gift !== 'game' || !event.game) return;
        const snap = SNAPSHOTS.find((s) => s.game?.id === event.game);
        if (!snap?.game) return;
        const line = snap.game.line;
        scene.zone.after(AFTER_THANKS, () => {
          if (!scene.playerIn) return;
          meme.feel({ smile: 1, browsUp: 0.8 }, 2.5);
          scene.say([line]);
        });
      }),
    );

    return {
      extras: () =>
        roll && prints
          ? [
              {
                id: 'memePhotos',
                group: 'give',
                label: PRINT_WORDS.give,
                disabled: () => (roll.count > 0 ? null : 'No photos for her'),
                run: () => {
                  const shots = roll.takeAll();
                  if (!shots.length) return undefined;
                  const before = prints.list().filter((p) => p.id !== EPILOGUE_PRINT).length;
                  const day = scene.day();
                  shots.forEach((image, i) => prints.add({ id: `print-${day}-${Date.now().toString(36)}-${i}`, caption: next(PRINT_WORDS.captions), image, day }));
                  meme.gesture('adjustGlasses');
                  meme.feel({ smile: 1, browsUp: 0.6 }, 3);
                  const overflow = before + shots.length > PRINT_ROOM;
                  if (overflow) scene.zone.after(3.2, () => scene.say([PRINT_WORDS.full]));
                  return { line: next(PRINT_WORDS.thanks) };
                },
              },
            ]
          : [],
      arrived(arrival) {
        if (arrival.first) return;
        scene.zone.after(arrival.helloEnds + AFTER_HELLO, () => {
          if (!scene.playerIn || ctx.memories?.filming || scene.busyWith) return;
          // A memory waiting is her hello's own news; else a snapshot turned up, else a wish for photos of the flat.
          if (visits.due) return;
          if (finds?.anyFresh) scene.say([next(PRINT_WORDS.found)]);
          else {
            const n = visits.facts().visits;
            if (prints && !prints.list().length && !roll?.count && n >= ASK_FROM && (n - ASK_FROM) % ASK_EVERY === 0) scene.say([PRINT_WORDS.ask]);
          }
        });
      },
    };
  },
};
