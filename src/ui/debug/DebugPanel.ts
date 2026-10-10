import { CardPanel, type PanelAction } from '../panel/CardPanel';
import { html, type Html } from '../panel/html';
import { nextTab, tabs } from '../panel/widgets';
import { CHOICES, PROGRESSIONS, type DebugSubjects, type Progression } from '@/cheats/progress/progressions';
import { applyDebugProgress } from '@/cheats/progress/debugProgress';
import './DebugPanel.css';

type Tab = 'progress' | 'votes' | 'events' | 'places';
const TABS: readonly { id: Tab; label: string }[] = [
  { id: 'progress', label: 'Progress' },
  { id: 'votes', label: 'Votes' },
  { id: 'events', label: 'Now' },
  { id: 'places', label: 'Go to' },
];

/** Something `?debug` can make happen at once (a power cut, a party, coins). */
export interface DebugEvent {
  label: string;
  run(): void;
  /** It shows once the page is built again (the zone reads it as it is made): the panel offers the reload. */
  reload?: boolean;
}

interface DebugPanelDeps {
  subjects: DebugSubjects;
  events: readonly DebugEvent[];
  /** Every place a door or the lift can take the player, and the trip there. */
  places(): readonly { id: string; label: string }[];
  go(id: string): void;
  reload(): void;
}

/**
 * `?debug`'s panel (its key: docs/checks.md "Debug mode"): every progression with its switch (the debug save starts
 * with all of them done; a switch turned off stays off), the co-owners' votes set outright, events made to happen
 * now, and a trip to any place. Progress changes wait for "Apply and reload": the world is built from the stores once.
 */
export class DebugPanel extends CardPanel {
  private tab: Tab = 'progress';
  /** The switches changed since the panel opened, by progression. */
  private readonly wanted = new Map<string, boolean>();
  private reloadDue = false;

  constructor(container: HTMLElement, private readonly deps: DebugPanelDeps) {
    super(container, { className: 'debug-panel', cardClass: 'debug-panel__card ui-card', title: 'Debug' });
  }

  protected override onOpened(): void {
    this.wanted.clear();
    super.onOpened();
  }

  private isOn(p: Progression): boolean {
    return this.wanted.get(p.id) ?? p.on(this.deps.subjects);
  }

  protected render(): Html {
    const bar = tabs({ tabs: TABS, active: this.tab, label: 'Debug', className: 'debug-panel__tabs' });
    return html`${bar}<div class="debug-panel__page">${this.page()}</div>`;
  }

  private page(): Html {
    switch (this.tab) {
      case 'progress': {
        const groups = [...new Set(PROGRESSIONS.map((p) => p.group))];
        return html`${groups.map(
          (group) => html`<h3 class="debug-panel__group">${group}</h3><ul class="debug-panel__list">${PROGRESSIONS.filter((p) => p.group === group).map((p) => {
            const on = this.isOn(p);
            return html`<li><span class="debug-panel__label">${p.label}</span><button type="button" class="ui-btn debug-panel__switch" aria-pressed="${on ? 'true' : 'false'}" data-action="switch" data-id="${p.id}">${on ? 'Done' : 'Not yet'}</button></li>`;
          })}</ul>`,
        )}`;
      }
      case 'votes':
        return html`<ul class="debug-panel__list">${CHOICES.map((c) => {
          const current = c.current();
          return html`<li class="debug-panel__vote"><span class="debug-panel__label">${c.label}</span><span class="debug-panel__options">${c.options.map(
            (o) => html`<button type="button" class="ui-btn debug-panel__option" aria-pressed="${o.id === current ? 'true' : 'false'}" data-action="vote" data-id="${c.id}" data-option="${o.id}">${o.label}</button>`,
          )}</span></li>`;
        })}</ul>`;
      case 'events':
        return html`<div class="debug-panel__grid">${this.deps.events.map((e, i) => html`<button type="button" class="ui-btn" data-action="event" data-index="${i}">${e.label}</button>`)}</div>`;
      case 'places':
        return html`<div class="debug-panel__grid">${this.deps.places().map((p) => html`<button type="button" class="ui-btn" data-action="go" data-id="${p.id}">${p.label}</button>`)}</div>`;
    }
  }

  protected override actions(): PanelAction[] {
    const changes = this.wanted.size > 0 || this.reloadDue;
    return [
      { action: 'all', label: 'Everything done' },
      { action: 'apply', label: changes ? 'Apply and reload' : 'Reload', primary: true },
    ];
  }

  protected override onAction(action: string, el: HTMLElement): void {
    const id = el.dataset.id ?? '';
    switch (action) {
      case 'tab':
        this.tab = (el.dataset.tab as Tab | undefined) ?? this.tab;
        return this.refresh();
      case 'switch': {
        const p = PROGRESSIONS.find((q) => q.id === id);
        if (p) this.wanted.set(p.id, !this.isOn(p));
        return this.refresh();
      }
      case 'all':
        for (const p of PROGRESSIONS) if (!this.isOn(p)) this.wanted.set(p.id, true);
        this.tab = 'progress';
        return this.refresh();
      case 'vote':
        CHOICES.find((c) => c.id === id)?.choose(el.dataset.option ?? '');
        this.reloadDue = true;
        this.setStatus('Voted. The stairwell shows it after a reload.', 'ok');
        return this.refresh();
      case 'event': {
        const event = this.deps.events[Number(el.dataset.index)];
        if (!event) return;
        event.run();
        if (event.reload) this.reloadDue = true;
        this.setStatus(event.reload ? `${event.label}: shows after a reload.` : `${event.label}: done.`, 'ok');
        return this.refresh();
      }
      case 'go':
        this.close();
        this.deps.go(id);
        return;
      case 'apply':
        applyDebugProgress(this.deps.subjects, this.wanted);
        this.deps.reload();
        return;
    }
  }

  protected override onSide(direction: 1 | -1): boolean {
    this.tab = nextTab(TABS.map((t) => t.id), this.tab, direction);
    this.refresh();
    return true;
  }
}
