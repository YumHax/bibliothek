import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Ad } from '@/classifieds/ads';
import { PLATFORM_LIST } from '@/catalog/platforms';
import { playBoxClack } from '@/audio/boxClack';
import { inHours } from '@/time/clock';
import { gameDayRandom } from '@/time/daily';
import type { BuildContext, ZoneHandle } from '../buildContext';
import type { Zone } from '../zone/Zone';
import { furnishShell } from '../shell';
import { furnishDecor, placeRoomLight } from '../build/roomParts';
import { showOnStall } from '../build/showOnStall';
import { TravelDoor } from '../travel/TravelDoor';
import { RiserStall } from '../market/RiserStall';
import { GlassCaseStall } from '../market/GlassCaseStall';
import type { StallLike } from '../market/stallTypes';
import { ShopCounter } from '../shop/ShopCounter';
import { Walker } from '../people/Walker';
import { randomLook } from '../people/looks';
import { Prop } from '../props/Prop';
import { REPLAY_PLAN as PLAN } from './replayPlan';

/** What the owner says when clicked, and on the player's arrival. */
const OWNER = 'Odile, behind the counter';
const OWNER_LINES = [
  '“Thirty-one years on Canal Street. Before that it was records.”',
  '“New stock on Mondays. Well, new old stock.”',
  '“The rare ones are in the case. Ask and I’ll open it.”',
  '“I buy too, love. Bring me what you don’t play.”',
];
const GREETING = '“Come in, come in, out of the cold. Have a rummage.”';
const CLOSING = '“That’s me closing up, love. The bus stop’s just outside.”';
/** Seconds after the player is in before the owner looks up. */
const GREET_AFTER = 1.2;

/**
 * Builds REPLAY on Canal Street (docs/zones.md "REPLAY, across town"): a second-hand games shop at line 38's other
 * stop, its own stock drawn by the game week as a dealer's lots are (`classifieds/sellerLot`, through
 * `ClassifiedsContext.lot`: priced and kept for the session): a mixed bag on the risers by the wall, one console's
 * games on the back risers, the collector's copies in the glass case. Odile at the counter says a word and buys games
 * too (the WE BUY desk). Its door is the bus back to Front Street.
 */
export function furnishReplay(zone: Zone, ctx: Pick<BuildContext, 'sky' | 'listener' | 'acoustics' | 'classifieds' | 'collection' | 'covers' | 'money' | 'today' | 'home'>): ZoneHandle {
  const { sky, listener, today } = ctx;
  const room = furnishShell(zone, sky, PLAN.room, { fixedDaylight: 0.35 });
  placeRoomLight(zone, room, 'pendant', PLAN.pendant, PLAN.lightSwitch);
  zone.placeAt(new TravelDoor({ style: 'panelled', label: 'Canal Street · the bus back to Front Street', to: 'street', leafColor: 0x2a3a2e, shopfront: true }), PLAN.exit);
  furnishDecor(zone, { listener, acoustics: ctx.acoustics }, PLAN.decor);

  // Odile behind her counter: a word; the counter, games bought off the player.
  let line = 0;
  const owner = new Walker({ viewer: listener, seed: PLAN.owner.seed, look: randomLook(PLAN.owner.seed, 'vendor'), label: OWNER, talk: () => OWNER_LINES[line++ % OWNER_LINES.length]!, labelWithin: 6, speaker: 'Odile' });
  zone.place(owner, new THREE.Vector3(PLAN.owner.at[0], 0, PLAN.owner.at[1]), PLAN.owner.yaw);
  owner.stand(PLAN.owner.yaw, 'hips', 'viewer');
  zone.placeAt(
    new ShopCounter({
      width: PLAN.counter.width,
      front: PLAN.counter.front,
      label: 'REPLAY’s counter · sell her some games',
      open: (session) => {
        owner.speak('“Let’s see what you’ve brought.”');
        session.openSellDesk();
      },
    }),
    PLAN.counter.at,
  );

  // The stalls and the week's stock on them (a lot drawn after the zone was let go is not laid).
  let alive = true;
  zone.onUnload(() => {
    alive = false;
  });
  const week = Math.floor(today.gameDay / 7);
  PLAN.stalls.forEach((spec, i) => {
    const stall: StallLike = spec.style === 'glass' ? new GlassCaseStall({ sign: spec.sign, cloth: 0x2a1e3a, accent: 0xffb02f }) : new RiserStall({ sign: spec.sign, cloth: 0x2e4a3e, accent: 0xffb02f });
    zone.placeAt(stall, spec.at);
    const classifieds = ctx.classifieds;
    if (!classifieds) return;
    const pickPlatform = gameDayRandom(`replay:${i}`, week * 7)();
    const ad: Ad = {
      id: `replay:${week}:${i}`,
      day: week * 7,
      until: week * 7 + 6,
      kind: spec.kind,
      name: 'REPLAY',
      flat: '',
      platform: spec.kind === 'mover' ? null : PLATFORM_LIST[Math.floor(pickPlatform * PLATFORM_LIST.length)]!.id,
      text: '',
      hours: PLAN.hours,
      seed: 52_000 + week * 10 + i,
    };
    void classifieds.lot(ad).then((lot) => {
      if (!alive) return;
      const items = lot.items.filter((item) => !ctx.collection.owns(item.game.id));
      showOnStall(stall, items, {
        host: zone,
        covers: ctx.covers,
        boxOptions: (item) => ({
          wallet: ctx.money.wallet,
          where: 'REPLAY on Canal Street',
          isWanted: () => ctx.collection.isWanted(item.game.id),
          thanks: () => '“A good one, that. Enjoy it.”',
          react: (reaction) => {
            if (reaction === 'pickUp' || reaction === 'putBack') playBoxClack(reaction === 'putBack');
          },
          speak: (said) => owner.speak(said),
        }),
      });
    });
  });

  zone.place(new ShopDay(zone, owner, () => sky.dayNight.state.hours % 24), new THREE.Vector3());
  return { room };
}

/** The owner's day: a hello once the player is in (each visit), a word at closing time. */
class ShopDay extends Prop implements Updatable {
  private greet = GREET_AFTER;
  private open: boolean | null = null;

  constructor(zone: Zone, private readonly owner: Walker, private readonly hours: () => number) {
    super();
    this.name = 'ReplayShopDay';
    zone.onUnload(() => {
      this.greet = GREET_AFTER;
      this.open = null;
    });
  }

  setZoneActive(active: boolean): void {
    if (active) this.greet = GREET_AFTER;
  }

  update(dt: number): void {
    if (this.greet > 0) {
      this.greet -= dt;
      if (this.greet <= 0) this.owner.speak(GREETING);
    }
    const open = inHours(this.hours(), PLAN.hours);
    if (this.open === true && !open) this.owner.speak(CLOSING);
    this.open = open;
  }
}
