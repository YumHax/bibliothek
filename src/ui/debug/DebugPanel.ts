import { CardPanel, type PanelAction } from '../panel/CardPanel';
import { attr, html, type Html } from '../panel/html';
import { nextTab } from '../panel/widgets';
import { pictogram, pictogramSprite } from '../panel/pictograms';
import { Arming } from '../confirmTwice';
import { searchKey } from '@/text/strings';
import { formatCount, formatNumber } from '@/text/count';
import { PROGRESSIONS, type DebugSubjects, type Progression } from '@/cheats/progress/progressions';
import { applyDebugProgress } from '@/cheats/progress/debugProgress';
import './DebugPanel.css';

type DebugTab = 'start' | 'progress' | 'people' | 'state' | 'collection' | 'events' | 'places' | 'social' | 'tools';

/** The sections down the rail: their pictogram, and what they are for in a line atop the page. */
const TABS: readonly { id: DebugTab; label: string; icon: string; about: string }[] = [
  { id: 'start', label: 'Restart from', icon: 'film', about: 'Wipe the debug save and start it again at a point of the story. Your real save is never touched.' },
  { id: 'progress', label: 'Progress', icon: 'medal', about: 'Every progression, at any step. Steps are set at once; the switches wait for a reload.' },
  { id: 'people', label: 'People', icon: 'heart', about: 'How everyone stands with you, from nemesis to close friend. Set quietly: no banner.' },
  { id: 'state', label: 'Money & time', icon: 'coin', about: 'Coins and tickets, the hour, the days going by, the weather.' },
  { id: 'collection', label: 'Collection', icon: 'shelf', about: 'Fill or empty the shelves. Search a title to add it or take it away.' },
  { id: 'events', label: 'Happenings', icon: 'star', about: 'Make something happen now, wherever you are.' },
  { id: 'places', label: 'Travel', icon: 'door', about: 'Go anywhere at once, even where only its own door leads.' },
  { id: 'social', label: 'Social lab', icon: 'cup', about: 'Every state of a conversation, on one person: the one you talked to last.' },
  { id: 'tools', label: 'Tools', icon: 'keys', about: 'Checks and the console.' },
];

/** Something `?debug` can make happen at once (a power cut, a party, coins). */
export interface DebugEvent {
  label: string;
  run(): void;
  /** It shows once the page is built again (the zone reads it as it is made): the panel offers the reload. */
  reload?: boolean;
}

interface EntryBase {
  tab: DebugTab;
  group: string;
  label: string;
  /** It shows once the page is built again: the panel offers the reload. */
  reload?: boolean;
  /** A picture beside it: a face, a cover, a place's photo. */
  visual?: () => Html;
  /** A line under the label (a row, never a tile, has one). */
  hint?: string;
}

/**
 * One line of the panel. An `action` is a tile (with a `hint`, a row with its own `button`; `confirm`: a second
 * press within the window does it; `current`: where things stand, marked); its result in words goes to the status
 * line. A `dial` sets one of its levels (`cheats/dials`, the votes, the weather; `tones` colour each step). A
 * `number` is a stepper set on Enter, on leaving the field, on − / + or on one of its `presets`.
 */
export type DebugEntry =
  | (EntryBase & { kind: 'action'; run(): string | void; button?: string; confirm?: boolean; current?: boolean })
  | (EntryBase & { kind: 'dial'; levels: readonly string[]; at(): number; set(level: number): void; tones?: readonly string[] })
  | (EntryBase & { kind: 'number'; value(): number; set(n: number): string | void; min?: number; max?: number; step?: number; presets?: readonly number[] });

/** A progression's switch, as the Progress page and the search show it. */
type Line = DebugEntry | { kind: 'switch'; tab: 'progress'; group: string; label: string; progression: Progression; visual?: undefined; hint?: undefined };

interface DebugPanelDeps {
  subjects: DebugSubjects;
  /** Every entry of every page; `query` is the search typed (the collection's games are listed for a search only). */
  entries(query: string): readonly DebugEntry[];
  /** The state of things in a few words, down the rail (the day and hour, the money, the weather, the start). */
  readouts(): readonly { label: string; value: string }[];
  /** A line atop a page besides its own (whom the social lab acts on). */
  header(tab: DebugTab): string | null;
  reload(): void;
}

/** Most lines a search lists. */
const MAX_FOUND = 80;
/** How long a line shows its tick after it did its thing (ms). */
const FLASH_MS = 1400;

