import { KEYS, PersistedStore } from '@/persistence';

/*
 * The friends' side of the social layer (docs/social.md "Friends"), saved under `KEYS.friendsLife`: the games the
 * player borrowed from a friend (`lendsGames`: in the collection, but never sold, swapped or given, and gone back
 * when due), the last postcard, the last word a friend put in for the player with someone (`takesSide`), the last
 * unannounced call (`dropsBy`). A module-level store: `economy/Transactions.isKeepsake` reads `isBorrowed`.
 */

/** A game borrowed from a friend: whose, what, when it goes back. */
interface Borrowed {
  gameId: string;
  title: string;
  from: string;
  dueDay: number;
}

interface FriendsLife {
  borrowed: Borrowed[];
  /** The game day of the last postcard. */
  postcard: number;
  /** Friend id -> the game day they last put in a word for the player. */
  sides: Record<string, number>;
  /** The game day of the last unannounced call. */
  dropBy: number;
}

const fresh = (): FriendsLife => ({ borrowed: [], postcard: -99, sides: {}, dropBy: -99 });

let store: PersistedStore<FriendsLife> | null = null;
let state: FriendsLife | null = null;

function loaded(): FriendsLife {
  if (state) return state;
  store = new PersistedStore<FriendsLife>({ key: KEYS.friendsLife, version: 1, defaults: fresh, read: readLife });
  state = store.load();
  return state;
}

function save(): void {
  store?.save(loaded());
}

function readLife(data: unknown): FriendsLife | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<Record<keyof FriendsLife, unknown>>;
  const borrowed = (Array.isArray(d.borrowed) ? d.borrowed : []).filter(
    (b): b is Borrowed => !!b && typeof b === 'object' && typeof (b as Borrowed).gameId === 'string' && typeof (b as Borrowed).title === 'string' && typeof (b as Borrowed).from === 'string' && typeof (b as Borrowed).dueDay === 'number',
  );
  const sides: Record<string, number> = {};
  if (d.sides && typeof d.sides === 'object') for (const [k, v] of Object.entries(d.sides)) if (typeof v === 'number') sides[k] = v;
  return { borrowed, postcard: typeof d.postcard === 'number' ? d.postcard : -99, sides, dropBy: typeof d.dropBy === 'number' ? d.dropBy : -99 };
}

/** Whether the collection's `gameId` is borrowed from a friend (not the player's to sell, swap or give). */
export function isBorrowed(gameId: string): boolean {
  return loaded().borrowed.some((b) => b.gameId === gameId);
}

/** What is borrowed now. */
export function borrowedGames(): readonly Borrowed[] {
  return loaded().borrowed;
}

/** `from` lends the player `game` until `dueDay`. */
export function borrow(entry: Borrowed): void {
  const s = loaded();
  s.borrowed = [...s.borrowed.filter((b) => b.gameId !== entry.gameId), entry];
  save();
}

/** The borrowed game went back (or left the collection). */
export function giveBack(gameId: string): void {
  const s = loaded();
  s.borrowed = s.borrowed.filter((b) => b.gameId !== gameId);
  save();
}

/** The game day of the last postcard, and the record of a new one. */
export function lastPostcard(): number {
  return loaded().postcard;
}
export function postcardSent(day: number): void {
  loaded().postcard = day;
  save();
}

/** The game day `friend` last put in a word for the player, and the record of a new one. */
export function lastSide(friend: string): number {
  return loaded().sides[friend] ?? -99;
}
export function sideTaken(friend: string, day: number): void {
  loaded().sides[friend] = day;
  save();
}

/** The game day of the last unannounced call, and the record of a new one. */
export function lastDropBy(): number {
  return loaded().dropBy;
}
export function droppedBy(day: number): void {
  loaded().dropBy = day;
  save();
}
