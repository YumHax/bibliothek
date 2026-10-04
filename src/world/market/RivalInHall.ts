import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { RIVAL } from '@/economy/pricing';
import { RIVAL_COLLECTOR, rivalAtMarket, type RivalCollector } from '@/economy/rivalCollector';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { Walker } from '../people/Walker';
import type { BrowseSpot } from '../people/Shopper';
import type { ForSaleBox } from './ForSaleBox';
import type { MarketFloor } from './MarketFloor';

interface RivalInHallOptions {
  viewer: THREE.Object3D;
  floor: MarketFloor;
  rival: RivalCollector;
  dayNight: DayNight;
  /** Today's market day. */
  day: () => number;
  owns: (id: string) => boolean;
  /** The way in from the door, zone-local floor points (door first). */
  entrance: readonly (readonly [number, number])[];
  /** The gaps between the front row's stalls (x), the row's z, the aisle's z: his way from the door to the stalls. */
  gaps: readonly number[];
  rowZ: number;
  aisleZ: number;
  /** Where people browse, and which are taken (the shoppers' claims: he takes one too while he stands there). */
  spots: readonly BrowseSpot[];
  claims: Set<BrowseSpot>;
}

type Step =
  | { kind: 'away'; wait: number }
  | { kind: 'walking' }
  | { kind: 'browsing'; left: number }
  | { kind: 'looking'; left: number; asked: boolean }
  | { kind: 'leaving' }
  | { kind: 'gone' };

/** Copies he would never go for: the player's own business (a wishlist find, a copy kept aside or ordered, an upgrade). */
const NOT_HIS = new Set(['wanted', 'keptAside', 'ordered', 'upgrade', 'grail', 'bin']);

/**
 * The rival collector at the flea market (`economy/rivalCollector.ts`), some market days (`rivalAtMarket`) between
 * `RIVAL.hall.hours`: he comes in by the door, browses a stall, and says out loud which copy he is after (the
 * priciest ordinary one on the stalls, never one held for the player, a wishlist find or one behind glass) and
 * where; after `RIVAL.hall.browse` seconds he walks to it and, after a look, takes it (`MarketFloor.takeForRival`:
 * it goes into his suitcase on Front Street, `RivalCollector.haulOn`). Bought or held by the player first, he owns
 * up and the player is a point up on him. He leaves by the door either way. A click on him: a word, by how things
 * stand between them. Only runs while the hall is the player's zone (the zone is not ticked otherwise).
 */
export class RivalInHall extends THREE.Object3D implements Furniture, Updatable {
  readonly contactShadow = false;
  private readonly person: Walker;
  private step: Step = { kind: 'away', wait: RIVAL.hall.arrive };
  private target: ForSaleBox | null = null;
  private spot: BrowseSpot | null = null;

