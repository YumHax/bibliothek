import type { Game, PlatformId } from '@/catalog/types';
import type { NoticeActions } from '@/notices';
import { KEYS, PersistedStore, safeStorage } from '@/persistence';
import type { Ad, ScriptedAd } from '@/classifieds/ads';
import { CLUE_NOTES, KEEPER, LANDLADY_AD, LINES, NEXT_LEADS, PROTOTYPE_ID, STORY_RULES, prototypeGame, type StoryMail, type StoryStage } from './prototype';

/** The stages in order: a clue is found at most once, never out of order. */
const ORDER: readonly StoryStage[] = ['waiting', 'clipping', 'stall', 'radio', 'arcade', 'trader', 'found', 'ended'];

/** What the trail reads of the rest of the game. */
interface StoryDeps {
  /** The game's day (`Today.gameDay`): every gate counts in it. */
  today: { readonly gameDay: number };
  /** The collection: whether the player has started one, and where the found cart goes (the parcel in the hall). */
  collection: { readonly games: readonly Game[]; owns(id: string): boolean; add(game: Game): void };
  /** The day's journal: each clue as a line. */
  journal?: { note(kind: string, text: string, options?: { weight?: 'headline' | 'line' | 'note' }): void };
}

/** The paper's small ads (`Classifieds`): the trail puts Hana's landlady's ad in, and hears when the player goes round. */
interface StoryAds {
  inject(spec: ScriptedAd): void;
  onVisit(cb: (ad: Ad) => void): () => void;
}

/** The journal's page about it: the clues so far, and where to look next. */
interface StoryFile {
  title: string;
  clues: string[];
  next?: string;
  /** How many clues the trail has in all (the journal draws the trail as dots, one a clue). */
  total: number;
  /** The trail is over: the panel folds it to a line. */
  done?: boolean;
}

interface Saved {
  stage: StoryStage;
  /** The game day the stage was reached (the gates and the post's patience count from it). */
  since: number;
}

/**
 * THE LOST PROTOTYPE: a trail followed over many game days through the channels the player meets
 * anyway (the mail on the mat, a stallholder, the morning radio, the arcade's counter, the collector on
 * Front Street, a friend round), each clue unlocking the next, up to the grey cart and its demo on the
 * TV. Nothing to grind: every gate is a day or a place visited, and a channel the player misses gives up
 * after `STORY_RULES.fallbackAfter` days, the post bringing its clue instead. Persisted
 * (`bibliothek.prototypeStory.v1`), tolerant of an unknown or broken save (it starts again from the
 * last stage it can read). The world's people ask it what to say (`atStall`, `onRadio`...): a line
 * returned is the clue told, and the trail moves on.
 */
export class PrototypeStory {
  private state: Saved;
  private readonly store: PersistedStore<Saved>;
  private notices: Pick<NoticeActions, 'react' | 'reward' | 'read'> | null = null;
  private readonly listeners = new Set<() => void>();
  private ads: StoryAds | null = null;

  constructor(private readonly deps: StoryDeps, storage: Storage | null = safeStorage(), key: string = KEYS.prototypeStory) {
    // Version 1: the stage and the day it was reached.
    this.store = new PersistedStore<Saved>({ key, version: 1, storage, defaults: () => ({ stage: 'waiting', since: 0 }), read: readSaved });
    this.state = this.store.load();
    // A save that already holds the cart (an imported collection) is past the trail.
    if (deps.collection.owns(PROTOTYPE_ID) && rank(this.state.stage) < rank('found')) this.state = { stage: 'found', since: deps.today.gameDay };
  }

  /** What tells the player (made after the stores: `bootstrap/ui`). */
  setNotices(notices: Pick<NoticeActions, 'react' | 'reward' | 'read'>): void {
    this.notices = notices;
  }

  /**
   * The small ads, made after the trail (`bootstrap/services`): from the arcade's clue on, Hana's landlady advertises
   * what Hana left behind; going round reaches the collector's clue (`atTrader`'s), the post still bringing it otherwise.
   */
  linkAds(ads: StoryAds): () => void {
    this.ads = ads;
    if (this.state.stage === 'arcade') this.advertise();
    return ads.onVisit((ad) => {
      if (ad.id !== LANDLADY_AD.id || this.state.stage !== 'arcade') return;
      this.reach('trader', `Hana’s landlady: the collector swapped the grey cart to ${KEEPER.name}`);
    });
  }

  /** Hana's landlady's ad, in the paper from the next day (idempotent: `inject` keeps the first). */
  private advertise(): void {
    const { games, hours, ...rest } = LANDLADY_AD;
    this.ads?.inject({ ...rest, games: [...games], hours: [hours[0], hours[1]], fromDay: this.state.since + 1 });
  }

  get stage(): StoryStage {
    return this.state.stage;
  }

  subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  // --- the channels ------------------------------------------------------------------------------

