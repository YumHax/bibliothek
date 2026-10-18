import type { Game } from '@/catalog/types';
import type { PageLook } from '@/social/bookSeen';
import { tasteOf } from '@/social/gifts';
import { tiesOf } from '@/social/gossip';
import { knowsBirthday } from '@/social/life/birthdays';
import { moodInfo, moodOf } from '@/social/mood';
import { findPerson, shortName } from '@/social/people';
import { effectsOf } from '@/social/perks';
import { phoneState } from '@/social/phoneCalls';
import { GIFTS, TRAITS } from '@/social/socialPlan';
import { standing } from '@/social/standing';
import { threadsOf, type Thread } from '@/social/threads';
import { tierInfo, tierOf } from '@/social/tiers';
import type { GiftKind, Memory, PersonId, PersonTopic, SocialEffect } from '@/social/types';
import { whereNow, whereWords } from '@/social/whereNow';
import { capitalise } from '@/text/strings';
import { daysAgoWords } from '@/time/dayWords';
import { html, type Html } from '../../panel/html';
import { coverImg } from '../../panel/widgets';
import { relationMeter } from '../meters';
import { badge, birthdayLine, FIT_WORDS, stamps, TASTE_WORDS, threadKey, tieName } from './bookParts';

/*
 * A person's page in the People book (docs/social.md "The People book"): on the left their Polaroid in their tier's
 * ring, the badge, the bar towards the next tier and the stamps of trust, where they are now and until when, and a
 * Call button when the player has their number; on the right what matters to them (their topics, marked once the
 * player has seen how they take them), what they are waiting for (needs on notes, promises on tickets), what is
 * between you now, your memories (with the game's cover), and their world (whom they know, a red thread for bad
 * blood). The page ages with the tier (`PageLook`): a typed card, then the player's pencil notes, then their hand,
 * then a photo of the two of you. Nothing of what is to come.
 */

/** What the page reads of the game besides the social layer: covers for memories about a game. */
interface PageDeps {
  day: number;
  hour: number;
  /** The player can ring them from the page. */
  canCall: boolean;
  game?(id: string): Game | undefined;
  coverUrl?(game: Game): string | undefined;
}

/** What is new on the page since last time (`social/bookSeen` keys), and whether its look just grew. */
export interface PageFresh {
  items: ReadonlySet<string>;
  grew: boolean;
}

const ribbon = (on: boolean): Html => (on ? html`<span class="people-book__ribbon">new</span>` : html``);

