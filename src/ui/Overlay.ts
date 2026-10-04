import type { Input } from '@/core/Input';
import { playUiSound } from '@/audio/uiSounds';
import { CONTROLS, type ControlDevice, type ControlGroup } from './controls';
import { escapeHtml } from './html';
import { onKeyLabelsChange, renderKeys } from './keys';
import { ControlsScreen } from './menu/ControlsScreen';
import { isField, moveFocus, navItems, panelOpen } from './menu/MenuNav';
import './menu/menu.css';
import { onWorldLoad } from './worldLoad';
import { fadeIn, fadeOut } from './fade';
import { parseCaption } from './hoverCaption';
import { hudSlot } from './hudSlot';
import { lastDevice, onDeviceChange } from '@/input/lastDevice';

/** The world is slow to load: past this (ms) the waiting button says it is still at it. */
const STILL_LOADING_MS = 10_000;

type Screen = 'main' | 'settings' | 'controls' | 'confirm';

/** The Settings screen's tabs; `addSetting` names one. */
export type SettingsTab = 'display' | 'audio' | 'controls' | 'game';
const SETTINGS_TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'display', label: 'Display' },
  { id: 'audio', label: 'Audio' },
  { id: 'controls', label: 'Controls' },
  { id: 'game', label: 'Game' },
];

/** A yes / no question asked inside the menu card (no browser dialog: it would block the page). */
export interface ConfirmOptions {
  title: string;
  message: string;
  /** The confirming button's text. */
  yes: string;
  /** Paints the confirming button in the warning colour. */
  danger?: boolean;
  onYes(): void;
}

interface OverlayOptions {
  /** Opens the collection (the pause menu's "Collection" button); no button without it. */
  onCollection?: () => void;
  /** The pause menu's summary: label / value pairs (coins, tickets, games, where the player is). */
  status?: () => Array<[label: string, value: string]>;
  /** The pause menu's "Go home" while the player is out (the arcade, the market, the street). */
  goHome?: { available(): boolean; go(): void };
  /** The Controls tab that fits where the player is. */
  controlsGroup?: () => ControlGroup;
  /** A game is under way: the title screen offers Continue and New game. */
  hasProgress?: boolean;
  /** Wipes the progress and starts over (after the menu's own confirmation). */
  onNewGame?: () => void;
  /** Shown small under the title screen. */
  version?: string;
  /**
   * Settings > Display > Text size, also right on the touch start card: a phone cannot pinch-zoom the page
   * (the 3D view needs every gesture), so the size is one tap away before the first entry.
   */
  textSize?: { get(): 'small' | 'normal' | 'large'; set(size: 'small' | 'normal' | 'large'): void };
}

const TEXT_SIZES = [
  { id: 'small', label: 'Small' },
  { id: 'normal', label: 'Normal' },
  { id: 'large', label: 'Large' },
] as const;

const START_FOOT = 'Click, press <kbd>Enter</kbd> or a controller button to start';
const RESUME_FOOT = '<kbd>Enter</kbd> or click outside to resume · <kbd>Start</kbd> on a controller';
const TOUCH_FOOT = 'Tap a button';
const BACK = '<button type="button" class="ui-btn menu__back" data-nav data-action="back">‹ Back</button>';

/**
 * The menus shown while the player is out of the room, plus the in-room crosshair and hover label (what the game tells
 * the player is `src/notices`').
 * - Title screen (before the first entry): Enter the room (or Continue / New game over a save), Settings, Controls and the essential keys.
 * - Pause menu (Esc afterwards): where the player stands and what they have, Resume, Go home (when out), Collection, Settings, Controls.
 * - Settings hosts the sections other parts add (`addSetting`), in tabs; Controls lists `CONTROLS` by tab and device;
 *   `confirm` asks a yes / no question in the card.
 * Pointer lock needs a user gesture, hence starting on a click (the primary button or the backdrop) or Enter.
 * Arrow keys / D-pad move the focus, Enter / A picks, Esc / B goes back. `wasHandled` tells the
 * `PointerLockFlow` that a controller press was a menu move, not a request to enter the room.
 */
