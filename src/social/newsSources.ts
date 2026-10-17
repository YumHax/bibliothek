import type { Game } from '@/catalog/types';
import { isGrail } from '@/economy/grails';
import { onBlackout } from '@/building/blackout';
import type { JournalEntry } from '@/journal/Journal';
import { addNews, type PlayerNews } from './news';
import type { NewsTag } from './socialPlan';
import { onStreetMark } from './street/streetMarks';

/*
 * Where the player's news comes from (docs/social.md "Your news"): what the stores and features already tell anyone,
 * turned into the player's own line, each once (`news.addNews` keeps an id once). A game come into the collection
 * (by where it came from), a grail or a sealed copy, a medal at the arcade, a Sunday at Mémé's, a console mended, the
 * power cut, the stray come home and the street's other moments, a games night, an open house, the club's visit, one
 * of Félix's copies back on his shelf. Started once at boot (`bootstrap/social`): what is already there is not news.
 */

/** What the news reads. */
interface NewsDeps {
  day(): number;
  collection: { readonly games: readonly Game[]; readonly lastChange?: 'import' | 'edit'; subscribe(cb: () => void): () => void };
  medals: { readonly total: number; subscribe(cb: () => void): () => void };
  grandma: { subscribe(listener: (event: { kind: string; sunday?: boolean }) => void): () => void };
  workshop: { readonly repaired: number; subscribe(cb: () => void): () => void };
  journal: { readonly today: { day: string; entries: readonly JournalEntry[] }; subscribe(cb: () => void): () => void };
}

function news(id: string, say: string, tags: readonly NewsTag[], icon: string, day: number, game?: Game): PlayerNews {
  return { id, say, tags, icon, day, ...(game ? { game: { id: game.id, title: game.title, platform: game.platform, ...(game.genre ? { genres: [game.genre.toLowerCase()] } : {}), ...(game.releaseDate ? { year: Number(game.releaseDate.slice(0, 4)) } : {}) } } : {}) };
}

/** A game just come into the collection, said by where it came from (null: nothing to tell, a loan). */
function gameNews(game: Game, day: number): PlayerNews | null {
  const where = game.acquired?.where.toLowerCase() ?? '';
  if (where.startsWith('borrowed')) return null;
  const id = `game:${game.id}`;
  const t = game.title;
  if (isGrail(game.id)) return news(id, `I finally got ${t}. The real thing!`, ['games', 'collection'], 'trophy', day, game);
  if (game.variant === 'sealed') return news(id, `I found ${t} still sealed!`, ['games', 'collection'], 'star', day, game);
  const gift = /^a gift from (.+)$/i.exec(game.acquired?.where ?? '')?.[1];
  if (gift) return news(id, `${gift} gave me ${t}!`, ['games', 'family'], 'gift', day, game);
  const cheap = (game.acquired?.price ?? 1) <= 15;
  if (where.includes('bin')) return news(id, `I dug ${t} out of the bargain bin!`, ['games', 'bargain'], 'games', day, game);
  if (where.includes('stall') || where.includes('market')) return news(id, `I found ${t} at the market!`, cheap ? ['games', 'bargain'] : ['games', 'collection'], 'games', day, game);
  if (where.includes('lot') || where.includes('sale')) return news(id, `I came home with ${t} from a sale!`, ['games', 'collection'], 'games', day, game);
  if (where.includes('swap')) return news(id, `I swapped my way to ${t}!`, ['games'], 'games', day, game);
  return news(id, `I got hold of ${t}!`, ['games'], 'games', day, game);
}

/** The street's moments worth telling (`streetMarks`), as the player says them. */
const STREET_NEWS: Partial<Record<string, { say: string; tags: readonly NewsTag[]; icon: string }>> = {
  strayHome: { say: 'The stray cat from Front Street lives with me now!', tags: ['cat', 'street'], icon: 'cat' },
  scratchBig: { say: 'I won big on a scratch card!', tags: ['street', 'bargain'], icon: 'coin' },
  garageFind: { say: 'I found a gem on the garage sale’s table!', tags: ['street', 'bargain', 'games'], icon: 'games' },
  felixFromVictor: { say: 'I bought one of uncle Félix’s games back from Victor!', tags: ['family', 'collection'], icon: 'family' },
  wagerWon: { say: 'I beat Victor to a copy. He owes me an espresso!', tags: ['games', 'bargain'], icon: 'trophy' },
  mansionFind: { say: 'Someone at the Mansions left me a game on the step!', tags: ['street', 'games'], icon: 'gift' },
};