export function personPage(id: PersonId, look: PageLook, fresh: PageFresh, deps: PageDeps): Html {
  const card = findPerson(id);
  if (!card) return html``;
  const s = standing(id);
  const tier = tierInfo(tierOf(s.warmth, s.trust));
  const met = s.met !== null;
  const known = met || card.listed === 'always';
  const { mood, why } = moodOf(id, deps.day, deps.hour);
  const where = whereNow(id, deps.day, deps.hour);
  const birthday = knowsBirthday(id) ? birthdayLine(id, deps.day) : null;
  const isNew = (key: string): boolean => fresh.items.has(key);

  // The left: who they are to you, where they are now, a call.
  const phone = s.number && deps.canCall ? phoneState(id, deps.day, deps.hour) : null;
  const call = phone
    ? html`<div class="people-book__call">
        <button type="button" class="ui-btn people-book__callbtn" data-action="call" data-id="${id}" aria-disabled="${!phone.picks}">Call</button>
        <small>${phone.picks ? 'Picks up now' : capitalise(phone.note)}</small>
      </div>`
    : '';
  const now = html`<dl class="people-book__card">
      <dt>Now</dt><dd>${!known ? 'Somewhere in town' : where ? whereWords(where) : card.whereabouts}</dd>
      ${met && mood !== 'fine' ? html`<dt>Today</dt><dd>${moodInfo(mood).name}${why ? html` · ${why}` : ''}</dd>` : ''}
      ${birthday ? html`<dt>Birthday</dt><dd>${birthday}</dd>` : ''}
    </dl>`;
  const photo =
    look === 'photo'
      ? html`<figure class="people-book__us"><span class="people-book__tape"></span><span class="people-book__usframe"><span data-portrait="${id}" data-size="64"></span><span class="people-book__you" aria-hidden="true"></span></span><figcaption>You and ${card.short ?? card.name}</figcaption></figure>`
      : '';

  // The right: what matters to them, what they wait for, what is between you, memories, their world.
  const topics = topicsPart(id, card.topics ?? [], isNew);
  const traits = card.traits.filter((t) => s.traitsKnown.includes(t)).map((t) => html`<li class="people-book__trait${isNew(`known:trait:${t}`) ? ' people-book__trait--new' : ''}"><b>${TRAITS[t].name}</b><small>${TRAITS[t].blurb}</small></li>`);
  const facts = (card.facts ?? []).filter((f) => s.known.includes(f.id)).map((f) => html`<li>${f.text}${ribbon(isNew(`known:${f.id}`))}</li>`);
  const tastes = (Object.keys(GIFTS) as GiftKind[]).flatMap((kind) => {
    const taste = tasteOf(id, kind);
    return taste ? [html`<span class="people-book__gift people-book__gift--${taste}">${TASTE_WORDS[taste]} ${GIFTS[kind].name}${ribbon(isNew(`known:taste:${kind}`))}</span>`] : [];
  });
  const knowAny = topics.shown || traits.length || facts.length || tastes.length;
  const threads = threadsOf(id, deps.day);
  const between = effectsOf(id).active;
  const stamp = (e: SocialEffect) => html`<li class="people-book__stamp people-book__stamp--${e.down ? 'bad' : 'on'}" style="--tier:${tierInfo(e.at).colour}">${e.text}</li>`;
  const margin = look === 'pencil' && s.met !== null ? html`<p class="people-book__margin" aria-hidden="true">met ${daysAgoWords(s.met, deps.day)}${where ? ` · ${where.where.toLowerCase()}` : ''}</p>` : '';
  const flourish = look === 'hand' || look === 'photo' ? html`<span class="people-book__coffee" aria-hidden="true"></span><span class="people-book__doodle" aria-hidden="true"></span>` : '';

  return html`<div class="people-book__dossier people-book__dossier--${look}${fresh.grew ? ' people-book__dossier--grew' : ''}" style="--tier:${tier.colour}">
    <aside class="people-book__id">
      <figure class="people-book__polaroid">
        <span class="people-book__tape"></span>
        <span class="people-book__ring"><span data-portrait="${id}" data-size="132"></span></span>
        <figcaption>${card.short ?? card.name}</figcaption>
      </figure>
      ${met ? html`<div class="people-book__where">${badge(id, 'big')}${relationMeter(s, { person: id })}${stamps(id)}</div>` : html`<p class="people-book__unmet">Not met yet</p>`}
      ${now}
      ${call}
      ${photo}
    </aside>
    <section class="people-book__notes">
      ${flourish}
      <header class="people-book__title">
        <h2>${card.name}</h2>
        <p>${card.role}</p>
        ${margin}
      </header>
      ${knowAny || topics.more ? html`<h3>What matters to them</h3>${topics.html}` : ''}
      ${traits.length ? html`<ul class="people-book__traits">${traits}</ul>` : ''}
      ${facts.length ? html`<ul class="people-book__facts">${facts}</ul>` : ''}
      ${tastes.length ? html`<p class="people-book__gifts">${tastes}</p>` : ''}
      ${met ? html`<h3>What they’re waiting for</h3>${threadsPart(threads, look, isNew)}` : ''}
      ${between.length ? html`<h3>Between you</h3><ul class="people-book__stamps">${between.map(stamp)}</ul>` : ''}
      <h3>Your memories</h3>
      ${memoriesPart(s.memories, deps, isNew)}
      <h3>Their world</h3>
      ${web(id)}
    </section>
  </div>`;
}

/** Their topics the player has seen them take (loves it, to avoid…), and one line while some are still to find. */
function topicsPart(id: PersonId, topics: readonly PersonTopic[], isNew: (key: string) => boolean): { html: Html; shown: number; more: boolean } {
  const known = standing(id).known;
  const found = topics.filter((t) => known.includes(`fit:${t.id}`));
  const more = found.length < topics.length;
  const chips = found.map((t) => html`<li class="people-book__topic people-book__topic--${t.fit}">${t.name} <small>${FIT_WORDS[t.fit]}</small>${ribbon(isNew(`known:fit:${t.id}`))}</li>`);
  return {
    html: html`${chips.length ? html`<ul class="people-book__topics">${chips}</ul>` : ''}${more ? html`<p class="people-book__more">Still to find…</p>` : ''}`,
    shown: chips.length,
    more,
  };
}

