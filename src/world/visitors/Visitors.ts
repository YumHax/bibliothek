import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Game, GameStatus } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { GameSource } from '@/collection/GameSource';
import type { SessionActions } from '@/game/SessionActions';
import { seeded } from '@/economy/seeded';
import { BorrowPanel } from '@/ui/BorrowPanel';
import { playDoorbell } from '@/audio/doorbell';
import { proximityVolume } from '@/video/proximityVolume';
import type { ActivityAware } from '../zone/lifecycle';
import type { Zone } from '../zone/Zone';
import { Prop } from '../props/Prop';
import type { DoorCaller } from '../hallway/FrontDoor';
import { HALLWAY_PLAN } from '../hallway/hallwayPlan';
import { ROOM_PLAN } from '../roomPlan';
import { Friend } from './Friend';
import { FRIENDS, SHARED_LINES, VISIT_RULES, type FriendPlan } from './friendsPlan';
import { borrowPick, fill, pickLine, shelfComment, tasteScore, yearOf } from './friendLines';
import { Visit, type DoorLike, type RouteSeat, type VisitRoute, type VisitScript } from './Visit';
import { VisitBook, type Loan, type PlannedVisit } from './VisitBook';

/** The collection as the visitors need it: what is in it, and marking a copy lent or back. */
export interface VisitorsCollection extends GameSource {
  find(id: string): Game | undefined;
  setStatus(id: string, status: GameStatus): void;
  add(game: Game): void;
  owns(id: string): boolean;
}

/** An armchair of the collection room (a `Seat`): where to stand before sitting, and its place and facing. */
export interface VisitorSeat {
  approachPoint(out: THREE.Vector3): THREE.Vector3;
  localToWorld(point: THREE.Vector3): THREE.Vector3;
  getWorldDirection(out: THREE.Vector3): THREE.Vector3;
}

export interface VisitorsOptions {
  /** The collection room's zone: the friends and the director live there (like the cat), and walk the flat. */
  living: Zone;
  /** The hallway's zone: its plan's points are converted from it. */
  hallway: Zone;
  /** The camera. */
  viewer: THREE.Object3D;
  collection: VisitorsCollection;
  /** What is on the shelves (not in the parcel, not lying about): what friends comment on and borrow. */
  shelved: GameSource;
  /** The in-game day (`MarketStock.day`): visits and loans count in it. */
  day: () => number;
  /** The in-game clock: the bell rings in the afternoon or the evening. */
  clock: { readonly state: { readonly hours: number } };
  /** The player is in the flat (not on the stairs, not out). */
  atHome: () => boolean;
  /** The player cannot answer now (asleep, travelling). */
  busy?: () => boolean;
  /** The collection room's armchairs (`ROOM_PLAN.seats` order). */
  seats: readonly VisitorSeat[];
  /**
   * The flat's front door (the hallway's `FrontDoor`), which the friends let themselves out through. It learns who
   * rings through the building's `Doorstep`: hand these visitors to it (`doorstep.also(visitors)`).
   */
  frontDoor: DoorLike | null;
  /** Someone else is at the door (the postman, `Doorstep.waiting`): a friend waits for the landing to clear. */
  doorTaken?: () => boolean;
  /** Walls between the listener and the bell. */
  acoustics?: { wallsBetween(a: THREE.Vector3, b: THREE.Vector3): number };
  /** The collection room's door onto the hallway, opened by a friend if it is shut. */
  livingDoor: DoorLike | null;
  /** Where the borrow panel goes (the game's container). */
  container: HTMLElement;
  /** Coins for a thank-you tip. */
  purse?: { earnCoins(coins: number): void };
  /** Games a friend may give away (the built-in list): one not in the collection, to their taste. */
  giftPool?: readonly Game[];
  /** The cat, when it is about: where it is and its name. */
  cat?: () => { at: THREE.Vector3; name: string } | null;
  /** A line for the HUD (a toast): what a friend says in earshot, a game posted back. */
  notice?: (text: string) => void;
  coverUrl?: (game: Game) => string | undefined;
  /** A game's fame (page views), for the comments. */
  viewsOf?: (game: Game) => number | null | undefined;
  /** `?visit`: a friend rings as soon as the player is home. */
  force?: boolean;
}

