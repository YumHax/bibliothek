import * as THREE from 'three';
import type { TalkExtra } from '@/social/talk';
import type { GrandmaRituals } from '@/grandma/GrandmaRituals';
import { RITUALS } from '@/grandma/GrandmaRituals';
import { FELIX_CONSOLE, favourOf, type FavourId } from '@/grandma/favours';
import { pocket } from '@/errands/pocket';
import { brokenOf } from '@/repair/consoles';
import { random } from '@/random';
import { isOwned } from '../../build/owned';
import { placeWith } from '../../zone/attach';
import type { MemeScene } from '../memeScene';
import type { LongcaseClock } from '../LongcaseClock';
import { RITUALS_PLAN } from '../ritualsPlan';
import { Hotspot } from './Hotspot';
import { teachRecipe } from './teachRecipe';

/** Seconds after her thanks before a recipe card, if she has one for the occasion. */
const THEN_RECIPE = 3.5;

/**
 * HER FAVOURS (docs/grandma.md "Sunday lunch, recipes and favours"): from her second visit, now and then, one small
 * thing she can't do herself, asked after her hello: her set's picture rolls (a thump on its side), the clock has
 * stopped (wound with the key she hands over: it hangs still until then), a croissant from Front Street's bakery (given
 * in the conversation), Félix's old console from her cupboard (it goes home to the kitchen chair, mended there with
 * `repair`; she knows on the next visit). Done: her thanks, a few coins pressed on the player, and the first time,
 * her plum jam's recipe.
 */
export class FavoursAtHers {
  private spot: Hotspot | null = null;

  constructor(
    private readonly scene: MemeScene,
    private readonly rituals: GrandmaRituals,
    private readonly clock: LongcaseClock | null,
  ) {
    this.apply();
  }

  /** On the way in, `at` seconds on: the open favour's news (done at home, or her reminder), else one asked now. */
  arrived(at: number): void {
    const { scene, rituals } = this;
    const open = rituals.favour;
    if (open) {
      if (open.id === 'console' && this.consoleDone(open.console)) scene.zone.after(at, () => this.done('console'));
      else if (open.day !== scene.day()) scene.zone.after(at, () => scene.say([favourOf(open.id).reminder]));
      return;
    }
    this.offer(at);
  }

  /** A favour asked, `at` seconds on, if she has one in mind (after lunch too). */
  offer(at = 0.5): void {
    const id = this.rituals.favourToAsk(this.scene.visits.facts().visits, (favour) => favour !== 'console' || this.canMend());
    if (id) this.scene.zone.after(at, () => this.ask(id));
  }

  extras(): TalkExtra[] {
    if (this.rituals.favour?.id !== 'croissant' || pocket.count('croissant') === 0) return [];
    return [
      {
        id: 'memeCroissant',
        group: 'give',
        label: 'Give her the croissant',
        run: () => {
          if (pocket.take('croissant') !== 'croissant') return undefined;
          return { line: this.done('croissant', true) ?? undefined };
        },
      },
    ];
  }

  private ask(id: FavourId): void {
    const { scene, rituals } = this;
    if (!scene.playerIn || rituals.favour) return;
    const { notices } = scene.ctx;
    let consoleId: string | undefined;
    if (id === 'console') {
      const workshop = scene.ctx.classifieds?.workshop;
      if (!workshop) return;
      const { fault } = brokenOf(FELIX_CONSOLE.platform, random(), random());
      consoleId = workshop.add({ platform: FELIX_CONSOLE.platform, fault, paid: 0, from: FELIX_CONSOLE.from }).id;
    }
    rituals.ask(id, consoleId);
    scene.meme.gesture(id === 'clock' ? 'point' : 'shrug');
    scene.say([favourOf(id).ask], () => {
      if (id === 'clock') notices.slip({ title: 'Mémé’s clock key', detail: 'A little brass key, warm from her apron pocket.' });
      if (id === 'console') notices.slip({ title: 'Félix’s Mega Drive', detail: 'Home on the kitchen chair, to mend at the table.' });
    });
    this.apply();
  }

  /** The favour done: her thanks (said, or returned for the conversation), the coins, the recipe the first time. */
  private done(id: FavourId, inConversation = false): string | null {
    const { scene, rituals } = this;
    if (!rituals.complete(id)) return null;
    this.apply();
    const thanks = favourOf(id).thanks;
    const coins = RITUALS.favour.coins;
    scene.ctx.money.purse?.earnCoins(coins);
    scene.ctx.notices.slip({ title: 'Mémé insists', detail: '“For the bus. Don’t argue.”', coins });
    scene.meme.gesture('clap');
    scene.meme.feel({ smile: 1, browsUp: 0.4 }, 2.5);
    if (!inConversation) scene.meme.speak(thanks);
    scene.zone.after(THEN_RECIPE, () => teachRecipe(scene, rituals, 'favour', () => undefined));
    return inConversation ? thanks : null;
  }

  /** The clock run down while it is the favour, and the spot to click on what needs doing. */
  private apply(): void {
    const id = this.rituals.favour?.id ?? null;
    this.clock?.setStopped(id === 'clock');
    if (this.spot) this.scene.zone.remove(this.spot);
    this.spot = null;
    const { tv } = this.scene.things;
    if (id === 'set') this.spot = this.place(tv, RITUALS_PLAN.favours.set, 'Her set · give it a thump on the side', 'Thump. The picture shivers, and holds.');
    else if (id === 'clock' && this.clock) this.spot = this.place(this.clock, RITUALS_PLAN.favours.clock, 'Longcase clock · wind it with her key', 'Eight turns of the key, a nudge to the pendulum: tick.');
  }

  private place(host: THREE.Object3D, { at, size }: { at: readonly [number, number, number]; size: readonly [number, number, number] }, label: string, did: string): Hotspot {
    const id = this.rituals.favour?.id;
    const spot = new Hotspot(size, {
      label: () => label,
      use: (session) => {
        if (!id) return;
        session.react(did);
        this.done(id);
      },
    });
    return placeWith(this.scene.zone, host, spot, new THREE.Vector3(...at));
  }

  /** Félix's console mended at home, or gone from the kitchen chair (sold on: she would not mind). */
  private consoleDone(consoleId: string | undefined): boolean {
    const workshop = this.scene.ctx.classifieds?.workshop;
    if (!workshop || !consoleId) return true;
    const console = workshop.consoles.find((c) => c.id === consoleId);
    return !console || console.fixed;
  }

  /** The kitchen has its table and chairs: a console can wait on the chair to be mended. */
  private canMend(): boolean {
    return !!this.scene.ctx.classifieds?.workshop && isOwned(this.scene.ctx.home.upgrades, 'kitchenTable');
  }
}
