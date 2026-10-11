import type { ReadingNotice } from '@/notices';
import { getPlatform } from '@/catalog/platforms';
import { FELIX_LOTS, felixLotGame } from '@/economy/felixLots';

/**
 * THE SALE'S CATALOGUE as read at home (docs/grandma.md "What the memories leave behind"): Félix's lots in order, Mémé's
 * pencil in the margin, and a tick by every one come home (`home`: `felixLots.lotsHome` of the collection). No count,
 * no share: the ticks are the page.
 */
export function catalogueCard(home: ReadonlySet<number>): ReadingNotice {
  const rows = FELIX_LOTS.map((lot) => {
    const game = felixLotGame(lot);
    const name = game ? `${game.title} (${getPlatform(game.platform).shortName})` : lot.id;
    const note = lot.note ? `  ~ ${lot.note}` : '';
    return `${home.has(lot.lot) ? '✓ ' : '    '}Lot ${lot.lot}. ${name}${note}`;
  });
  return {
    look: 'note',
    title: 'Sale of the contents of a flat · lots 1 to 412',
    text: `Video games and accessories, the property of the late Mr F. Aubry. Viewing from nine.\n\nOdette’s pencil marks:\n${rows.join('\n')}`,
  };
}