const eye = new THREE.Vector3();
const tmp = new THREE.Vector3();
/**
 * Friends who drop by: decides the day and the hour (`VisitBook`), rings the bell with a friend
 * waiting on the landing, tells the front door who is there (a `DoorCaller`, chained behind the
 * building's `Doorstep` with `doorstep.also(visitors)`: the door opens without the keys, and
 * opening it lets them in), then plays the `Visit` out and answers its script: comments
 * on the shelves, a word for the cat, a borrow request (the `BorrowPanel`; the game is marked
 * `lent`, its box wearing the LENT OUT tag, until it comes back), the loan handed back on a later
 * visit (with a tip or a game they no longer want, sometimes) or posted back when long overdue.
 * An empty prop in the collection room's zone, so it ticks with the flat and stops with it.
 */
export class Visitors extends Prop implements Updatable, ActivityAware, DoorCaller {
  readonly contactShadow = false;
  readonly book = new VisitBook();
  private readonly friends = new Map<string, Friend>();
  private readonly route: VisitRoute;
  private readonly panel: BorrowPanel;
  private readonly doorPoint: THREE.Vector3;
  private visit: Visit | null = null;
  private ringing = { since: -1, rings: 0 };
  private askedAt = -1;
  private awayFor = 0;
  private clock = 0;
  private checkedDay = -1;
  private primed = false;
  private forced: boolean;

  constructor(private readonly options: VisitorsOptions) {
    super();
    this.name = 'Visitors';
    this.forced = options.force ?? false;
    const { living, hallway } = options;
    const hall = (p: readonly [number, number]) => living.toLocal(hallway.toWorld(new THREE.Vector3(p[0], 0, p[1])));
    const room = (p: readonly [number, number]) => new THREE.Vector3(p[0], 0, p[1]);
    const hp = HALLWAY_PLAN.visitor;
    const rp = ROOM_PLAN.visitor;
    this.route = {
      stairs: hall(hp.stairs),
      landing: hall(hp.landing),
      inside: hall(hp.inside),
      hallDoor: hall(hp.livingDoor),
      roomDoor: room(rp.door),
      hub: room(rp.hub),
      browse: rp.browse.map((b) => ({ at: room(b.at), yaw: b.yaw, kind: b.kind, via: (b.via ?? []).map(room) })),
      seats: rp.seats.flatMap(({ seat: index, via }) => {
        const seat = options.seats[index];
        return seat ? [this.routeSeat(seat, via.map(room))] : [];
      }),
    };
    // The bell hangs inside, over the front door.
    this.doorPoint = hallway.toWorld(new THREE.Vector3(HALLWAY_PLAN.room.width / 2 - 0.1, 2.1, 0));
    this.panel = new BorrowPanel(options.container);
    for (const plan of FRIENDS) {
      const friend = living.place(new Friend(plan, options.viewer), this.route.stairs.clone());
      friend.setPresent(false);
      // Drawn (under the floor) until the first frame, so the start-up `prime()` compiles their materials.
      friend.visible = true;
      this.friends.set(plan.id, friend);
    }
  }

  // --- DoorCaller -------------------------------------------------------------------------------

  caller(): string | null {
    return this.visit?.atDoor ? this.visit.friend.plan.name : null;
  }

  answered(): void {
    const visit = this.visit;
    if (!visit?.atDoor) return;
    const plan = visit.friend.plan;
    this.book.cameIn(plan.id);
    const random = Math.random;
    this.say(plan, pickLine(plan.lines.greet, random), 'Hi!', true);
    visit.letIn();
  }

