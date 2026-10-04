import type { Updatable } from '@/core/Engine';
import type { Honours } from '@/economy/Honours';
import type { ActivityAware } from '../../zone/lifecycle';
import { Prop } from '../../props/Prop';
import type { Zone } from '../../zone/Zone';
import { HALLWAY_PLAN } from '../../hallway/hallwayPlan';
import type { GatheringDeps } from './deps';
import { GATHERING_RULES } from './gatheringPlan';
import type { Occasion } from './host';
import { ClubVisit } from './ClubVisit';
import { GamesNight } from './GamesNight';
import { NightPhotos } from './NightPhotos';
import { OpenHouse } from './OpenHouse';

/** A games night may still start this late (the friends were asked for the evening and the player came home late). */
const NIGHT_LATEST = 22.5;

/** A line of the phone's page for the gatherings: what it asks for, a word on it, whether it can be asked now. */
interface PhoneEventRow {
  id: 'gamesNight' | 'openHouse';
  label: string;
  note: string;
  enabled: boolean;
}

export interface GatheringsOptions extends GatheringDeps {
  /** The hallway's zone: the games nights' photos hang there. */
  hallway: Zone;
  /** The sets and consoles completed: the club comes to see each. */
  honours?: Honours;
  /** How many games the collection holds (owned or lent): the paper takes an open house from `minGames`. */
  collectionSize: () => number;
  /** `?gamesnight` / `?openhouse` / `?clubvisit`: that gathering as soon as the player is home (testing). */
  force?: 'night' | 'house' | 'club';
}

/**
 * The gatherings' director (docs/visitors.md "Gatherings"): starts a games night on its evening, an open house on its
 * afternoon, the collectors' club's visit the day after a set is completed, one at a time and never on a day a friend
 * already came; it holds that day and the front door for them (an `Occasion` of the visitors' director). It answers
 * the phone's page (`phoneRows`, `call`), hangs the games nights' photos in the hallway and reads the paper's article
 * the day after an open house. An empty prop in the collection room's zone, so it stops with the flat.
 */
export class Gatherings extends Prop implements Updatable, ActivityAware, Occasion {
  readonly contactShadow = false;
  private current: GamesNight | OpenHouse | ClubVisit | null = null;
  private photos: NightPhotos | null = null;
  private toldHouseDay = -1;
  private forced: GatheringsOptions['force'];

  constructor(private readonly options: GatheringsOptions) {
    super();
    this.name = 'Gatherings';
    this.forced = options.force;
    options.host.attach(this);
    this.hangPhotos();
  }

  // --- Occasion -------------------------------------------------------------------------------------

  holds(day: number): boolean {
    const { book } = this.options;
    return this.current !== null || book.nightOn(day) !== null || book.house?.day === day;
  }

  caller(): string | null {
    return this.current?.party.caller() ?? null;
  }

  answered(): void {
    this.current?.party.answered();
  }

  passing(): boolean {
    return this.current?.party.passing() ?? false;
  }

  // --- the frame ------------------------------------------------------------------------------------

  setZoneActive(active: boolean): void {
    // The flat left the loop (the player went out by the street door): whoever was here has gone home.
    if (active || !this.current) return;
    this.current.party.cancel();
    this.end();
  }

  update(dt: number): void {
    const { host, book } = this.options;
    const day = host.options.day();
    book.tidy(day);
    const current = this.current;
    if (current) {
      current.update(dt);
      if (current.done) this.end();
      return;
    }
    if (!host.options.atHome() || host.options.busy?.()) return;
    this.readPaper(day);
    this.tellHouse(day);
    this.maybeStart(day);
  }

  private end(): void {
    const current = this.current;
    this.current = null;
    current?.finish();
    this.hangPhotos();
  }

  private maybeStart(day: number): void {
    const { host, book, honours } = this.options;
    const { options } = host;
    if (host.visiting || options.doorTaken?.()) return;
    const hours = options.clock.state.hours;
    if (this.forced) return this.startForced(day);
    const night = book.nightOn(day);
    if (night && hours >= night.hour && hours < NIGHT_LATEST) {
      host.rang(day);
      this.current = new GamesNight(this.options, day);
      return;
    }
    const house = book.house;
    const { from, until } = GATHERING_RULES.openHouse;
    if (house?.day === day && hours >= from && hours < until) {
      host.rang(day);
      this.current = new OpenHouse(this.options, day);
      return;
    }
    const honour = honours?.unvisited;
    const club = GATHERING_RULES.club;
    if (honour && day > honour.day && !host.rangOn(day) && !this.holds(day) && hours >= club.from && hours < club.until) {
      host.rang(day);
      this.current = new ClubVisit(this.options, honour, (id) => honours?.visited(id));
    }
  }

