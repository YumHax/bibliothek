import { hashInts } from '@/random/hash';
import type { ReadingNotice } from './types';
import { dismissHint } from './dismissHint';

/*
 * The paper a card to read is printed on (docs/notices.md "Card to read"): the markup of each look, and the pages a
 * long text is cut into. `ReadingCard` owns the queue, the clock and the page turns; this only builds.
 */

/** A page holds this much at most: about six lines of the card's serif at its width. */
const PAGE_CHARS = 420;
const PAGE_LINES = 6;

/** A sentence, its closing quote and the space after it. */
const SENTENCE = /[^.!?]+[.!?]+[”"’']*\s*|[^.!?]+$/g;

/** The text as pages, each short enough to read at a glance: cut at paragraphs, then at sentences, never mid-sentence. */
export function pagesOf(text: string): string[] {
  if (fits(text)) return [text];
  const pages: string[] = [];
  let page = '';
  for (const unit of units(text)) {
    const joined = page ? `${page}${unit.breaks ? '\n' : ' '}${unit.text}` : unit.text;
    if (fits(joined) || !page) {
      page = joined;
      continue;
    }
    pages.push(page.trim());
    page = unit.text;
  }
  if (page.trim()) pages.push(page.trim());
  return pages.length ? pages : [text];
}

function fits(text: string): boolean {
  return text.length <= PAGE_CHARS && text.split('\n').length <= PAGE_LINES;
}

/** The text as lines, a line too long for a page broken into its sentences (`breaks`: the unit starts a new line). */
function units(text: string): { text: string; breaks: boolean }[] {
  const out: { text: string; breaks: boolean }[] = [];
  for (const line of text.split('\n')) {
    if (line.length <= PAGE_CHARS) {
      out.push({ text: line, breaks: true });
      continue;
    }
    const sentences = line.match(SENTENCE) ?? [line];
    sentences.forEach((s, i) => out.push({ text: s.trim(), breaks: i === 0 }));
  }
  return out;
}

/** The parts of a card `ReadingCard` writes to as the pages turn. */
export interface CardParts {
  el: HTMLElement;
  /** The page's text. */
  body: HTMLElement;
  /** "2 of 3 · 1/2": the card's place in its batch and the page shown; hidden when there is nothing to say. */
  stamp: HTMLElement;
  /** What the card changed: shown on the last page only. */
  effect: HTMLElement | null;
  /** "…and 2 more notes": the queue's overflow, on the last page. */
  more: HTMLElement | null;
  /** The pill at the foot: "Turn over" or "Put down" with the key in hand (`setDismissVerb`). */
  hint: HTMLElement;
}

/** A card's markup for its look: the frame, the title, the body and the lines around it, empty until `ReadingCard` fills the page. */
export function buildCard(card: ReadingNotice & { more?: number }): CardParts {
  const look = card.look ?? 'note';
  const el = document.createElement('article');
  el.className = 'reading';
  el.dataset.look = look;
  // Where the title, the text and the signature go: the back of a postcard, else the sheet itself.
  const face = look === 'postcard' ? postcardSides(el, card) : el;
  if (look === 'letter') {
    el.dataset.hand = card.hand ?? 'pen';
    const flap = document.createElement('div');
    flap.className = 'reading__flap';
    flap.setAttribute('aria-hidden', 'true');
    el.appendChild(flap);
  }
  if (look === 'flyer' && card.accent !== undefined) el.style.setProperty('--flyer-accent', `#${card.accent.toString(16).padStart(6, '0')}`);

  const stamp = document.createElement('span');
  stamp.className = 'reading__stamp';
  stamp.hidden = true;
  el.appendChild(stamp);

  if (card.date && look === 'letter') {
    const date = document.createElement('span');
    date.className = 'reading__date';
    date.textContent = card.date;
    face.appendChild(date);
  }
  if (card.title) {
    const title = document.createElement('h3');
    title.className = 'reading__title';
    title.textContent = card.title;
    face.appendChild(title);
  }
  const body = document.createElement('p');
  body.className = 'reading__text';
  face.appendChild(body);
  if (card.from) {
    const from = document.createElement('p');
    from.className = 'reading__from';
    from.textContent = card.from;
    face.appendChild(from);
  }
  let effect: HTMLElement | null = null;
  if (card.effect) {
    effect = document.createElement('p');
    effect.className = 'reading__effect';
    effect.textContent = card.effect;
    face.appendChild(effect);
  }
  let more: HTMLElement | null = null;
  if (card.more) {
    more = document.createElement('p');
    more.className = 'reading__more';
    more.textContent = `…and ${card.more} more ${card.more === 1 ? 'note' : 'notes'}`;
    face.appendChild(more);
  }
  const foot = document.createElement('div');
  foot.className = 'reading__foot';
  const hint = dismissHint();
  foot.appendChild(hint);
  el.appendChild(foot);
  return { el, body, stamp, effect, more, hint };
}

/** A postcard's two sides in `el`: the picture (the place, a painted sky) in front, the written side behind; returns the written side. */
function postcardSides(el: HTMLElement, card: ReadingNotice): HTMLElement {
  const place = card.place ?? card.title ?? 'Somewhere';
  // The sky's hue from the place's name: the same place, the same picture.
  el.style.setProperty('--postcard-hue', String(hashInts(...[...place].map((c) => c.charCodeAt(0))) % 360));
  const sides = document.createElement('div');
  sides.className = 'reading__sides';
  const front = document.createElement('div');
  front.className = 'reading__front';
  front.setAttribute('aria-hidden', 'true');
  const picture = document.createElement('div');
  picture.className = 'reading__picture';
  const greeting = document.createElement('span');
  greeting.className = 'reading__greeting';
  greeting.textContent = 'Greetings from';
  const name = document.createElement('span');
  name.className = 'reading__place';
  name.textContent = place;
  picture.append(greeting, name);
  front.appendChild(picture);
  const back = document.createElement('div');
  back.className = 'reading__back';
  const written = document.createElement('div');
  written.className = 'reading__written';
  const address = document.createElement('div');
  address.className = 'reading__address';
  const postage = document.createElement('span');
  postage.className = 'reading__postage';
  address.appendChild(postage);
  for (let i = 0; i < 3; i++) {
    const line = document.createElement('span');
    line.className = 'reading__address-line';
    address.appendChild(line);
  }
  back.append(written, address);
  sides.append(front, back);
  el.appendChild(sides);
  return written;
}
