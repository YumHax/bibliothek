import { ESTATE_SALE } from '@/economy/pricing';
import { estatePhase, estateStart } from './estateSale';
import { pinSource, type BoardNote } from './boardNotes';

/*
 * THE NEW TENANT (docs/building.md "The estate sale"): the late Mr Lambert's courtyard flat on the 3rd does not stay
 * empty. `afterDays` game days after the sale's last, Yann Le Goff moves in (the night show on Radio Brocante, the
 * kitchen radio's 8-bit hour is his): his hello on the hall's board for a few days, his name on the mailbox, and
 * some evenings he is in the hall at the mailboxes, someone new to meet (`social/people/building` 'legoff').
 */

export const NEW_TENANT = {
  person: 'legoff',
  name: 'Yann Le Goff',
  surname: 'LE GOFF',
  /** Game days after the sale's last before he moves in. */
  afterDays: 6,
  /** His hello on the board, this many game days from the day he moves in. */
  noteDays: 3,
  note: {
    id: 'new-tenant',
    title: 'Hello from the 3rd!',
    lines: ['Moving into the courtyard flat this week.', 'Sorry for the boxes in the lift.', 'Come and say hello, I am up late.'],
    signed: 'Yann Le Goff',
    paper: 0xe8f1fb,
    weight: 2,
  } satisfies BoardNote,
  /** Some evenings (`share` of game days, between `hours`), he checks his post at the mailboxes in the hall. */
  hall: { share: 0.5, hours: [18, 22] as [number, number] },
} as const;

/** The game day he moves in, once the sale is over; null before the sale has a date. */
function newTenantDay(day: number): number | null {
  const start = estateStart(day);
  return start === null ? null : start + ESTATE_SALE.days + NEW_TENANT.afterDays;
}

/** Whether he lives in the building on game day `day`. */
export function newTenantIn(day: number): boolean {
  const from = newTenantDay(day);
  return from !== null && estatePhase(day) === 'over' && day >= from;
}

/** Pins his hello on the hall's board for his first days (once; the stairwell does it as it is built). Returns the unpin. */
export function pinNewTenantNote(): () => void {
  return pinSource('newTenant', (day) => {
    const from = newTenantDay(day);
    return from !== null && newTenantIn(day) && day - from < NEW_TENANT.noteDays ? [{ ...NEW_TENANT.note, lines: [...NEW_TENANT.note.lines] }] : [];
  });
}
