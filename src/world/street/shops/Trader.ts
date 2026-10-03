import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { Game } from '@/catalog/types';
import { readGame } from '@/catalog/validate';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { StockItem } from '@/economy/StockItem';
import { TRADER_MARKUP } from '@/economy/pricing';
import { KEYS, PersistedStore } from '@/persistence';
import { gameDayRandom } from '@/time/daily';
import { RIVAL_COLLECTOR, rivalOnFrontStreet, type RivalCollector } from '@/economy/rivalCollector';
import type { Today } from '@/time/Today';
import { snowStandard } from '../snowCover';
import type { DayNight } from '../../props/DayNight';
import type { Furniture } from '../../Furniture';
import { ForSaleBox } from '../../market/ForSaleBox';
import { Walker } from '../../people/Walker';
import { outOfSight } from '../life/sight';

export interface TraderOptions {
  /** The zone: his games must be placed to be clickable. */
  host: { place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F; remove(item: Furniture): void; toLocal(point: THREE.Vector3): THREE.Vector3 };
  covers: BoxArtLoader;
  wallet: { readonly coins: number; subscribe(cb: () => void): () => void };
  /** The flea market: today's stock once drawn, and what buying one of its copies away from it means. */
  market: { peekToday(): readonly StockItem[] | null; soldToRival(item: StockItem): void };
  /** His pick follows the game day (the market's stock), his coming the real day (`isTraderDay`). */
  today: Pick<Today, 'gameDay'>;
  owns: (id: string) => boolean;
  isWanted: (id: string) => boolean;
  /** Game hours he stands there between. */
  hours: readonly [number, number];
  viewer: THREE.Object3D;
  /** The zone's collision set (world boxes): his stand collides only while he is there. */
  collisions?: { add(box: THREE.Box3): void; remove(box: THREE.Box3): void };
  /** Asked first when he is clicked: a line of a story the player follows (`src/story`), else null. */
  talk?: () => string | null;
  /** Who he is to the player (`economy/rivalCollector`): what he won at the flea market and the saleroom joins his suitcase. */
  rival?: RivalCollector;
}

/** Whether today (the real date) the collector sets up on Front Street: about one day in `oneDayIn` (phase 1 of the cycle). */
export function isTraderDay(oneDayIn: number, date = new Date()): boolean {
  return rivalOnFrontStreet(date, oneDayIn);
}

/** What he adds to what the stall asked him (`TRADER_MARKUP` in pricing.ts). */
const MARKUP = TRADER_MARKUP;
const COPIES = 3;
const SUITCASE = { width: 0.72, depth: 0.46, height: 0.72 };
const LOOK_EVERY = 2;
const LINES = [
  'Bought these at the flea market at opening. Dealers’ hours, friend.',
  'Everything’s negotiable. Well, almost everything.',
  'Got something to swap? I take games in part exchange.',
  'You collect too? Then you know what that one’s worth.',
];
const EMPTY_LINES = [
  'Still waiting for my man at the flea market. Come back after you’ve been.',
  'Nothing on the table yet. The market has to open first, doesn’t it?',
];
const THANKS = ['Pleasure. Tell your friends. Or don’t.', 'A fair deal. Mostly for me.', 'Look after it: I might buy it back.'];

/** What he picked out of today's stock (the same all game day, reloads included). */
interface SavedPick {
  /** The game day (`Today.gameDay`). */
  day: number;
  games: Game[];
  prices: number[];
}

/**
 * A rival collector who sets up outside RETRO GAMES some days (`isTraderDay`), during `hours`: a
 * person behind an open suitcase on a folding stand, with three games he bought off the flea
 * market's stalls at opening, so they are gone from there, one of them from the player's
 * wishlist when the market had it (he is a dealer), at a markup. They are market copies (`ForSaleBox`,
 * `'stall'`): click to look, B buys, H haggles, X swaps a game from the collection in part
 * exchange (it goes to the flea market), R holds. Until the player's market day has drawn the
 * stock, his suitcase is empty and he says to come back later. Origin on the pavement where he
 * stands, +z is the buyer's side.
 */