  passing(): boolean {
    return this.visit?.passingFront ?? false;
  }

  // --- the frame ----------------------------------------------------------------------------------

  setZoneActive(active: boolean): void {
    // The flat left the loop (the player went out by the street door): whoever was here has gone home.
    if (!active) this.visit?.cancel();
  }

  update(dt: number): void {
    if (!this.primed) {
      this.primed = true;
      for (const friend of this.friends.values()) if (!friend.isPresent) friend.visible = false;
    }
    this.clock += dt;
    const day = this.options.day();
    if (day !== this.checkedDay) {
      this.checkedDay = day;
      this.tidyLoans(day);
    }
    const visit = this.visit;
    if (!visit) {
      this.maybeStart(day);
      return;
    }
    visit.update(dt);
    if (this.visit !== visit) return;
    if (visit.atDoor) this.ringBell(visit);
    else {
      const home = this.options.atHome() || visit.passingFront;
      this.awayFor = home ? 0 : this.awayFor + dt;
      if (this.awayFor > VISIT_RULES.aloneFor) {
        this.options.notice?.(`${visit.friend.plan.name} let themself out.`);
        visit.cancel();
        return;
      }
    }
    const friend = visit.friend;
    if (friend.request && this.clock - this.askedAt > VISIT_RULES.askFor && !this.panel.isOpen) friend.request = null;
  }

  // --- starting and ringing -----------------------------------------------------------------------

  private maybeStart(day: number): void {
    const { options } = this;
    const door = options.frontDoor;
    if (!options.atHome() || options.busy?.() || options.doorTaken?.() || (door && door.isOpen)) return;
    let plan = this.book.plan(day);
    const hours = options.clock.state.hours;
    if (this.forced && !plan) plan = this.forcedPlan();
    if (!plan) return;
    if (!this.forced && (hours < plan.hour || hours >= VISIT_RULES.hours.latest)) return;
    this.forced = false;
    const friend = this.friends.get(plan.friend.id);
    if (!friend) return;
    this.ringing = { since: -1, rings: 0 };
    this.awayFor = 0;
    friend.chat = () => this.chatLine(friend.plan);
    this.visit = new Visit(friend, this.route, options.viewer, { front: door, living: options.livingDoor }, this.script(friend.plan, plan.loan), {
      returning: plan.loan !== null,
      cat: () => options.cat?.()?.at ?? null,
    });
    this.visit.start();
  }

  /** `?visit`: whoever has a loan due, else the first friend without one, right now. */
  private forcedPlan(): PlannedVisit | null {
    const loan = this.book.loans[0] ?? null;
    const friend = FRIENDS.find((f) => (loan ? f.id === loan.friendId : !this.book.loans.some((l) => l.friendId === f.id)));
    return friend ? { friend, hour: 0, loan } : null;
  }

  /** On the landing: the bell now, again a while later, then they give up and go back down. */
  private ringBell(visit: Visit): void {
    const { ringing } = this;
    if (ringing.since < 0) return;
    const waited = this.clock - ringing.since;
    if (ringing.rings === 1 && waited > VISIT_RULES.ringAgainAfter) {
      ringing.rings = 2;
      this.ring();
    } else if (waited > VISIT_RULES.giveUpAfter) {
      ringing.since = -1;
      if (this.options.atHome()) this.options.notice?.(`Nobody answered: ${visit.friend.plan.name} will try another day.`);
      visit.turnAway();
    }
  }

  // --- the visit's script ---------------------------------------------------------------------------

