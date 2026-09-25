import { QUALITY, QUALITY_LEVELS, setQuality, type QualityLevel } from '@/graphics';

const LABELS: Record<QualityLevel, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/**
 * "Low / Medium / High" in the Settings screen (`Overlay.addSetting`). Materials and passes are
 * built once from the setting, so picking another level saves it and reloads the page.
 */
export class QualityPicker {
  readonly element: HTMLDivElement;
  /** Shown under the buttons by the Settings screen. */
  static readonly NOTE = 'Changing it reloads the page.';

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'quality-picker';
    this.element.setAttribute('role', 'group');
    this.element.innerHTML = QUALITY_LEVELS.map(
      (level) => `<button type="button" class="ui-btn" data-level="${level}" aria-pressed="${level === QUALITY.level}">${LABELS[level]}</button>`,
    ).join('');
    this.element.addEventListener('click', (e) => {
      const level = (e.target as HTMLElement).closest('button')?.dataset.level as QualityLevel | undefined;
      if (level && level !== QUALITY.level) setQuality(level);
    });
  }
}