/**
 * `?debug`'s console (docs/checks.md "Debug mode"), from its key or the pause menu: sections down a rail (where the
 * save restarts from, progress, people, money and time, the collection, happenings, travel, the social lab, tools)
 * with the state of things under them, a search over every section in the header, and the section's cards on the
 * right: switches, ladders of steps, steppers, tiles. Progress switches wait for "Apply": the world is built from the
 * stores once.
 */
export class DebugPanel extends CardPanel {
  private tab: DebugTab = 'progress';
  private query = '';
  /** The switches changed since the panel opened, by progression. */
  private readonly wanted = new Map<string, boolean>();
  private reloadDue = false;
  /** The lines painted last, by their index in the markup. */
  private shown: Line[] = [];
  /** The line that just did its thing (its tick shows a moment). */
  private flashed: number | null = null;
  private flashTimer: number | undefined;
  private readonly arming = new Arming(() => this.refresh());
  private readonly search: HTMLInputElement;

  constructor(container: HTMLElement, private readonly deps: DebugPanelDeps) {
    super(container, { className: 'debug-panel', cardClass: 'debug-panel__card ui-card', title: 'Debug', label: 'Debug console' });
    // In the header, outside the body the panel repaints: typing keeps its focus and its caret.
    const header = this.card.querySelector('.ui-panel__header')!;
    const find = document.createElement('label');
    find.className = 'debug-panel__find';
    this.search = document.createElement('input');
    this.search.type = 'search';
    this.search.className = 'debug-panel__search';
    this.search.placeholder = 'Find anything: Mémé, armchair, party, Front Street, Zelda…';
    this.search.setAttribute('aria-label', 'Find in every section');
    find.append(this.search);
    const keys = document.createElement('span');
    keys.className = 'debug-panel__keys';
    keys.textContent = '² or F8';
    header.append(find, keys);
    this.listen(this.search, 'input', () => {
      this.query = this.search.value;
      // The lines move: an armed one would be another.
      this.arming.reset();
      this.flashed = null;
      this.refresh();
    });
    // A number field: set on Enter or on leaving it.
    this.listen(this.root, 'change', (e) => {
      const el = e.target as HTMLInputElement;
      const line = el.dataset.line === undefined ? undefined : this.shown[Number(el.dataset.line)];
      if (line?.kind === 'number') this.setNumber(line, Number(el.dataset.line), Number(el.value));
    });
  }

  /** Opens on `tab` next time (`?social-lab` opens on the lab). */
  showTab(tab: 'social'): void {
    this.tab = tab;
  }

  protected override onOpened(): void {
    this.wanted.clear();
    this.arming.reset();
    this.flashed = null;
    super.onOpened();
  }

  protected override onClosed(): void {
    window.clearTimeout(this.flashTimer);
  }

  private isOn(p: Progression): boolean {
    return this.wanted.get(p.id) ?? p.on(this.deps.subjects);
  }

  private get searching(): boolean {
    return this.query.trim() !== '';
  }

  /** The lines of the section open, or every line the search finds. */
  private lines(): Line[] {
    const switches: Line[] = PROGRESSIONS.map((p) => ({ kind: 'switch', tab: 'progress', group: `Done or not · ${p.group}`, label: p.label, progression: p }));
    const all = [...this.deps.entries(this.query.trim()), ...switches];
    const words = searchKey(this.query).split(' ').filter(Boolean);
    if (!words.length) return all.filter((l) => l.tab === this.tab);
    return all.filter((l) => {
      const text = searchKey(`${l.label} ${l.group} ${tabOf(l.tab).label} ${l.hint ?? ''}`);
      return words.every((w) => text.includes(w));
    }).slice(0, MAX_FOUND);
  }

  protected render(): Html {
    this.shown = this.lines();
    return html`${pictogramSprite()}<div class="debug-panel__frame">${this.rail()}<section class="debug-panel__page">${this.pageHead()}${this.page()}</section></div>`;
  }

  /** The sections, and the state of things under them. */
  private rail(): Html {
    return html`<nav class="debug-panel__rail" aria-label="Sections">
      <div class="debug-panel__tabs" role="tablist">${TABS.map((t) => {
        const active = !this.searching && t.id === this.tab;
        return html`<button type="button" class="debug-panel__tab" role="tab" aria-selected="${active ? 'true' : 'false'}" data-action="tab" data-tab="${t.id}">${pictogram(t.icon, 'debug-panel__tab-icon')}<span>${t.label}</span></button>`;
      })}</div>
      <div class="debug-panel__now"><p class="debug-panel__now-head">Right now</p><dl>${this.deps.readouts().map((r) => html`<div><dt>${r.label}</dt><dd>${r.value}</dd></div>`)}</dl></div>
    </nav>`;
  }

