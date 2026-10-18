import type { Game } from '@/catalog/types';
import { exportSave, importSave, readSaveFile, saveFileName } from '@/settings/saveFile';
import { collectionCard } from '@/share/collectionCard';
import { collectionPage } from '@/share/collectionPage';
import type { CollectionSummary } from '@/share/collectionSummary';
import { download, fileDate } from '@/share/download';
import { action, group } from './fields';
import type { SettingsHost } from './GameSettingsForm';
import { formatCount } from '@/text/count';

interface SaveFileOptions {
  version: string;
  /** The collection as it stands, summed up for the card and the page. */
  summary: () => CollectionSummary;
  /** A game's front cover through the art proxy (same origin: the card's canvas stays exportable). */
  coverUrl: (game: Game) => string | undefined;
  /** A game's front cover anywhere (GitHub): the page needs no server. */
  publicCoverUrl: (game: Game) => string | undefined;
}

/** This browser's progress as a file the player keeps (Save file, and the wipes' "Download a copy first"). */
export function downloadSave(version: string): void {
  const file = exportSave(version);
  download(saveFileName(file), new Blob([JSON.stringify(file)], { type: 'application/json' }));
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
      host.confirm({ title: 'That file is not a save', message: read.reason, yes: 'OK', info: true, onYes: () => undefined });
      return;
    }
    const when = read.file.exportedAt ? ` written ${savedWhen(read.file.exportedAt)}` : '';
    const games = read.games ? ` (${formatCount(read.games, 'game')})` : '';
    host.confirm({
      title: 'Load this save?',
      message: `The save${when}${games} replaces everything in this browser: coins, collection, the flat, the arcade, the market. Settings stay. Download your own save first if you may want it back.`,
      yes: 'Load it',
      danger: true,
      onYes: () => importSave(read.file),
    });
  };

  const saveButton = action('Download save', () => downloadSave(options.version));
  const loadButton = action('Load a save…', () => picker.click());
  const saveGroup = group(saveButton, loadButton);
  saveGroup.append(picker);
  host.addSetting('game', 'Save file', saveGroup, 'Your progress as a file: keep a copy, or carry it to another browser. Loading one replaces this browser’s progress.');

  // The card is drawn first and shown here (the picture as it will be sent); "Save the picture" keeps it.
  const preview = document.createElement('figure');
  preview.className = 'menu__share-preview';
  preview.hidden = true;
  const previewImg = document.createElement('img');
  previewImg.alt = 'Your collection card';
  const previewSave = action('Save the picture', () => {
    if (drawn) download(`bibliothek-collection-${fileDate()}.png`, drawn);
  });
  preview.append(previewImg, previewSave);
  const shareNote = document.createElement('p');
  shareNote.className = 'menu__note';
  let drawn: Blob | null = null;
  let previewUrl: string | null = null;
  const cardButton = action('Collection card (picture)', () => {
    const label = cardButton.textContent;
    cardButton.textContent = 'Drawing the card…';
    cardButton.setAttribute('disabled', '');
    shareNote.textContent = '';
    void collectionCard(options.summary(), options.coverUrl, WHO)
      .then((blob) => {
        drawn = blob;
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = URL.createObjectURL(blob);
        previewImg.src = previewUrl;
        preview.hidden = false;
        previewSave.focus({ preventScroll: true });
      })
      .catch((err) => {
        console.warn('[share] the card could not be drawn', err);
        shareNote.textContent = 'The card could not be drawn this time (the covers would not load). Try again in a moment.';
      })
      .finally(() => {
        cardButton.textContent = label;
        cardButton.removeAttribute('disabled');
      });
  });
  const pageButton = action('Collection page (web page)', () => {
    const html = collectionPage(options.summary(), options.publicCoverUrl, WHO);
    download(`bibliothek-collection-${fileDate()}.html`, new Blob([html], { type: 'text/html' }));
  });
  const shareGroup = group(cardButton, pageButton);
  shareGroup.append(preview, shareNote);
  host.addSetting('game', 'Share your collection', shareGroup, 'A picture of your shelves (every cover, the counts, the worth), or a web page of the whole collection to keep or send.');
}

/** When a save file was written, in words: "today", "yesterday", "on 3 October 2026". */
function savedWhen(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `on ${at.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}
