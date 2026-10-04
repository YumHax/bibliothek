import type { NoticeActions } from '@/notices';
import { findPerson, shortName } from './people';
import { effectsCrossed } from './perks';
import { onSocial } from './standing';
import { tierChangeLine, tierInfo, tierRank } from './tiers';
import type { PersonId, SocialChange } from './types';
import { capitalise } from '@/text/strings';

/*
 * A tier crossed is told once (docs/social.md "Clarity"), at the moment it happens: up, a reward banner naming what
 * it brings ("Mrs Dubois is a friend now: holds your parcels at the lodge"), the first time the player hears of it;
 * down, a card saying what it costs now. Wired once in `bootstrap/session` with the notices; the conversation panel
 * only moves its meter.
 */

/** Tells every tier change through `notices`, from now on. Returns the unsubscribe. */
export function announceTiers(notices: Pick<NoticeActions, 'reward' | 'read'>, picture?: (id: PersonId, ring: string) => HTMLCanvasElement): () => void {
  return onSocial((change) => tell(notices, change, picture));
}

function tell(notices: Pick<NoticeActions, 'reward' | 'read'>, change: SocialChange, picture?: (id: PersonId, ring: string) => HTMLCanvasElement): void {
  if (change.before === change.after) return;
  const card = findPerson(change.id);
  if (!card) return;
  const name = shortName(change.id);
  const after = tierInfo(change.after);
  const title = tierChangeLine(name, change.before, change.after);
  const { gained, lost } = effectsCrossed(change.id, change.before, change.after);
  const up = tierRank(change.after) > tierRank(change.before);
  // Small moves are the journal's (a newcomer becoming an acquaintance, a cold one thawing to civil): a banner is
  // for a tier that does something (Friendly and up, a perk gained), a card for bad blood (Cold and down, a perk lost).
  if (up) {
    if (tierRank(change.after) < tierRank('friendly') && !gained.length) return;
    const perks = gained.map((e) => e.text);
    const detail = perks.length ? `${perks.join('. ')}.` : change.heard ? 'Word got round: they think well of you.' : `${capitalise(change.why ?? 'you get on')}.`;
    notices.reward({ title, detail, big: change.after === 'close', picture: picture?.(change.id, after.colour), pictureRing: after.colour });
    return;
  }
  if (tierRank(change.after) >= tierRank('stranger') && !lost.length) return;
  const penalty = card.effects?.find((e) => e.down && e.at === change.after)?.text;
  const reason = change.heard ? `${name} heard about it from someone.` : change.why ? `${capitalise(change.why)}.` : '';
  notices.read({
    title,
    text: reason || `Things are not what they were with ${name}.`,
    effect: penalty ? `${penalty}.` : lost.length ? `No more: ${lost.map((e) => e.text.toLowerCase()).join('; ')}.` : undefined,
    look: 'note',
  });
}
