import type { Input } from '@/core/Input';
import { CONTROLS } from './controls';
import { ControlsScreen } from './menu/ControlsScreen';
import { isField, moveFocus, navItems } from './menu/MenuNav';
import './menu/menu.css';

type Screen = 'main' | 'settings' | 'controls';

export interface OverlayOptions {
  /** Opens the collection (the pause menu's "Collection" button); no button without it. */
  onCollection?: () => void;
}

const ESSENTIALS = CONTROLS.filter((c) => c.essential).map((c) => `<li>${c.html}</li>`).join('');
const START_FOOT = 'Click, press <kbd>Enter</kbd> or a controller button to start';
const RESUME_FOOT = '<kbd>Enter</kbd> or click outside to resume · <kbd>Start</kbd> on a controller';
const BACK = '<button type="button" class="ui-btn menu__back" data-nav data-action="back">‹ Back</button>';

/**
 * The menus shown while the player is out of the room, plus the in-room crosshair, hover label and hint.
 * - Title screen (before the first entry): Enter the room, Settings, Controls and the essential keys.
 * - Pause menu (Esc afterwards): Resume, Collection, Settings, Controls.
 * - Settings hosts the sections other parts add (`addSetting`), Controls lists `CONTROLS` by tab.
 * Pointer lock needs a user gesture, hence starting on a click (the primary button or the backdrop) or Enter.
 * Arrow keys / D-pad move the focus, Enter / A picks, Esc / B goes back. `wasHandled` tells the
 * `PointerLockFlow` that a controller press was a menu move, not a request to enter the room.
 */
export class Overlay {
  private readonly root: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly screens: Record<Screen, HTMLElement>;
  private readonly settingsBody: HTMLElement;
  private readonly controls = new ControlsScreen();
  private readonly crosshair: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private hintTimer: number | undefined;
  private screen: Screen = 'main';
  private playing = false;
  /** Set on the first entry: from then on the main screen is the pause menu. */
  private started = false;
  /** While a DOM overlay (collection editor) is up, neither the menu nor the crosshair may show. */
  private modal = false;
  /** The last press the menu consumed, read once by `wasHandled`. */
  private handledCode: string | null = null;

