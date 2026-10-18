import type { Input } from '@/core/Input';
import { Listeners } from '@/core/Listeners';
import { html, paint, type Html } from './panel/html';
import { pictogram, pictogramSprite } from './panel/pictograms';
import { registerPanel } from './menu/MenuNav';
import { fadeIn, fadeOut } from './fade';
import { lastDevice } from '@/input/lastDevice';
import './TravelMenu.css';

/** Somewhere the player can go from a door; `key` is the physical code that picks it (Digit1...). */
export interface TravelChoice<Id extends string = string> {
  id: Id;
  label: string;
  /** Where it is, a few words ("Front Street", "The building"): the menu groups the places under it. */
  place?: string;
  /** A small photo of it as the player last left it (a JPEG data URL, `world/travel/travelCards`). */
  photo?: string;
}

const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9'];

/** The order the groups come in, nearest first, and the little drawing a place without a photo gets. */
const PLACES: readonly { place: string; pictogram: string }[] = [
  { place: 'Home', pictogram: 'house' },
  { place: 'The building', pictogram: 'door' },
  { place: 'Front Street', pictogram: 'stall' },
  { place: 'Linden Avenue', pictogram: 'heart' },
  { place: 'Across town', pictogram: 'parcel' },
];

function placeRank(place: string | undefined): number {
  const at = PLACES.findIndex((p) => p.place === place);
  return at === -1 ? PLACES.length : at;
}

/**
 * The little panel a door opens: "Where to?", the places grouped by where they are (home, the building, Front
 * Street...), each with the photo of it as it was last left, and Stay. Works under pointer lock (press the digit),
 * with a free cursor (click), on a touch screen (tap), and with a controller (the first line has the focus: A goes,
 * the D-pad walks the lines, B stays, through `registerPanel`). The Session freezes walking while it is open and
 * reacts to `onPick` / `onCancel`; Esc under pointer lock unlocks the mouse instead, which the Session treats as a
 * cancel too.
 */
export class TravelMenu<Id extends string = string> {
  private readonly root: HTMLDivElement;
  private readonly list: HTMLElement;
  private readonly stay: HTMLElement;
  private choices: TravelChoice<Id>[] = [];
  private readonly pickListeners = new Listeners<[id: Id]>();
  private readonly cancelListeners = new Listeners<[]>();
  /** Open (the card fades out after closing, so `hidden` lags behind). */
  private shown = false;

  constructor(container: HTMLElement, input: Input) {
    this.root = document.createElement('div');
    this.root.className = 'travel-menu';
    this.root.hidden = true;
    paint(
      this.root,
      html`<div class="travel-menu__card ui-card" role="dialog" aria-modal="true" aria-labelledby="travel-menu-title">
        ${pictogramSprite()}
        <h2 id="travel-menu-title">Where to?</h2>
        <div class="travel-menu__places"></div>
        <button type="button" class="ui-btn travel-menu__stay" data-action="stay">Stay</button>
      </div>`,
    );
    this.list = this.root.querySelector('.travel-menu__places')!;
    this.stay = this.root.querySelector('[data-action="stay"]')!;
    container.appendChild(this.root);

    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const choice = target.closest<HTMLElement>('[data-id]');
      const picked = choice && this.choices.find((c) => c.id === choice.dataset.id);
      if (picked) this.pick(picked.id);
      else if (target.closest('[data-action="stay"]')) this.cancel();
    });
    input.onPress((code, e) => {
      if (!this.isOpen) return;
      const i = DIGITS.indexOf(code);
      if (i !== -1 && this.choices[i]) {
        e.preventDefault();
        this.pick(this.choices[i]!.id);
      } else if (code === 'Escape') {
        this.cancel();
      }
    });
    registerPanel(this.root, { isOpen: () => this.isOpen, onBack: () => this.cancel() });
  }

  /** Calls `listener` with the destination picked; returns the unsubscribe. */
  onPick(listener: (id: Id) => void): () => void {
    return this.pickListeners.add(listener);
  }

  /** Calls `listener` when the player stays (Stay, Esc, B); returns the unsubscribe. */
  onCancel(listener: () => void): () => void {
    return this.cancelListeners.add(listener);
  }

  get isOpen(): boolean {
    return this.shown;
  }

  open(choices: TravelChoice<Id>[]): void {
    // Grouped by where they are, nearest first; the digits follow the order shown.
    this.choices = choices.map((c, i) => ({ c, i })).sort((a, b) => placeRank(a.c.place) - placeRank(b.c.place) || a.i - b.i).map(({ c }) => c);
    // Key caps for the device in hand: the digits and Esc on a keyboard, B on a controller (A takes the focused line), none on a touchscreen.
    const device = lastDevice();
    const groups: { place: string | undefined; items: { choice: TravelChoice<Id>; index: number }[] }[] = [];
    this.choices.forEach((choice, index) => {
      const last = groups[groups.length - 1];
      if (last && last.place === choice.place) last.items.push({ choice, index });
      else groups.push({ place: choice.place, items: [{ choice, index }] });
    });
    // One group needs no heading: the places say it.
    const showHeads = groups.length > 1;
    paint(
      this.list,
      html`${groups.map(
        (g) => html`<section class="travel-menu__group">
          ${showHeads && g.place ? html`<h3 class="travel-menu__place">${g.place}</h3>` : ''}
          <ul>${g.items.map(({ choice, index }) => html`<li>${this.stopButton(choice, index, device === 'keyboard')}</li>`)}</ul>
        </section>`,
      )}`,
    );
    const stayCap = device === 'keyboard' ? 'Esc' : device === 'gamepad' ? 'B' : null;
    paint(this.stay, html`${stayCap ? html`<kbd>${stayCap}</kbd> ` : ''}Stay`);
    this.shown = true;
    fadeIn(this.root, 'travel-menu--closing');
    // The first destination has the focus: a controller's A takes it, the D-pad walks on, a tap picks any.
    this.list.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }

  close(): void {
    this.shown = false;
    fadeOut(this.root, 'travel-menu--closing', 150);
    if (this.root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
  }

  /** One place: its photo (or the drawing of its kind of place), its name, its digit on a keyboard. */
  private stopButton(choice: TravelChoice<Id>, index: number, digits: boolean): Html {
    const drawing = PLACES.find((p) => p.place === choice.place)?.pictogram ?? 'door';
    const picture = choice.photo
      ? html`<img class="travel-menu__photo" src="${choice.photo}" alt="" />`
      : html`<span class="travel-menu__photo travel-menu__photo--none">${pictogram(drawing, 'travel-menu__drawing')}</span>`;
    const cap = digits && index < DIGITS.length ? html`<kbd>${index + 1}</kbd>` : '';
    return html`<button type="button" class="ui-btn travel-menu__stop" data-id="${choice.id}">${picture}<span class="travel-menu__name">${choice.label}</span>${cap}</button>`;
  }

  private pick(id: Id): void {
    this.close();
    this.pickListeners.emit(id);
  }

  private cancel(): void {
    if (!this.isOpen) return;
    this.close();
    this.cancelListeners.emit();
  }
}
