import type { PlatformId } from '@/catalog/types';
import type { StockItem } from '@/economy/StockItem';
import type { PersonId } from '@/social/types';
import { standing } from '@/social/standing';
import { tierInfo, tierOf } from '@/social/tiers';
import { html, type Html } from '../panel/html';
import { icon } from '../social/icons';
import type { PhoneLine } from './phoneLines';

/*
 * The phone's call screen (docs/social.md "The phone"): whoever was rung, big, with the state of the line in words
 * (Calling…, No answer, On the line, Call ended), then what they said as balloons by their faces, and the one red
 * button. Markup only; `PhonePanel` runs the call.
 */

/** Who is on the other end: their name, a word under it ("the NES stall", "flat 3"), their face if they are someone. */
export interface Callee {
  name: string;
  sub: string;
  face: PersonId | null;
}

/** A call, from the first ring to its end. */
export type PhoneCall =
  | { state: 'ringing'; who: Callee }
  | { state: 'missed'; who: Callee; why: string }
  | { state: 'talk'; who: Callee; lines: readonly PhoneLine[] }
  | { state: 'stall'; who: Callee; platform: PlatformId; items: readonly StockItem[] | null; said: readonly PhoneLine[] };

/** Whether the line is still open (a red Hang up), or it is over (a plain Back). */
export function lineOpen(call: PhoneCall): boolean {
  return call.state === 'ringing' || call.state === 'stall' || (call.state === 'talk' && call.lines.some((l) => l.kind === 'said'));
}

/** A face in its tier's ring, painted after the markup (`PhonePanel.repaint` fills `[data-portrait]`). */
export function faceSlot(id: PersonId, size: number, className = 'phone-face'): Html {
  const s = standing(id);
  return html`<span class="${className}" data-portrait="${id}" data-size="${size}" style="--tier:${tierInfo(tierOf(s.warmth, s.trust)).colour}; --face:${size}px"></span>`;
}

/** Someone who is not a person of the game (a paper, a seller from the ads): their initials on a disc. */
export function initialsSlot(name: string, size: number, className = 'phone-face'): Html {
  const words = name.replace(/^THE\s+/i, '').split(/[\s,]+/).filter((w) => /^\p{L}/u.test(w));
  const letters = words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('');
  return html`<span class="${className} ${className}--initials" style="--face:${size}px" aria-hidden="true">${letters}</span>`;
}

/** The face of whoever is rung or speaks: theirs if they are someone, else their initials. */
function calleeFace(who: Callee, size: number, className?: string): Html {
  return who.face ? faceSlot(who.face, size, className) : initialsSlot(who.name, size, className);
}

/** What the line says now, in words. */
function lineState(call: PhoneCall): string {
  switch (call.state) {
    case 'ringing': return 'Calling…';
    case 'missed': return 'No answer';
    case 'stall': return 'On the line';
    case 'talk': return lineOpen(call) ? 'On the line' : 'Call ended';
  }
}

/** Their words as balloons by their faces, the asides as notes. `speaker` finds the face of a name said before a quote. */
export function talkHtml(lines: readonly PhoneLine[], who: Callee, speaker: (name: string) => PersonId | null): Html {
  return html`${lines.map((line) => {
    if (line.kind === 'note') return html`<p class="phone-call__note">${line.words}</p>`;
    const name = line.who ?? who.name;
    const id = line.who ? speaker(line.who) : who.face;
    return html`<div class="phone-said">
      ${id ? faceSlot(id, 30, 'phone-said__face') : initialsSlot(name, 30, 'phone-said__face')}
      <p class="phone-said__bubble"><b>${name}</b>${line.words}</p>
    </div>`;
  })}`;
}

/**
 * The call screen: the face (rings pulsing out while it rings), the name and the line's state, what goes on (`talk`:
 * balloons, a stall's table), and the button that ends it: red Hang up while the line is open, Back once it is over.
 */
export function callScreen(call: PhoneCall, talk: Html): Html {
  const open = lineOpen(call);
  const sub = call.state === 'missed' ? call.why : call.who.sub;
  return html`<section class="phone-call phone-call--${call.state}" aria-label="${lineState(call)}: ${call.who.name}">
    <div class="phone-call__head">
      <span class="phone-call__halo">${calleeFace(call.who, 76, 'phone-call__face')}</span>
      <h2 class="phone-call__name">${call.who.name}</h2>
      <p class="phone-call__sub">${sub}</p>
      <p class="phone-call__state">${lineState(call)}</p>
    </div>
    <div class="phone-call__talk">${talk}</div>
    <div class="phone-call__keys">
      <button type="button" class="phone-call__end${open ? '' : ' phone-call__end--back'}" data-action="hangup" data-autofocus>
        <span class="phone-call__end-disc">${icon(open ? 'handset' : 'arrowLeft', 1.25)}</span>${open ? 'Hang up' : 'Back'}
      </button>
    </div>
  </section>`;
}