  private pageHead(): Html {
    if (this.searching) {
      const found = this.shown.length;
      return html`<header class="debug-panel__head"><h3>Found</h3><p>${found ? `${formatCount(found, 'line')} for “${this.query.trim()}”, from every section.` : 'Try another word.'}</p></header>`;
    }
    const tab = tabOf(this.tab);
    const extra = this.deps.header(this.tab);
    return html`<header class="debug-panel__head"><h3>${tab.label}</h3><p>${tab.about}</p>${extra ? html`<p class="debug-panel__extra">${extra}</p>` : ''}</header>`;
  }

  private page(): Html {
    if (!this.shown.length) {
      return html`<div class="debug-panel__empty">${pictogram('magnifier', 'debug-panel__empty-icon')}<p>${this.searching ? `Nothing called “${this.query.trim()}”.` : 'Nothing here from where you stand.'}</p></div>`;
    }
    // Found lines say which section they are on.
    const groupOf = (l: Line): string => (this.searching ? `${tabOf(l.tab).label} · ${l.group}` : l.group);
    const groups = [...new Set(this.shown.map(groupOf))];
    return html`<div class="debug-panel__cards">${groups.map((group) => {
      const lines = this.shown.map((l, i) => ({ l, i })).filter(({ l }) => groupOf(l) === group);
      const tiles = lines.filter(({ l }) => isTile(l));
      const rows = lines.filter(({ l }) => !isTile(l));
      const people = rows.length > 0 && rows.every(({ l }) => l.kind === 'dial' && l.visual);
      const timeline = rows.length > 0 && rows.every(({ l }) => l.tab === 'start');
      const list = timeline ? 'debug-panel__timeline' : people ? 'debug-panel__people' : 'debug-panel__rows';
      return html`<section class="debug-panel__group">
        <h4>${group}</h4>
        ${rows.length ? html`<ul class="${list}">${rows.map(({ l, i }) => (timeline ? this.station(l, i) : people ? this.person(l, i) : this.row(l, i)))}</ul>` : ''}
        ${tiles.length ? html`<div class="debug-panel__tiles">${tiles.map(({ l, i }) => this.tile(l, i))}</div>` : ''}
      </section>`;
    })}</div>`;
  }

  /** A plain action, a place: the tile is the button. */
  private tile(l: Line, i: number): Html {
    const armed = this.arming.isArmed(String(i));
    const flash = this.flashed === i;
    const classes = ['debug-panel__tile', l.visual && 'debug-panel__tile--photo', armed && 'debug-panel__tile--armed', flash && 'debug-panel__tile--done'].filter(Boolean).join(' ');
    return html`<button type="button" class="${classes}" data-action="line" data-line="${i}">${l.visual ? html`<span class="debug-panel__photo">${l.visual()}</span>` : ''}<span class="debug-panel__tile-label">${armed ? `Again to confirm: ${l.label}` : l.label}</span>${flash ? pictogram('check', 'debug-panel__tick') : ''}</button>`;
  }

  /** A start point on the story's line: what it is, and the press that starts the save there. */
  private station(l: Line, i: number): Html {
    if (l.kind !== 'action') return html``;
    const armed = this.arming.isArmed(String(i));
    return html`<li class="debug-panel__station${l.current ? ' debug-panel__station--here' : ''}">
      <span class="debug-panel__dot" aria-hidden="true"></span>
      <div class="debug-panel__station-text"><strong>${l.label}${l.current ? html` <em>you started here</em>` : ''}</strong><small>${l.hint ?? ''}</small></div>
      <button type="button" class="ui-btn ui-btn--sm${armed ? ' ui-btn--armed' : ''}" data-action="line" data-line="${i}">${armed ? 'Again: wipe and restart' : l.button ?? 'Start here'}</button>
    </li>`;
  }

