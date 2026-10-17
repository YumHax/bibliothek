import { KEYS, PersistedStore } from '@/persistence';
import { clockShort } from '@/text/clock';
import { gameDayRandom } from '@/time/daily';
import { everyone, findPerson, shortName } from './people';
import { MEME_ID } from './people/family';
import { phoneRefusal } from './phoneHours';
import { hasNumber, isMet, standing } from './standing';
import { threadsOf } from './threads';
import { atLeast, tierOf } from './tiers';
import type { PersonId } from './types';
import { whereNow } from './whereNow';

/*
 * The phone both ways (docs/social.md "The phone"): whether someone picks up now (asleep, at work, or free:
 * `phoneState`), and the friends who ring the player at home. Now and then on a game day one of them (someone deep, a
 * friend or closer, whose number the player has) rings the flat at an hour of the day; picked up in time, the
 * conversation opens over the phone with their first word (`callerOpening`); let ring out, they leave a message on the
 * phone (`messages`), which waits, a light blinking, until it is played. Mémé rings on her own (`world/bedroom/memeRing`).
 * Saved under `KEYS.phoneCalls`.
 */

/** Whether `id` picks up at this hour, and the contacts' word for it. */
interface PhoneState {
  picks: boolean;
  /** "picks up", "asleep until 8:00", "at work until 17:00". */
  note: string;
  kind: 'free' | 'asleep' | 'work';
}

/** A message left on the phone. */
interface PhoneMessage {
  person: PersonId;
  day: number;
  hour: number;
  text: string;
}

interface CallsSave {
  /** The game day drawn, the hour its call is due (null: no call that day), who rang (once rung). */
  day: number;
  hour: number | null;
  rang: PersonId | null;
  messages: PhoneMessage[];
}

/** The share of game days a friend rings, the hours it can be (game hours), and how many messages the phone keeps. */
const CALLS = { odds: 0.35, from: 10.5, to: 20.5, keep: 8 } as const;

let store: PersistedStore<CallsSave> | null = null;
let state: CallsSave | null = null;

function loaded(): CallsSave {
  if (state) return state;
  store = new PersistedStore<CallsSave>({ key: KEYS.phoneCalls, version: 1, defaults: () => ({ day: -1, hour: null, rang: null, messages: [] }), read: readSave });
  state = store.load();
  return state;
}

function readSave(data: unknown): CallsSave | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Partial<CallsSave>;
  const messages = Array.isArray(d.messages) ? d.messages.filter((m): m is PhoneMessage => !!m && typeof m.person === 'string' && typeof m.text === 'string' && typeof m.day === 'number' && typeof m.hour === 'number') : [];
  return { day: typeof d.day === 'number' ? d.day : -1, hour: typeof d.hour === 'number' ? d.hour : null, rang: typeof d.rang === 'string' ? d.rang : null, messages };
}

function save(): void {
  store?.save(loaded());
}

/** Whether `id` picks up at game hour `hour` of `day`: asleep, at work behind a counter, or free. */
export function phoneState(id: PersonId, day: number, hour: number): PhoneState {
  const where = whereNow(id, day, hour);
  const until = where?.until !== undefined && where.until !== null ? ` until ${clockShort(where.until)}` : '';
  if (where?.kind === 'asleep' || phoneRefusal(id, hour) !== null) return { picks: false, note: `asleep${where?.kind === 'asleep' ? until : ''}`, kind: 'asleep' };
  if (where?.kind === 'work') return { picks: false, note: `at work${until}`, kind: 'work' };
  return { picks: true, note: 'picks up', kind: 'free' };
}

/** Why `id` does not pick up now (the phone's line), or null when they do. */
export function callRefusal(id: PersonId, day: number, hour: number): string | null {
  const s = phoneState(id, day, hour);
  if (s.picks) return null;
  if (s.kind === 'work') return `${shortName(id)} doesn’t pick up: ${s.note}.`;
  return phoneRefusal(id, hour) ?? `It rings and rings. ${shortName(id)} is ${s.note}.`;
}

