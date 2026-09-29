import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { NoticeActions } from '@/notices';
import type { Game, GameStatus } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { GameSource } from '@/collection/GameSource';
import type { SessionActions } from '@/game/SessionActions';
import { seeded } from '@/economy/seeded';
import { BorrowPanel } from '@/ui/BorrowPanel';
import { playDoorbell, playDoorShut } from '@/audio/doorbell';
import { playFootfall } from '@/audio/footfall';
import type { FootSurface } from '@/audio/footSurface';
import { audioBus, startedAudioContext } from '@/audio/audioContext';
import { spatialInput, spatialOf } from '@/audio/spatial';
import { playCoins } from '@/audio/coins';
import { playMurmur } from '@/audio/murmur';
import { proximityVolume } from '@/video/proximityVolume';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import { GameBox } from '../GameBox';
import { STAIRWELL_PLAN, STOREY, landingY } from '../stairwell/stairwellPlan';
import type { ActivityAware } from '../zone/lifecycle';
import type { Zone } from '../zone/Zone';
import { Prop } from '../props/Prop';
import { nowPlaying } from '../screen/nowPlaying';
import type { DoorCaller } from '../hallway/FrontDoor';
import { HALLWAY_PLAN } from '../hallway/hallwayPlan';
import { ROOM_PLAN } from '../roomPlan';
import { Friend } from './Friend';
import { FRIENDS, SHARED_LINES, VISIT_RULES, WORDS, type FriendPlan, type Word } from './friendsPlan';
import { borrowPick, fill, lookPick, shelfComment, tasteScore, yearOf, type LinePicker } from './friendLines';
import { Visit, type DoorLike, type HeldBox, type RouteSeat, type VisitRoute, type VisitScript } from './Visit';
import { VisitBook, type Loan, type PlannedVisit } from './VisitBook';
import { HOUSEHOLD } from '@/household/rules';
import { FloorNav, PERSON_WALKER } from '../nav/FloorNav';

/** Seconds (the visit's clock) between a friend's hello and their word on the cake, so the two bubbles do not collide. */
const CAKE_LINE_DELAY = 3;
/** Daylight (0..1, `SkyState.daylight`) under which the night's lines are said. */
const NIGHT_BELOW = 0.3;

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
  /** Its seat's height (m). */
  readonly sittingHeight: number;
  /** The guest sitting in it (or heading for it), whom the cat and the player leave it to. */
  guest: string | null;
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
  /** The in-game clock: the bell rings in the afternoon or the evening; after dark, the night's lines. */
  clock: { readonly state: { readonly hours: number; readonly daylight?: number } };
  /** The player is in the flat (not on the stairs, not out). */
  atHome: () => boolean;
  /** The player cannot answer now (asleep, travelling). */
  busy?: () => boolean;
  /** The collection room's armchairs (`ROOM_PLAN.seats` order). */
  seats: readonly VisitorSeat[];
  /** Those of `seats` that stand (bought for the flat), live; all of them when not given. A friend only sits in one of these. */
  standing?: readonly VisitorSeat[];
  /**
   * The flat's front door (the hallway's `FrontDoor`), which the friends let themselves out through. It learns who
   * rings through the building's `Doorstep`: hand these visitors to it (`doorstep.also(visitors)`).
   */
  frontDoor: DoorLike | null;
  /** Someone else is at the door (the postman, `Doorstep.waiting`): a friend waits for the landing to clear. */
  doorTaken?: () => boolean;
  /** Walls between the listener and the bell (or a friend's footsteps); a sidestep only goes where none stands. */
  acoustics?: { wallsBetween(a: THREE.Vector3, b: THREE.Vector3): number };
  /** The furniture (the world's colliders): a sidestep, or a shortcut from shelf to shelf, only goes where none stands. */
  collisions?: { intersectsSphere(point: THREE.Vector3, radius: number): boolean };
  /** The day's journal: who came round, what went on loan and came back. */
  journal?: { note(kind: string, text: string): void };
  /** What is underfoot at a world point (their footsteps' sound); parquet when not given. */
  surfaceAt?: (world: THREE.Vector3) => FootSurface;
  /** The box art: a game handed back is held out as its box. */
  covers?: BoxArtLoader;
  /** The boxes on the flat's shelves: a browsing friend looks at one on the bookcase in front of them. */
  shelfBoxes?: () => readonly GameBox[];
  /** The screen playing a longplay (world, its middle), or null: a seated friend watches it. */
  watch?: () => THREE.Vector3 | null;
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
  /** What the player is told that no friend says in person: one let themself out, a game posted back, a gift. */
  notices?: Pick<NoticeActions, 'react' | 'reward' | 'read'>;
  coverUrl?: (game: Game) => string | undefined;
  /** A game's fame (page views), for the comments. */
  viewsOf?: (game: Game) => number | null | undefined;
  /** `?visit`: a friend rings as soon as the player is home. */
  force?: boolean;
  /** A cake on the kitchen table (docs/household.md): a friend has a slice, stays longer, and leaves a thank-you. */
  hosting?: { cakeOut(): boolean; eatCake(): void };
}

