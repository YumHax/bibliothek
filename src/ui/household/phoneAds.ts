import type { Classifieds } from '@/classifieds/Classifieds';
import { SELLERS_BUILDING, clockOf } from '@/classifieds/ads';
import type { PhoneAds } from './PhonePanel';

/**
 * The phone's small ads page over `Classifieds`: the ads read in today's Gaming Weekly, the visit agreed with one (a
 * second ring repeats it; ringing another seller agrees theirs instead).
 */
export function phoneAds(book: Classifieds): PhoneAds {
  return {
    hint: 'Nothing to ring yet: the Gaming Weekly at the newsstand on Front Street has small ads, people round the corner selling their old games.',
    list: () => {
      const booking = book.booking;
      return book.seenAds().map((ad) => ({
        id: ad.id,
        who: `${ad.name}, ${ad.flat}`,
        text: ad.text,
        booked: booking?.ad.id === ad.id ? `${booking.day === book.today ? 'today' : 'tomorrow'} ${clockOf(ad.hours[0])}–${clockOf(ad.hours[1])}` : null,
      }));
    },
    ring: (id) => {
      const ad = book.find(id);
      if (!ad) return 'The number rings and rings. They must have sold everything.';
      const before = book.booking;
      const line = book.book(ad);
      return before && before.ad.id !== ad.id ? `${line}\n(Your visit to ${before.ad.name} is off: no harm, ring them again if you like.)` : `${line}\n${SELLERS_BUILDING} is on Front Street, over PARK FRUIT & VEG, by Park Street’s corner.`;
    },
  };
}
