import * as THREE from 'three';
import type { NoticeActions } from '@/notices';
import type { Today } from '@/time/Today';
import { HUNT } from '@/building/hunt/huntPlan';
import { NEW_LEAD, connectHunt, findClue, huntFound, huntOpen, huntSince, onHunt } from '@/building/hunt/BuildingHunt';
import { pinSource, refreshBoard } from '@/building/boardNotes';
import { estatePhase } from '@/building/estateSale';
import type { Zone } from '../zone/Zone';
import type { MailPiece } from '../props/MailDrop';
import { dressCellar } from '../cellar/huntHook';
import { dressCourtyard } from '../courtyard/huntHook';
import { atticState, onAtticChange } from '../attic/atticState';
import { foundChannels, onChannels } from '../roof/channels';
import { addCatFind } from '../cat/escapes';
import { STAIRWELL_PLAN } from '../stairwell/stairwellPlan';
import { ClueMark } from './ClueMark';
import { CARVING, CHALK, MAILBOX_CARD } from './clueLooks';

interface HuntWiring {
  today: Today;
  journal?: { note(kind: string, text: string): void };
  notices?: NoticeActions;
  /** A note under the flat's door. */
  slipNote: (piece: MailPiece) => void;
  /** The stairwell's zone: the nameless mailbox's card goes on its cabinet. */
  stairwell: Zone;
}

/** The nameless mailbox's flap (the bottom row's last, past every name) on the hall's cabinet, its slot (zone-local). */
function mailboxSlot(): { at: THREE.Vector3; yaw: number } {
  const { x, y, z, rows, columns } = STAIRWELL_PLAN.mailboxes;
  // The cabinet's face stands 0.12 m off the wall, turned to face +x; flap (row r, column c) is 0.22 x 0.24 m.
  const r = rows - 1;
  const c = columns - 1;
  const along = -(columns * 0.22) / 2 + (c + 0.5) * 0.22;
  const up = (rows * 0.24) / 2 - r * 0.24 - 0.06;
  return { at: new THREE.Vector3(x + 0.125, y + up, z - along), yaw: Math.PI / 2 };
}

/** Seconds after the trunk's game is handed over that Henri's note in it is read. */
const CHEST_NOTE_MS = 4500;

/**
 * Lays the building's treasure hunt (`HUNT`, docs/zones.md "The sixth floor") out where its clues are,
 * once at boot: Henri Lambert's letter under the door from `startDay` on (his niece's cover if he has
 * died by then: the estate sale's mourning), the cellars' chalk (`cellar/huntHook`), the card in the
 * nameless mailbox, his card on the hall's board (found when the board is read), the carving in the
 * courtyard's chestnut (`courtyard/huntHook`), what the cat may bring back (`cat/escapes.addCatFind`),
 * the attic reached and its trunk opened (`attic/atticState`), the aerial's tag on the roof
 * (`roof/channels`). What an old neighbour remembers is `building/hunt/huntSays`, asked by the stairs' residents.
 */
export function placeHunt({ today, journal, notices, slipNote, stairwell }: HuntWiring): void {
  connectHunt({ ...(journal ? { journal } : {}), ...(notices ? { notices } : {}), day: () => today.gameDay });

  // The letter, and the chalk's words if the cellars stay shut too long.
  const post = (day: number): void => {
    if (huntOpen('letter') && day >= HUNT.startDay) {
      const phase = estatePhase(day);
      slipNote(phase === 'none' ? HUNT.letterNote : HUNT.posthumous);
      findClue('letter', 'never');
    }
    if (huntOpen('chalk') && day - huntSince() >= HUNT.chalkFallbackDays) {
      slipNote(HUNT.chalkNote);
      findClue('chalk', 'never');
    }
  };
  post(today.gameDay);
  today.onNewGameDay(post);

  // The cellars' far wall, the nameless mailbox, the chestnut.
  dressCellar((zone, spots) => {
    const [x, y, z] = spots.chalk.at;
    zone.place(new ClueMark('chalk', CHALK), new THREE.Vector3(x, y, z), spots.chalk.yaw);
  });
  const slot = mailboxSlot();
  stairwell.place(new ClueMark('mailbox', MAILBOX_CARD), slot.at, slot.yaw);
  dressCourtyard((zone, spots) => {
    zone.place(new ClueMark('chestnut', CARVING), spots.chestnut.at, spots.chestnut.yaw);
  });

  // His card on the board, while it waits to be read (and a few days after).
  const { boardCard } = HUNT;
  pinSource('hunt', () => (huntOpen('board') || (huntFound('board') && !huntFound('chestnut')) ? [{ ...boardCard, onRead: () => void findClue('board', 'later') }] : []));
  onHunt(refreshBoard);

  // The cat, out on the stairs, may bring a corner of his photograph back.
  addCatFind(() => {
    if (!huntOpen('cat')) return null;
    findClue('cat', 'never');
    const { title, text } = HUNT.clues.cat;
    return { title, text, effect: `${NEW_LEAD}.` };
  });

  // Up the lift, the trunk opened, the aerial's tag.
  const attic = (): void => {
    const state = atticState();
    if (state.found) findClue('attic', 'later');
    if (state.chest && findClue('chest', 'never') && notices) {
      const { title, text } = HUNT.clues.chest;
      // On the building's clock: the note waits while the player is away from the stairwell, and dies with it.
      stairwell.after(CHEST_NOTE_MS / 1000, () => notices.read({ title, text, effect: 'The sixth floor: solved.', look: 'letter' }));
    }
  };
  attic();
  onAtticChange(attic);
  const aerial = (quiet: boolean): void => {
    if (!huntOpen('aerial') || !foundChannels().some((c) => c.step !== null)) return;
    if (!findClue('aerial', quiet ? 'later' : 'never') || quiet) return;
    const { title, text } = HUNT.clues.aerial;
    notices?.read({ title, text, effect: `${NEW_LEAD}.`, look: 'plaque' });
  };
  // A channel already tuned at boot (found before the hunt counted it): the tag counts, without its card popping up.
  aerial(true);
  onChannels(() => aerial(false));
}
