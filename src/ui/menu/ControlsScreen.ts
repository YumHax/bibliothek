import { CONTROLS, CONTROL_DEVICES, CONTROL_GROUPS, type ControlDevice, type ControlGroup, type ControlHint } from '../controls';
import { escapeHtml } from '../html';
import { onKeyLabelsChange, renderKeys } from '../keys';

/**
 * The Controls screen's body: one tab per `CONTROL_GROUPS` entry, a switch between keyboard,
 * controller and touch, and the selected group as a two-column table (what to press | what it does).
 * The Overlay hosts it, forwards Left / Right to `step` and opens it on the tab and device that
 * fit the moment (`open`).
 */
export class ControlsScreen {
  readonly element: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private readonly devices: HTMLDivElement;
  private readonly table: HTMLTableSectionElement;
  private group: ControlGroup = 'room';
  private device: ControlDevice = 'keyboard';

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'menu__controls-screen';
    this.element.innerHTML = `
      <div class="menu__tabs" role="tablist" aria-label="Where">
        ${CONTROL_GROUPS.map(
          (g) => `<button type="button" class="ui-btn" role="tab" id="controls-tab-${g.id}" aria-controls="controls-panel" data-nav data-group="${g.id}">${g.label}</button>`,
        ).join('')}
      </div>
      <div class="menu__segmented" role="radiogroup" aria-label="Device">
        ${CONTROL_DEVICES.map(
          (d) => `<button type="button" class="ui-btn" role="radio" data-nav data-device="${d.id}">${d.label}</button>`,
        ).join('')}
      </div>
      <div class="menu__body" id="controls-panel" role="tabpanel">
        <table class="menu__controls"><tbody></tbody></table>
      </div>`;
    this.tabs = this.element.querySelector('.menu__tabs')!;
    this.devices = this.element.querySelector('.menu__segmented')!;
    this.table = this.element.querySelector('tbody')!;
    this.element.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const group = target.closest<HTMLElement>('[data-group]')?.dataset.group as ControlGroup | undefined;
      const device = target.closest<HTMLElement>('[data-device]')?.dataset.device as ControlDevice | undefined;
      if (group) this.select(group, this.device);
      if (device) this.select(this.group, device);
    });
    onKeyLabelsChange(() => this.render());
    this.select(this.group, this.device);
  }

  /** Shows `group` for `device` (the Overlay calls it each time the screen opens). */
  open(group: ControlGroup, device: ControlDevice): void {
    this.select(group, device);
  }

  /** Previous / next tab (wrapping), keeping the focus on the tab strip. */
  step(direction: 1 | -1): void {
    const at = CONTROL_GROUPS.findIndex((g) => g.id === this.group);
    const next = CONTROL_GROUPS[(at + direction + CONTROL_GROUPS.length) % CONTROL_GROUPS.length]!;
    this.select(next.id, this.device);
    this.tabs.querySelector<HTMLElement>(`[data-group="${next.id}"]`)?.focus();
  }

  private select(group: ControlGroup, device: ControlDevice): void {
    this.group = group;
    this.device = device;
    for (const tab of this.tabs.querySelectorAll<HTMLElement>('[data-group]')) {
      tab.setAttribute('aria-selected', String(tab.dataset.group === group));
    }
    for (const radio of this.devices.querySelectorAll<HTMLElement>('[data-device]')) {
      radio.setAttribute('aria-checked', String(radio.dataset.device === device));
    }
    this.element.querySelector('[role="tabpanel"]')!.setAttribute('aria-labelledby', `controls-tab-${group}`);
    this.render();
  }

  private render(): void {
    this.table.innerHTML = CONTROLS.filter((c) => c.group === this.group)
      .map((c) => {
        const keys = keysFor(c, this.device);
        return `<tr${keys ? '' : ' class="menu__controls--na"'}><th scope="row">${keys ?? '—'}</th><td>${escapeHtml(c.action)}</td></tr>`;
      })
      .join('');
  }
}

/** The line's keys on `device`, or null when that device has no way to do it. */
function keysFor(hint: ControlHint, device: ControlDevice): string | null {
  const markup = device === 'keyboard' ? hint.keys : device === 'gamepad' ? hint.pad : hint.touch;
  return markup === undefined ? null : renderKeys(markup);
}