export class Overlay {
  private readonly root: HTMLDivElement;
  private readonly card: HTMLDivElement;
  private readonly screens: Record<Screen, HTMLElement>;
  private readonly settingsTabs: HTMLElement;
  private readonly settingsBodies = new Map<SettingsTab, HTMLElement>();
  private settingsTab: SettingsTab = 'display';
  private readonly controls = new ControlsScreen();
  private readonly crosshair: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private screen: Screen = 'main';
  /** The screen a confirmation returns to, and what it confirms. */
  private confirmFrom: Screen = 'main';
  private pendingConfirm: ConfirmOptions | null = null;
  private playing = false;
  /** Set on the first entry: from then on the main screen is the pause menu. */
  private started = false;
  /** While a DOM overlay (collection editor) is up, neither the menu nor the crosshair may show. */
  private modal = false;
  /** The last press the menu consumed, read once by `wasHandled`. */
  private handledCode: string | null = null;
  /** What the player last used (`input/lastDevice`), for the Controls screen, the foot line and the caption's key cap. */
  private device: ControlDevice = lastDevice();
  private hud = { crosshair: true, hoverLabel: true };
  private hoverText: string | null = null;
  private hoverPlacement: 'crosshair' | 'edge' = 'crosshair';
  /** The caption's pending hide (a short delay, so sweeping across two things does not blink it). */
  private hoverHide: number | undefined;
  /** The menu is up (it fades out before `hidden`, so `root.hidden` lags behind). */
  private shown = true;
  /** A panel closed without a gesture: the card only asks for the click the mouse lock needs (`promptReturn`). */
  private returning = false;
  /** The world is not ready yet: the primary button waits ("Opening the door…"). */
  private loading = true;
  /** The "still loading" line's timer, while the world loads. */
  private loadingSlow: number | undefined;
  /** The mouse lock is being asked for again after the browser's cooldown (`setResuming`): the card waits, quietly. */
  private resuming = false;
  /** The pause menu's added buttons (`addPauseButton`), by their `data-action`. */
  private readonly pauseActions = new Map<string, () => void>();
  /** The pause buttons shown only when their predicate holds (read each time the menu opens). */
  private readonly pauseShown = new Map<string, () => boolean>();

