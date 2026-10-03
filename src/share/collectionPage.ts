import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { formatReleaseDate } from '@/catalog/format';
import { escapeHtml } from '@/ui/html';
import { formatCount } from '@/ui/money';
import type { CollectionSummary } from './collectionSummary';

/*
 * The collection as a web page to keep or send: one standalone HTML file (styles inline, a few lines of
 * script for the filter), every game a card with its cover from its public source (libretro-thumbnails on
 * GitHub, so the page needs no server), the title on a made-up box when the cover will not load.
 */

/** The page's HTML. `coverUrl` is an address that works anywhere (no same-origin proxy). */
export function collectionPage(summary: CollectionSummary, coverUrl: (game: Game) => string | undefined, who: string): string {
  const chips = summary.platforms
    .map(({ platform, count }) => `<button type="button" data-platform="${escapeHtml(platform.id)}" style="--accent:${hex(platform.accentColor)}">${escapeHtml(platform.shortName)} <b>${count}</b></button>`)
    .join('');
  const pride = summary.pride
    .map((p) => `<li>${cover(p.game, coverUrl)}<strong>${p.grail ? '★ ' : ''}${escapeHtml(p.game.title)}</strong><span>${escapeHtml(getPlatform(p.game.platform).shortName)} · about ${formatCount(p.value)} coins</span></li>`)
    .join('');
  const cards = summary.games.map((game) => card(game, coverUrl)).join('\n');
  const games = summary.games.length;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(who)} · The collection</title>
<style>
:root { --ink: #ece9e2; --dim: rgba(236,233,226,.62); --gold: #d4a52a; --back: #14141b; --card: #1d1d26; color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px clamp(16px, 4vw, 56px) 48px; background: radial-gradient(1200px 500px at 15% 0, rgba(212,165,42,.14), transparent) var(--back); color: var(--ink); font: 16px/1.45 system-ui, -apple-system, 'Segoe UI', sans-serif; }
h1 { margin: 0; font: 400 clamp(40px, 7vw, 76px)/1.05 'DM Serif Display', Georgia, serif; }
.sub { margin: 8px 0 20px; color: var(--dim); }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 28px; }
.chips button { border: 0; border-radius: 99px; padding: 6px 14px; background: var(--accent); color: #101014; font: 600 14px system-ui, sans-serif; cursor: pointer; opacity: .9; }
.chips button[aria-pressed="true"] { outline: 3px solid var(--ink); opacity: 1; }
h2 { margin: 0 0 12px; font: 700 13px system-ui, sans-serif; letter-spacing: .14em; color: var(--gold); }
.pride { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 24px; margin: 0 0 36px; padding: 0; list-style: none; }
.pride li { display: flex; flex-direction: column; gap: 4px; }
.pride strong { font: 400 20px 'DM Serif Display', Georgia, serif; }
.pride span, .meta { color: var(--dim); font-size: 13px; }
.filter { width: min(420px, 100%); margin: 0 0 18px; padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,.18); background: var(--card); color: var(--ink); font: inherit; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 18px; }
.game { display: flex; flex-direction: column; gap: 6px; }
.game[hidden] { display: none; }
.cover { position: relative; aspect-ratio: 5 / 7; display: flex; align-items: flex-end; justify-content: center; }
.cover img { max-width: 100%; max-height: 100%; border-radius: 3px; box-shadow: 0 6px 18px rgba(0,0,0,.5); }
.cover .boxed { position: absolute; inset: 0; display: none; padding: 12px; border-radius: 4px; background: var(--accent); color: #fff; font-weight: 700; font-size: 14px; }
.cover.none .boxed { display: block; }
.cover.none img { display: none; }
.title { font-weight: 600; font-size: 14px; line-height: 1.25; }
footer { margin-top: 40px; color: var(--dim); font-size: 12px; }
</style>
</head>
<body>
<h1>The collection</h1>
<p class="sub">${escapeHtml(who)} · ${games} game${games === 1 ? '' : 's'} · worth about ${formatCount(summary.value)} coins</p>
<div class="chips">${chips}</div>
${pride ? `<h2>PRIDE OF THE SHELVES</h2><ul class="pride">${pride}</ul>` : ''}
<h2>EVERY GAME</h2>
<input class="filter" type="search" placeholder="Filter by title…" aria-label="Filter by title">
<div class="grid">
${cards}
</div>
<footer>Made in Bibliothek · box art from libretro-thumbnails (github.com/libretro-thumbnails)</footer>
<script>
(() => {
  const cards = [...document.querySelectorAll('.game')];
  const filter = document.querySelector('.filter');
  let platform = null;
  const apply = () => {
    const q = filter.value.trim().toLowerCase();
    for (const c of cards) c.hidden = (platform && c.dataset.platform !== platform) || (q && !c.dataset.title.includes(q));
  };
  filter.addEventListener('input', apply);
  for (const b of document.querySelectorAll('.chips button')) b.addEventListener('click', () => {
    platform = platform === b.dataset.platform ? null : b.dataset.platform;
    for (const o of document.querySelectorAll('.chips button')) o.setAttribute('aria-pressed', String(o.dataset.platform === platform));
    apply();
  });
  for (const img of document.querySelectorAll('.cover img')) img.addEventListener('error', () => img.parentElement.classList.add('none'));
})();
</script>
</body>
</html>
`;
}

function card(game: Game, coverUrl: (game: Game) => string | undefined): string {
  const platform = getPlatform(game.platform);
  const notes = [
    platform.shortName,
    game.releaseDate ? formatReleaseDate(game.releaseDate) : undefined,
    game.edition === 'firstPrint' ? 'first print' : game.edition === 'budget' ? 'budget re-release' : undefined,
    game.condition === 'worn' ? 'worn' : game.condition === 'noManual' ? 'no manual' : undefined,
    game.status === 'lent' ? 'lent out' : undefined,
  ].filter(Boolean).join(' · ');
  return `<div class="game" data-platform="${escapeHtml(platform.id)}" data-title="${escapeHtml(game.title.toLowerCase())}">${cover(game, coverUrl)}<span class="title">${escapeHtml(game.title)}</span><span class="meta">${escapeHtml(notes)}</span></div>`;
}

function cover(game: Game, coverUrl: (game: Game) => string | undefined): string {
  const url = coverUrl(game);
  const accent = hex(getPlatform(game.platform).accentColor);
  return `<div class="cover${url ? '' : ' none'}" style="--accent:${accent}">${url ? `<img loading="lazy" alt="" src="${escapeHtml(url)}">` : ''}<span class="boxed">${escapeHtml(game.title)}</span></div>`;
}

const hex = (color: number): string => `#${color.toString(16).padStart(6, '0')}`;
