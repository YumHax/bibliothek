import type { Game } from '@/catalog/types';
import { canonicalGameId } from '@/catalog';
import type { NoticeActions } from '@/notices';
import { FELIX_LOTS, felixCopy } from '@/economy/felixLots';
import { GASPARD_TALK } from '@/grandma/gaspardLines';
import type { FamilyStory } from './FamilyStory';

/*
 * WHAT GASPARD KEPT BACK (docs/grandma.md "The end of the story"): his one Sunday back at Mémé's after the apology, he
 * hands the player the copy of Félix's he could not put in the sale: the lowest lot of the catalogue not home yet, a
 * slip of his inside the box. It goes into the collection like any gift (the parcel in the hall).
 */

interface GaspardReturnDeps {
  family: FamilyStory;
  collection: { owns(id: string): boolean; add(game: Game): void };
  notices: Pick<NoticeActions, 'reward'>;
}

export function wireGaspardReturn({ family, collection, notices }: GaspardReturnDeps): void {
  family.onGaspardBack((day) => {
    const lot = FELIX_LOTS.find((l) => !collection.owns(canonicalGameId(l.id)) && felixCopy(l));
    const copy = lot && felixCopy(lot);
    const t = GASPARD_TALK.back;
    family.note(t.note, 'headline');
    if (!lot || !copy) return;
    collection.add({
      ...copy,
      status: 'owned',
      addedAt: new Date().toISOString(),
      past: { kind: 'note', text: t.past },
      acquired: { price: 0, where: t.where, day },
    });
    notices.reward({ title: `Félix’s ${copy.title}`, detail: `Lot ${lot.lot}, kept back from the sale by Gaspard. In the parcel in the hall.`, big: true });
  });
}