const eye = new THREE.Vector3();
const tmp = new THREE.Vector3();
const probe = new THREE.Vector3();
/** The straight-way probe: a body-wide sphere (m) at these heights over the floor, every `step` m. */
const WALK_PROBE = { radius: 0.2, heights: [0.35, 1.0], step: 0.12 };
/** An armchair further than this (m) from where it stood when the round was made has been moved: its plan route is dropped. */
const SEAT_MOVED = 0.05;
/** The detour grid is probed again at most this often (ms): the furniture moves only by the player's hand. */
const NAV_FRESH_MS = 1000;
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
  /** The collection room's floor as a friend walks it round the furniture (`detour`), made on first need. */
  private nav: FloorNav | null = null;
  private navAt = -Infinity;
  private ringing = { since: -1, rings: 0 };
  private askedAt = -1;
  private awayFor = 0;
  private clock = 0;
  private checkedDay = -1;
  private primed = false;
  private forced: boolean;
  /** This visit's friend had some of the cake. */
  private caked = false;
  /** A game handed back, held out: its loan closes (it goes back on its shelf) when they let go. */
  private returning: { loan: Loan; box: GameBox | null } | null = null;
  /** The box a browsing friend looks at, for their comment. */
  private looked: Game | null = null;

  constructor(private readonly options: VisitorsOptions) {
    super();
    this.name = 'Visitors';
    this.forced = options.force ?? false;
    const { living, hallway } = options;
    const hall = (p: readonly [number, number]) => living.toLocal(hallway.toWorld(new THREE.Vector3(p[0], 0, p[1])));
    const room = (p: readonly [number, number]) => new THREE.Vector3(p[0], 0, p[1]);
    const hp = HALLWAY_PLAN.visitor;
    const rp = ROOM_PLAN.visitor;
    // Down the stairwell's flight A from our landing (k 0): its top tread's edge, and `stairs.treads` treads down.
    const sw = STAIRWELL_PLAN;
    const run = (sw.halfLanding.z1 - sw.floorLanding.z0) / sw.treads;
    const flightX = (sw.flightA.x0 + sw.flightA.x1) / 2;
    const down = VISIT_RULES.stairs.treads;
    const stairwell = (x: number, y: number, z: number) => living.toLocal(new THREE.Vector3(sw.origin[0] + x, sw.origin[1] + y, sw.origin[2] + z));
    this.route = {
      stairs: hall(hp.stairs),
      flight: {
        top: stairwell(flightX, landingY(0), sw.floorLanding.z0),
        bottom: stairwell(flightX, landingY(0) - (down / sw.treads) * (STOREY / 2), sw.floorLanding.z0 + run * down),
      },
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
    this.say(plan, this.line(`${plan.id}:greet`, plan.lines.greet), 'hi', true);
    this.options.journal?.note('visit', `${plan.name} came round`);
    visit.letIn();
    const hosting = this.options.hosting;
    if (hosting?.cakeOut()) {
      this.caked = true;
      hosting.eatCake();
      visit.after(CAKE_LINE_DELAY, () => this.say(plan, this.line('cake', SHARED_LINES.cake), 'cake', true));
    }
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
        this.options.notices?.react(`${visit.friend.plan.name} let themself out.`);
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
    friend.chat = () => {
      this.visit?.faceViewer();
      return this.chatLine(friend.plan);
    };
    // Whatever they say is heard, faintly, from where they stand.
    friend.voice = (text) => this.murmur(friend, text);
    this.caked = false;
    this.returning = null;
    const acoustics = options.acoustics;
    this.visit = new Visit(friend, this.route, options.viewer, { front: door, living: options.livingDoor }, this.script(friend.plan, plan.loan), {
      returning: plan.loan !== null,
      cat: () => options.cat?.()?.at ?? null,
      linger: () => (this.caked ? HOUSEHOLD.cake.linger : 1),
      watch: options.watch,
      clear: acoustics ? (a, b) => acoustics.wallsBetween(a, b) === 0 && this.walkable(a, b) : undefined,
      detour: acoustics && options.collisions ? (a, b) => this.detour(a, b) : undefined,
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
      if (this.options.atHome()) this.options.notices?.react(`Nobody answered: ${visit.friend.plan.name} will try another day.`);
      visit.turnAway();
    }
  }

  // --- the visit's script ---------------------------------------------------------------------------

  private script(plan: FriendPlan, loan: Loan | null): VisitScript {
    return {
      say: (line, word) => this.say(plan, line, word),
      arrived: () => {
        this.book.rang(this.options.day());
        this.ringing = { since: this.clock, rings: 1 };
        this.ring();
      },
      enterLine: () => this.enterLine(plan),
      handBack: () => (loan ? this.handBack(plan, loan) : null),
      shelve: () => this.shelveReturned(),
      browse: (kind, at, yaw) => this.browse(plan, kind, at, yaw),
      ask: () => this.ask(plan),
      greetCat: () => {
        const cat = this.options.cat?.();
        return cat ? fill(this.line('cat', SHARED_LINES.cat), { cat: cat.name }) : null;
      },
      sitLine: () => (this.options.watch?.() ? this.line('sitTv', SHARED_LINES.sitTv) : this.line('sit', SHARED_LINES.sit)),
      leaveLine: () => (this.night ? this.line('leaveNight', SHARED_LINES.leaveNight) : this.line('leave', SHARED_LINES.leave)),
      excuse: () => this.line('excuse', SHARED_LINES.excuse),
      step: (at) => this.footstep(at),
      shutFront: () => this.soundAt(this.doorPoint, (level, spatial) => playDoorShut(level * DOOR_LEVEL, spatial)),
      left: () => this.ended(),
    };
  }

  /**
   * At a stop: at the window, the street and a word on it (the night's, after dark); at a shelf, a box on the
   * bookcase in front of them (their taste weighs) and a word on that game.
   */
  private browse(plan: FriendPlan, kind: 'shelf' | 'window', at: THREE.Vector3, yaw: number): { look: THREE.Vector3 | null; line: string | null } {
    const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
    if (kind === 'window') {
      const line = this.night ? this.line('windowNight', SHARED_LINES.windowNight) : this.line('window', SHARED_LINES.window);
      return { look: at.clone().addScaledVector(forward, 4).setY(at.y + 1.3), line };
    }
    const games = this.options.shelved.games;
    const onShelves = new Set(games.map((g) => g.id));
    const near: GameBox[] = [];
    for (const box of this.options.shelfBoxes?.() ?? []) {
      if (!onShelves.has(box.game.id)) continue;
      box.getWorldPosition(tmp);
      const dx = tmp.x - at.x;
      const dz = tmp.z - at.z;
      const d = Math.hypot(dx, dz);
      if (d < VISIT_RULES.lookWithin && d > 0.05 && (dx * forward.x + dz * forward.z) / d > 0.35) near.push(box);
    }
    const game = lookPick(plan, near.map((b) => b.game), Math.random);
    const box = game ? near.find((b) => b.game === game) : undefined;
    this.looked = game;
    const line = shelfComment(plan, games, Math.random, { viewsOf: this.options.viewsOf, focus: game, pick: this.picker });
    return { look: box ? box.getWorldPosition(new THREE.Vector3()) : null, line };
  }

  /** A friend's footfall at `at`: its loudness by distance, muffled and panned by where it is, the floor's own sound. */
  private footstep(at: THREE.Vector3): void {
    const { steps } = VISIT_RULES;
    const surface = this.options.surfaceAt?.(at) ?? 'wood';
    this.soundAt(tmp.copy(at).setY(at.y + 0.3), (level, spatial) => {
      const ctx = startedAudioContext();
      if (!ctx || level * steps.level < 0.003) return;
      const out = ctx.createGain();
      out.gain.value = level * steps.level;
      out.connect(spatialInput(ctx, audioBus(ctx, 'world'), spatial, 1));
      playFootfall(ctx, out, surface, { force: 0.85 });
      window.setTimeout(() => out.disconnect(), 900);
    }, { referenceDistance: 1, rolloff: 1.2, maxDistance: steps.maxDistance, wallGain: 0.45 });
  }

  private ended(): void {
    this.shelveReturned();
    this.looked = null;
    const visit = this.visit;
    this.visit = null;
    if (visit) {
      visit.friend.request = null;
      visit.friend.chat = null;
      if (this.caked) this.thankForCake(visit.friend.plan);
    }
    this.caked = false;
    if (this.panel.isOpen) this.panel.close();
  }

  /** A friend who had cake leaves a thank-you: a game they no longer play (to their taste), else a few coins. */
  private thankForCake(plan: FriendPlan): void {
    const { collection, day: dayOf, purse, giftPool, notices } = this.options;
    const day = dayOf();
    const random = seeded(`cake:${plan.id}:${day}`);
    const { giftChance, tip } = HOUSEHOLD.cake;
    const unowned = giftPool?.filter((g) => !collection.owns(g.id) && tasteScore(plan.taste, g) >= 2) ?? [];
    const gift = random() < giftChance ? unowned[Math.floor(random() * unowned.length)] : undefined;
    if (gift) {
      collection.add({ ...gift, status: 'owned', condition: 'noManual', acquired: { price: 0, where: `a gift from ${plan.name}`, day } });
      this.say(plan, fill(this.line('cakeGift', SHARED_LINES.cakeGift), { title: gift.title }), 'here', true);
      notices?.reward({ title: `A gift: ${gift.title}`, detail: `From ${plan.name}, for the cake. It waits in your parcel in the hall.` });
    } else if (purse) {
      const coins = tip[0] + Math.floor(random() * (tip[1] - tip[0] + 1));
      purse.earnCoins(coins);
      this.coinsFrom(plan, coins);
      this.say(plan, fill(this.line('cakeTip', SHARED_LINES.cakeTip), { coins }), 'here', true);
      notices?.reward({ title: `${plan.name} says thanks`, detail: 'For the cake.', coins });
    }
  }

  // --- the phone ------------------------------------------------------------------------------------

  /** The friends as the phone lists them: whether each could be asked round today, and a word on them. */
  phoneBook(): { id: string; name: string; note: string; free: boolean }[] {
    const day = this.options.day();
    const invited = this.book.invitedOn(day);
    const taken = this.visit !== null || invited !== null || this.book.rangOn(day);
    return FRIENDS.map((f) => {
      const loan = this.book.loans.find((l) => l.friendId === f.id);
      const note = invited === f.id ? 'coming today' : loan ? `has your ${loan.title}` : this.book.visitsOf(f.id) ? `${this.book.visitsOf(f.id)} visits` : 'never been round';
      return { id: f.id, name: f.name, note, free: !taken };
    });
  }

  /** Asks `friendId` round today, from `hour` of the clock: what they say (or why not). */
  invite(friendId: string, hour: number): { ok: boolean; line: string } {
    const plan = FRIENDS.find((f) => f.id === friendId);
    const day = this.options.day();
    if (!plan) return { ok: false, line: 'Wrong number.' };
    if (this.visit || this.book.rangOn(day)) return { ok: false, line: 'You have had a visitor today already. Another day.' };
    if (hour >= VISIT_RULES.hours.latest) return { ok: false, line: `${plan.name}: “Bit late now, isn’t it? Another day.”` };
    if (!this.book.invite(friendId, day, hour)) return { ok: false, line: 'Someone is coming round today already.' };
    const at = `${Math.floor(hour)}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')}`;
    return { ok: true, line: `${plan.name}: “${fill(this.line('invited', SHARED_LINES.invited), { hour: at })}”` };
  }

  /** At the second shelf: the game they would most like to borrow, if any suits them and they feel like asking. */
  private ask(plan: FriendPlan): void {
    const friend = this.friends.get(plan.id);
    if (!friend || friend.request) return;
    const day = this.options.day();
    const random = seeded(`borrow:${plan.id}:${day}`);
    if (random() >= plan.borrowChance) return;
    // Not the game on the screen right now: its box is in the console.
    const candidates = this.options.shelved.games.filter((g) => (g.status ?? 'owned') === 'owned' && !this.book.lentTo(g.id) && g.id !== nowPlaying.gameId);
    // Nobody asks for the only games on a near-empty shelf.
    if (candidates.length < VISIT_RULES.borrowMinShelved) return;
    const game = borrowPick(plan, candidates, random);
    if (!game) return;
    const [min, max] = VISIT_RULES.loanDays;
    const days = min + Math.floor(seeded(`loan:${plan.id}:${game.id}:${day}`)() * (max - min + 1));
    this.askedAt = this.clock;
    this.say(plan, fill(this.line('ask', SHARED_LINES.ask), { title: game.title, days }), 'ask');
    friend.request = {
      label: `${plan.name} · answer (borrow ${game.title}?)`,
      answer: (session: SessionActions) => {
        this.panel.show({
          friend: plan.name,
          title: game.title,
          detail: [getPlatform(game.platform).name, yearOf(game)].filter(Boolean).join(', '),
          days,
          cover: this.options.coverUrl?.(game),
          game,
          lend: () => this.lend(plan, game),
          refuse: () => {
            friend.request = null;
            this.say(plan, this.line('refused', SHARED_LINES.refused), 'ok');
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
    this.say(plan, this.line('lent', SHARED_LINES.lent), 'yay');
    this.options.journal?.note('visit', `Lent ${game.title} to ${plan.name}`);
  }

  /**
   * A return visit, just inside the door: the game held out (its box, back on its shelf when they let go:
   * `shelveReturned`), a tip or a game they no longer want, sometimes (that one waits in the parcel).
   */
  private handBack(plan: FriendPlan, loan: Loan): HeldBox | null {
    const { collection, day: dayOf, purse, giftPool, covers } = this.options;
    const day = dayOf();
    const copy = collection.find(loan.gameId);
    const box = copy && covers ? new GameBox(copy, covers) : null;
    this.returning = { loan, box };
    const random = seeded(`thanks:${plan.id}:${loan.gameId}:${loan.lentDay}`);
    const lines = [fill(this.line('returned', SHARED_LINES.returned), { title: loan.title })];
    let coins = 0;
    let gifted: string | null = null;
    if (day > loan.dueDay) lines.push(fill(this.line('late', SHARED_LINES.late), { title: loan.title }));
    const { tipChance, tip, giftChance } = VISIT_RULES.thanks;
    if (purse && random() < tipChance) {
      coins = tip[0] + Math.floor(random() * (tip[1] - tip[0] + 1));
      purse.earnCoins(coins);
      this.coinsFrom(plan, coins);
      lines.push(fill(this.line('tip', SHARED_LINES.tip), { coins }));
    }
    if (giftPool && random() < giftChance) {
      const unowned = giftPool.filter((g) => !collection.owns(g.id) && tasteScore(plan.taste, g) >= 2);
      const gift = unowned[Math.floor(random() * unowned.length)];
      if (gift) {
        collection.add({ ...gift, status: 'owned', condition: 'noManual', acquired: { price: 0, where: `a gift from ${plan.name}`, day } });
        lines.push(fill(this.line('gift', SHARED_LINES.gift), { title: gift.title }));
        gifted = gift.title;
      }
    }
    this.say(plan, lines.join(' '), 'here', true);
    this.options.journal?.note('visit', `${plan.name} brought ${loan.title} back`);
    if (coins || gifted) this.options.notices?.reward({ title: gifted ? `A gift: ${gifted}` : `${plan.name} says thanks`, detail: `${loan.title} is back.${gifted ? ` ${gifted}, from ${plan.name}, waits in your parcel in the hall.` : ''}`, coins: coins || undefined });
    return box ? { box, width: box.dimensions.width } : null;
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
        this.options.notices?.read({ title: `${loan.title} came back by post`, text: `A padded envelope from ${name}, and a note: “Sorry! Thanks for the loan.”`, effect: `${loan.title} is back on its shelf.`, look: 'letter' });
        this.options.journal?.note('visit', `${loan.title} came back by post from ${name}`);
      }
    }
  }

  /** The game handed back goes back on its shelf: the loan closes, the box they held is let go. */
  private shelveReturned(): void {
    const returning = this.returning;
    if (!returning) return;
    this.returning = null;
    this.closeLoan(returning.loan);
    returning.box?.removeFromParent();
    returning.box?.dispose();
  }

  private closeLoan(loan: Loan): void {
    const game = this.options.collection.find(loan.gameId);
    if (game?.status === 'lent') this.options.collection.setStatus(loan.gameId, 'owned');
    this.book.close(loan);
  }

  /** The bell, heard through the flat (fainter and duller rooms away, never silent), from the front door's side. */
  private ring(): void {
    this.soundAt(this.doorPoint, (level, spatial) => playDoorbell(Math.max(BELL_FLOOR, BELL_LEVEL * level), spatial), { referenceDistance: 2, maxDistance: 40, wallGain: 0.6 });
  }

  /**
   * A sound at `at` (world) as the player hears it: `play` gets its loudness (0..1, by distance and walls) and
   * where it comes from (`spatial.ts`: the side by the player's yaw, a low-pass per wall).
   */
  private soundAt(at: THREE.Vector3, play: (level: number, spatial: { pan: number; walls: number }) => void, volume: { referenceDistance: number; maxDistance: number; wallGain: number; rolloff?: number } = { referenceDistance: 1.5, maxDistance: 20, wallGain: 0.5 }): void {
    const { viewer, acoustics } = this.options;
    viewer.getWorldPosition(eye);
    const distance = eye.distanceTo(at);
    if (distance >= volume.maxDistance) return play(0, { pan: 0, walls: 0 });
    const walls = acoustics?.wallsBetween(eye, at) ?? 0;
    play(proximityVolume(distance, { ...volume, walls }) / 100, spatialOf(viewer, at, walls));
  }

  // --- lines ----------------------------------------------------------------------------------------

  /** A line of `bucket` from its shuffle bag (every line once before any again, across visits: the `VisitBook` keeps it). */
  private line(bucket: string, lines: readonly string[]): string {
    return this.book.draw(bucket, lines, Math.random);
  }

  /** Just inside the front door: a word for a first visit, a regular's, or the evening's. */
  private enterLine(plan: FriendPlan): string {
    const visits = this.book.visitsOf(plan.id);
    if (visits <= 1) return this.line('enterFirst', SHARED_LINES.enterFirst);
    if (this.night) return this.line('enterNight', SHARED_LINES.enterNight);
    if (visits > VISIT_RULES.regularAfter && Math.random() < 0.5) return this.line('enterRegular', SHARED_LINES.enterRegular);
    return this.line('enter', SHARED_LINES.enter);
  }

  /** Their tip changing hands, from where they stand. */
  private coinsFrom(plan: FriendPlan, coins: number): void {
    const friend = this.friends.get(plan.id);
    if (!friend) return;
    friend.getWorldPosition(tmp).setY(tmp.y + 1.1);
    this.soundAt(tmp, (level, spatial) => {
      if (level > 0) playCoins(Math.min(5, Math.max(2, Math.round(coins / 2))), 0.12 * level, spatial);
    }, { referenceDistance: 1.2, maxDistance: 12, wallGain: 0.4 });
  }

  /** A murmur at their mouth for what they say, by distance, walls and side. */
  private murmur(friend: Friend, text: string): void {
    const { murmur } = VISIT_RULES;
    friend.getWorldPosition(tmp).setY(tmp.y + 1.6);
    this.soundAt(tmp, (level, spatial) => playMurmur(text, murmur.level * level, spatial, friend.plan.voice.pitch), { referenceDistance: 1, maxDistance: murmur.maxDistance, wallGain: 0.4 });
  }

  /** No furniture on the straight way from `a` to `b` (world, at hip and chest height): a friend could walk it. */
  private walkable(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const collisions = this.options.collisions;
    if (!collisions) return true;
    const length = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.max(1, Math.ceil(length / WALK_PROBE.step));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      for (const y of WALK_PROBE.heights) {
        probe.set(a.x + (b.x - a.x) * t, a.y - 1 + y, a.z + (b.z - a.z) * t);
        if (collisions.intersectsSphere(probe, WALK_PROBE.radius)) return false;
      }
    }
    return true;
  }

  private readonly picker: LinePicker = (bucket, lines) => this.line(bucket, lines);

  /** After dark on the in-game clock: the night's lines. */
  private get night(): boolean {
    const { daylight, hours } = this.options.clock.state;
    return daylight !== undefined ? daylight < NIGHT_BELOW : hours >= 20 || hours < 6;
  }

  // --- speaking -------------------------------------------------------------------------------------

  /**
   * The line itself, over their head with their name, for a player in earshot (or always, for what matters: a
   * greeting, a hand-back: out of view it goes to the subtitles); out of earshot, a word in passing.
   */
  private say(plan: FriendPlan, line: string, word: Word, always = false): void {
    const friend = this.friends.get(plan.id);
    if (!friend || !line) return;
    this.options.viewer.getWorldPosition(eye);
    friend.getWorldPosition(tmp);
    if (always || Math.hypot(eye.x - tmp.x, eye.z - tmp.z) < VISIT_RULES.earshot) friend.speak(line, plan.name);
    else friend.say(this.line(`word:${word}`, WORDS[word]));
  }

  /** A click to chat: small talk, or a word on the shelves (on the box they just looked at, once: then any other). */
  private chatLine(plan: FriendPlan): string {
    const random = Math.random;
    if (random() < 0.5) return this.line(`${plan.id}:smalltalk`, plan.lines.smalltalk);
    const focus = this.looked;
    this.looked = null;
    return shelfComment(plan, this.options.shelved.games, random, { viewsOf: this.options.viewsOf, focus, pick: this.picker });
  }

  /**
   * A way round the furniture between two floor points of the collection room (zone-local), for a friend's round
   * after the player moved a piece onto it: the grid's legs to `to` (or the nearest free spot); null outside the room
   * or when no way is found (they walk straight, stopping at what is in the way).
   */
  private detour(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3[] | null {
    const { living, collisions } = this.options;
    if (!collisions) return null;
    const floor = living.floorBounds;
    const from = living.toWorld(a.clone().setY(0));
    const to = living.toWorld(b.clone().setY(0));
    if (!floor.containsPoint(new THREE.Vector2(from.x, from.z)) || !floor.containsPoint(new THREE.Vector2(to.x, to.z))) return null;
    this.nav ??= new FloorNav(collisions, floor, undefined, PERSON_WALKER);
    const now = performance.now();
    if (now - this.navAt > NAV_FRESH_MS) {
      this.nav.invalidate();
      this.navAt = now;
    }
    return this.nav.planPath(from, to)?.map((point) => living.toLocal(point.clone()).setY(0)) ?? null;
  }

  /**
   * An armchair on the round, read live from the armchair (the player may move it): where they stand before sitting,
   * where and which way they sit. The plan's way there (`via`) holds while it stands where it stood; moved, the
   * detours find the way.
   */
  private routeSeat(seat: VisitorSeat, via: THREE.Vector3[]): RouteSeat {
    const { living, viewer, cat, standing } = this.options;
    const placed = seat.localToWorld(new THREE.Vector3());
    const world = new THREE.Vector3();
    const forward = new THREE.Vector3();
    return {
      get via() {
        return seat.localToWorld(world.set(0, 0, 0)).distanceTo(placed) > SEAT_MOVED ? [] : via;
      },
      get approach() {
        return living.toLocal(seat.approachPoint(new THREE.Vector3())).setY(0);
      },
      get at() {
        return living.toLocal(seat.localToWorld(new THREE.Vector3(0, 0, -0.02))).setY(0);
      },
      get yaw() {
        seat.getWorldDirection(forward);
        return Math.atan2(forward.x, forward.z);
      },
      height: seat.sittingHeight,
      free: () => {
        seat.localToWorld(world.set(0, 0, 0));
        if (standing && !standing.includes(seat)) return false;
        viewer.getWorldPosition(eye);
        const catAt = cat?.()?.at;
        const mine = this.visit?.friend.plan.name ?? null;
        if (seat.guest && seat.guest !== mine) return false;
        return Math.hypot(eye.x - world.x, eye.z - world.z) > 0.9 && (!catAt || Math.hypot(catAt.x - world.x, catAt.z - world.z) > 0.7);
      },
      claim: (guest) => {
        seat.guest = guest;
      },
    };
  }
}

/** The bell's loudness by the door, and at least this anywhere in the flat (as the postman's). */
const BELL_LEVEL = 0.22;
const BELL_FLOOR = 0.035;
/** The front door pulled shut, right by it. */
const DOOR_LEVEL = 0.35;
