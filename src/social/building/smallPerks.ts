import { addExtras } from '../extras';
import { has } from '../perks';
import type { TalkExtra } from '../talk';
import { BUILDING_PERKS } from './buildingPerksPlan';
import { doneOn, markDay } from './perkState';

/*
 * The building's word-of-mouth perks (docs/social.md "The building's perks"): what Sofia Rossi knows of the post and
 * of Comets, the postman's offer, Pascal's strong arms and the Nguyens' spare pad. Lines only where the game has no
 * mechanism to change (the flat's furniture weighs nothing to carry; a games night has no pad limit).
 */

/** The post as Sofia sees it from the sorting office (`collection/MailPost`). */
interface PostView {
  readonly count: number;
  due(): readonly unknown[];
}

const P = BUILDING_PERKS;

/** "One game in the post, it comes on the next round." */
function postLine(post: PostView | undefined): string {
  if (!post || post.count === 0) return 'Nothing in the post for you today. I’d know.';
  const due = post.due().length;
  const n = post.count === 1 ? 'One parcel' : `${post.count} parcels`;
  return due ? `${n} for you, on the van this round. The postman will ring.` : `${n} for you at the sorting office. Next round, or the one after.`;
}

export function wireSmallPerks(post: PostView | undefined): void {
  addExtras(({ person, day }) => {
    const extras: TalkExtra[] = [];
    if (person === 'rossi' && has('rossi', 'postNews')) {
      extras.push({ id: 'rossi-post', group: 'ask', label: 'Anything in the post for me?', run: () => ({ line: postLine(post) }) });
    }
    if (person === 'rossi' && has('rossi', 'arcadeTips')) {
      extras.push({
        id: 'rossi-comets',
        group: 'ask',
        label: 'Any tips for Comets?',
        disabled: () => (doneOn('rossi-comets', day) ? 'One lesson a day' : null),
        run: () => {
          markDay('rossi-comets', day);
          return { line: P.rossiTips[day % P.rossiTips.length]! };
        },
      });
    }
    if (person === 'postman' && has('postman', 'carriesUp')) extras.push({ id: 'postman-up', group: 'ask', label: 'Bring my parcels up?', run: () => ({ line: P.postmanRounds }) });
    if (person === 'girard' && has('girard', 'helpsCarry')) extras.push({ id: 'girard-carry', group: 'ask', label: 'Help me move something?', run: () => ({ line: P.girardCarry }) });
    if (person === 'nguyen' && has('nguyen', 'lendsPad')) extras.push({ id: 'nguyen-pad', group: 'ask', label: 'Borrow the spare pad', run: () => ({ line: P.nguyenPad }) });
    return extras;
  });
}
