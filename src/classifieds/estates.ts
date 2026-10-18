import { estatePhase, estateStart } from '@/building/estateSale';
import { ESTATE_SALE } from '@/economy/pricing';
import type { ScriptedAd } from './ads';

/*
 * OTHER ESTATES (docs/economy.md "Small ads and the seller's flat"): once Mr Lambert's sale in the entrance hall is
 * over, now and then another family clears a late relative's games through THE GAMING WEEKLY's small ads, in Park
 * Corner Mansions like every private seller: the first `ESTATE_ADS.after` game days on, then every `every` days, each
 * estate in turn and then round again. A loft's lot (mixed, priced by someone who does not know), the family's own words.
 */

const ESTATE_ADS = { after: 18, every: 21 } as const;

/** The estates, in turn: who passed away, who sells, what the ad says, how they open the door. */
const ESTATES: readonly { id: string; name: string; text: string; greeting: string }[] = [
  {
    id: 'penrose',
    name: 'Mrs Penrose',
    text: 'Estate of the late Arthur Penrose, projectionist at the old Rex. His video games, decades of them, boxed. Family selling. Call afternoons.',
    greeting: 'Come in. Dad ran the projector at the Rex for thirty years, and in the evenings, these. He’d want them played.',
  },
  {
    id: 'hale',
    name: 'Mr Hale',
    text: 'My aunt Odile ran the games club at the primary school. Her cupboard of cartridges must go. Kind offers. Ring afternoons.',
    greeting: 'Hello! My aunt taught for forty years. Half the street learnt to count playing these, she used to say.',
  },
  {
    id: 'vos',
    name: 'Mrs Vos',
    text: 'Late husband’s collection: he kept the pub’s old consoles and every game the regulars left behind. Priced to clear. Call afternoons.',
    greeting: 'Mind the step. Bernard never threw a thing away. Every game a regular forgot at the bar, he kept. Here they are.',
  },
  {
    id: 'kowalski',
    name: 'Mr Kowalski',
    text: 'Clearing my father’s flat. He mended televisions, and kept the games people left in them. All sorts. Ring afternoons.',
    greeting: 'Come in, come in. Dad repaired sets for the whole street. Half of these came out of somebody’s telly.',
  },
];

/** The estate ads due up to `day` (and the next, a day early so it is in the paper on its first morning). */
function estateAdsUpTo(day: number): ScriptedAd[] {
  if (estatePhase(day) !== 'over') return [];
  const start = estateStart(day);
  if (start === null) return [];
  const first = start + ESTATE_SALE.days + ESTATE_ADS.after;
  const out: ScriptedAd[] = [];
  for (let n = 0, from = first; from <= day + 1; n++, from += ESTATE_ADS.every) {
    const estate = ESTATES[n % ESTATES.length]!;
    out.push({ id: `estate:${estate.id}:${n}`, fromDay: from, kind: 'loft', name: estate.name, platform: null, text: estate.text, hours: [12, 19], greeting: estate.greeting });
  }
  return out;
}

/** Puts each estate's ad in the paper as its day comes (at start and every new game day; `Classifieds.inject` is idempotent). */
export function scheduleEstateAds(book: { inject(spec: ScriptedAd): void }, today: { readonly gameDay: number; onNewGameDay(cb: (day: number) => void): () => void }): void {
  const post = (): void => {
    for (const ad of estateAdsUpTo(today.gameDay)) book.inject(ad);
  };
  post();
  today.onNewGameDay(post);
}
