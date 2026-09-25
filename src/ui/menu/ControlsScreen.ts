import { CONTROLS, CONTROL_GROUPS, type ControlGroup } from '../controls';

/**
 * The Controls screen's body: one tab per `CONTROL_GROUPS` entry and the lines of the selected one.
 * The Overlay hosts it and forwards Left / Right to `step`.
 */
export class ControlsScreen {
  readonly element: HTMLDivElement;
  private readonly tabs: HTMLDivElement;
  private readonly list: HTMLUListElement;
  private group: ControlGroup = 'room';

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'menu__controls-screen';
    this.element.innerHTML = `
      <div class="menu__tabs" role="tablist">
        ${CONTROL_GROUPS.map(
          (g) => `<button type="button" class="ui-btn" role="tab" data-nav data-group="${g.id}">${g.label}</button>`,
        ).join('')}
      </div>
      <div class="menu__body"><ul class="menu__controls"></ul></div>`;
    this.tabs = this.element.querySelector('.menu__tabs')!;
    this.list = this.element.querySelector('ul')!;
    this.tabs.addEventListener('click', (e) => {
      const group = (e.target as HTMLElement).closest<HTMLElement>('[data-group]')?.dataset.group as ControlGroup | undefined;
      if (group) this.select(group);
    });
    this.select(this.group);
  }

  /** Previous / next tab (wrapping), keeping the focus on the tab strip. */
  step(direction: 1 | -1): void {
    const at = CONTROL_GROUPS.findIndex((g) => g.id === this.group);
    const next = CONTROL_GROUPS[(at + direction + CONTROL_GROUPS.length) % CONTROL_GROUPS.length]!;
    this.select(next.id);
    this.tabs.querySelector<HTMLElement>(`[data-group="${next.id}"]`)?.focus();
  }

  private select(group: ControlGroup): void {
    this.group = group;
    for (const tab of this.tabs.querySelectorAll<HTMLElement>('[data-group]')) {
      tab.setAttribute('aria-selected', String(tab.dataset.group === group));
    }
    this.list.innerHTML = CONTROLS.filter((c) => (c.group ?? 'room') === group)
      .map((c) => `<li>${c.html}</li>`)
      .join('');
  }
}