  private script(plan: FriendPlan, loan: Loan | null): VisitScript {
    const random = Math.random;
    return {
      say: (line, word) => this.say(plan, line, word),
      arrived: () => {
        this.book.rang(this.options.day());
        this.ringing = { since: this.clock, rings: 1 };
        this.ring();
      },
      handBack: () => {
        if (loan) this.handBack(plan, loan);
      },
      comment: (kind) => (kind === 'window' ? pickLine(SHARED_LINES.window, random) : shelfComment(plan, this.options.shelved.games, random, this.options.viewsOf)),
      ask: () => this.ask(plan),
      greetCat: () => {
        const cat = this.options.cat?.();
        return cat ? fill(pickLine(SHARED_LINES.cat, random), { cat: cat.name }) : null;
      },
      sitLine: () => pickLine(SHARED_LINES.sit, random),
      leaveLine: () => pickLine(SHARED_LINES.leave, random),
      left: () => this.ended(),
    };
  }

  private ended(): void {
    const visit = this.visit;
    this.visit = null;
    if (visit) {
      visit.friend.request = null;
      visit.friend.chat = null;
    }
    if (this.panel.isOpen) this.panel.close();
  }

  /** At the second shelf: the game they would most like to borrow, if any suits them and they feel like asking. */
  private ask(plan: FriendPlan): void {
    const friend = this.friends.get(plan.id);
    if (!friend || friend.request) return;
    const day = this.options.day();
    const random = seeded(`borrow:${plan.id}:${day}`);
    if (random() >= plan.borrowChance) return;
    const candidates = this.options.shelved.games.filter((g) => (g.status ?? 'owned') === 'owned' && !this.book.lentTo(g.id));
    const game = borrowPick(plan, candidates, random);
    if (!game) return;
    const [min, max] = VISIT_RULES.loanDays;
    const days = min + Math.floor(seeded(`loan:${plan.id}:${game.id}:${day}`)() * (max - min + 1));
    this.askedAt = this.clock;
    this.say(plan, fill(pickLine(SHARED_LINES.ask, random), { title: game.title, days }), '?');
    friend.request = {
      label: `Click to answer ${plan.name}: borrow ${game.title}?`,
      answer: (session: SessionActions) => {
        this.panel.show({
          friend: plan.name,
          title: game.title,
          detail: [getPlatform(game.platform).name, yearOf(game)].filter(Boolean).join(', '),
          days,
          cover: this.options.coverUrl?.(game),
          lend: () => this.lend(plan, game),
          refuse: () => {
            friend.request = null;
            this.say(plan, pickLine(SHARED_LINES.refused, Math.random), 'OK');
          },
        });
        session.openPanel(this.panel);
      },
    };
  }

  private lend(plan: FriendPlan, game: Game): void {
    const friend = this.friends.get(plan.id);
    if (friend) friend.request = null;
    const current = this.options.collection.find(game.id);
    if (!current || (current.status ?? 'owned') !== 'owned') return;
    this.book.lend(plan.id, game, this.options.day());
    this.options.collection.setStatus(game.id, 'lent');
    this.say(plan, pickLine(SHARED_LINES.lent, Math.random), 'Yay!');
  }

  /** A return visit, just inside the door: the game back on its shelf, a tip or a game they no longer want, sometimes. */
  private handBack(plan: FriendPlan, loan: Loan): void {
    const { collection, day: dayOf, purse, giftPool } = this.options;
    const day = dayOf();
    this.closeLoan(loan);
    const random = seeded(`thanks:${plan.id}:${loan.gameId}:${loan.lentDay}`);
    const lines = [fill(pickLine(SHARED_LINES.returned, random), { title: loan.title })];
    if (day > loan.dueDay) lines.push(fill(pickLine(SHARED_LINES.late, random), { title: loan.title }));
    const { tipChance, tip, giftChance } = VISIT_RULES.thanks;
    if (purse && random() < tipChance) {
      const coins = tip[0] + Math.floor(random() * (tip[1] - tip[0] + 1));
      purse.earnCoins(coins);
      lines.push(fill(pickLine(SHARED_LINES.tip, random), { coins }));
    }
    if (giftPool && random() < giftChance) {
      const unowned = giftPool.filter((g) => !collection.owns(g.id) && tasteScore(plan.taste, g) >= 2);
      const gift = unowned[Math.floor(random() * unowned.length)];
      if (gift) {
        collection.add({ ...gift, status: 'owned', condition: 'noManual', acquired: { price: 0, where: `a gift from ${plan.name}`, day } });
        lines.push(fill(pickLine(SHARED_LINES.gift, random), { title: gift.title }));
      }
    }
    this.say(plan, lines.join(' '), 'Here!', true);
  }

