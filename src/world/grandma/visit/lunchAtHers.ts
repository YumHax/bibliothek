import * as THREE from 'three';
import type { SeatLike, SessionActions } from '@/game/SessionActions';
import type { TalkExtra } from '@/social/talk';
import type { GrandmaRituals } from '@/grandma/GrandmaRituals';
import { LUNCH, LUNCH_LINES, lunchHours, lunchOf, type LunchKind } from '@/grandma/lunch';
import { GRANDMA_TALK } from '@/grandma/grandma';
import { pick, random, shuffled } from '@/random';
import type { MemeScene } from '../memeScene';
import type { SundayTable } from '../SundayTable';
import { GRANDMA_FLAT_PLAN } from '../grandmaFlatPlan';
import { RITUALS_PLAN } from '../ritualsPlan';
import { Hotspot } from './Hotspot';
import { teachRecipe } from './teachRecipe';
import { walkHer, walkHome } from './herWay';

const OWNER = 'lunch';
/** Seconds between two looks at the clock for lunchtime while the player is in (she calls them when it comes). */
const LOOK_EVERY = 2;
/** Seconds she waits before trying again when someone else has her (the kettle, a game of cards). */
const RETRY = 4;

/**
 * LUNCH AT HER TABLE (docs/grandma.md "Sunday lunch, recipes and favours"): on a lunch day (`lunchOf`: a Sunday,
 * Christmas) in her hours, she calls the player to the table and goes to her chair; the player sits at the table's end
 * (the chair, or "Sit down to lunch"): the blanquette served, her talk over it, the meal told in a fade (the clock to
 * the coffee), the tart, then the envelope she kept back at the door (`GrandmaVisits.holdEnvelope`), Christmas's
 * present, a recipe the first times, and she clears up. Left without eating, the envelope is in the coat pocket.
 */
export class LunchAtHers {
  /** Called to the table this visit; she is sitting there; the meal is under way. */
  private called = false;
  private seated = false;
  private eating = false;
  /** Her hello is over (lunchtime may come while the player is in). */
  private greeted = false;
  private look = 0;
  private retry = 0;
  private spot: Hotspot | null = null;
  private readonly seat: SeatLike;

  constructor(
    private readonly scene: MemeScene,
    private readonly rituals: GrandmaRituals,
    private readonly table: SundayTable | null,
    /** Lunch over and cleared: what else the visit has (a favour asked). */
    private readonly cleared: () => void,
  ) {
    const { at, eye, yaw } = RITUALS_PLAN.lunch.seat;
    this.seat = { eyePose: () => ({ position: scene.world(at[0], eye, at[1]), yaw }) };
  }

  /** Today's lunch, if any (`?debug`'s Christmas too). */
  kind(): LunchKind | null {
    if (this.rituals.forced === 'christmas') return 'christmas';
    return lunchOf(this.scene.day(), this.scene.ctx.today.realDate());
  }

  /** A lunch she would call the player to now. */
  get due(): boolean {
    return this.kind() !== null && lunchHours(this.scene.hour()) && !this.rituals.ateOn(this.scene.day());
  }

  /** The Sunday envelope waits for the end of lunch (asked by `GrandmaVisits.arrive`). */
  holdsEnvelope(): boolean {
    return this.kind() === 'sunday' && this.due;
  }

  /** On the way in, `at` seconds on: whether lunch takes the visit (she calls the player, or says it is to come). */
  arrived(at: number): boolean {
    this.scene.zone.after(at, () => (this.greeted = true));
    if (this.due) {
      this.scene.zone.after(at, () => this.call());
      return true;
    }
    if (this.kind() && this.scene.hour() < LUNCH.from && !this.rituals.ateOn(this.scene.day())) this.scene.zone.after(at, () => this.scene.say([LUNCH_LINES.later]));
    return false;
  }

  update(dt: number): void {
    if (!this.scene.playerIn || !this.greeted || this.called) return;
    this.look -= dt;
    this.retry -= dt;
    if (this.look > 0) return;
    this.look = LOOK_EVERY;
    // Lunchtime came while the player was in (in the morning, on a Sunday): she calls them then.
    if (this.due && this.retry <= 0) this.call();
  }

  /** "Sit down to lunch", while she waits at the table. */
  extras(session: SessionActions): TalkExtra[] {
    if (!this.seated || this.eating || this.rituals.ateOn(this.scene.day())) return [];
    return [{ id: 'memeLunch', group: 'talk', label: 'Sit down to lunch', opensPanel: true, run: () => this.begin(session) }];
  }

  /** The player has gone: the envelope kept back is in the coat pocket; she is sat down again on the next arrival. */
  left(): void {
    const { scene } = this;
    // The envelope kept back (or the hour gone past lunch on the way in): `takeEnvelope` gives it only once a Sunday.
    if (!this.rituals.ateOn(scene.day())) {
      const coins = scene.visits.takeEnvelope(scene.day());
      if (coins) {
        scene.ctx.money.purse?.earnCoins(coins);
        scene.ctx.notices.reward({ ...LUNCH_LINES.pocketed, coins });
      }
    }
    this.greeted = false;
    this.called = false;
    this.seated = false;
    this.eating = false;
    this.clearChair();
    scene.release(OWNER);
  }