export class Trader extends THREE.Group implements Furniture, Updatable, Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly person: Walker;
  private readonly kit = new THREE.Group();
  private readonly boxes: ForSaleBox[] = [];
  /** Puts a copy back on the suitcase (after he packed up, or a purchase handed back). */
  private readonly placers = new Map<ForSaleBox, () => void>();
  private filled = false;
  private greeted = false;
  /** The games in his suitcase that he won off the player's nose (his haul). */
  private readonly haulIds = new Set<string>();
  private present = false;
  private lookClock = LOOK_EVERY;
  private line = 0;
  /** The stand's box in world space (built on the first update, once placed), in the zone's collisions while he is there. */
  private collider: THREE.Box3 | null = null;
  /** Just (re)activated: the first update takes what the clock says, seen or not (the player has only just arrived). */
  private fresh = true;
  private readonly here = new THREE.Vector3();

  constructor(private readonly dayNight: DayNight, private readonly options: TraderOptions) {
    super();
    this.name = 'Trader';
    this.person = new Walker({ viewer: options.viewer, seed: RIVAL_COLLECTOR.seed, label: `${RIVAL_COLLECTOR.label} · chat`, speaker: RIVAL_COLLECTOR.short, fade: true });
    this.person.traverse((o) => {
      o.castShadow = false;
    });
    this.person.position.z = -0.35;
    this.person.stand(0, 'crossed');
    this.add(this.person);
    this.buildKit();
    this.add(this.kit);
    this.hitboxes = this.person.hitboxes;
    this.setPresent(false);
  }

  /** Empty: the stand's box comes and goes with him (`collider`), no ghost once he has packed up. */
  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setZoneActive(active: boolean): void {
    if (active) this.fresh = true;
  }

  setHovered(): void {
    // A person does not glow.
  }

  label(): string | null {
    return this.present ? `${RIVAL_COLLECTOR.label} · chat` : null;
  }

  activate(_session: SessionActions): void {
    if (!this.present) return;
    const told = this.options.talk?.();
    if (told) {
      this.person.speak(told);
      return;
    }
    // The first word is how things stand between them (the hall, the saleroom); then his patter.
    const { rival } = this.options;
    if (rival && !this.greeted) {
      this.greeted = true;
      const haul = this.boxes.some((b) => this.haulIds.has(b.item.game.id));
      this.person.speak(haul ? `${rival.greeting()} And yes, that's the one I beat you to. Still for sale.` : rival.greeting());
      rival.meet();
      return;
    }
    const lines = this.boxes.length ? LINES : EMPTY_LINES;
    const line = lines[this.line++ % lines.length]!;
    this.person.speak(line);
  }

  /** Him, for the street's people budget (`life/PeopleBudget`): drawn only while among the nearest few. */
  get figure(): Walker {
    return this.person;
  }

  dispose(): void {
    for (const box of this.boxes) box.dispose();
    if (this.collider && this.present) this.options.collisions?.remove(this.collider);
  }

  update(dt: number): void {
    const [from, to] = this.options.hours;
    const s = this.dayNight.state;
    const present = s.hours >= from && s.hours < to && s.rain < 0.3;
    if (!this.collider) {
      this.updateWorldMatrix(true, false);
      this.collider = new THREE.Box3(new THREE.Vector3(-0.45, 0, -0.6), new THREE.Vector3(0.45, 1.1, 0.8)).applyMatrix4(this.matrixWorld);
    }
    // He sets up and packs up only while the player cannot see the spot.
    if (present !== this.present && (this.fresh || outOfSight(this.options.viewer, this.getWorldPosition(this.here)))) this.setPresent(present);
    this.fresh = false;
    if (!present) return;
    this.person.update(dt);
    if (this.filled) return;
    this.lookClock += dt;
    if (this.lookClock < LOOK_EVERY) return;
    this.lookClock = 0;
    const picked = this.pick();
    if (picked) this.lay(picked);
  }

  private setPresent(present: boolean): void {
    if (this.collider && present !== this.present) {
      if (present) this.options.collisions?.add(this.collider);
      else this.options.collisions?.remove(this.collider);
    }
    this.present = present;
    this.visible = present;
    this.person.setPresent(present, new THREE.Vector3(0, 0, -0.35));
    if (present) this.person.stand(0, 'crossed');
    // Packed up, his copies leave the pavement with him (a hidden box would still be clickable).
    for (const box of this.boxes) {
      if (present) this.placers.get(box)?.();
      else this.options.host.remove(box);
    }
  }

  /** Today's three copies: remembered if he already picked them, else taken off the market's stalls now (once it has stock). */
  private pick(): { games: Game[]; prices: number[] } | null {
    const { market, owns, isWanted, today } = this.options;
    const day = today.gameDay;
    const saved = load();
    if (saved && saved.day === day) return saved;
    const stock = market.peekToday();
    if (!stock) return null;
    const pool = stock.filter((item) => item.priced && item.source !== 'bin' && item.source !== 'ordered' && item.source !== 'upgrade' && !item.reserved && !owns(item.game.id));
    const random = gameDayRandom('trader', day);
    const chosen: StockItem[] = [];
    const wanted = pool.find((item) => isWanted(item.game.id));
    if (wanted) chosen.push(wanted);
    while (chosen.length < COPIES && chosen.length < pool.length) {
      const item = pool[Math.floor(random() * pool.length)]!;
      if (!chosen.includes(item)) chosen.push(item);
    }
    for (const item of chosen) market.soldToRival(item);
    const pick: SavedPick = { day, games: chosen.map((item) => item.game), prices: chosen.map((item) => Math.max(2, Math.round(item.price * MARKUP))) };
    save(pick);
    return pick;
  }

  /** His copies, leaning in the open suitcase: what he won lately first (the flea market, the saleroom), then today's pick. */
  private lay({ games, prices }: { games: Game[]; prices: number[] }): void {
    this.filled = true;
    const { host, covers, wallet, isWanted, owns, rival, today } = this.options;
    const haul = (rival?.haulOn(today.gameDay) ?? []).map((h) => ({ game: h.game, price: Math.max(2, Math.round(h.price * MARKUP)) }));
    for (const h of haul) this.haulIds.add(h.game.id);
    const picked = games.map((game, i) => ({ game, price: prices[i]! })).filter(({ game }) => !this.haulIds.has(game.id));
    const left = [...haul, ...picked].filter(({ game }) => !owns(game.id)).slice(0, COPIES + 2);
    const spacing = SUITCASE.width / (left.length + 1);
    left.forEach(({ game, price }, i) => {
      const item = new StockItem(game, game.condition ?? 'complete', 'stall', { list: price, final: true });
      const box = new ForSaleBox(item, covers, {
        pose: { kind: 'lean', angle: 0.35 },
        wallet,
        where: 'the collector outside RETRO GAMES',
        isWanted: () => isWanted(game.id),
        thanks: () => THANKS[Math.floor(Math.random() * THANKS.length)]!,
      });
      const at = host.toLocal(this.localToWorld(new THREE.Vector3(-SUITCASE.width / 2 + spacing * (i + 1), SUITCASE.height + 0.1, 0.52)));
      const place = (): void => {
        host.place(box, at, this.rotation.y);
      };
      box.onSold = () => {
        host.remove(box);
        this.boxes.splice(this.boxes.indexOf(box), 1);
        // Bought back off him: out of his haul.
        if (this.haulIds.has(game.id)) rival?.sold(game.id);
      };
      box.restock = () => {
        place();
        this.boxes.push(box);
      };
      this.placers.set(box, place);
      place();
      this.boxes.push(box);
    });
  }

  private buildKit(): void {
    const { width, depth, height } = SUITCASE;
    const metal = snowStandard({ color: 0x2a2c30, roughness: 0.45 });
    // The folding stand: two crossed frames.
    for (const side of [-1, 1]) {
      for (const tilt of [-0.45, 0.45]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.02, height / Math.cos(tilt), 0.02), metal);
        leg.position.set(side * (width / 2 - 0.04), height / 2, 0.5);
        leg.rotation.x = tilt;
        this.kit.add(leg);
      }
    }
    // The suitcase, open: its base on the stand, its lid standing up behind with the sign.
    const leather = snowStandard({ color: 0x5a3422, roughness: 0.7 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, depth), leather);
    base.position.set(0, height + 0.05, 0.5);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(width, depth, 0.06), leather);
    lid.position.set(0, height + 0.1 + depth / 2, 0.5 - depth / 2 - 0.02);
    lid.rotation.x = -0.12;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.08, depth - 0.1), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.9 }));
    sign.position.set(0, height + 0.1 + depth / 2, 0.5 - depth / 2 + 0.015);
    sign.rotation.x = -0.12;
    for (const mesh of [base, lid, sign]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.kit.add(mesh);
    }
  }
}