  constructor(private readonly options: RivalInHallOptions) {
    super();
    this.person = new Walker({
      viewer: options.viewer,
      seed: RIVAL_COLLECTOR.seed,
      label: `${RIVAL_COLLECTOR.label} · chat`,
      speaker: RIVAL_COLLECTOR.short,
      fade: true,
      corners: 0.35,
      talk: () => this.talk(),
    });
    this.person.traverse((o) => {
      o.castShadow = false;
    });
    this.person.setPresent(false);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  /** Placed by the hall at the zone's origin: his body is the zone's child. */
  placeIn(host: { place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F }): void {
    host.place(this.person, new THREE.Vector3(...this.at(this.options.entrance[0]!)));
  }

  update(dt: number): void {
    const step = this.step;
    if (step.kind === 'gone') return;
    if (step.kind === 'away') {
      step.wait -= dt;
      if (step.wait <= 0) this.tryArrive();
      return;
    }
    // His body is the zone's (it ticks him); this only directs him.
    // The copy left the stall meanwhile: the player's now (bought, or in their hand / held at the stall), or another's.
    if (this.target && step.kind !== 'leaving' && !this.options.floor.displayed.has(this.target)) {
      this.lost();
      return;
    }
    if (step.kind === 'browsing') {
      step.left -= dt;
      if (step.left <= 0) this.goForIt();
    } else if (step.kind === 'looking') {
      step.left -= dt;
      if (step.left <= 0) this.take(step);
    }
  }

  dispose(): void {
    if (this.spot) this.options.claims.delete(this.spot);
  }

  private tryArrive(): void {
    const { rival, day, dayNight } = this.options;
    const today = day();
    const hunt = rival.huntOn(today);
    const [from, to] = RIVAL.hall.hours;
    const hours = dayNight.state.hours % 24;
    if (!rivalAtMarket(today) || hunt?.outcome || hours >= to) {
      this.step = { kind: 'gone' };
      return;
    }
    // Before he gets up: he comes once the clock says so, if the player is still about.
    if (hours < from) {
      this.step = { kind: 'away', wait: 10 };
      return;
    }
    // Back after a reload, the copy he named already the player's: beaten, he does not come back for it.
    if (hunt && this.options.owns(hunt.gameId)) {
      rival.endHunt(today, 'beaten');
      this.step = { kind: 'gone' };
      return;
    }
    const target = this.pick(hunt?.gameId);
    // The copy he named is no longer on the stalls (another shopper's now): nothing to come back for today.
    if (!target && hunt && this.options.floor.stalls.some((e) => e.boxes.size > 0)) {
      this.step = { kind: 'gone' };
      return;
    }
    // The stock is still being laid out (or priced): look again in a moment.
    if (!target) {
      this.step = { kind: 'away', wait: 3 };
      return;
    }
    this.target = target;
    rival.startHunt(today, target.item.game);
    const decoy = this.spotNear(this.otherStall(target)) ?? this.spotNear(target);
    this.person.setPresent(true, new THREE.Vector3(...this.at(this.options.entrance[0]!)));
    this.step = { kind: 'walking' };
    // In by the door, past the boards, then to a stall.
    this.walkTo(decoy, () => {
      this.person.speak(this.announce(target));
      this.step = { kind: 'browsing', left: RIVAL.hall.browse };
    }, this.options.entrance.slice(1));
  }

  /** Today's copy: the one he said (back after a reload), else the priciest ordinary copy on the stalls. */
  private pick(gameId?: string): ForSaleBox | null {
    const { floor, owns } = this.options;
    const boxes = floor.stalls.flatMap((entry) => (entry.stall.behindGlass ? [] : [...entry.boxes]));
    if (gameId) return boxes.find((b) => b.item.game.id === gameId) ?? null;
    const fair = boxes.filter((b) => b.item.priced && !b.isHeld && !b.item.reserved && !NOT_HIS.has(b.item.source) && !owns(b.item.game.id));
    // Wait for the prices: he knows what things are worth.
    if (!fair.length || boxes.some((b) => !b.item.priced)) return null;
    return fair.reduce((best, b) => (b.item.price > best.item.price ? b : best));
  }

  private goForIt(): void {
    const target = this.target;
    if (!target) return this.leave();
    this.person.say('Right then.');
    this.step = { kind: 'walking' };
    this.walkTo(this.spotNear(target), () => (this.step = { kind: 'looking', left: RIVAL.hall.look, asked: false }));
  }

  private take(step: Extract<Step, { kind: 'looking' }>): void {
    const { floor, rival, day } = this.options;
    const target = this.target!;
    // In the player's hand: he asks once, and gives them a moment.
    if (target.isHeld || target.item.reserved) {
      if (!step.asked) {
        step.asked = true;
        step.left = 6;
        this.person.speak(target.item.reserved ? 'On hold? For you? Of course it is.' : 'Are you buying that, or just admiring it?');
        return;
      }
      return this.lost();
    }
    const game = target.item.game;
    const price = target.item.price;
    if (!floor.takeForRival(target)) return this.lost();
    rival.endHunt(day(), 'took', { game, price });
    this.person.gesture('fistPump');
    const smug = rival.view().mood === 'smug';
    this.person.speak(smug ? `The ${game.title}: mine. Again. You'll find it on my table on Front Street, at my price.` : `There we are: the ${game.title}. If you want it after all, I'll be on Front Street with my suitcase.`);
    this.target = null;
    this.leave();
  }

  /** The copy is gone: the player's (a point to them) or someone else's. */
  private lost(): void {
    const { rival, day, owns } = this.options;
    const target = this.target;
    this.target = null;
    if (!target) return this.leave();
    const game = target.item.game;
    if (owns(game.id) || target.isHeld || target.item.reserved) {
      // Beaten only once it is the player's for good; held or in hand, he just gives up for today.
      if (owns(game.id)) rival.endHunt(day(), 'beaten');
      this.person.gesture('headShake');
      this.person.speak(owns(game.id) ? `You got the ${game.title}? Well played. I'll have the next one.` : `Keep it, then. There'll be others.`);
    } else {
      this.person.gesture('shrug');
      this.person.say('Gone. Typical.');
    }
    this.leave();
  }

  private leave(): void {
    this.step = { kind: 'leaving' };
    if (this.spot) this.options.claims.delete(this.spot);
    this.spot = null;
    // Back to the way in, then out along it to the door.
    const { entrance } = this.options;
    const out = entrance.slice(0, -1).reverse().map((p) => new THREE.Vector3(...this.at(p)));
    this.person.walk([...this.route(entrance[entrance.length - 1]!), ...out], () => {
      this.person.setPresent(false);
      this.step = { kind: 'gone' };
    });
  }

  private talk(): string {
    const { rival } = this.options;
    const line = this.target && this.step.kind !== 'leaving' ? this.announce(this.target) : rival.greeting();
    rival.meet();
    return line;
  }

  private announce(box: ForSaleBox): string {
    const entry = this.options.floor.stalls.find((e) => e.boxes.has(box));
    const where = entry ? `on the ${entry.platform.shortName} stall` : 'over there';
    const mood = this.options.rival.view().mood;
    const title = box.item.game.title;
    if (mood === 'stung') return `Not this time. The ${title} ${where} is mine: I'm just having a look round first.`;
    if (mood === 'smug') return `See the ${title} ${where}? Lovely. I'll be taking that in a minute.`;
    return `Morning. The ${title} ${where}: I've had my eye on it. Don't you go getting ideas.`;
  }

  /** The stall another than `box`'s (the one at the other end of the row), to browse while he waits. */
  private otherStall(box: ForSaleBox): ForSaleBox | null {
    const stalls = this.options.floor.stalls;
    const mine = stalls.findIndex((e) => e.boxes.has(box));
    const other = stalls[(mine + Math.ceil(stalls.length / 2)) % stalls.length];
    return other ? [...other.boxes][0] ?? null : null;
  }

  /** A free browse spot in front of `box`'s stall (the nearest), claimed. */
  private spotNear(box: ForSaleBox | null): BrowseSpot | null {
    if (!box) return null;
    const { spots, claims } = this.options;
    const here = box.getWorldPosition(new THREE.Vector3());
    const local = this.person.parent ? this.person.parent.worldToLocal(here.clone()) : here;
    const free = spots.filter((s) => !claims.has(s) || s === this.spot);
    const best = (free.length ? free : spots).reduce((a, b) => (dist(b, local) < dist(a, local) ? b : a));
    if (this.spot) claims.delete(this.spot);
    claims.add(best);
    this.spot = best;
    return best;
  }

  private walkTo(spot: BrowseSpot | null, then: () => void, via: readonly (readonly [number, number])[] = []): void {
    if (!spot) return this.leave();
    const last = via[via.length - 1];
    const path = [...via.map((p) => new THREE.Vector3(...this.at(p))), ...this.route(spot.at, last)];
    this.person.walk(path, () => {
      this.person.stand(spot.yaw, 'think');
      then();
    });
  }

  /** From where he stands to `at` (zone-local): through a gap in the front row when the way crosses it, along the aisle. */
  private route(at: readonly [number, number], start?: readonly [number, number]): THREE.Vector3[] {
    const { gaps, rowZ, aisleZ } = this.options;
    const from = start ? { x: start[0], z: start[1] } : this.person.position;
    const gap = gaps.reduce((a, b) => (Math.abs(b - at[0]) < Math.abs(a - at[0]) ? b : a));
    const front = (z: number) => z > rowZ - 0.4;
    const pts: [number, number][] = [];
    if (front(from.z) && !front(at[1])) pts.push([gap, rowZ], [gap, aisleZ]);
    else if (!front(from.z) && front(at[1])) pts.push([gap, aisleZ], [gap, rowZ]);
    else if (!front(from.z)) pts.push([from.x, aisleZ]);
    pts.push([at[0], front(at[1]) ? at[1] : aisleZ], [at[0], at[1]]);
    // No leg of length nil (the aisle point and the spot's, when the spot is in the aisle).
    const legs = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1]![0], p[1] - pts[i - 1]![1]) > 0.05);
    return legs.map((p) => new THREE.Vector3(...this.at(p)));
  }

  private at([x, z]: readonly [number, number]): [number, number, number] {
    return [x, 0, z];
  }
}

function dist(spot: BrowseSpot, p: THREE.Vector3): number {
  return Math.hypot(spot.at[0] - p.x, spot.at[1] - p.z);
}
