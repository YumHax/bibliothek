import type { NoticeActions } from '@/notices';
import { KEYS, PersistedStore } from '@/persistence';
import { addExtras } from '@/social/extras';
import { PROMISE, TIERS } from '@/social/socialPlan';
import { countedToday, nudge, standing } from '@/social/standing';
import type { TalkExtra } from '@/social/talk';
import { addThreadSource } from '@/social/threads';

/*
 * Mme Pereira's welcome (docs/social.md "The first day"): the whole social loop once, on the first day, without a
 * rule said. The concierge is met in the hall on the way out; her first topic is one she loves (her card's
 * `obvious` one: her face lights up before the click). Once she has been talked to, she has a favour: Mrs Roux's
 * parcel, across the player's landing. Said yes to, it is the first promise (a ticket in the conversation, a thread in
 * the People book, a To-do); handed to Mrs Roux, it is kept: a stamp of Mme Pereira's trust and her warmth, so she
 * comes up a tier that same day (her scene, docs/social.md "Tier scenes"), and the next morning her note waits on the
 * fridge (`onWelcomeKept`, for the keepsakes). Let lapse past the next day, it is broken like any promise. A save
 * that met her before this existed never sees it; nor does `?debug`.
 */

const CONCIERGE = 'pereira';
const NEIGHBOUR = 'roux';

type Stage = 'none' | 'asked' | 'promised' | 'kept' | 'broken' | 'declined' | 'skipped';

interface WelcomeSave {
  stage: Stage;
  /** The game day of the last step (asked, promised, kept). */
  day: number;
}

const STAGES: readonly Stage[] = ['none', 'asked', 'promised', 'kept', 'broken', 'declined', 'skipped'];

/** What the welcome needs of the game. */
interface WelcomeDeps {
  day(): number;
  onNewDay(cb: (day: number) => void): void;
  notices: Pick<NoticeActions, 'tip'>;
  /** A line in the day's journal. */
  note(text: string): void;
  /** False plays without it (`?debug`, a save from before the first day). */
  enabled: boolean;
}

/** The welcome's words (in-game, so English). */
const WORDS = {
  ask: 'Anything I can help with?',
  asked: 'Would you? There is a parcel for Mrs Roux, across your landing. My knees and those stairs… Take it up for me?',
  yes: 'I’ll take it up to Mrs Roux',
  yesSaid: 'Thank you. You see? Already one of us.',
  no: 'Sorry, not today',
  noSaid: 'Never mind. I will manage, I always do.',
  deliver: 'A parcel for you, from the lodge',
  delivered: 'From the lodge? Mme Pereira sent you up? How kind. Come by another time, I will make tea.',
  thread: 'Take Mrs Roux’s parcel up to her, across your landing.',
  due: 'today',
  todo: 'Take Mrs Roux’s parcel up to her (5th floor, across your landing).',
  kept: 'Took Mrs Roux’s parcel up for Mme Pereira',
  broken: 'Forgot Mme Pereira’s parcel for Mrs Roux',
} as const;

let store: PersistedStore<WelcomeSave> | null = null;
let state: WelcomeSave = { stage: 'none', day: 0 };
const kept = new Set<(day: number) => void>();

function save(stage: Stage, day: number): void {
  state = { stage, day };
  store?.save(state);
}

/** Hears the welcome kept (once, the day it is): the fridge's first note is hers. Returns the unsubscribe. */
export function onWelcomeKept(cb: (day: number) => void): () => void {
  kept.add(cb);
  return () => kept.delete(cb);
}