  /** `?gamesnight`, `?openhouse`, `?clubvisit`: now, whatever the hour and the book (the club with any honour, or a made-up one). */
  private startForced(day: number): void {
    const { host, honours } = this.options;
    const kind = this.forced;
    this.forced = undefined;
    host.rang(day);
    if (kind === 'night') this.current = new GamesNight(this.options, day);
    else if (kind === 'house') this.current = new OpenHouse(this.options, day);
    else {
      const honour = honours?.unvisited ?? honours?.earned[0] ?? { id: 'set:mario-nes', kind: 'set' as const, name: 'Mario on the NES', platform: 'nes' as const, day, visited: false };
      this.current = new ClubVisit(this.options, honour, (id) => honours?.visited(id));
    }
  }

  // --- the phone ------------------------------------------------------------------------------------

  /** What the phone's page offers: everyone round tonight, the paper for an open house. */
  phoneRows(): PhoneEventRow[] {
    const night = this.nightRefusal();
    const house = this.houseRefusal();
    const { aheadDays, from } = GATHERING_RULES.openHouse;
    return [
      { id: 'gamesNight', label: 'Have everyone round tonight', note: night ?? 'a games night: PADDLE WARS on the TV', enabled: night === null },
      { id: 'openHouse', label: 'Ring THE GAMING WEEKLY', note: house ?? `announce an open house, in ${aheadDays} days from ${from}:00`, enabled: house === null },
    ];
  }

  /** Asks for `id`: what is said on the line. */
  call(id: PhoneEventRow['id']): string {
    const { host, book } = this.options;
    const day = host.options.day();
    if (id === 'gamesNight') {
      const why = this.nightRefusal();
      if (why) return why;
      const { from, inHours } = GATHERING_RULES.gamesNight;
      const hour = Math.max(from, host.options.clock.state.hours + inHours);
      book.planNight(day, hour);
      host.options.journal?.note('visit', 'Asked everyone round for a games night');
      return `Everyone: “Games night? We’re in. See you around ${clockOf(hour)}!”`;
    }
    const why = this.houseRefusal();
    if (why) return why;
    const { aheadDays, from, until } = GATHERING_RULES.openHouse;
    book.announceHouse(day + aheadDays);
    host.options.journal?.note('visit', 'Announced an open house in THE GAMING WEEKLY');
    return `THE GAMING WEEKLY: “An open house, lovely. It goes in tomorrow’s paper: the day after, ${from}:00 to ${clockOf(until)}. Two coins at the door, I’ll put.”`;
  }

  private nightRefusal(): string | null {
    const { host, book } = this.options;
    const day = host.options.day();
    if (this.current) return 'You have people round right now.';
    if (host.options.clock.state.hours >= GATHERING_RULES.gamesNight.callUntil) return 'Too late to ask everyone round tonight. Another day.';
    if (host.rangOn(day) && !book.nightOn(day)) return 'You had a visitor today already. Another day.';
    return book.nightRefusal(day);
  }

  private houseRefusal(): string | null {
    const { host, book, collectionSize } = this.options;
    return book.houseRefusal(host.options.day(), collectionSize());
  }

  // --- the paper and the photos ---------------------------------------------------------------------

  /** The day after an open house, the paper has it: read once at home. */
  private readPaper(day: number): void {
    const { book, host } = this.options;
    const article = book.article;
    if (!article || article.printed || day <= article.day) return;
    book.printed();
    const quote = article.quotes[0];
    const best = article.best ? ` The star of the shelves: ${article.best}.` : '';
    host.options.notices?.read({
      title: 'THE GAMING WEEKLY',
      text: `OPEN HOUSE ON FRONT STREET. ${article.guests} visitor${article.guests === 1 ? '' : 's'} climbed the stairs yesterday to see a private collection of old games, boxed and shelved like a museum's.${best}${quote ? ` “${quote}” said one.` : ''}`,
      effect: 'The market has heard of you: your standing there went up.',
      look: 'letter',
    });
    host.options.journal?.note('visit', 'THE GAMING WEEKLY wrote about the open house');
  }

  /** The morning of an open house, at home: a word that it is today. */
  private tellHouse(day: number): void {
    const { book, host } = this.options;
    if (book.house?.day !== day || this.toldHouseDay === day) return;
    const { from, until } = GATHERING_RULES.openHouse;
    if (host.options.clock.state.hours >= until) return;
    this.toldHouseDay = day;
    host.options.notices?.react(`Your open house is today, ${from}:00 to ${clockOf(until)}: the paper printed it.`);
  }

  /** The games nights' photos on the hallway's string, put up with the first. */
  private hangPhotos(): void {
    const photos = this.options.book.photos;
    if (!photos.length) return;
    this.photos ??= this.options.hallway.placeAt(new NightPhotos(), HALLWAY_PLAN.nightPhotos);
    this.photos.show(photos);
  }
}

/** "19:30" from 19.5. */
function clockOf(hours: number): string {
  const h = Math.floor(hours) % 24;
  const m = Math.round((hours % 1) * 60);
  return `${h}:${String(m).padStart(2, '0')}`;
}