/** Lines of the day's journal that make news, by kind and their words. */
const JOURNAL_NEWS: readonly { kind: string; match: RegExp; id: string; say: string; tags: readonly NewsTag[]; icon: string }[] = [
  { kind: 'visit', match: /^Games night/, id: 'gamesNight', say: 'We had a games night at mine!', tags: ['party', 'games'], icon: 'games' },
  { kind: 'visit', match: /^Open house:/, id: 'openHouse', say: 'I opened my flat to visitors. The stairs were packed!', tags: ['party', 'collection'], icon: 'people' },
  { kind: 'visit', match: /^The club came/, id: 'club', say: 'The collectors’ club came to see my collection!', tags: ['collection', 'games'], icon: 'trophy' },
  { kind: 'home', match: /^Adopted a cat/, id: 'catAdopted', say: 'I adopted a cat!', tags: ['cat'], icon: 'cat' },
  { kind: 'story', match: /back on uncle Félix’s shelf$/, id: 'felixShelf', say: 'Another of uncle Félix’s games is back on his shelf.', tags: ['family', 'collection'], icon: 'family' },
];

/** Starts the news: from now on, what happens is something to tell. */
export function startNews(deps: NewsDeps): void {
  // The collection: what was owned at boot is not news; a file imported is not either.
  let owned = new Set(deps.collection.games.filter((g) => (g.status ?? 'owned') !== 'wishlist').map((g) => g.id));
  deps.collection.subscribe(() => {
    const now = deps.collection.games.filter((g) => (g.status ?? 'owned') !== 'wishlist');
    if (deps.collection.lastChange !== 'import') {
      for (const game of now) {
        if (owned.has(game.id)) continue;
        const n = gameNews(game, deps.day());
        if (n) addNews(n);
      }
    }
    owned = new Set(now.map((g) => g.id));
  });
  let medals = deps.medals.total;
  deps.medals.subscribe(() => {
    if (deps.medals.total > medals) addNews(news(`medal:${deps.medals.total}`, 'I won a medal at the arcade!', ['arcade', 'games'], 'trophy', deps.day()));
    medals = deps.medals.total;
  });
  let repaired = deps.workshop.repaired;
  deps.workshop.subscribe(() => {
    if (deps.workshop.repaired > repaired) addNews(news(`mended:${deps.workshop.repaired}`, 'I mended a broken console at my kitchen table!', ['games', 'collection'], 'tools', deps.day()));
    repaired = deps.workshop.repaired;
  });
  deps.grandma.subscribe((event) => {
    if (event.kind !== 'visit') return;
    const day = deps.day();
    addNews(event.sunday ? news(`meme:${day}`, 'I had Sunday lunch at my grandmother’s.', ['family'], 'family', day) : news(`meme:${day}`, 'I went to see my grandmother.', ['family'], 'family', day));
  });
  onBlackout((cut) => {
    if (cut) addNews(news(`blackout:${deps.day()}`, 'Did you see? The whole building lost its power!', ['building'], 'bolt', deps.day()));
  });
  onStreetMark((mark) => {
    const n = STREET_NEWS[mark];
    if (n) addNews(news(`street:${mark}`, n.say, n.tags, n.icon, deps.day()));
  });
  // The journal: what the gatherings and the story write there anyway (each line read once).
  let page = deps.journal.today.day;
  let read = deps.journal.today.entries.length;
  deps.journal.subscribe(() => {
    const today = deps.journal.today;
    if (today.day !== page) [page, read] = [today.day, 0];
    for (const entry of today.entries.slice(read)) {
      const n = JOURNAL_NEWS.find((j) => j.kind === entry.kind && j.match.test(entry.text));
      if (n) addNews(news(`${n.id}:${deps.day()}`, n.say, n.tags, n.icon, deps.day()));
    }
    read = today.entries.length;
  });
}
