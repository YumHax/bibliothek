import { saidLines } from '@/notices/speechLog';
import { everyone } from '@/social/people';
import { standing } from '@/social/standing';
import { tierInfo, tierOf } from '@/social/tiers';
import type { PersonId } from '@/social/types';
import { CardPanel } from './panel/CardPanel';
import { html, type Html } from './panel/html';
import { emptyState } from './panel/widgets';
import { portrait } from './social/portrait';
import './SaidPanel.css';

/** The face drawn beside a line (px). */
const FACE_PX = 34;

/**
 * "What was said": the last lines people said to the player, newest first, as the little balloons they came in, the
 * speaker's face beside them when it is someone the player can know, the cards read (a letter, the radio) as slips of
 * paper; lines in a row from one speaker under one face. To read again what went by too fast (the pause menu's
 * button). A `ModalLike` the Session opens through `openPanel`.
 */
export class SaidPanel extends CardPanel {
  constructor(container: HTMLElement) {
    super(container, { className: 'said-panel', cardClass: 'said-panel__card ui-card', title: 'What was said', dismissAutofocus: true });
  }

  protected render(): Html {
    const lines = saidLines();
    if (!lines.length) return emptyState('What people say to you, and the cards you read, wait here to be read again.', { pictogram: 'letter', title: 'Nobody has said anything yet', className: 'said-panel__empty' });
    const ids = idsByName();
    const now = Date.now();
    const runs: { name?: string; card?: boolean; texts: string[]; when: string }[] = [];
    for (const line of lines) {
      const last = runs[runs.length - 1];
      const when = whenWords(line.at, now);
      if (last && !line.card && !last.card && last.name === line.name && last.when === when) last.texts.push(line.text);
      else runs.push({ name: line.name, card: line.card, texts: [line.text], when });
    }
    return html`<ol class="said-panel__lines">${runs.map((run, i) => {
      const head = i === 0 || runs[i - 1]!.when !== run.when ? html`<li class="said-panel__when">${run.when}</li>` : '';
      return html`${head}${this.run(run, ids)}`;
    })}</ol>`;
  }

  /** One speaker's lines in a row (their face, the balloons), or a card read as a paper slip. */
  private run(run: { name?: string; card?: boolean; texts: string[] }, ids: Map<string, PersonId>): Html {
    if (run.card)
      return html`<li class="said-panel__card-read"><span class="said-panel__eyebrow">Read</span>${run.name ? html`<b>${run.name}</b>` : ''}${run.texts.map((t) => html`<p>${t}</p>`)}</li>`;
    const id = run.name ? ids.get(run.name) : undefined;
    return html`<li class="said-panel__run">
      <span class="said-panel__face"${id ? html` data-portrait="${id}"` : ''} aria-hidden="true">${id ? '' : (run.name ?? '…').slice(0, 1)}</span>
      <div class="said-panel__said">${run.name ? html`<b class="said-panel__who">${run.name}</b>` : ''}${run.texts.map((t) => html`<p class="said-panel__balloon">${t}</p>`)}</div>
    </li>`;
  }

  /** The faces are drawn canvases: dropped into their slots after the markup. */
  protected override repaint(): void {
    super.repaint();
    for (const slot of this.body.querySelectorAll<HTMLElement>('[data-portrait]')) {
      const id = slot.dataset.portrait as PersonId;
      const s = standing(id);
      slot.appendChild(portrait(id, FACE_PX, tierInfo(tierOf(s.warmth, s.trust)).colour));
    }
  }
}

/** When a line was said, as a separator says it: "Just now", "An hour ago", "Earlier today", "Yesterday", "Before". */
function whenWords(at: number | undefined, now: number): string {
  if (at === undefined) return 'Before';
  const minutes = (now - at) / 60_000;
  if (minutes < 5) return 'Just now';
  if (minutes < 45) return 'A few minutes ago';
  if (minutes < 120) return 'An hour ago';
  const then = new Date(at);
  const today = new Date(now);
  if (then.toDateString() === today.toDateString()) return 'Earlier today';
  today.setDate(today.getDate() - 1);
  if (then.toDateString() === today.toDateString()) return 'Yesterday';
  return 'Before';
}

/** Who a speaker's name belongs to: lines are kept with the name said ("Mrs Roux", "Victor"). */
function idsByName(): Map<string, PersonId> {
  const ids = new Map<string, PersonId>();
  for (const card of everyone()) {
    ids.set(card.name, card.id);
    if (card.short) ids.set(card.short, card.id);
  }
  return ids;
}