/**
 * Version 1: `{ day, games, prices }` (bare JSON before versions were kept), `day` the market day.
 * A game this build cannot read goes with its price. Without storage (private mode) he picks again on the next visit.
 */
const store = new PersistedStore<SavedPick>({
  key: KEYS.trader,
  version: 1,
  defaults: () => ({ day: -1, games: [], prices: [] }),
  read: readPick,
});

function readPick(data: unknown): SavedPick | null {
  if (typeof data !== 'object' || data === null) return null;
  const { day, games, prices } = data as Partial<Record<keyof SavedPick, unknown>>;
  if (typeof day !== 'number' || !Array.isArray(games) || !Array.isArray(prices)) return null;
  const pick: SavedPick = { day, games: [], prices: [] };
  games.forEach((value, i) => {
    const game = readGame(value);
    const price = prices[i];
    if (!game || typeof price !== 'number' || !Number.isFinite(price)) return;
    pick.games.push(game);
    pick.prices.push(price);
  });
  return pick;
}

function load(): SavedPick | null {
  return store.tryLoad();
}

function save(pick: SavedPick): void {
  store.save(pick);
}

/** The card taped in the lid: COLLECTOR · BUY SELL SWAP. */
function signTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 150);
  ctx.fillStyle = '#efe6d0';
  ctx.fillRect(0, 0, 256, 150);
  ctx.fillStyle = '#1a1614';
  ctx.textAlign = 'center';
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillText('COLLECTOR', 128, 52);
  ctx.font = 'bold 24px Georgia, serif';
  ctx.fillText('BUY · SELL · SWAP', 128, 94);
  ctx.font = 'italic 18px Georgia, serif';
  ctx.fillText('rare finds, fair-ish prices', 128, 128);
  return toTexture(canvas, 'facing');
}