  constructor(container: HTMLElement, input: Input, private readonly onStart: () => void, private readonly options: OverlayOptions = {}) {
    const resuming = options.hasProgress === true;
    this.root = document.createElement('div');
    this.root.className = 'overlay menu';
    this.root.innerHTML = `
      <div class="menu__card ui-card" role="dialog" aria-modal="true" aria-label="Menu">
        <section class="menu__screen" data-screen="main">
          <p class="menu__return" data-role="return" role="button" tabindex="0" hidden>Click or press Enter to return to the room</p>
          <p class="menu__kicker" data-role="kicker" hidden>Paused</p>
          <h1>Bibliothek</h1>
          <p class="menu__tagline" data-role="tagline">A video game collection, one box at a time</p>
          <dl class="menu__status" data-role="status" hidden></dl>
          <nav class="menu__buttons">
            <button type="button" class="ui-btn ui-btn--primary" data-nav data-action="start">${resuming ? 'Continue' : 'Enter the room'}</button>
            ${resuming && options.onNewGame ? '<button type="button" class="ui-btn" data-nav data-action="new-game">New game</button>' : ''}
            ${options.goHome ? '<button type="button" class="ui-btn" data-nav data-action="home" hidden>Go home</button>' : ''}
            ${options.onCollection ? '<button type="button" class="ui-btn" data-nav data-action="collection" hidden>Collection <kbd data-key="Tab"></kbd></button>' : ''}
            <button type="button" class="ui-btn" data-nav data-action="settings">Settings</button>
            <button type="button" class="ui-btn" data-nav data-action="controls">Controls</button>
          </nav>
          <ul class="menu__essentials" data-role="essentials"></ul>
          ${options.textSize ? `<div class="menu__text-size" data-role="text-size" role="radiogroup" aria-label="Text size" hidden><span>Text size</span>${TEXT_SIZES.map((t) => `<button type="button" class="ui-btn" role="radio" data-nav data-text-size="${t.id}">${t.label}</button>`).join('')}</div>` : ''}
          <p class="menu__foot" data-role="foot"></p>
          ${options.version ? `<p class="menu__version" data-role="version">v${escapeHtml(options.version)} · progress saves automatically</p>` : ''}
        </section>
        <section class="menu__screen" data-screen="settings" hidden>
          <header class="menu__header">${BACK}<h2>Settings</h2></header>
          <div class="menu__tabs" role="tablist" aria-label="Settings">
            ${SETTINGS_TABS.map((t) => `<button type="button" class="ui-btn" role="tab" id="settings-tab-${t.id}" aria-controls="settings-${t.id}" data-nav data-tab="${t.id}">${t.label}</button>`).join('')}
          </div>
          ${SETTINGS_TABS.map((t) => `<div class="menu__body" role="tabpanel" id="settings-${t.id}" aria-labelledby="settings-tab-${t.id}" data-body="${t.id}" hidden></div>`).join('')}
        </section>
        <section class="menu__screen" data-screen="controls" hidden>
          <header class="menu__header">${BACK}<h2>Controls</h2></header>
        </section>
        <section class="menu__screen menu__confirm" data-screen="confirm" hidden role="alertdialog" aria-labelledby="menu-confirm-title" aria-describedby="menu-confirm-message">
          <h2 id="menu-confirm-title"></h2>
          <p id="menu-confirm-message"></p>
          <div class="menu__confirm-buttons">
            <button type="button" class="ui-btn" data-nav data-action="confirm-no">Cancel</button>
            <button type="button" class="ui-btn ui-btn--primary" data-nav data-action="confirm-yes"></button>
          </div>
        </section>
      </div>`;
    this.card = this.root.querySelector('.menu__card')!;
    const screen = (name: Screen) => this.root.querySelector<HTMLElement>(`[data-screen="${name}"]`)!;
    this.screens = { main: screen('main'), settings: screen('settings'), controls: screen('controls'), confirm: screen('confirm') };
    this.screens.controls.appendChild(this.controls.element);
    this.settingsTabs = this.screens.settings.querySelector('.menu__tabs')!;
    for (const t of SETTINGS_TABS) this.settingsBodies.set(t.id, this.screens.settings.querySelector<HTMLElement>(`[data-body="${t.id}"]`)!);
    this.selectSettingsTab(this.settingsTab);

    // The backdrop resumes the game with a mouse (a stray tap on a phone should not); clicks inside the card only do what they hit.
    this.root.addEventListener('click', (e) => {
      if (this.returning) {
        onStart();
        return;
      }
      if (e.target === this.root && this.device !== 'touch' && this.screen === 'main' && !this.loading) onStart();
    });
    this.card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const tab = target.closest<HTMLElement>('[data-tab]')?.dataset.tab as SettingsTab | undefined;
      if (tab) this.selectSettingsTab(tab);
      const size = target.closest<HTMLElement>('[data-text-size]')?.dataset.textSize as 'small' | 'normal' | 'large' | undefined;
      if (size && options.textSize) {
        options.textSize.set(size);
        playUiSound('pick');
        this.renderTextSize();
      }
      const action = target.closest<HTMLElement>('[data-action]')?.dataset.action;
      if (!action) return;
      playUiSound(action === 'back' || action === 'confirm-no' ? 'back' : 'pick');
      if (action === 'start') onStart();
      else if (action === 'collection') options.onCollection?.();
      else if (action === 'home') options.goHome?.go();
      else if (action === 'settings' || action === 'controls') this.show(action);
      else if (this.pauseActions.has(action)) this.pauseActions.get(action)!();
      else if (action === 'back') this.show('main');
      else if (action === 'new-game') this.confirmNewGame();
      else if (action === 'confirm-no') this.show(this.confirmFrom);
      else if (action === 'confirm-yes') {
        const pending = this.pendingConfirm;
        this.show(this.confirmFrom);
        pending?.onYes();
      }
    });
    input.onPress((code, e) => this.onPress(code, e));
    // The device last used decides what the Controls screen shows first, whether the backdrop resumes and the caption's key cap.
    onDeviceChange((device) => this.setDevice(device));
    onKeyLabelsChange(() => this.renderKeys());
    container.appendChild(this.root);
    this.renderMain();
    this.primary.focus({ preventScroll: true });

    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair';
    this.crosshair.hidden = true;
    container.appendChild(this.crosshair);

    // First in the column under the crosshair (`hudSlot`): the click's reaction and the touch badge stack under it.
    this.label = document.createElement('div');
    this.label.className = 'hover-label';
    this.label.hidden = true;
    hudSlot(container, 'crosshair').appendChild(this.label);

    document.body.classList.add('menu-open');
    // The primary button waits for the world (the first zone loaded); a failure is the bootstrap's alert.
    onWorldLoad((state) => this.setLoading(state !== 'ready'));
  }

  /** While the world loads the primary button is disabled and says so; the backdrop and Enter wait too. */
  private setLoading(loading: boolean): void {
    this.loading = loading;
    const primary = this.primary;
    primary.toggleAttribute('disabled', loading);
    primary.setAttribute('aria-busy', String(loading));
    window.clearTimeout(this.loadingSlow);
    if (loading) {
      // The ellipsis ticks (`menu__dots`); a slow connection is told the door is still being opened.
      primary.innerHTML = 'Opening the door<span class="menu__dots" aria-hidden="true"></span>';
      primary.setAttribute('aria-label', 'Opening the door');
      this.loadingSlow = window.setTimeout(() => {
        if (!this.loading) return;
        primary.innerHTML = 'Opening the door, still loading<span class="menu__dots" aria-hidden="true"></span>';
        primary.setAttribute('aria-label', 'Opening the door, still loading');
      }, STILL_LOADING_MS);
    } else {
      primary.removeAttribute('aria-label');
      this.renderPrimary();
      if (this.visible && (document.activeElement === document.body || document.activeElement === null)) primary.focus({ preventScroll: true });
    }
  }

  /**
   * The browser refused the mouse lock (its cooldown after Esc) and it is being asked for again: the
   * card stays up, its button (or the return line) says "Resuming…" and waits. Off: back to its word.
   */
  setResuming(resuming: boolean): void {
    if (resuming === this.resuming) return;
    this.resuming = resuming;
    const primary = this.primary;
    const line = this.screens.main.querySelector<HTMLElement>('[data-role="return"]')!;
    primary.toggleAttribute('disabled', resuming || this.loading);
    primary.setAttribute('aria-busy', String(resuming || this.loading));
    if (resuming) {
      primary.innerHTML = 'Resuming<span class="menu__dots" aria-hidden="true"></span>';
      line.innerHTML = 'Resuming<span class="menu__dots" aria-hidden="true"></span>';
    } else {
      line.textContent = 'Click or press Enter to return to the room';
      this.renderPrimary();
    }
  }

  /** The world is ready to walk into (the start card's button is live). */
  get ready(): boolean {
    return !this.loading;
  }

  /** The primary button's word: Enter the room, Continue over a save, Resume once started. */
  private renderPrimary(): void {
    if (this.loading || this.resuming) return;
    this.primary.textContent = this.started ? 'Resume' : this.options.hasProgress ? 'Continue' : 'Enter the room';
  }

  /**
   * A panel closed without a gesture (Esc is not one), so the browser would refuse the mouse lock: the
   * card shows only "Click to return to the room" until the click (or Enter) that it needs; Esc shows
   * the whole pause menu instead.
   */
  promptReturn(): void {
    this.returning = true;
    this.playing = false;
    this.apply();
    this.renderReturn();
    this.screens.main.querySelector<HTMLElement>('[data-role="return"]')!.focus({ preventScroll: true });
  }

  private renderReturn(): void {
    const line = this.screens.main.querySelector<HTMLElement>('[data-role="return"]')!;
    line.hidden = !this.returning;
    this.card.classList.toggle('menu__card--return', this.returning);
    this.root.classList.toggle('menu--return', this.returning);
  }

  /**
   * Adds a button to the pause menu, before Settings (the journal, the collector's book...): shown
   * only once the game has started, and while `shown` says so. `id` names it (unique); `run` is called on a click or Enter.
   */
  addPauseButton(id: string, label: string, run: () => void, shown?: () => boolean): void {
    const action = `pause-${id}`;
    this.pauseActions.set(action, run);
    if (shown) this.pauseShown.set(action, shown);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ui-btn';
    button.dataset.nav = '';
    button.dataset.action = action;
    button.dataset.pause = '';
    button.textContent = label;
    button.hidden = !this.started;
    const settings = this.screens.main.querySelector('[data-action="settings"]');
    settings?.parentElement?.insertBefore(button, settings);
  }

  /** Adds a section to a tab of the Settings screen (the graphics level, the cat...). */
  addSetting(tab: SettingsTab, title: string, element: HTMLElement, note?: string): void {
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
    this.settingsBodies.get(tab)!.appendChild(section);
  }

  /** Asks a yes / no question in the card; Cancel (or Esc / B) goes back to the screen it came from. */
  confirm(options: ConfirmOptions): void {
    this.pendingConfirm = options;
    this.confirmFrom = this.screen === 'confirm' ? this.confirmFrom : this.screen;
    this.screens.confirm.querySelector('h2')!.textContent = options.title;
    this.screens.confirm.querySelector('p')!.textContent = options.message;
    const yes = this.screens.confirm.querySelector<HTMLElement>('[data-action="confirm-yes"]')!;
    yes.textContent = options.yes;
    yes.classList.toggle('ui-btn--danger', options.danger === true);
    yes.classList.toggle('ui-btn--primary', options.danger !== true);
    this.show('confirm');
  }

  /** Which HUD aids show in the room (Settings > Display). */
  setHud(hud: { crosshair: boolean; hoverLabel: boolean }): void {
    this.hud = hud;
    this.apply();
    const text = this.hoverText;
    this.hoverText = null; // redraw
    this.setHoverLabel(text, this.hoverPlacement);
  }

  /** Hide the menu and show the crosshair (or the reverse). */
  setPlaying(playing: boolean): void {
    if (playing && !this.started) this.started = true;
    if (playing && this.returning) {
      this.returning = false;
      this.renderReturn();
    }
    this.playing = playing;
    if (!playing) this.setHoverLabel(null); // out of the room nothing is looked at (the caption must not linger over the menu)
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

  /** In the room: the menu is not up (a panel may be open over the room). */
  get isPlaying(): boolean {
    return this.playing;
  }

  /** True while a DOM panel owns the screen: controller presses are the panel's, not a request to enter the room. */
  get isModal(): boolean {
    return this.modal || panelOpen();
  }

  /** True once if the last press of `code` was consumed by the menu (a move, a pick, a back). */
  wasHandled(code: string): boolean {
    const handled = this.handledCode === code;
    this.handledCode = null;
    return handled;
  }

  private get visible(): boolean {
    return this.shown;
  }

  private apply(): void {
    const wasVisible = this.visible;
    this.shown = !(this.playing || this.modal);
    // In quickly (the CSS entrance), out with a short fade: resuming does not cut the card away.
    if (this.shown) fadeIn(this.root, 'menu--closing');
    else fadeOut(this.root, 'menu--closing', 150);
    document.body.classList.toggle('menu-open', this.shown);
    // The crosshair fades in and out (100 ms) rather than blinking.
    if (this.playing && !this.modal && this.hud.crosshair) fadeIn(this.crosshair, 'crosshair--out');
    else fadeOut(this.crosshair, 'crosshair--out', 100);
    if (this.visible && !wasVisible) {
      this.renderMain();
      this.renderReturn();
      this.show('main');
      this.primary.focus({ preventScroll: true });
    } else if (!this.visible && this.card.contains(document.activeElement)) {
      (document.activeElement as HTMLElement).blur();
    }
  }

  private get primary(): HTMLElement {
    return this.screens.main.querySelector<HTMLElement>('[data-action="start"]')!;
  }

  private setDevice(device: ControlDevice): void {
    if (device === this.device) return;
    this.device = device;
    if (this.visible) this.renderFoot();
    // The caption up now gets the new device's key cap.
    if (this.hoverText && !this.label.hidden) this.renderCaption(this.hoverText);
  }

  private renderMain(): void {
    const q = (role: string) => this.screens.main.querySelector<HTMLElement>(`[data-role="${role}"]`)!;
    const paused = this.started;
    q('kicker').hidden = !paused;
    q('essentials').hidden = paused;
    q('tagline').hidden = paused;
    const version = this.screens.main.querySelector<HTMLElement>('[data-role="version"]');
    if (version) version.hidden = paused;
    this.renderPrimary();
    const button = (action: string) => this.screens.main.querySelector<HTMLElement>(`[data-action="${action}"]`);
    const newGame = button('new-game');
    if (newGame) newGame.hidden = paused;
    const collection = button('collection');
    if (collection) collection.hidden = !paused;
    const home = button('home');
    if (home) home.hidden = !paused || !this.options.goHome?.available();
    for (const extra of this.screens.main.querySelectorAll<HTMLElement>('[data-pause]')) extra.hidden = !paused || !(this.pauseShown.get(extra.dataset.action ?? '')?.() ?? true);
    const status = q('status');
    const rows = paused ? (this.options.status?.() ?? []) : [];
    status.hidden = rows.length === 0;
    status.innerHTML = rows.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('');
    this.renderKeys();
    this.renderFoot();
  }

  /** The touch start card's text size row: up before the first entry on a touchscreen, the size in use checked. */
  private renderTextSize(): void {
    const row = this.screens.main.querySelector<HTMLElement>('[data-role="text-size"]');
    if (!row || !this.options.textSize) return;
    row.hidden = this.started || this.device !== 'touch';
    const now = this.options.textSize.get();
    for (const button of row.querySelectorAll<HTMLElement>('[data-text-size]')) button.setAttribute('aria-checked', String(button.dataset.textSize === now));
  }

  private renderFoot(): void {
    const foot = this.screens.main.querySelector<HTMLElement>('[data-role="foot"]')!;
    foot.innerHTML = this.device === 'touch' ? TOUCH_FOOT : this.started ? RESUME_FOOT : START_FOOT;
    this.renderTextSize();
  }

  /** Everything showing a key name, re-rendered when the bindings or the layout change. */
  private renderKeys(): void {
    const essentials = CONTROLS.filter((c) => c.essential);
    this.screens.main.querySelector<HTMLElement>('[data-role="essentials"]')!.innerHTML = essentials
      .map((c) => {
        const keys = this.device === 'gamepad' ? c.pad : this.device === 'touch' ? c.touch : c.keys;
        return keys === undefined ? '' : `<li>${renderKeys(keys)} <span>${escapeHtml(c.action.toLowerCase())}</span></li>`;
      })
      .join('');
    for (const kbd of this.card.querySelectorAll<HTMLElement>('kbd[data-key]')) kbd.innerHTML = renderKeys(`{${kbd.dataset.key}}`).replace(/<\/?kbd>/g, '');
  }

  private selectSettingsTab(tab: SettingsTab): void {
    this.settingsTab = tab;
    for (const button of this.settingsTabs.querySelectorAll<HTMLElement>('[data-tab]')) {
      button.setAttribute('aria-selected', String(button.dataset.tab === tab));
    }
    for (const [id, body] of this.settingsBodies) body.hidden = id !== tab;
  }

  /** Previous / next Settings tab (wrapping), keeping the focus on the tab strip. */
  private stepSettingsTab(direction: 1 | -1): void {
    const at = SETTINGS_TABS.findIndex((t) => t.id === this.settingsTab);
    const next = SETTINGS_TABS[(at + direction + SETTINGS_TABS.length) % SETTINGS_TABS.length]!;
    this.selectSettingsTab(next.id);
    this.settingsTabs.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus();
    playUiSound('move');
  }

  private confirmNewGame(): void {
    const onNewGame = this.options.onNewGame;
    if (!onNewGame) return;
    this.confirm({
      title: 'Start a new game?',
      message: 'Your coins, tickets, collection and everything the arcade and the market remember are wiped. Settings stay. This cannot be undone.',
      yes: 'Start over',
      danger: true,
      onYes: onNewGame,
    });
  }

  private show(screen: Screen): void {
    const from = this.screen;
    this.screen = screen;
    for (const [name, el] of Object.entries(this.screens)) el.hidden = name !== screen;
    this.card.classList.toggle('menu__card--wide', screen === 'controls' || screen === 'settings');
    if (screen === 'controls') this.controls.open(this.options.controlsGroup?.() ?? 'room', this.device);
    if (screen === from) return;
    // Back on the main screen, the focus returns to the button that opened the sub-screen; a confirmation starts on Cancel.
    const target =
      screen === 'main'
        ? this.screens.main.querySelector<HTMLElement>(`[data-action="${from}"]`)
        : screen === 'confirm'
          ? this.screens.confirm.querySelector<HTMLElement>('[data-action="confirm-no"]')
          : navItems(this.screens[screen])[1];
    (target && target.offsetParent !== null ? target : navItems(this.screens[screen])[0])?.focus({ preventScroll: true });
  }

  /** One step of a range input (Left / Right, the D-pad), firing `input` and `change` like a drag and its release would. */
  private nudge(range: HTMLInputElement, direction: 1 | -1): void {
    if (direction > 0) range.stepUp();
    else range.stepDown();
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    playUiSound('move');
  }

  private onPress(code: string, e: KeyboardEvent): void {
    if (!this.visible) return;
    const focused = document.activeElement;
    const inCard = focused instanceof HTMLElement && this.card.contains(focused);
    // An alert's button (Retry) is part of the menu's walk: Up from the first item reaches it, Enter / A presses it.
    const alertButton = document.querySelector<HTMLElement>('.alert-bar:not([hidden]) .alert-bar__action');
    const inAlert = !!alertButton && focused === alertButton;
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
        if (alertButton && !inAlert && navItems(this.screens[this.screen])[0] === focused) {
          alertButton.focus();
          playUiSound('move');
          return handled();
        }
        moveFocus(this.screens[this.screen], -1);
        return handled();
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'GamepadLeft':
      case 'GamepadRight': {
        const direction = code.endsWith('Left') ? -1 : 1;
        if (focused instanceof HTMLInputElement && focused.type === 'range') {
          if (code.startsWith('Gamepad')) this.nudge(focused, direction);
          else playUiSound('move'); // the range steps itself on the arrow keys
          return code.startsWith('Gamepad') ? handled() : undefined;
        }
        if (isField(focused)) return;
        if (this.screen === 'controls') this.controls.step(direction);
        else if (this.screen === 'settings') this.stepSettingsTab(direction);
        else if (this.screen === 'confirm' || inCard) moveFocus(this.screens[this.screen], direction);
        else return;
        return handled();
      }
      case 'Escape':
      case 'GamepadB':
        if (this.returning) {
          // The whole pause menu, instead of the one line.
          this.returning = false;
          this.renderReturn();
          this.primary.focus({ preventScroll: true });
          return handled();
        }
        if (this.screen !== 'main') {
          playUiSound('back');
          this.show(this.screen === 'confirm' ? this.confirmFrom : 'main');
        }
        return handled();
      case 'Enter':
      case 'NumpadEnter':
        if (isField(focused)) return; // typing the cat's name
        e.preventDefault();
        if (inAlert) alertButton.click();
        else if (this.returning) this.onStart();
        else if (inCard && focused instanceof HTMLButtonElement) focused.click();
        else if (this.screen === 'main' && !this.loading) this.onStart();
        return;
      case 'Space':
        // Only the focused button: a stray Space must never start or resume the game.
        if (isField(focused)) return;
        e.preventDefault();
        if (inCard && focused instanceof HTMLButtonElement && focused !== this.primary) focused.click();
        return;
      case 'GamepadA':
        if (inAlert) {
          alertButton.click();
          return handled();
        }
        // On the primary button the press enters the room (the PointerLockFlow's controller mode).
        if (!inCard || focused === this.primary || !(focused instanceof HTMLButtonElement)) return;
        focused.click();
        return handled();
    }
  }

  /**
   * Small caption naming the object being looked at: under the crosshair, or along the top edge so it
   * never covers a playing screen. `Name · verb` (the repo's convention) shows the name, then a key cap
   * for the device in hand (the mouse, the controller's A, a fingertip) and the verb; a legacy
   * "…click to verb" caption is read the same way. It fades in, and waits a moment before hiding. The
   * crosshair itself brightens while there is something to use (`crosshair--active`). Asked again
   * with the same text (the Session re-reads it a few times a second), nothing is redrawn.
   */
  setHoverLabel(text: string | null, placement: 'crosshair' | 'edge' = 'crosshair'): void {
    if (this.modal || !this.playing) text = null; // a panel or the menu is up: nothing is looked at (the Session re-reads it meanwhile)
    const changed = text !== this.hoverText || placement !== this.hoverPlacement;
    this.hoverText = text;
    this.hoverPlacement = placement;
    this.crosshair.classList.toggle('crosshair--active', !!text);
    const label = this.label;
    if (!text || !this.hud.hoverLabel) {
      if (label.hidden || this.hoverHide !== undefined) return;
      this.hoverHide = window.setTimeout(() => {
        this.hoverHide = undefined;
        label.classList.remove('hover-label--in');
        fadeOut(label, 'hover-label--out', 120);
      }, 80);
      return;
    }
    window.clearTimeout(this.hoverHide);
    this.hoverHide = undefined;
    if (!changed && !label.hidden && label.classList.contains('hover-label--in')) return;
    this.renderCaption(text);
    label.classList.toggle('hover-label--edge', placement === 'edge');
    const wasHidden = label.hidden;
    fadeIn(label, 'hover-label--out');
    if (wasHidden) void label.offsetWidth; // start the fade from transparent
    label.classList.add('hover-label--in');
  }

  /** The caption's markup: the name, and the verb behind the device's key cap. */
  private renderCaption(text: string): void {
    const { name, verb } = parseCaption(text);
    const nameHtml = name ? `<span class="hover-label__name">${escapeHtml(name)}</span>` : '';
    const verbHtml = verb ? `<span class="hover-label__verb">${this.capHtml()}${escapeHtml(verb)}</span>` : '';
    this.label.innerHTML = nameHtml + verbHtml;
  }

  /** The key cap for the device last used (`input/lastDevice`, not how the room was entered): the mouse (default), the controller's A, a finger. */
  private capHtml(): string {
    if (this.device === 'gamepad') return '<span class="hover-label__cap hover-label__cap--pad" aria-label="A">A</span>';
    if (this.device === 'touch') return '<span class="hover-label__cap hover-label__cap--touch" aria-label="Tap"></span>';
    return '<span class="hover-label__cap hover-label__cap--mouse" aria-label="Click"></span>';
  }
}
