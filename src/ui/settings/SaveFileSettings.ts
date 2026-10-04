import type { Game } from '@/catalog/types';
import { exportSave, importSave, readSaveFile, saveFileName } from '@/settings/saveFile';
import { collectionCard } from '@/share/collectionCard';
import { collectionPage } from '@/share/collectionPage';
import type { CollectionSummary } from '@/share/collectionSummary';
import { download, fileDate } from '@/share/download';
import { action, group } from './fields';
import type { SettingsHost } from './GameSettingsForm';

interface SaveFileOptions {
  version: string;
  /** The collection as it stands, summed up for the card and the page. */
  summary: () => CollectionSummary;
  /** A game's front cover through the art proxy (same origin: the card's canvas stays exportable). */
  coverUrl: (game: Game) => string | undefined;
  /** A game's front cover anywhere (GitHub): the page needs no server. */
  publicCoverUrl: (game: Game) => string | undefined;
}

/** Whose collection the card names: the collector, plainly (the game has no player name). */
const WHO = 'A collector’s shelves';

/**
 * The Game tab's file sections: the save to a file and back (a file of this browser's progress, loaded
 * in another, replacing what is there after a yes), and the collection to share, as a picture (PNG) or
 * a page (HTML) with every cover.
 */
export function addSaveFileSettings(host: SettingsHost, options: SaveFileOptions): void {
  const picker = document.createElement('input');
  picker.type = 'file';
  picker.accept = 'application/json,.json';
  picker.hidden = true;
  picker.addEventListener('change', () => {
    const file = picker.files?.[0];
    picker.value = '';
    if (file) void loadFrom(file);
  });

  const loadFrom = async (file: File): Promise<void> => {
    const read = readSaveFile(await file.text());
    if (!read.ok) {
      host.confirm({ title: 'Not a save', message: read.reason, yes: 'OK', onYes: () => undefined });
      return;
    }
    const when = read.file.exportedAt ? ` written on ${read.file.exportedAt.slice(0, 10)}` : '';
    const games = read.games ? ` (${read.games} game${read.games === 1 ? '' : 's'})` : '';
    host.confirm({
      title: 'Load this save?',
      message: `The save${when}${games} replaces everything in this browser: coins, collection, the flat, the arcade, the market. Settings stay. Download your own save first if you may want it back.`,
      yes: 'Load it',
      danger: true,
      onYes: () => importSave(read.file),
    });
  };

  const saveButton = action('Download save', () => {
    const file = exportSave(options.version);
    download(saveFileName(file), new Blob([JSON.stringify(file)], { type: 'application/json' }));
  });
  const loadButton = action('Load a save…', () => picker.click());
  const saveGroup = group(saveButton, loadButton);
  saveGroup.append(picker);
  host.addSetting('game', 'Save file', saveGroup, 'Your progress as a file: keep a copy, or carry it to another browser. Loading one replaces this browser’s progress.');

  const cardButton = action('Collection card (PNG)', () => {
    const label = cardButton.textContent;
    cardButton.textContent = 'Drawing the card…';
    cardButton.setAttribute('disabled', '');
    void collectionCard(options.summary(), options.coverUrl, WHO)
      .then((blob) => download(`bibliothek-collection-${fileDate()}.png`, blob))
      .catch((err) => console.warn('[share] the card could not be drawn', err))
      .finally(() => {
        cardButton.textContent = label;
        cardButton.removeAttribute('disabled');
      });
  });
  const pageButton = action('Collection page (HTML)', () => {
    const html = collectionPage(options.summary(), options.publicCoverUrl, WHO);
    download(`bibliothek-collection-${fileDate()}.html`, new Blob([html], { type: 'text/html' }));
  });
  host.addSetting('game', 'Share your collection', group(cardButton, pageButton), 'A picture of your shelves (every cover, the counts, the worth), or a web page of the whole collection to keep or send.');
}