/** Starts the welcome: her favour in the conversation, Mrs Roux's hand-over, the thread, the promise's day. */
export function startFirstWelcome(deps: WelcomeDeps): void {
  store = new PersistedStore<WelcomeSave>({
    key: KEYS.firstWelcome,
    version: 1,
    defaults: () => ({ stage: 'none', day: 0 }),
    read: (d) => {
      const v = d as Partial<WelcomeSave> | null;
      return v && STAGES.includes(v.stage as Stage) && typeof v.day === 'number' ? { stage: v.stage as Stage, day: v.day } : null;
    },
  });
  const today = deps.day();
  const saved = store.tryLoad();
  // Kept from the first boot on: a reload later that first day (the save has progress by then) must not skip it.
  if (!saved) save(deps.enabled ? 'none' : 'skipped', today);
  else state = saved;
  // Someone who knew her before the welcome: never.
  const met = standing(CONCIERGE).met;
  if (state.stage === 'none' && met !== null && met < today - 1) save('skipped', today);
  if (state.stage === 'skipped') return;
  // The promise still going: its to-do slip is back after a reload.
  if (state.stage === 'promised') pinTodo(deps);

  addExtras((ctx) => extrasFor(ctx.person, ctx.day, deps));
  addThreadSource((id) => (id === CONCIERGE && state.stage === 'promised' ? [{ person: CONCIERGE, kind: 'promise', text: WORDS.thread, due: WORDS.due, day: state.day }] : []));
  deps.onNewDay((day) => {
    // A promise lets lapse past the day after: broken, like any.
    if (state.stage === 'promised' && day > state.day + 1) {
      save('broken', day);
      nudge(CONCIERGE, { warmth: PROMISE.broken.warmth, trust: PROMISE.broken.trust, why: 'you forgot her parcel', day, memory: 'you forgot my parcel for Mrs Roux', memoryWeight: -8 });
      deps.note(WORDS.broken);
    }
  });
}

/** The parcel's to-do slip, top left, up until it is delivered or the promise lapses. */
function pinTodo(deps: WelcomeDeps): void {
  deps.notices.tip(WORDS.todo, { id: 'welcome-parcel', head: 'To do', until: () => state.stage !== 'promised', ms: Number.POSITIVE_INFINITY });
}

function extrasFor(person: string, day: number, deps: WelcomeDeps): TalkExtra[] {
  if (person === CONCIERGE) {
    // Her favour comes once the first word was had (her loved topic first), the day she was met or the next.
    const met = standing(CONCIERGE).met;
    if (state.stage === 'none' && met !== null && day <= met + 1 && countedToday(CONCIERGE, 'conversation', day)) {
      return [{ id: 'welcome-ask', group: 'talk', label: WORDS.ask, fit: 'loves', run: () => {
        save('asked', day);
        return { line: WORDS.asked };
      } }];
    }
    if (state.stage === 'asked') {
      return [
        { id: 'welcome-yes', group: 'promise', label: WORDS.yes, once: true, due: WORDS.due, fit: 'loves', run: () => {
          save('promised', day);
          pinTodo(deps);
          return { line: WORDS.yesSaid };
        } },
        { id: 'welcome-no', group: 'promise', label: WORDS.no, fit: 'meh', run: () => {
          save('declined', day);
          return { line: WORDS.noSaid };
        } },
      ];
    }
  }
  if (person === NEIGHBOUR && state.stage === 'promised') {
    return [{ id: 'welcome-deliver', group: 'give', label: WORDS.deliver, fit: 'loves', run: () => {
      save('kept', day);
      // The first promise kept: a whole stamp of her trust (raw), her warmth, a memory; Mrs Roux glad of it too. It
      // takes her to Acquaintance at least, whatever was said before: her thanks that evening says so (`tierScenes`).
      const floor = (TIERS.find((t) => t.id === 'acquaintance')?.from ?? 10) + 2;
      const warmth = Math.max(PROMISE.kept.warmth, floor - standing(CONCIERGE).warmth);
      nudge(CONCIERGE, { warmth, trust: PROMISE.kept.trust, raw: true, why: 'you kept your word', day, memory: 'you took my parcel up to Mrs Roux', memoryWeight: 12 });
      nudge(NEIGHBOUR, { warmth: 4, why: 'glad of the parcel', day, memory: 'you brought my parcel up', memoryWeight: 4 });
      deps.note(WORDS.kept);
      for (const cb of [...kept]) cb(day);
      return { line: WORDS.delivered };
    } }];
  }
  return [];
}
