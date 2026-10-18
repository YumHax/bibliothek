import { QUALITY, QUALITY_LEVELS, recommendedQuality, setQuality, type QualityLevel } from '@/graphics';
import type { ConfirmOptions } from './Overlay';
import { html, paint } from './panel/html';

const LABELS: Record<QualityLevel, string> = { low: 'Low', medium: 'Medium', high: 'High' };

/**
 * "Low / Medium / High" in the Settings screen (`Overlay.addSetting`). Materials and passes are
 * built once from the setting, so picking another level asks first, then saves it and reloads the
 * page. The level suggested for this device is marked.
 */
export class QualityPicker {
  readonly element: HTMLDivElement;
  /** Shown under the buttons by the Settings screen. */
  static readonly NOTE = 'Applying another level reloads the page (your progress is saved).';

  constructor(confirm: (options: ConfirmOptions) => void) {
    const recommended = recommendedQuality();
    this.element = document.createElement('div');
    this.element.className = 'quality-picker menu__segmented';
    this.element.setAttribute('role', 'radiogroup');
    this.element.setAttribute('aria-label', 'Graphics quality');
    paint(
      this.element,
      html`${QUALITY_LEVELS.map(
        (level) =>
          html`<button type="button" class="ui-btn" role="radio" data-level="${level}" aria-checked="${level === QUALITY.level ? 'true' : 'false'}">${LABELS[level]}${level === recommended ? html` <small>recommended</small>` : ''}</button>`,
      )}`,
    );
    this.element.addEventListener('click', (e) => {
      const level = (e.target as HTMLElement).closest('button')?.dataset.level as QualityLevel | undefined;
      if (!level || level === QUALITY.level) return;
      confirm({
        title: `${LABELS[level]} graphics?`,
        message: 'The page reloads to rebuild the room with the new level. Your progress is saved.',
        yes: 'Reload now',
        onYes: () => setQuality(level),
      });
    });
  }
}