  /** Someone's card: their face in their tier's colour, their name, the ladder of tiers. */
  private person(l: Line, i: number): Html {
    if (l.kind !== 'dial') return html``;
    const at = l.at();
    const tone = l.tones?.[at];
    return html`<li class="debug-panel__person${this.flashed === i ? ' debug-panel__person--done' : ''}"${tone ? html` style="--tone: ${tone}"` : ''}>
      <span class="debug-panel__face">${l.visual?.()}</span>
      <div class="debug-panel__person-text"><strong>${l.label}</strong><span class="debug-panel__level">${l.levels[at] ?? '—'}</span></div>
      ${this.ladder(l, i, at, true)}
    </li>`;
  }

  /** A line with its control on the right. */
  private row(l: Line, i: number): Html {
    const label = html`<span class="debug-panel__label">${l.label}${l.hint ? html`<small>${l.hint}</small>` : ''}</span>`;
    const visual = l.visual ? html`<span class="debug-panel__thumb">${l.visual()}</span>` : '';
    const flash = this.flashed === i ? pictogram('check', 'debug-panel__tick') : '';
    switch (l.kind) {
      case 'switch': {
        const on = this.isOn(l.progression);
        const pending = this.wanted.has(l.progression.id) && this.wanted.get(l.progression.id) !== l.progression.on(this.deps.subjects);
        return html`<li class="debug-panel__row${pending ? ' debug-panel__row--pending' : ''}">${label}
          ${pending ? html`<span class="debug-panel__pending">on reload</span>` : ''}
          <span class="debug-panel__state">${on ? 'Done' : 'Not yet'}</span>
          <button type="button" class="debug-panel__switch" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-label="${l.label}" data-action="line" data-line="${i}"><span class="debug-panel__knob"></span></button>
        </li>`;
      }
      case 'action': {
        const armed = this.arming.isArmed(String(i));
        return html`<li class="debug-panel__row">${visual}${label}${flash}<button type="button" class="ui-btn ui-btn--sm${armed ? ' ui-btn--armed' : ''}" data-action="line" data-line="${i}">${armed ? 'Press again' : l.button ?? 'Do it'}</button></li>`;
      }
      case 'dial': {
        const at = l.at();
        // A few short levels side by side, named; a long ladder as steps with the level's name beside.
        const short = l.levels.length <= 4 && l.levels.every((name) => name.length <= 14);
        return html`<li class="debug-panel__row">${visual}<span class="debug-panel__label">${l.label}${short ? '' : html`<small class="debug-panel__level">${l.levels[at] ?? '—'}</small>`}</span>${flash}
          ${short
            ? html`<span class="debug-panel__segments" role="group" aria-label="${l.label}">${l.levels.map((name, n) => html`<button type="button" class="debug-panel__segment" aria-pressed="${n === at ? 'true' : 'false'}" data-action="level" data-line="${i}" data-level="${n}">${name}</button>`)}</span>`
            : this.ladder(l, i, at, false)}
        </li>`;
      }
      case 'number': {
        const value = l.value();
        return html`<li class="debug-panel__row debug-panel__row--number">${label}${flash}
          ${l.presets?.length ? html`<span class="debug-panel__presets">${l.presets.map((p) => html`<button type="button" class="debug-panel__preset" aria-pressed="${p === value ? 'true' : 'false'}" data-action="preset" data-line="${i}" data-value="${p}">${formatNumber(p)}</button>`)}</span>` : ''}
          <span class="debug-panel__stepper">
            <button type="button" class="debug-panel__step" aria-label="Less" data-action="nudge" data-line="${i}" data-by="-1">−</button>
            <input type="number" class="debug-panel__number" data-line="${i}" value="${value}"${l.min !== undefined ? html` min="${l.min}"` : ''}${l.max !== undefined ? html` max="${l.max}"` : ''} step="${l.step ?? 1}" aria-label="${l.label}">
            <button type="button" class="debug-panel__step" aria-label="More" data-action="nudge" data-line="${i}" data-by="1">+</button>
          </span>
        </li>`;
      }
    }
  }