  /** The doormat on coming home (`hallway/mail.ts`): the clipping that starts it, or a channel's clue the post brought. */
  mail(day: number): StoryMail | null {
    const { stage } = this.state;
    if (stage === 'waiting') {
      const owned = this.deps.collection.games.filter((g) => g.status !== 'wishlist').length;
      if (day < STORY_RULES.start.day || owned < STORY_RULES.start.games) return null;
      this.reach('clipping', 'A clipping on the doormat about a lost game');
      return LINES.clipping;
    }
    const after = (STORY_RULES.fallbackAfter as Partial<Record<StoryStage, number>>)[stage];
    if (after === undefined || day - this.state.since < after) return null;
    switch (stage) {
      case 'stall':
        this.reach('radio', 'Radio Brocante wrote back about MOONPOST');
        return LINES.radioLetter;
      case 'radio':
        this.reach('arcade', 'The arcade’s attendant left a note about HAB');
        return LINES.arcadeNote;
      case 'arcade':
        this.reach('trader', 'The collector’s card: he swapped the grey cart');
        return LINES.traderCard;
      case 'trader':
        this.give(`posted by ${KEEPER.name}`);
        return LINES.keeperPostcard;
      default:
        return null;
    }
  }

  /** A stallholder clicked at the flea market: the NES one knows (any of them, a couple of days on), the others send the player there. */
  atStall(platform: PlatformId): string | null {
    if (this.state.stage !== 'clipping') return null;
    if (platform === 'nes' || this.deps.today.gameDay - this.state.since >= STORY_RULES.anyStallAfter) {
      this.reach('stall', `The NES stallholder remembered ${'Halcyon Byte'}`);
      return LINES.stall;
    }
    return LINES.otherStall;
  }

  /** Radio Brocante's morning chronicle is on (`HomeLife.chronicle`): its line about the game, from the morning after the stall's tip. */
  onRadio(): string | null {
    if (this.state.stage !== 'stall' || this.deps.today.gameDay <= this.state.since) return null;
    this.reach('radio', 'Radio Brocante had a caller about MOONPOST');
    return LINES.radio;
  }

  /** The arcade's attendant clicked. */
  atArcadeCounter(): string | null {
    if (this.state.stage !== 'radio') return null;
    this.reach('arcade', 'The arcade’s attendant knew who HAB is');
    return LINES.arcade;
  }

  /** The collector outside RETRO GAMES clicked (on a day he is there). */
  atTrader(): string | null {
    if (this.state.stage !== 'arcade') return null;
    this.reach('trader', `The collector swapped the grey cart to ${KEEPER.name}`);
    return LINES.trader;
  }

  /** A friend round, clicked to chat: the keeper hands the cart over, the others say where it is. */
  atFriend(friendId: string): string | null {
    if (this.state.stage !== 'trader') return null;
    if (friendId !== KEEPER.id) return LINES.otherFriend;
    this.give(`a gift from ${KEEPER.name}`);
    return LINES.keeper;
  }

  /** The demo played to its end on the TV: Hana's letter, and the trail is done. */
  demoFinished(): void {
    if (rank(this.state.stage) >= rank('ended')) return;
    this.reach('ended', 'MOONPOST ran to its end on the TV');
    this.notices?.read({ title: 'A letter, folded in the box', text: LINES.letter, look: 'letter', from: LINES.letterFrom, date: LINES.letterDate });
    this.notices?.reward({ title: 'The lost prototype: delivered', detail: 'MOONPOST ran on your TV, thirty-odd years late. It stays on your shelves.', big: true });
  }

  /** The journal's page: the clues found and the next lead; null before the trail starts. */
  file(): StoryFile | null {
    const { stage } = this.state;
    if (stage === 'waiting') return null;
    const clues = ORDER.slice(1, rank(stage) + 1).map((s) => CLUE_NOTES[s as Exclude<StoryStage, 'waiting'>]);
    const next = NEXT_LEADS[stage];
    return { title: 'The MOONPOST file', clues, total: ORDER.length - 1, ...(next ? { next } : {}), ...(stage === 'ended' ? { done: true } : {}) };
  }

  // --- moving on ---------------------------------------------------------------------------------

  /** The cart into the collection (it waits in the parcel in the hall), from `where`. */
  private give(where: string): void {
    const day = this.deps.today.gameDay;
    if (!this.deps.collection.owns(PROTOTYPE_ID)) this.deps.collection.add(prototypeGame(day, where));
    this.reach('found', `${KEEPER.name} handed over the grey cart: MOONPOST v0.9`);
    this.notices?.reward({ title: 'Found: the lost prototype', detail: 'MOONPOST v0.9, the only cart there is. In the parcel in the hall: put it in the NES.', big: true });
  }

  private reach(stage: StoryStage, journalLine: string): void {
    if (rank(stage) <= rank(this.state.stage)) return;
    this.state = { stage, since: this.deps.today.gameDay };
    this.store.save(this.state);
    this.deps.journal?.note('story', journalLine, { weight: 'headline' });
    if (stage === 'arcade') this.advertise();
    if (stage !== 'found' && stage !== 'ended') this.notices?.react('A new lead: in the journal, the MOONPOST file');
    for (const cb of [...this.listeners]) cb();
  }
}

const rank = (stage: StoryStage): number => ORDER.indexOf(stage);

function readSaved(data: unknown): Saved | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<Saved>;
  const stage = ORDER.includes(d.stage as StoryStage) ? (d.stage as StoryStage) : null;
  if (!stage) return null;
  return { stage, since: typeof d.since === 'number' && Number.isFinite(d.since) ? d.since : 0 };
}
