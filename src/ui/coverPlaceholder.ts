import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { escapeHtml } from './html';

/**
 * A cover that does not load (no box art for that game, the art server down) becomes a small made-up
 * box instead of an empty frame: the platform's colour, its short name on a band, the title. One
 * listener for every panel's thumbnails (`.catalogue__cover` images, `installCoverPlaceholders`); a
 * thumbnail made with `coverAttrs` says its title and platform, others borrow the row's title.
 */
export function coverAttrs(game: Game): string {
  const platform = getPlatform(game.platform);
  const colour = `#${platform.accentColor.toString(16).padStart(6, '0')}`;
  return ` data-cover-title="${escapeHtml(game.title)}" data-cover-platform="${escapeHtml(platform.shortName)}" data-cover-colour="${colour}"`;
}

/** Listens under `root` (capture: before each panel's own handler) for thumbnails that fail. Returns the unsubscribe. */
export function installCoverPlaceholders(root: HTMLElement): () => void {
  const onError = (e: Event): void => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.classList.contains('catalogue__cover')) return;
    img.replaceWith(placeholder(img));
  };
  root.addEventListener('error', onError, true);
  return () => root.removeEventListener('error', onError, true);
}

function placeholder(img: HTMLImageElement): HTMLElement {
  const row = img.closest('[data-result], .catalogue__row, li, tr, article');
  const title = img.dataset.coverTitle ?? row?.querySelector('.catalogue__title, h3, h4, strong')?.textContent?.trim() ?? '';
  const box = document.createElement('span');
  box.className = 'catalogue__cover catalogue__cover--placeholder';
  box.setAttribute('aria-hidden', 'true');
  if (img.dataset.coverColour) box.style.setProperty('--cover-colour', img.dataset.coverColour);
  const band = document.createElement('span');
  band.className = 'catalogue__cover-band';
  band.textContent = img.dataset.coverPlatform ?? '';
  const name = document.createElement('span');
  name.className = 'catalogue__cover-title';
  name.textContent = title;
  box.append(band, name);
  return box;
}