  /** A loan whose game is gone from the collection (or no longer marked lent) is over; one long overdue comes back by post. */
  private tidyLoans(day: number): void {
    for (const loan of [...this.book.loans]) {
      const game = this.options.collection.find(loan.gameId);
      if (!game || game.status !== 'lent') {
        this.book.close(loan);
        continue;
      }
      if (this.book.overdue(day).includes(loan) && this.visit?.friend.plan.id !== loan.friendId) {
        this.closeLoan(loan);
        const name = FRIENDS.find((f) => f.id === loan.friendId)?.name ?? 'A friend';
        this.options.notice?.(`${name} posted ${loan.title} back, with a note: "Sorry! Thanks for the loan."`);
      }
    }
  }

  private closeLoan(loan: Loan): void {
    const game = this.options.collection.find(loan.gameId);
    if (game?.status === 'lent') this.options.collection.setStatus(loan.gameId, 'owned');
    this.book.close(loan);
  }

  /** The bell, heard through the flat (fainter rooms away, never silent). */
  private ring(): void {
    this.options.viewer.getWorldPosition(eye);
    const walls = this.options.acoustics?.wallsBetween(eye, this.doorPoint) ?? 0;
    const level = BELL_LEVEL * proximityVolume(eye.distanceTo(this.doorPoint), { referenceDistance: 2, maxDistance: 40, walls, wallGain: 0.6 });
    playDoorbell(Math.max(BELL_FLOOR, level));
  }

  // --- speaking -------------------------------------------------------------------------------------

  /** A word in the bubble; the line itself for a player in earshot (or always, for what matters: a greeting, a hand-back). */
  private say(plan: FriendPlan, line: string, word: string, always = false): void {
    const friend = this.friends.get(plan.id);
    if (!friend || !line) return;
    friend.say(word);
    this.options.viewer.getWorldPosition(eye);
    friend.getWorldPosition(tmp);
    if (always || Math.hypot(eye.x - tmp.x, eye.z - tmp.z) < VISIT_RULES.earshot) this.options.notice?.(`${plan.name}: ${line}`);
  }

  private chatLine(plan: FriendPlan): string {
    const random = Math.random;
    return random() < 0.5 ? pickLine(plan.lines.smalltalk, random) : shelfComment(plan, this.options.shelved.games, random, this.options.viewsOf);
  }

  private routeSeat(seat: VisitorSeat, via: THREE.Vector3[]): RouteSeat {
    const { living, viewer, cat } = this.options;
    const forward = seat.getWorldDirection(new THREE.Vector3());
    const at = living.toLocal(seat.localToWorld(new THREE.Vector3(0, 0, -0.02))).setY(0);
    const approach = living.toLocal(seat.approachPoint(new THREE.Vector3())).setY(0);
    const world = seat.localToWorld(new THREE.Vector3());
    return {
      via,
      approach,
      at,
      yaw: Math.atan2(forward.x, forward.z),
      free: () => {
        viewer.getWorldPosition(eye);
        const catAt = cat?.()?.at;
        return Math.hypot(eye.x - world.x, eye.z - world.z) > 0.9 && (!catAt || Math.hypot(catAt.x - world.x, catAt.z - world.z) > 0.7);
      },
    };
  }
}

/** The bell's loudness by the door, and at least this anywhere in the flat (as the postman's). */
const BELL_LEVEL = 0.22;
const BELL_FLOOR = 0.035;
