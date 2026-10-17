import type { NoticeActions } from '@/notices';
import { capitalise } from '@/text/strings';
import { keepsakeFor, keepsakesOwned, onKeepsakes, openPersonPage, type OwnedKeepsake } from '@/social/keepsakes';
import { findPerson, shortName } from '@/social/people';
import { tier } from '@/social/standing';
import { tierName } from '@/social/tiers';
import type { Zone } from '../zone/Zone';
import { placeWith } from '../zone/attach';
import { presentWhile } from '../build/presence';
import { WALL } from '../surface/layers';
import type { Fridge } from './Fridge';
import type { Corkboard } from './Corkboard';
import { KeepsakeSlot, type SlotContent } from './KeepsakeSlot';
import { FridgeLook } from './FridgeLook';
import { KITCHEN_PLAN } from './kitchenPlan';
import { closeUp, closeUpOn } from '@/player/closeUp';

/*
 * Friends' keepsakes in the kitchen (docs/social.md "Keepsakes"): the first eight on the fridge door, under magnets,
 * swinging with it; the next twenty pinned on the corkboard once it is bought. Hovered: whose it is and how the player
 * stands with them now; clicked: their words on it, read; clicked again before looking away: their page in the People
 * book. What shows follows the keepsakes given (`social/keepsakes`) and the day (Mme Pereira's welcome waits for its
 * morning). A click target stands in front of the fridge door only while it is shut; between the keepsakes, a click
 * on the door is a close look at them all (`FridgeLook`), let go of by walking off, looking away or Esc.
 */

interface KeepsakeWiring {
  notices: Pick<NoticeActions, 'read'>;
  /** The game day now, and a way to hear it change (a keepsake dated tomorrow appears in the morning). */
  day(): number;
  onDayChange(cb: () => void): () => void;
  /** The corkboard, placed (staged until bought), and whether it is bought. */
  board?: { board: Corkboard; owned(): boolean; onOwned(cb: () => void): () => void };
}

function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

/** Puts the fridge's and the corkboard's keepsake places in `zone` and keeps what they show up to date. */
export function furnishKeepsakes(zone: Zone, fridge: Fridge, wiring: KeepsakeWiring): void {
  // The keepsake just read: clicked again before the eye leaves it, it opens its giver's page.
  let lastRead: string | null = null;
  const use = (slot: () => KeepsakeSlot) => ({
    label: () => {
      const content = slot().content;
      if (!content) return null;
      const { person } = content;
      const again = lastRead === content.key;
      return `${capitalise(possessive(shortName(person)))} ${content.def.name} · ${tierName(tier(person), person)} · ${again ? 'their page' : 'read'}`;
    },
    use: () => {
      const content = slot().content;
      if (!content) return;
      const { person } = content;
      if (lastRead === content.key) {
        lastRead = null;
        openPersonPage(person);
        return;
      }
      lastRead = content.key;
      const { def } = content;
      wiring.notices.read({
        title: `${capitalise(possessive(shortName(person)))} ${def.name}`,
        text: def.words,
        look: def.kind === 'postcard' ? 'postcard' : 'note',
        from: findPerson(person)?.name ?? shortName(person),
        ...(def.place ? { place: def.place } : {}),
      });
    },
  });

  const onLeave = (): void => {
    lastRead = null;
  };
  // The fridge door: eight places in two columns, far enough apart that no two keepsakes overlap.
  const face = fridge.face;
  const onFridge = face.slots.map((place, index) => {
    let self: KeepsakeSlot | null = null;
    self = new KeepsakeSlot(use(() => self!), { holder: face.panel, at: place.inPanel, index, fastener: 'magnet', layer: WALL.print, target: [0.15, 0.17], onLeave });
    return { slot: placeWith(zone, fridge, self, place.inFridge.clone()), shown: () => face.shut };
  });
  // The corkboard: twenty, close together, so neighbours take two layers in a checkerboard.
  const board = wiring.board;
  const onBoard = board
    ? board.board.slots.map((at, index) => {
        let self: KeepsakeSlot | null = null;
        const layer = (index % 5) % 2 === Math.floor(index / 5) % 2 ? WALL.print : WALL.overlay;
        self = new KeepsakeSlot(use(() => self!), { holder: board.board, at, index, fastener: 'pin', layer, target: [0.12, 0.1], onLeave });
        return { slot: placeWith(zone, board.board, self, at.clone()), shown: () => board.owned() };
      })
    : [];
  const places = [...onFridge, ...onBoard];

  const contentOf = (owned: OwnedKeepsake): SlotContent | null => {
    const def = keepsakeFor(owned.person, owned.tier);
    if (!def) return null;
    return { key: `${owned.person}:${owned.tier}`, person: owned.person, def, giver: shortName(owned.person), ...(owned.photo ? { photo: owned.photo } : {}) };
  };
  const refresh = (): void => {
    const shown = keepsakesOwned(wiring.day()).map(contentOf).filter((c): c is SlotContent => c !== null);
    places.forEach((place, i) => place.slot.show(i < onFridge.length || board?.owned() ? (shown[i] ?? null) : null));
  };
  refresh();
  zone.onUnload(onKeepsakes(refresh));
  zone.onUnload(wiring.onDayChange(refresh));
  if (board) zone.onUnload(board.onOwned(refresh));

  // The close look: over the shut door's keepsakes while there is at least one, its click drawing the view in.
  let letGo: (() => void) | null = null;
  const look = new FridgeLook({
    label: () => (closeUpOn() ? 'Fridge door · step back' : 'Friends’ keepsakes · look closer'),
    use: () => {
      if (closeUpOn()) {
        letGo?.();
        return;
      }
      letGo = closeUp(look, { ...KITCHEN_PLAN.fridgeLook, onEnd: () => (letGo = null) });
    },
  }, face.area.width, face.area.height);
  placeWith(zone, fridge, look, face.area.centre.clone());
  const onTheDoor = (): boolean => face.shut && onFridge.some((place) => place.slot.content !== null);
  presentWhile(zone, look, onTheDoor, (cb) => {
    const offs = [onKeepsakes(cb), wiring.onDayChange(cb), face.onMove(cb)];
    return () => offs.forEach((off) => off());
  });
  // The door opened, or the kitchen left: the close look lets go.
  zone.onUnload(face.onMove(() => {
    if (!face.shut) letGo?.();
  }));
  zone.onUnload(() => letGo?.());

  // A place is in the room (drawn, clickable) only with something in it, and the fridge's only while its door is shut.
  for (const place of places) {
    presentWhile(zone, place.slot, () => place.slot.content !== null && place.shown(), (cb) => {
      const offs = [onKeepsakes(cb), wiring.onDayChange(cb), face.onMove(cb), ...(board ? [board.onOwned(cb)] : [])];
      return () => offs.forEach((off) => off());
    });
  }
}