/** Who may ring the player: someone deep (or an old friend), a friend or closer, whose number the player has, free now. */
function mayRing(id: PersonId, day: number, hour: number): boolean {
  const card = findPerson(id);
  if (!card || id === MEME_ID || !isMet(id) || !hasNumber(id)) return false;
  if (card.depth !== 'deep' && card.group !== 'friends') return false;
  const s = standing(id);
  return atLeast(tierOf(s.warmth, s.trust), 'friend') && phoneState(id, day, hour).picks;
}

/** The day's draw, made once a game day: whether someone rings, and at what hour. */
function drawn(day: number): CallsSave {
  const s = loaded();
  if (s.day === day) return s;
  const rand = gameDayRandom('phoneCall', day);
  s.day = day;
  s.rang = null;
  s.hour = rand() < CALLS.odds ? CALLS.from + rand() * (CALLS.to - CALLS.from) : null;
  save();
  return s;
}

/** How late a call can be heard ringing: past this many game hours after its hour, the player was out and it left a message. */
const RING_LATE = 1;

/**
 * Who rings the flat now (their hour of the day come, not rung yet), picked at the hour among who may, or null; `late`
 * when the hour is long gone (the flat's phone was out of earshot: they leave a message without ringing).
 */
export function phoneCaller(day: number, hour: number): { id: PersonId; late: boolean } | null {
  const s = drawn(day);
  if (s.hour === null || s.rang !== null || hour < s.hour) return null;
  const callers = everyone().filter((p) => mayRing(p.id, day, Math.max(s.hour!, Math.min(hour, s.hour! + RING_LATE))));
  if (!callers.length) return null;
  const rand = gameDayRandom('phoneCaller', day);
  return { id: callers[Math.floor(rand() * callers.length)]!.id, late: hour - s.hour > RING_LATE };
}

/** Their first word on the phone when the player picks up: a need they have, else a hello. */
export function callerOpening(id: PersonId, day: number): string {
  const name = shortName(id);
  const need = threadsOf(id, day).find((t) => t.kind !== 'promise');
  if (need) return `Hello? It’s ${name}! Listen, I wanted to ask you something. ${need.text}`;
  const lines = [`Hello? It’s ${name}! I was just thinking of you. How are things?`, `Hey, it’s ${name}! Have you got a minute?`, `It’s ${name}! Nothing urgent, I just felt like a chat.`];
  return lines[Math.floor(gameDayRandom(`callOpening:${id}`, day)() * lines.length)]!;
}

/** The message `id` leaves when nobody picks up. */
function messageOf(id: PersonId, day: number): string {
  const name = shortName(id);
  const need = threadsOf(id, day).find((t) => t.kind !== 'promise');
  if (need) return `Hi, it’s ${name}. ${need.text} Call me back when you can!`;
  const memory = standing(id).memories.find((m) => m.weight > 0 && day - m.day >= 1);
  if (memory) return `Hi, it’s ${name}. I was just thinking about when ${memory.text}. Call me when you can!`;
  return `Hi, it’s ${name}! Nothing urgent, I just wanted to hear how you are. Call me back!`;
}

/** The call was answered (the conversation opens) or rang out (a message waits): either way, the day's call is done. */
export function callEnded(id: PersonId, day: number, hour: number, answered: boolean): void {
  const s = drawn(day);
  s.rang = id;
  if (!answered) {
    s.messages.push({ person: id, day, hour, text: messageOf(id, day) });
    if (s.messages.length > CALLS.keep) s.messages.splice(0, s.messages.length - CALLS.keep);
  }
  save();
}

/** The messages waiting on the phone, oldest first. */
export function messages(): readonly PhoneMessage[] {
  return loaded().messages;
}

/** Plays the messages (they are gone once heard): oldest first. */
export function playMessages(): PhoneMessage[] {
  const s = loaded();
  const heard = s.messages;
  s.messages = [];
  save();
  return heard;
}
