import { inHours, type HourPair, type HourSpan } from './clock';

/*
 * What is on, and when, declared once per feature and read by everyone who tells the player about it (the street's
 * news and bills, the board, the journal) and by the feature itself, so the paper never contradicts the pavement.
 * A `Schedule` says which day it follows (the REAL date for what the street does for everyone that date: the
 * collector, the garage sale, the cast-off box, the tournament; the GAME day for what the game's own calendar runs:
 * the market's fairs, the saleroom's sale), on which of those days it is on, between which hours, and in what
 * weather. `isOn` is the one rule all of them are judged by; `keptAway` the weather's part of it on its own.
 */

type ClockKind = 'real' | 'game';

/** Rain and snow now, 0..1 (`SkyState`). */
export interface Weather {
  readonly rain: number;
  readonly snow: number;
}

/** The moment a schedule is judged at: the real date, the game day and the hour of it, the weather. */
export interface Moment {
  readonly date: Date;
  readonly gameDay: number;
  readonly hours: number;
  readonly weather: Weather;
}

export interface Schedule {
  readonly id: string;
  /** Which day it follows (see above). */
  readonly clock: ClockKind;
  /** Whether it is one of its days: `day` is the real date or the game day, as `clock` says. */
  isDay(day: Date | number): boolean;
  /** The hours it is on during its day; absent: all day. */
  readonly hours?: HourSpan | HourPair;
  /** Whether the weather lets it happen; absent: any weather. */
  presence?(weather: Weather): boolean;
}

/** A schedule on the REAL date: `isDay` gets the date. */
export function realDays(id: string, isDay: (date: Date) => boolean, rest: Pick<Schedule, 'hours' | 'presence'> = {}): Schedule {
  return { id, clock: 'real', isDay: (day) => isDay(day instanceof Date ? day : new Date()), ...rest };
}

/** A schedule on the GAME day: `isDay` gets the day count. */
export function gameDays(id: string, isDay: (day: number) => boolean, rest: Pick<Schedule, 'hours' | 'presence'> = {}): Schedule {
  return { id, clock: 'game', isDay: (day) => isDay(typeof day === 'number' ? day : NaN), ...rest };
}

/** Whether today (by the schedule's own clock) is one of its days. */
function onToday(schedule: Schedule, moment: Pick<Moment, 'date' | 'gameDay'>): boolean {
  return schedule.isDay(schedule.clock === 'real' ? moment.date : moment.gameDay);
}

/** Whether the weather keeps it away (false when the schedule has no weather rule). */
export function keptAway(schedule: Schedule, weather: Weather): boolean {
  return schedule.presence ? !schedule.presence(weather) : false;
}

/** Whether it is on now: its day, within its hours, in weather it comes out in. */
function isOn(schedule: Schedule, moment: Moment): boolean {
  if (!onToday(schedule, moment)) return false;
  if (schedule.hours && !inHours(moment.hours, schedule.hours)) return false;
  return !keptAway(schedule, moment.weather);
}

/** The schedules by id, for whoever assembles "what's on" (`register` at the feature's module, `get` by name). */
class ScheduleBook {
  private readonly byId = new Map<string, Schedule>();

  register<S extends Schedule>(schedule: S): S {
    this.byId.set(schedule.id, schedule);
    return schedule;
  }

  get(id: string): Schedule | undefined {
    return this.byId.get(id);
  }

  /** Every registered schedule that is on at `moment`, in registration order. */
  on(moment: Moment): Schedule[] {
    return [...this.byId.values()].filter((s) => isOn(s, moment));
  }

  /** Every registered schedule whose day today is (whatever the hour and the weather), in registration order. */
  today(moment: Pick<Moment, 'date' | 'gameDay'>): Schedule[] {
    return [...this.byId.values()].filter((s) => onToday(s, moment));
  }
}

/** The game's one book of schedules. */
export const SCHEDULES = new ScheduleBook();