  constructor(container: HTMLElement, input: Input, private readonly onStart: () => void, options: OverlayOptions = {}) {
    this.root = document.createElement('div');
    this.root.className = 'overlay menu';
    this.root.innerHTML = `
      <div class="menu__card ui-card" role="dialog" aria-modal="true" aria-label="Menu">
        <section class="menu__screen" data-screen="main">
          <p class="menu__kicker" data-role="kicker" hidden>Paused</p>
          <h1>Bibliothek</h1>
          <p class="menu__tagline" data-role="tagline">A video game collection, one box at a time</p>
          <nav class="menu__buttons">
            <button type="button" class="ui-btn ui-btn--primary" data-nav data-action="start">Enter the room</button>
            ${options.onCollection ? '<button type="button" class="ui-btn" data-nav data-action="collection" hidden>Collection <kbd>Tab</kbd></button>' : ''}
            <button type="button" class="ui-btn" data-nav data-action="settings">Settings</button>
            <button type="button" class="ui-btn" data-nav data-action="controls">Controls</button>
          </nav>
          <ul class="menu__essentials" data-role="essentials">${ESSENTIALS}</ul>
          <p class="menu__foot" data-role="foot">${START_FOOT}</p>
        </section>
        <section class="menu__screen" data-screen="settings" hidden>
          <header class="menu__header">${BACK}<h2>Settings</h2></header>
          <div class="menu__body" data-role="settings"></div>
        </section>
        <section class="menu__screen" data-screen="controls" hidden>
          <header class="menu__header">${BACK}<h2>Controls</h2></header>
        </section>
      </div>`;
    this.card = this.root.querySelector('.menu__card')!;
    const screen = (name: Screen) => this.root.querySelector<HTMLElement>(`[data-screen="${name}"]`)!;
    this.screens = { main: screen('main'), settings: screen('settings'), controls: screen('controls') };
    this.screens.controls.appendChild(this.controls.element);
    this.settingsBody = this.root.querySelector('[data-role="settings"]')!;

    // The backdrop starts (resumes) the game; clicks inside the card only do what they hit.
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) onStart();
    });
    this.card.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
      if (action === 'start') onStart();
      else if (action === 'collection') options.onCollection?.();
      else if (action === 'settings' || action === 'controls') this.show(action);
      else if (action === 'back') this.show('main');
    });
    input.onPress((code, e) => this.onPress(code, e));
    container.appendChild(this.root);
    this.primary.focus({ preventScroll: true });

    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair';
    this.crosshair.hidden = true;
    container.appendChild(this.crosshair);

    this.label = document.createElement('div');
    this.label.className = 'hover-label';
    this.label.hidden = true;
    container.appendChild(this.label);

    this.hint = document.createElement('div');
    this.hint.className = 'hint';
    this.hint.hidden = true;
    container.appendChild(this.hint);
  }

  /** Adds a section to the Settings screen (the graphics level, the cat...). */
  addSetting(title: string, element: HTMLElement, note?: string): void {
    const section = document.createElement('section');
    section.className = 'menu__section';
    const heading = document.createElement('h3');
    heading.textContent = title;
    section.append(heading, element);
    if (note) {
      const p = document.createElement('p');
      p.className = 'menu__note';
      p.textContent = note;
      section.appendChild(p);
    }
    for (const el of element.querySelectorAll<HTMLElement>('button, input, select')) el.dataset.nav = '';
    this.settingsBody.appendChild(section);
  }

  /** Hide the menu and show the crosshair (or the reverse). */
  setPlaying(playing: boolean): void {
    if (playing && !this.started) {
      this.started = true;
      this.renderMain();
    }
    this.playing = playing;
    this.apply();
  }

  /**
   * A modal DOM overlay is open (or just closed). While modal, the menu stays hidden even
   * when the pointer lock drops, and the crosshair is hidden too.
   */
  setModal(modal: boolean): void {
    this.modal = modal;
    if (modal) this.setHoverLabel(null);
    this.apply();
  }

  /** True once if the last press of `code` was consumed by the menu (a move, a pick, a back). */
  wasHandled(code: string): boolean {
    const handled = this.handledCode === code;
    this.handledCode = null;
    return handled;
  }

  private get visible(): boolean {
    return !this.root.hidden;
  }

  private apply(): void {
    const wasVisible = this.visible;
    this.root.hidden = this.playing || this.modal;
    this.crosshair.hidden = !this.playing || this.modal;
    if (this.visible && !wasVisible) {
      this.show('main');
      this.primary.focus({ preventScroll: true });
    } else if (!this.visible && this.card.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
  }

  private get primary(): HTMLElement {
    return this.screens.main.querySelector<HTMLElement>('[data-action="start"]')!;
  }

  private renderMain(): void {
    const q = (role: string) => this.screens.main.querySelector<HTMLElement>(`[data-role="${role}"]`)!;
    q('kicker').hidden = !this.started;
    q('essentials').hidden = this.started;
    q('tagline').hidden = this.started;
    q('foot').innerHTML = this.started ? RESUME_FOOT : START_FOOT;
    this.primary.textContent = this.started ? 'Resume' : 'Enter the room';
    const collection = this.screens.main.querySelector<HTMLElement>('[data-action="collection"]');
    if (collection) collection.hidden = !this.started;
  }

  private show(screen: Screen): void {
    const from = this.screen;
    this.screen = screen;
    for (const [name, el] of Object.entries(this.screens)) el.hidden = name !== screen;
    this.card.classList.toggle('menu__card--wide', screen === 'controls');
    if (screen === from) return;
    // Back on the main screen, the focus returns to the button that opened the sub-screen.
    const target = screen === 'main' ? this.screens.main.querySelector<HTMLElement>(`[data-action="${from}"]`) : navItems(this.screens[screen])[1];
    (target ?? navItems(this.screens[screen])[0])?.focus({ preventScroll: true });
  }

  private onPress(code: string, e: KeyboardEvent): void {
    if (!this.visible) return;
    const focused = document.activeElement;
    const inCard = focused instanceof HTMLElement && this.card.contains(focused);
    const handled = () => {
      this.handledCode = code;
      e.preventDefault();
    };
    switch (code) {
      case 'ArrowDown':
      case 'GamepadDown':
        if (code === 'ArrowDown' && focused instanceof HTMLSelectElement) return; // the select's own options
        moveFocus(this.screens[this.screen], 1);
        return handled();
      case 'ArrowUp':
      case 'GamepadUp':
        if (code === 'ArrowUp' && focused instanceof HTMLSelectElement) return; // the select's own options
        moveFocus(this.screens[this.screen], -1);
        return handled();
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'GamepadLeft':
      case 'GamepadRight':
        if (this.screen !== 'controls' || isField(focused)) return;
        this.controls.step(code.endsWith('Left') ? -1 : 1);
        return handled();
      case 'Escape':
      case 'GamepadB':
        if (this.screen !== 'main') this.show('main');
        return handled();
      case 'Enter':
      case 'NumpadEnter':
      case 'Space':
        if (isField(focused)) return; // typing the cat's name
        e.preventDefault();
        if (inCard && focused instanceof HTMLButtonElement) focused.click();
        else if (this.screen === 'main') this.onStart();
        return;
      case 'GamepadA':
        // On the primary button the press enters the room (the PointerLockFlow's controller mode).
        if (!inCard || focused === this.primary || !(focused instanceof HTMLButtonElement)) return;
        focused.click();
        return handled();
    }
  }

  /** Small caption naming the object being looked at: under the crosshair, or along the top edge so it never covers a playing screen. */
  setHoverLabel(text: string | null, placement: 'crosshair' | 'edge' = 'crosshair'): void {
    this.label.hidden = !text;
    if (text) this.label.textContent = text;
    this.label.classList.toggle('hover-label--edge', placement === 'edge');
  }

  showHint(message: string, durationMs = 2500): void {
    this.hint.textContent = message;
    this.hint.hidden = false;
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => (this.hint.hidden = true), durationMs);
  }
}
