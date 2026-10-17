import type { NoticeActions, ReadingNotice } from '@/notices';
import { findPerson, shortName } from './people';
import { effectsCrossed } from './perks';
import { slipCoolingNote, stageTierUp, useTierBanner } from './scenes/tierScenes';
import { onSocial } from './standing';
import { onTalkEnd, talkingWith } from './talkState';
import { tierChangeLine, tierInfo, tierRank } from './tiers';
import type { PersonId, SocialChange, TierId } from './types';
import { capitalise } from '@/text/strings';

/*
 * A tier crossed is told once (docs/social.md "Clarity"), never in the middle of a conversation (it waits for its
 * end, `talkState`): up, a reward banner naming what it brings ("Mrs Dubois is a friend now: holds your parcels at
 * the lodge"), after the tier's scene when there is one (`scenes/tierScenes`: they come to the door with their
 * keepsake, the banner once they have gone); down, a card saying what it costs now, or for someone close to home
 * their note under the door. Wired once in `bootstrap/social` with the notices; the conversation panel only moves its
 * meter.
 */

type Picture = (id: PersonId, ring: string) => HTMLCanvasElement;

/** Tells every tier change through `notices`, from now on. Returns the unsubscribe. */
export function announceTiers(notices: Pick<NoticeActions, 'reward' | 'read'>, picture?: Picture): () => void {
  // A scene played later (a reload in between included) shows its banner from what is left of the change.
  useTierBanner((id, before, after) => whenNotTalking(() => reward(notices, { id, before, after, warmth: 0, trust: 0 }, picture)));
  return onSocial((change) => tell(notices, change, picture));
}

/** Runs `show` now, or once the conversation open now is over. */
function whenNotTalking(show: () => void): void {
  if (!talkingWith()) {
    show();
    return;
  }
  const off = onTalkEnd(() => {
    off();
    show();
  });
}

function tell(notices: Pick<NoticeActions, 'reward' | 'read'>, change: SocialChange, picture?: Picture): void {
  if (change.before === change.after) return;
  const card = findPerson(change.id);
  if (!card) return;
  const name = shortName(change.id);
  const { gained, lost } = effectsCrossed(change.id, change.before, change.after);
  const up = tierRank(change.after) > tierRank(change.before);
  // Small moves are the journal's (a newcomer becoming an acquaintance, a cold one thawing to civil): a banner is
  // for a tier that does something (Friendly and up, a perk gained), a card for bad blood (Cold and down, a perk lost).
  if (up) {
    if (tierRank(change.after) < tierRank('friendly') && !gained.length) return;
    // Their scene shows it: the banner comes when they have gone back down.
    if (stageTierUp(change)) return;
    whenNotTalking(() => reward(notices, change, picture));
    return;
  }
  if (tierRank(change.after) >= tierRank('polite') && !lost.length) return;
  const penalty = card.effects?.find((e) => e.down && e.at === change.after)?.text;
  const source = change.from ? shortName(change.from) : null;
  const reason = change.heard ? `${name} heard about it from ${source ?? 'someone'}.` : change.why ? `${capitalise(change.why)}.` : '';
  const read: ReadingNotice = {
    title: tierChangeLine(name, change.before, change.after),
    text: reason || `Things are not what they were with ${name}.`,
    effect: penalty ? `${penalty}.` : lost.length ? `No more: ${lost.map((e) => e.text.toLowerCase()).join('; ')}.` : undefined,
    look: 'note',
  };
  // Fallen to Cold or lower, someone close to home writes it: a note under the door, in their hand.
  if (tierRank(change.after) <= tierRank('cold') && slipCoolingNote(change, read)) return;
  whenNotTalking(() => notices.read(read));
}

/** The banner of a tier reached: their portrait, what it brings now. */
function reward(notices: Pick<NoticeActions, 'reward'>, change: Pick<SocialChange, 'id' | 'before' | 'after' | 'why' | 'heard' | 'warmth' | 'trust'>, picture?: Picture): void {
  const after = tierInfo(change.after);
  const { gained } = effectsCrossed(change.id, change.before as TierId, change.after);
  const perks = gained.map((e) => e.text);
  const detail = perks.length ? `${perks.join('. ')}.` : change.heard ? 'Word got round: they think well of you.' : `${capitalise(change.why ?? 'you get on')}.`;
  notices.reward({ title: tierChangeLine(shortName(change.id), change.before, change.after), detail, big: change.after === 'close', picture: picture?.(change.id, after.colour), pictureRing: after.colour });
}