/** What they wait for: their needs and words on notes (in their own hand once they are a friend), the player's promises on tickets. */
function threadsPart(threads: readonly Thread[], look: PageLook, isNew: (key: string) => boolean): Html {
  if (!threads.length) return html`<p class="people-book__more">Nothing for now.</p>`;
  const theirHand = look === 'hand' || look === 'photo';
  const items = threads.map((t) =>
    t.kind === 'promise'
      ? html`<li class="people-book__ticket"><b>You promised</b><span>${t.text}</span>${t.due ? html`<small>${t.due}</small>` : ''}${ribbon(isNew(threadKey(t)))}</li>`
      : html`<li class="people-book__sticky${theirHand ? ' people-book__sticky--hand' : ''}">${theirHand ? `“${t.text}”` : html`<i>They mentioned:</i> ${t.text}`}${ribbon(isNew(threadKey(t)))}</li>`,
  );
  return html`<ul class="people-book__threads">${items}</ul>`;
}

/** Your memories with them, a dated diary; a memory about a game shows its cover. */
function memoriesPart(memories: readonly Memory[], deps: PageDeps, isNew: (key: string) => boolean): Html {
  if (!memories.length) return html`<p class="people-book__more">Nothing yet.</p>`;
  return html`<ol class="people-book__diary">${memories.map((m) => {
    const game = m.game ? deps.game?.(m.game) : undefined;
    const cover = game ? coverImg(deps.coverUrl?.(game), game, 'people-book__cover') : '';
    return html`<li class="${m.weight < 0 ? 'people-book__diary--sore' : ''}"><time>${capitalise(daysAgoWords(m.day, deps.day))}</time><span>${cover}“${sentence(m.text)}”${ribbon(isNew(`memory:${m.day}:${m.text}`))}</span></li>`;
  })}</ol>`;
}

/** Whom they know among the people met: their face in the middle, the others round it on threads; bad blood in red. */
function web(id: PersonId): Html {
  const ties = tiesOf(id)
    .filter((t) => standing(t.id).met !== null || findPerson(t.id)?.listed === 'always')
    .slice(0, 8);
  if (!ties.length) return html`<p class="people-book__more">Nobody you know.</p>`;
  const at = (i: number) => {
    const a = -Math.PI / 2 + (i / ties.length) * Math.PI * 2;
    return { x: 50 + Math.cos(a) * 38, y: 50 + Math.sin(a) * 36 };
  };
  const lines = ties.map((t, i) => {
    const p = at(i);
    const kind = t.tie >= 0.2 ? 'warm' : t.tie > -0.2 ? 'even' : t.tie > -0.5 ? 'cold' : 'feud';
    return html`<line x1="50" y1="50" x2="${p.x.toFixed(1)}" y2="${p.y.toFixed(1)}" class="people-book__thread people-book__thread--${kind}" style="--weight:${(1 + Math.abs(t.tie) * 2.5).toFixed(2)}"/>`;
  });
  const nodes = ties.map((t, i) => {
    const p = at(i);
    return html`<button type="button" class="people-book__node${t.tie <= -0.2 ? ' people-book__node--feud' : ''}" data-action="person" data-id="${t.id}" style="left:${p.x.toFixed(1)}%;top:${p.y.toFixed(1)}%">
      <span data-portrait="${t.id}" data-size="38"></span><b>${shortName(t.id)}</b><small>${tieName(t.tie)}</small>
    </button>`;
  });
  return html`<div class="people-book__web">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
    <span class="people-book__hub" data-portrait="${id}" data-size="46"></span>
    ${nodes}
  </div>`;
}

/** A remembered line as a sentence: capitalised, a full stop unless it already ends on one ("!", "?", "…"). */
function sentence(text: string): string {
  const said = capitalise(text.trim());
  return /[.!?…]$/.test(said) ? said : `${said}.`;
}
