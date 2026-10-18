import type { Updatable } from '@/core/Engine';
import type { Honours } from '@/economy/Honours';
import { inHours } from '@/time/clock';
import type { ActivityAware } from '../../zone/lifecycle';
import { Prop } from '../../props/Prop';
import type { Zone } from '../../zone/Zone';
import { HALLWAY_PLAN } from '../../hallway/hallwayPlan'; // imports-ok: friends and guests walk the flat and the stairwell: the visit reads the rooms it crosses
import type { GatheringDeps } from './deps';
import { GATHERING_RULES } from './gatheringPlan';
import type { Occasion } from './host';
import { ClubVisit } from './ClubVisit';
import { MemeVisit, type MemeVisitDeps } from './MemeVisit';
import { GamesNight, nightGuests } from './GamesNight';
import { NightPhotos } from './NightPhotos';
import { OpenHouse } from './OpenHouse';
import { clockShort } from '@/text/clock';
import { formatCount } from '@/text/count';

/** "Sam and Inès", "Sam, Inès and Marco". */
function andList(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]!}`;
}

/** A games night may still start this late (the friends were asked for the evening and the player came home late). */
const NIGHT_LATEST = 22.5;

/** A line of the phone's Invite app for the gatherings: what it asks for, who answers, a word on it, whether it can be asked now. */
interface PhoneEventRow {
  id: 'gamesNight' | 'openHouse';
  label: string;
  /** Who answers the ring (the call screen's name). */
  who: string;
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
  /** Mémé's visits to the flat (docs/grandma.md "The end of the story"). */
  meme?: MemeVisitDeps;
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
  private current: GamesNight | OpenHouse | ClubVisit | MemeVisit | null = null;
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

  /** A gathering is on in the flat right now (the building's power cut waits for it to end). */
  get underWay(): boolean {
    return this.current !== null;
  }

  // --- Occasion -------------------------------------------------------------------------------------

  holds(day: number): boolean {
    const { book } = this.options;
    return this.current !== null || book.nightOn(day) !== null || book.house?.day === day || this.options.meme?.family.visitDay === day;
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
    this.options.meme?.family.tidy(day);
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
    if (night && inHours(hours, [night.hour, NIGHT_LATEST])) {
      host.rang(day);
      this.current = new GamesNight(this.options, day);
      return;
    }
    const house = book.house;
    const { from, until } = GATHERING_RULES.openHouse;
    if (house?.day === day && inHours(hours, [from, until])) {
      host.rang(day);
      this.current = new OpenHouse(this.options, day, this.options.collectionSize());
      return;
    }
    // Mémé's Saturday (planned at hers), or now and then one after her first visit: before the club, she came first.
    const meme = this.options.meme;
    if (meme && !host.rangOn(day) && meme.family.visitAt(day, hours)) {
      host.rang(day);
      this.current = new MemeVisit(this.options, meme, day);
      return;
    }
    const honour = honours?.unvisited;
    const club = GATHERING_RULES.club;
    if (honour && day > honour.day && !host.rangOn(day) && !this.holds(day) && inHours(hours, [club.from, club.until])) {
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
    else if (kind === 'house') this.current = new OpenHouse(this.options, day, this.options.collectionSize());
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
      { id: 'gamesNight', label: 'Have everyone round tonight', who: 'Your friends', note: night ?? 'a games night: PADDLE WARS on the TV', enabled: night === null },
      { id: 'openHouse', label: 'An open house', who: 'THE GAMING WEEKLY', note: house ?? `announced in the paper, ${aheadDays} days from now, from ${from}:00`, enabled: house === null },
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
      host.options.journal?.note('visit', 'Asked everyone round for a games night', { weight: 'note' });
      // A friend gone cold says no on the phone; the others are in.
      const { coming, away } = nightGuests();
      const yes = `${andList(coming.map((f) => f.name))}: “Games night? We’re in. See you around ${clockShort(hour)}!”`;
      const no = away.map((f) => `${f.name}: “I’m busy tonight. Have fun.”`);
      return coming.length === 1 ? `${coming[0]!.name}: “Just us, then? I’m in. See you around ${clockShort(hour)}.”${no.length ? ` ${no.join(' ')}` : ''}` : [yes, ...no].join(' ');
    }
    const why = this.houseRefusal();
    if (why) return why;
    const { aheadDays, from, until } = GATHERING_RULES.openHouse;
    book.announceHouse(day + aheadDays);
    host.options.journal?.note('visit', 'Open house announced in THE GAMING WEEKLY', { weight: 'note' });
    return `THE GAMING WEEKLY: “An open house, lovely. It goes in tomorrow’s paper: the day after, ${from}:00 to ${clockShort(until)}. A few coins at the door for the jar, I’ll put.”`;
  }

  private nightRefusal(): string | null {
    const { host, book } = this.options;
    const day = host.options.day();
    if (this.current) return 'You have people round right now.';
    if (host.options.clock.state.hours >= GATHERING_RULES.gamesNight.callUntil) return 'Too late to ask everyone round tonight. Another day.';
    if (host.rangOn(day) && !book.nightOn(day)) return 'You had a visitor today already. Another day.';
    if (host.invitedOn(day)) return 'Not tonight: you asked a friend round today already.';
    if (!nightGuests().coming.length) return 'Nobody picks up tonight. Your friends are keeping their distance.';
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
      text: `OPEN HOUSE ON FRONT STREET. ${formatCount(article.guests, 'visitor')} climbed the stairs yesterday to see a private collection of old games, boxed and shelved like a museum's.${best}${quote ? ` “${quote}” said one.` : ''}`,
      effect: 'The market has heard of you: your standing there went up.',
      look: 'letter',
      hand: 'print',
    });
    host.options.journal?.note('visit', 'THE GAMING WEEKLY wrote about the open house', { weight: 'note' });
  }

  /** The morning of an open house, at home: a word that it is today. */
  private tellHouse(day: number): void {
    const { book, host } = this.options;
    if (book.house?.day !== day || this.toldHouseDay === day) return;
    const { from, until } = GATHERING_RULES.openHouse;
    if (host.options.clock.state.hours >= until) return;
    this.toldHouseDay = day;
    host.options.notices?.react(`Your open house is today, ${from}:00 to ${clockShort(until)}: the paper printed it.`);
  }

  /** The games nights' photos on the hallway's string, put up with the first. */
  private hangPhotos(): void {
    const photos = this.options.book.photos;
    if (!photos.length) return;
    this.photos ??= this.options.hallway.placeAt(new NightPhotos(), HALLWAY_PLAN.nightPhotos);
    this.photos.show(photos);
  }
}
