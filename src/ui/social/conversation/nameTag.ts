import { knowsBirthday } from '@/social/life/birthdays';
import { isBirthday, moodInfo, moodOf } from '@/social/mood';
import { findPerson } from '@/social/people';
import { isMet, standing } from '@/social/standing';
import type { TalkContext } from '@/social/conversation';
import { tierInfo, tierOf } from '@/social/tiers';
import type { PersonId } from '@/social/types';
import { capitalise } from '@/text/strings';
import { tierBadge } from '../badge';
import { icon, MOOD_ICONS } from '../icons';
import { relationMeter, trustStamps } from '../meters';
import { html, type Html } from '../../panel/html';

/*
 * Who they are to the player, pinned on top of their balloon (docs/social.md "The panel"): their face in the tier's
 * ring, their name (with the book's mark: a click opens their page in the People book over the conversation), the
 * tier's word, the bar to the next tier and the stamps of trust, and their day when it matters (a birthday known, a
 * mood and why). A voice or a call has a bigger face: there is no body to look at.
 */

interface TagOptions {
  /** Only their voice is here (a door, a counter, the phone): the face is the medallion. */
  voice: boolean;
  phone: boolean;
  /** Their page in the book can be opened from here. */
  canOpen: boolean;
  /** The controller is in hand: the name shows its Y. */
  pad: boolean;
}

export function tagHtml(id: PersonId, ctx: TalkContext, o: TagOptions): Html {
  const card = findPerson(id);
  const s = standing(id);
  const tier = tierOf(s.warmth, s.trust);
  const met = isMet(id);
  const name = met ? (card?.short ?? card?.name ?? id) : capitalise(card?.role ?? 'Someone');
  const { mood, why } = moodOf(id, ctx.day, ctx.hour);
  const day: Html[] = [];
  if (isBirthday(id, ctx.day) && knowsBirthday(id)) day.push(html`<span class="social-tag__day social-tag__day--cake">${icon('cake', 1)} Birthday today</span>`);
  if (mood !== 'fine') day.push(html`<span class="social-tag__day social-mood social-mood--${mood}">${icon(MOOD_ICONS[mood], 1)} ${moodInfo(mood).name}${why ? html`<span class="social-mood__why">, ${why}</span>` : ''}</span>`);
  const book = html`<span class="social-tag__book" aria-hidden="true">${icon('book', 1)}</span>`;
  const title = met && o.canOpen
    ? html`<button type="button" class="social-tag__name" data-action="person" aria-label="${name}: open their page in the People book">${book}<span>${name}</span>${o.pad ? html`<kbd class="social-pad" aria-hidden="true">Y</kbd>` : ''}</button>`
    : html`<span class="social-tag__name">${book}<span>${name}</span></span>`;
  return html`<div class="social-tag${o.voice ? ' social-tag--voice' : ''}" style="--tier:${tierInfo(tier).colour}">
    <span class="social-tag__face">${o.phone ? html`<span class="social-tag__phone" aria-label="On the phone">${icon('phone', 0.9)}</span>` : ''}</span>
    <div class="social-tag__id">
      <div class="social-tag__top">${title}${met ? tierBadge(tier, id, { small: true }) : ''}</div>
      ${met ? html`<div class="social-tag__standing">${relationMeter(s, { person: id, compact: true })}${trustStamps(s)}</div>` : ''}
      ${day.length ? html`<p class="social-tag__days">${day}</p>` : ''}
    </div>
  </div>`;
}
