import { escapeHtml } from '../html';

/**
 * The Settings screen's controls, each a small element with a `set` to follow the store: a slider,
 * an on/off switch and a row of choices. All of them are buttons or range inputs, so the menu's
 * arrow / D-pad navigation reaches them (the Overlay marks them `data-nav`).
 */
export interface Field<T> {
  readonly element: HTMLElement;
  set(value: T): void;
}

export interface SliderOptions {
  min: number;
  max: number;
  step: number;
  format(value: number): string;
  onInput(value: number): void;
}

export function slider(label: string, options: SliderOptions): Field<number> {
  const element = document.createElement('label');
  element.className = 'menu__field menu__field--slider';
  element.innerHTML = `
    <span class="menu__field-label">${escapeHtml(label)}</span>
    <input type="range" min="${options.min}" max="${options.max}" step="${options.step}" />
    <output></output>`;
  const range = element.querySelector('input')!;
  const output = element.querySelector('output')!;
  range.addEventListener('input', () => {
    const value = Number(range.value);
    output.textContent = options.format(value);
    options.onInput(value);
  });
  return {
    element,
    set(value) {
      if (document.activeElement !== range) range.value = String(value);
      output.textContent = options.format(value);
    },
  };
}

export function toggle(label: string, onChange: (on: boolean) => void): Field<boolean> {
  const element = document.createElement('div');
  element.className = 'menu__field';
  element.innerHTML = `
    <span class="menu__field-label">${escapeHtml(label)}</span>
    <button type="button" class="ui-btn menu__switch" role="switch" aria-label="${escapeHtml(label)}"><span></span></button>`;
  const button = element.querySelector('button')!;
  button.addEventListener('click', () => onChange(button.getAttribute('aria-checked') !== 'true'));
  return {
    element,
    set(on) {
      button.setAttribute('aria-checked', String(on));
      button.querySelector('span')!.textContent = on ? 'On' : 'Off';
    },
  };
}

export function choice<T extends string>(label: string, options: ReadonlyArray<{ id: T; label: string }>, onChange: (id: T) => void): Field<T> {
  const element = document.createElement('div');
  element.className = 'menu__field';
  element.innerHTML = `
    <span class="menu__field-label">${escapeHtml(label)}</span>
    <div class="menu__segmented" role="radiogroup" aria-label="${escapeHtml(label)}">
      ${options.map((o) => `<button type="button" class="ui-btn" role="radio" data-choice="${o.id}">${escapeHtml(o.label)}</button>`).join('')}
    </div>`;
  element.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-choice]')?.dataset.choice as T | undefined;
    if (id) onChange(id);
  });
  return {
    element,
    set(value) {
      for (const button of element.querySelectorAll<HTMLElement>('[data-choice]')) {
        button.setAttribute('aria-checked', String(button.dataset.choice === value));
      }
    },
  };
}

/** A plain button row (reset, erase…); `danger` paints it in the warning colour. */
export function action(label: string, onClick: () => void, danger = false): HTMLElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `ui-btn${danger ? ' ui-btn--danger' : ''}`;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

/** Stacks fields into one section body. */
export function group(...children: HTMLElement[]): HTMLElement {
  const element = document.createElement('div');
  element.className = 'menu__fields';
  element.append(...children);
  return element;
}
