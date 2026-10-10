import type { Game, PlatformId } from '@/catalog/types';
import { KEYS, PersistedStore } from '@/persistence';
import { gameDayRandom } from '@/time/daily';
import { chance, pick } from '@/random';
import { gameFit } from '@/social/gifts';
import { personAtDoor } from '@/social/people';
import { doorKey } from '@/world/stairwell/building';
import { refreshBoard, type BoardNote } from './boardNotes';
import { befriend, COLD, friendship } from './friendship';
import { isPartyDay, partyGuests } from './neighboursParty';
import { isHomeAt, residentAt } from './residentsHome';

/*
 * THE FILM NIGHT in the courtyard ("le ciné de cour"): once the flat has its projector, the sheet rolled up on the
 * workshop's back wall in the yard (`world/courtyard/YardCinema`) puts on a film: the player picks one of their games
 * (`ui/ScreeningPanel`), its longplay is the film. The hall's board says so (`cinemaNotes`). The first dry evening
 * the player is in the yard after dark, the residents who are home come down with their chairs, sit before the sheet
 * and watch what the projector throws on it; when the film has run its course they clap, think the better of the
 * player, and the one it meant most to comes over: a word about it, and from a friend something out of their cupboard
 * left on their chair. Nothing happens while the player is elsewhere (the film waits for the next evening), nor on
 * the neighbours' party's day. What was put on, and the screenings shown, are kept.
 */

export const CINEMA = {
  /** Dark enough for the picture: the sky's daylight under this. */
  dark: 0.12,
  /** The last hour they still come down (game hours; past midnight counts as late too). */
  until: 23.5,
  /** Too wet for it: rain over this (snow is fine: blankets). */
  rain: 0.15,
  /** Seconds of picture that make a whole screening (the film's "end": the claps). */
  film: 180,
  /** What coming to a screening raises each resident's friendship by (once a day). */
  warmth: 4,
  /** A resident who is home comes down with this chance, more the warmer they are with the player (per point of warmth). */
  come: 0.55,
  comePerWarmth: 0.012,
  /** The one the film meant most to brings something from their cupboard from this friendship, if the film is their kind. */
  giftFrom: 20,
  giftFit: 0.5,
} as const;

/** The film put on: the game whose longplay it is (enough of it for the tastes), and the game day it was put on. */
interface Planned {
  id: string;
  title: string;
  platform: PlatformId;
  year?: number;
  genre?: string;
  day: number;
}

interface State {
  planned: Planned | null;
  /** Screenings shown. */
  shown: number;
}

const store = new PersistedStore<State>({
  key: KEYS.yardCinema,
  version: 1,
  defaults: () => ({ planned: null, shown: 0 }),
  read: (data) => {
    const d = data as Partial<State> | null;
    if (!d || typeof d.shown !== 'number') return null;
    const p = d.planned as Partial<Planned> | null | undefined;
    const planned = p && typeof p.id === 'string' && typeof p.title === 'string' && typeof p.platform === 'string' && typeof p.day === 'number' ? (p as Planned) : null;
    return { planned, shown: d.shown };
  },
});
let state: State = store.load();
const listeners = new Set<() => void>();

function save(next: State): void {
  state = next;
  store.save(state);
  refreshBoard();
  for (const listener of listeners) listener();
}

/** The film put on and not shown yet, or null. */
export function plannedFilm(): Readonly<Planned> | null {
  return state.planned;
}

/** The film put on changed (picked, shown): the yard re-dresses. Returns the unsubscribe. */
export function onCinemaChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Puts `game` on for the next dry evening (a film already put on is replaced). */
export function putOnFilm(game: Pick<Game, 'id' | 'title' | 'platform' | 'releaseDate' | 'genre'>, day: number): void {
  const year = game.releaseDate ? Number(game.releaseDate.slice(0, 4)) : NaN;
  save({ ...state, planned: { id: game.id, title: game.title, platform: game.platform, ...(Number.isFinite(year) ? { year } : {}), ...(game.genre ? { genre: game.genre } : {}), day } });
}

/** The game day `?debug` asked for a screening on, whatever the hour and the sky (this page only; -1: none). */
let forcedOn = -1;

/** `?debug`: `game` is put on and the film night is on now, dark or not. */
export function forceFilmNight(game: Pick<Game, 'id' | 'title' | 'platform' | 'releaseDate' | 'genre'>, day: number): void {
  forcedOn = day;
  putOnFilm(game, day);
}

