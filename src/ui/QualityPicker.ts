import { QUALITY, QUALITY_LEVELS, setQuality, type QualityLevel } from '@/graphics';

const LABELS: Record<QualityLevel, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/**
 * "Graphics: Low / Medium / High" on the start card. Materials and passes are built once from the
 * setting, so picking another level saves it and reloads the page. Clicks stay inside the row:
 * the card around it starts the game on click.
 */
export class QualityPicker {
  readonly element: HTMLDivElement;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'quality-picker';
    this.element.innerHTML = `<span>Graphics</span>${QUALITY_LEVELS.map(
      (level) => `<button type="button" data-level="${level}" aria-pressed="${level === QUALITY.level}">${LABELS[level]}</button>`,
    ).join('')}`;
    this.element.addEventListener('click', (e) => {
      e.stopPropagation();
      const level = (e.target as HTMLElement).closest('button')?.dataset.level as QualityLevel | undefined;
      if (level && level !== QUALITY.level) setQuality(level);
    });
  }
}
