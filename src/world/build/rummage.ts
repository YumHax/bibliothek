import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { HouseholdContext } from '../buildContext';
import type { Openable } from '../props/Openable';
import type { Furniture } from '../Furniture';
import { SlideDrawer } from '../props/SlideDrawer';
import { FindPickup } from '../props/FindPickup';
import { booklet, coinScatter, ticketFold, withNote } from '../props/findModels';
import { placeWith } from '../zone/attach';
import type { LaidFind } from '@/household/rummage';
import { playCoins } from '@/audio/coins';
import { playPaperRustle } from '@/audio/householdSounds';

/** The most coins a handful shows, whatever it is worth. */
const MOST_COINS_SHOWN = 8;

/**
 * Wires the doors and drawers of a piece of the flat's furniture to what they hold (docs/household.md "Doors and
 * drawers"): when a leaf opens, what `HomeLife.peekFind` says lies there (the last tenant's leftover for the flat's own
 * `fitted` fittings, with their note by the first, else the day's find, now and then) is laid on its `stash` as a
 * thing to see (coins, a strip of tickets, a booklet: `props/findModels`), and only a click on it (`FindPickup`)
 * pockets it: the clink or the rustle, a slip with the chips (a banner for a booklet that completes a copy), the
 * tenant's note to read with their first leftover. Left there, it waits: a leftover till it is taken, the day's find
 * till the day ends (yesterday's is swapped for today's, or cleared, on the next opening). A leaf with no `stash`
 * holds nothing. `spot` names the piece in the save (`kitchen.run0`), each leaf by its index after it.
 */
export function rummageIn(zone: Zone, household: HouseholdContext | undefined, leaves: readonly object[], spot: string, fitted: boolean): void {
  if (!household) return;
  const { life, notices } = household;
  leaves.forEach((leaf, i) => {
    if (!isOpenable(leaf) || !leaf.stash) return;
    const where = { key: `${spot}#${i}`, noun: leaf.noun, fitted, drawer: leaf instanceof SlideDrawer };
    let laid: { pickup: FindPickup; id: string } | null = null;
    leaf.onOpen = () => {
      const find = life.peekFind(where);
      const id = find ? idOf(find) : null;
      if (laid?.id === id) return;
      // What lay there is gone (taken, or yesterday's): off the shelf before today's goes on it.
      if (laid) {
        laid.pickup.removeModel();
        zone.remove(laid.pickup);
        laid = null;
      }
      if (!find || !leaf.stash) return;
      const pickup: FindPickup = new FindPickup({
        stash: leaf.stash,
        model: modelOf(find, where.key, leaf.stash.room),
        flat: find.find.kind === 'manual' || find.find.kind === 'notebook',
        label: labelOf(find),
        openness: () => leaf.openness,
        take: () => {
          laid = null;
          const taken = life.takeFind(where);
          if (!taken) return;
          if (taken.paper) playPaperRustle();
          else playCoins(Math.min(5, taken.coins ?? 1));
          const notice = { title: taken.title, ...(taken.detail ? { detail: taken.detail } : {}), ...(taken.coins ? { coins: taken.coins } : {}), ...(taken.tickets ? { tickets: taken.tickets } : {}) };
          if (taken.notable) notices.reward(notice);
          else notices.slip(notice);
          if (taken.note) notices.read({ ...taken.note, look: 'note' });
        },
        gone: () => zone.remove(pickup),
      });
      // Placed with the leaf, so moving the piece (a bought nightstand) carries it along.
      placeWith(zone, leaf, pickup, new THREE.Vector3());
      laid = { pickup, id: idOf(find) };
    };
  });
}

/** What a find is, to tell whether the one lying there is still the one there is. */
function idOf({ find, leftover, note }: LaidFind): string {
  const what = find.kind === 'coins' ? find.coins : find.kind === 'tickets' ? find.tickets : find.kind === 'notebook' ? 'felix' : find.gameId;
  return `${find.kind}:${what}:${leftover}:${note}`;
}

/** The thing to see: a handful of coins, a folded strip of tickets, a booklet; the tenant's note under the first leftover. */
function modelOf(laid: LaidFind, key: string, room: number | undefined): THREE.Object3D {
  const { find } = laid;
  const seed = `${key}:${laid.leftover ? 'leftover' : idOf(laid)}`;
  const model = find.kind === 'coins' ? coinScatter(Math.min(MOST_COINS_SHOWN, find.coins), seed, room) : find.kind === 'tickets' ? ticketFold(find.tickets, seed) : booklet(find.title, seed);
  return laid.note ? withNote(model, seed) : model;
}

function labelOf({ find, note }: LaidFind): string {
  if (find.kind === 'manual') return `Manual of ${find.title} · take`;
  if (find.kind === 'notebook') return `${find.title} · take`;
  const what = find.kind === 'tickets' ? 'Arcade tickets' : find.coins === 1 ? 'A coin' : 'Loose change';
  return note ? `${what} and a note · take` : `${what} · take`;
}

function isOpenable(leaf: object): leaf is Openable & Furniture {
  return 'onOpen' in leaf && 'noun' in leaf && 'isOpen' in leaf && 'stash' in leaf;
}