/** The evening's sky and hour: whether the yard can have its film now (a film put on, dark, dry, not too late, no party). */
export function filmNightNow(day: number, date: Date, sky: { hours: number; daylight: number; rain: number }): 'none' | 'wet' | 'on' {
  if (!state.planned || isPartyDay(day, date)) return 'none';
  if (forcedOn === day) return 'on';
  const evening = sky.hours >= 12 ? sky.hours < CINEMA.until : false;
  if (!evening || sky.daylight > CINEMA.dark) return 'none';
  return sky.rain > CINEMA.rain ? 'wet' : 'on';
}

/** A resident come down to the film: their door, name, look's seed. */
export interface Viewer {
  k: number;
  i: number;
  name: string;
  seed: number;
}

/**
 * Who comes down tonight (game day `day`, at `hours`): the residents who are home and not cross with the player, each
 * with a chance that grows with how they stand with them; the same for the same evening and film.
 */
export function audience(day: number, hours: number): Viewer[] {
  const film = state.planned;
  if (!film) return [];
  const random = gameDayRandom(`cinema:${film.id}`, day);
  return partyGuests().filter((g) => {
    const r = residentAt(g.k, g.i);
    const warmth = friendship(doorKey(g.k, g.i));
    const roll = chance(random, Math.min(0.95, CINEMA.come + Math.max(0, warmth) * CINEMA.comePerWarmth));
    return (forcedOn === day || !r || isHomeAt(r, hours)) && warmth > COLD && roll;
  });
}

/** What the one the film meant most to does after it: a word about it, or a word and a game left on their chair. */
interface Afterwards {
  viewer: Viewer;
  line: string;
  /** They leave a game from their cupboard on their chair. */
  gift: boolean;
}

/** What they remember of it, by the film (`{title}`): their own past with the game. */
const MEMORIES = [
  'I played {title} at my cousin’s every holiday. He never let me have the second pad.',
  '{title}! My brother and I fell out over that one for a whole summer.',
  'I’d forgotten the music of {title}. I could hum it all the way up the stairs now.',
  'We had {title} on rent from the video shop, three days at a time. I never saw the end.',
  'My dad used to play {title} after we’d gone to bed. We heard it through the wall.',
];
const GIFTS = [
  'Watching that, I thought of a box in my cupboard. I’ve left it on my chair: it’s better on your shelves.',
  'You should have this, I never play it any more. It’s on my chair, take it before the dew does.',
];

/**
 * The film ran its course with `came` in the yard (game day `day`): each thinks the better of the player, the film is
 * shown (the sheet comes down), and the one it meant most to says so. Null when nobody came (the film stays on).
 */
export function filmShown(day: number, came: readonly Viewer[]): Afterwards | null {
  const film = state.planned;
  if (!film || !came.length) return null;
  for (const v of came) befriend(doorKey(v.k, v.i), CINEMA.warmth, 'yardCinema', day);
  const taste = { title: film.title, platform: film.platform, ...(film.genre ? { genres: [film.genre] } : {}), ...(film.year ? { year: film.year } : {}) };
  const fitOf = (v: Viewer): number => {
    const id = personAtDoor(doorKey(v.k, v.i));
    return id ? gameFit(id, taste) : 0.4;
  };
  const random = gameDayRandom(`cinema-after:${film.id}`, day);
  const best = came.reduce((a, b) => (fitOf(b) > fitOf(a) ? b : a));
  const gift = fitOf(best) >= CINEMA.giftFit && friendship(doorKey(best.k, best.i)) >= CINEMA.giftFrom;
  const line = gift ? pick(random, GIFTS) : pick(random, MEMORIES).replace('{title}', film.title);
  forcedOn = -1;
  save({ planned: null, shown: state.shown + 1 });
  return { viewer: best, line, gift };
}

/** The board's poster while a film is put on: tonight, or (put on a day or more ago) the next dry evening. */
export function cinemaNotes(day: number): BoardNote[] {
  const film = state.planned;
  if (!film) return [];
  const when = film.day >= day ? 'TONIGHT' : 'NEXT DRY EVENING';
  return [
    {
      id: 'yard-cinema',
      title: `FILM NIGHT IN THE COURTYARD · ${when}`,
      lines: [`On the sheet: ${film.title}.`, 'When it’s dark, by the workshop wall.', 'Bring a chair and a blanket.'],
      paper: 0xe8eef6,
      signed: 'Your neighbour with the projector',
      weight: 2,
    },
  ];
}
