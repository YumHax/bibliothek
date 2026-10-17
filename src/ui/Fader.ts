import './Fader.css';
import type { TravelCard } from '@/world/travel/Travel';

/** How long the curtain stays down before it shows where it is going (ms): a quick trip never shows its card. */
const CARD_AFTER_MS = 350;
/** A first trip somewhere (no time measured yet): how long the bar takes to creep to its first marks (ms). */
const FIRST_GUESS_MS = 4000;

/**
 * Full-screen curtain for teleports: `out()` covers the view, `in()` reveals it, both awaitable. A trip may tint it
 * with the light of where it goes (warm for a shop, the sky's for the street) and show the place's card
 * (`destination`): its name, where it is, a photo of it as the player last left it (`world/travel/travelCards`) and a
 * bar that `progress` moves on (the module fetched, the zone built, its shaders compiled), creeping between the marks
 * at the pace the last trip there took. The card shows only if the curtain is still down after `CARD_AFTER_MS`. A night's
 * sleep uses the curtain without a card.
 */
export class Fader {
  private readonly el: HTMLDivElement;
  private readonly card: HTMLElement;
  private readonly photo: HTMLDivElement;
  private readonly place: HTMLParagraphElement;
  private readonly name: HTMLParagraphElement;
  private readonly bar: HTMLDivElement;
  private cardTimer = 0;
  private expectMs = FIRST_GUESS_MS;
  private share = 0;

  constructor(container: HTMLElement) {
    this.el = document.createElement('div');
    this.el.className = 'fader';
    this.el.style.opacity = '0';
    this.el.hidden = true;
    this.card = document.createElement('figure');
    this.card.className = 'fader__card';
    this.card.hidden = true;
    this.photo = document.createElement('div');
    this.photo.className = 'fader__photo';
    this.place = document.createElement('p');
    this.place.className = 'fader__place';
    this.name = document.createElement('p');
    this.name.className = 'fader__name';
    const track = document.createElement('div');
    track.className = 'fader__track';
    this.bar = document.createElement('div');
    this.bar.className = 'fader__bar';
    track.appendChild(this.bar);
    const caption = document.createElement('figcaption');
    caption.className = 'fader__caption';
    caption.append(this.place, this.name, track);
    this.card.append(this.photo, caption);
    this.card.setAttribute('role', 'status');
    this.el.appendChild(this.card);
    container.appendChild(this.el);
  }

  /** Covers the view, in `tint` (a CSS colour; black by default) if given. */
  out(ms = 350, tint?: string): Promise<void> {
    this.el.style.backgroundColor = tint ?? '';
    this.el.hidden = false;
    return this.animate('1', ms);
  }

  /** Shows where the trip goes, should the curtain still be down in a moment. */
  destination(card: TravelCard): void {
    window.clearTimeout(this.cardTimer);
    this.name.textContent = card.label;
    this.place.textContent = card.place ?? '';
    this.place.hidden = !card.place;
    this.photo.style.backgroundImage = card.photo ? `url("${card.photo}")` : '';
    this.card.classList.toggle('fader__card--photo', !!card.photo);
    this.expectMs = card.expectMs ?? FIRST_GUESS_MS;
    this.setBar(0, 0);
    this.cardTimer = window.setTimeout(() => {
      this.card.hidden = false;
      // From where the trip is now, creep towards its next mark at the remembered pace.
      this.creep();
    }, CARD_AFTER_MS);
  }

  /** How far the trip is, 0..1: the bar jumps there, then creeps towards the next mark. */
  progress(share: number): void {
    this.share = Math.max(this.share, share);
    if (this.card.hidden) return;
    this.creep();
  }

  async in(ms = 450): Promise<void> {
    window.clearTimeout(this.cardTimer);
    if (!this.card.hidden) this.setBar(1, 180);
    await this.animate('0', ms);
    this.el.hidden = true;
    this.card.hidden = true;
    this.share = 0;
    this.el.style.backgroundColor = '';
  }

  /** The bar to where the trip is, then on towards the next mark (never past it) over the share of the trip it covers. */
  private creep(): void {
    const marks = [0.1, 0.45, 0.75, 1];
    const next = marks.find((m) => m > this.share + 1e-3) ?? 1;
    this.setBar(this.share, 120);
    // A transition timed on the remembered trip: it runs on the compositor, so it keeps moving while the main thread builds.
    window.requestAnimationFrame(() => this.setBar(this.share + (next - this.share) * 0.9, Math.max(300, (next - this.share) * this.expectMs)));
  }

  private setBar(share: number, ms: number): void {
    this.bar.style.transitionDuration = `${ms}ms`;
    this.bar.style.transform = `scaleX(${Math.min(1, Math.max(0, share)).toFixed(3)})`;
  }

  private animate(opacity: string, ms: number): Promise<void> {
    this.el.style.transitionDuration = `${ms}ms`;
    // Force a style flush so the transition starts from the current opacity.
    void this.el.offsetWidth;
    this.el.style.opacity = opacity;
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }
}