  /** ‹ the steps › : each step a segment filled up to the level, the arrows one step down or up. */
  private ladder(l: Extract<Line, { kind: 'dial' }>, i: number, at: number, toned: boolean): Html {
    const last = l.levels.length - 1;
    return html`<span class="debug-panel__ladder" role="group" aria-label="${l.label}: ${l.levels[at] ?? ''}">
      <button type="button" class="debug-panel__step" aria-label="One step down" data-action="level" data-line="${i}" data-level="${at - 1}"${attr('disabled', at <= 0)}>‹</button>
      <span class="debug-panel__rungs">${l.levels.map((name, n) => html`<button type="button" class="debug-panel__rung${n <= at ? ' debug-panel__rung--on' : ''}${n === at ? ' debug-panel__rung--at' : ''}"${toned && l.tones?.[n] ? html` style="--rung: ${l.tones[n]}"` : ''} aria-label="${name}" aria-pressed="${n === at ? 'true' : 'false'}" data-action="level" data-line="${i}" data-level="${n}"></button>`)}</span>
      <button type="button" class="debug-panel__step" aria-label="One step up" data-action="level" data-line="${i}" data-level="${at + 1}"${attr('disabled', at >= last)}>›</button>
    </span>`;
  }

  /** The switches turned and not applied yet (one turned twice is back as it was). */
  private pending(): number {
    return [...this.wanted].filter(([id, on]) => PROGRESSIONS.find((p) => p.id === id)?.on(this.deps.subjects) !== on).length;
  }

  protected override actions(): PanelAction[] {
    const pending = this.pending();
    if (pending) {
      return [
        { action: 'discard', label: 'Undo the switches' },
        { action: 'apply', label: `Apply ${formatCount(pending, 'switch', { plural: 'switches' })} and reload`, primary: true },
      ];
    }
    return this.reloadDue ? [{ action: 'apply', label: 'Reload to see it', primary: true }] : [];
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const index = Number(el.dataset.line);
    const line = this.shown[index];
    switch (action) {
      case 'tab':
        this.tab = (el.dataset.tab as DebugTab | undefined) ?? this.tab;
        this.query = this.search.value = '';
        this.flashed = null;
        return this.refresh();
      case 'line':
        if (!line) return;
        if (line.kind === 'switch') {
          this.wanted.set(line.progression.id, !this.isOn(line.progression));
          return this.refresh();
        }
        if (line.kind !== 'action') return;
        if (line.confirm && !this.arming.press(String(index))) return;
        return this.done(line, index, line.run());
      case 'level':
        if (line?.kind === 'dial') this.setDial(line, index, Number(el.dataset.level));
        return;
      case 'nudge':
        if (line?.kind === 'number') this.setNumber(line, index, line.value() + Number(el.dataset.by) * (line.step ?? 1));
        return;
      case 'preset':
        if (line?.kind === 'number') this.setNumber(line, index, Number(el.dataset.value));
        return;
      case 'discard':
        this.wanted.clear();
        this.setStatus('The switches are back as they were.');
        return this.refresh();
      case 'apply':
        applyDebugProgress(this.deps.subjects, this.wanted);
        this.deps.reload();
        return;
    }
  }

  private setDial(line: Extract<Line, { kind: 'dial' }>, index: number, level: number): void {
    if (!Number.isInteger(level) || level < 0 || level >= line.levels.length) return;
    line.set(level);
    this.done(line, index, `${line.label}: ${line.levels[line.at()] ?? line.levels[level]}.`);
  }

  private setNumber(line: Extract<Line, { kind: 'number' }>, index: number, n: number): void {
    if (!Number.isFinite(n)) return this.setStatus(`${line.label}: not a number.`, 'error');
    this.done(line, index, line.set(Math.min(line.max ?? Infinity, Math.max(line.min ?? -Infinity, n))));
  }

  /** After a line did its thing: its tick a moment, the status line, the reload offered when the world must be built again. */
  private done(line: DebugEntry, index: number, result: string | void): void {
    if (line.reload) this.reloadDue = true;
    const said = result || `${line.label}: done.`;
    this.setStatus(line.reload ? `${said} It shows after a reload.` : said, 'ok');
    this.flashed = index;
    window.clearTimeout(this.flashTimer);
    this.flashTimer = window.setTimeout(() => {
      this.flashed = null;
      if (this.isOpen) this.refresh();
    }, FLASH_MS);
    this.refresh();
  }

  protected override onSide(direction: 1 | -1): boolean {
    if (this.searching) return false;
    this.tab = nextTab(TABS.map((t) => t.id), this.tab, direction);
    this.refresh();
    return true;
  }
}

function tabOf(id: DebugTab): (typeof TABS)[number] {
  return TABS.find((t) => t.id === id) ?? TABS[0]!;
}

/** A plain action or a place: drawn as a tile, not a row. */
function isTile(l: Line): boolean {
  return l.kind === 'action' && !l.hint;
}