  /** She calls the player to the table and goes to her chair. */
  private call(): void {
    const { scene } = this;
    if (this.called) return;
    if (!scene.claim(OWNER)) {
      this.retry = RETRY;
      return;
    }
    this.called = true;
    this.table?.setSunday(true);
    const kind = this.kind();
    scene.say([pick(random, kind === 'christmas' ? [...LUNCH_LINES.call, LUNCH_LINES.christmas[0]] : LUNCH_LINES.call)]);
    const { table } = GRANDMA_FLAT_PLAN.memeDay;
    const sitDown = (): void => {
      scene.meme.sit(table.yaw, table.seat, 'lap', scene.world(...table.gaze));
      this.seated = true;
      this.spotChair();
    };
    const home = scene.home();
    if (home.at[0] === table.at[0] && home.at[1] === table.at[1]) sitDown();
    else walkHer(scene, RITUALS_PLAN.lunch.herChair, sitDown);
  }

  /** The chair at the table's end, clickable while she waits. */
  private spotChair(): void {
    if (this.spot) return;
    const { at, size } = RITUALS_PLAN.lunch.seatSpot;
    this.spot = new Hotspot(size, {
      label: () => 'Your place at the table · sit down to lunch',
      use: (session) => this.begin(session),
    });
    this.scene.zone.place(this.spot, new THREE.Vector3(at[0], 0, at[1]));
  }

  private clearChair(): void {
    if (this.spot) this.scene.zone.remove(this.spot);
    this.spot = null;
  }

  /** The player sits down: served, her talk, then the meal. */
  private begin(session: SessionActions): void {
    if (this.eating || !this.seated) return;
    this.eating = true;
    this.clearChair();
    session.sit(this.seat);
    this.table?.serve('served');
    const talk = this.kind() === 'christmas' ? LUNCH_LINES.christmas : LUNCH_LINES.talk;
    this.scene.meme.gesture('point');
    this.scene.say([pick(random, LUNCH_LINES.serve), ...shuffled(random, talk).slice(0, 2)], () => this.meal(session));
  }

  /** The meal told in a fade (the clock to the coffee), the tart on the table after it. */
  private meal(session: SessionActions): void {
    const { scene } = this;
    // The player went out while she was talking: nothing more.
    if (!this.eating) return;
    if (session.seatedIn !== this.seat) {
      // Got up before the meal: no harm, the place stays laid.
      this.eating = false;
      this.table?.serve('laid');
      scene.meme.speak('Eat standing up, then. Like your uncle.');
      this.spotChair();
      return;
    }
    const kind = this.kind() ?? 'sunday';
    const day = scene.day();
    const minutes = Math.round(Math.min(170, Math.max(LUNCH.least, (LUNCH.clears - scene.hour()) * 60)));
    const pastimes = scene.ctx.home.household?.pastimes;
    if (!pastimes) {
      this.rituals.eat(day, kind);
      this.table?.serve('dessert');
      this.dessert(kind);
      return;
    }
    void pastimes.run({ minutes, outMs: LUNCH.outMs, darkMs: LUNCH.darkMs, inMs: LUNCH.inMs, dark: () => this.table?.serve('dessert') }, () => this.rituals.eat(day, kind)).then((ran) => {
      if (ran === null) {
        // Something else was being told: try again from the chair.
        this.eating = false;
        this.table?.serve('laid');
        this.spotChair();
        return;
      }
      this.dessert(kind);
    });
  }

  /** The tart and the coffee; the envelope, Christmas's present, a recipe; then she clears up and goes back to her seat. */
  private dessert(kind: LunchKind): void {
    const { scene } = this;
    const { notices, money } = scene.ctx;
    const day = scene.day();
    const steps: (() => void)[] = [];
    steps.push(() => scene.say([pick(random, LUNCH_LINES.dessert)], next));
    const coins = scene.visits.takeEnvelope(day);
    if (coins) {
      steps.push(() => {
        scene.meme.gesture('nudge');
        scene.say([LUNCH_LINES.envelope], next);
        money.purse?.earnCoins(coins);
        notices.reward({ ...GRANDMA_TALK.envelope, coins });
      });
    }
    const year = scene.ctx.today.realDate().getFullYear();
    if (kind === 'christmas' && this.rituals.keep('christmas', `christmasGift:${year}`)) {
      steps.push(() => {
        scene.meme.gesture('clap');
        scene.say([LUNCH_LINES.christmasGift], next);
        money.purse?.earnCoins(LUNCH.christmasCoins);
        notices.reward({ ...LUNCH_LINES.christmasPresent, coins: LUNCH.christmasCoins });
      });
    }
    steps.push(() => teachRecipe(scene, this.rituals, 'lunch', next));
    steps.push(() => scene.say([pick(random, LUNCH_LINES.clear)], next));
    steps.push(() => this.backToHerSeat());
    let i = 0;
    function next(): void {
      steps[i++]?.();
    }
    next();
  }

  /** She clears up: back to her seat for the hour, given back to the visit. */
  private backToHerSeat(): void {
    const { scene } = this;
    this.eating = false;
    this.seated = false;
    walkHome(scene, () => {
      scene.release(OWNER);
      this.cleared();
    });
  }
}
