import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { Updatable } from '@/core/Engine';
import type { SessionActions } from '@/game/SessionActions';
import type { Classifieds } from '@/classifieds/Classifieds';
import { SELLERS_BUILDING } from '@/classifieds/ads';
import { formatClock } from '@/text/clock';
import { createCanvas, toTexture, FONT } from '@/covers/generated/canvasUtils';
import { playIntercomLine } from '@/audio/furnitureSounds';
import { playDoorbell } from '@/audio/doorbell';
import { invisibleHitbox } from '../meshUtils';
import { METAL } from '../materials/palette';
import { snowPaint } from './snowCover';
import { Prop, part } from '../props/Prop';
import { HoverGlint } from '../props/hoverGlint';
import type { Furniture } from '../Furniture';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { Game } from '@/catalog/types';
import { StockItem } from '@/economy/StockItem';
import { ForSaleBox } from '../market/ForSaleBox';
import { pocket } from '@/errands/pocket';
import { MANSION_RESIDENTS, findOnStep, flatName, mansionDay, ringFlat, takeFromStep } from '@/social/street/mansionDoors';
import { markStreet } from '@/social/street/streetMarks';
import { groundHeight } from './relief/ground';

/** What the bells need besides the small ads: the zone the step's games are placed in, the day, the coins. */
interface MansionBellOptions {
  /** The small ads (a seller's visit due at the hour); none: the bells only ring the residents. */
  book?: Classifieds;
  host: { place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F; remove(item: Furniture): void; toLocal(point: THREE.Vector3): THREE.Vector3 };
  covers: BoxArtLoader;
  wallet: { readonly coins: number; subscribe(cb: () => void): () => void };
  /** A cupboard's worth of games (`MarketStock.randomGames`), drawn by `seed`. */
  randomGames: (seed: string, count: number) => Promise<Game[]>;
  owns: (id: string) => boolean;
  isWanted: (id: string) => boolean;
  /** The game day: whose favour, whose find. */
  day: () => number;
  /** Where a favour's thanks goes. */
  purse?: { earnCoins(coins: number): void };
}

/** Where the step's games lie: out from the plate's foot and to its side (plate frame, m). */
const STEP = { x: 0.35, out: 0.38, spread: 0.2 };

/** The plate (m) and its name card's canvas (px); the bells in two columns of `ROWS`. */
const PLATE = { w: 0.2, h: 0.36, d: 0.012 };
const ROWS = 6;
const CARD_PX: [number, number] = [256, 448];
/** Who lives in the block, flat by flat, as the cards say. */
const RESIDENTS = MANSION_RESIDENTS;
/** Seconds between the bell's ring and the door's buzz letting the player in (then the travel's curtain). */
const BUZZ_AFTER = 0.9;

/**
 * The bells at Park Corner Mansions' street door (docs/economy.md "Small ads and the seller's flat"): a brass plate by
 * the painted entrance, two columns of bell pushes with their names. While a visit agreed on the phone is due
 * (`Classifieds.door`), a ring is answered, the door buzzes and the player goes up to the seller's flat (`travel`); too
 * early, a word to come back at the hour. Otherwise each click rings the next flat down the plate
 * (`social/street/mansionDoors`): a word over the intercom or nothing, a favour asked (bring it from the street's
 * counters and ring again: a few coins), or a cupboard being cleared, its games put out on the step below the plate
 * for the player to take (free `ForSaleBox`es). Wall-hung on the facade: origin at the plate's middle on the wall, +z
 * towards the street. Never collides.
 */
export class MansionBell extends Prop implements Interactable, Updatable {
  readonly hitboxes: THREE.Object3D[];
  private readonly glint: HoverGlint;
  private readonly card: THREE.MeshStandardMaterial;
  /** Rung and buzzed in: a second click while the door buzzes does nothing. */
  private buzzing = false;
  /** The next flat down the plate a click rings (0 .. 11). */
  private cursor = 0;
  /** The games put out on the step today, once laid. */
  private readonly onStep: ForSaleBox[] = [];
  private laidOn = -1;
  /** The game day the step was last looked at for a find put out before a reload. */
  private lookedOn = -1;
  private readonly book: Classifieds | undefined;

  constructor(private readonly options: MansionBellOptions) {
    super();
    this.book = options.book;
    this.name = 'MansionBell';
    const brass = METAL.agedBrass();
    part(this, PLATE.w, PLATE.h, PLATE.d, brass, { z: PLATE.d / 2 });
    // The name card behind its strip of glass, the bell pushes down its edges, the speaker grille under them.
    const [canvas, ctx] = createCanvas(...CARD_PX);
    paintCard(ctx);
    this.card = new THREE.MeshStandardMaterial({ map: toTexture(canvas), roughness: 0.4 });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(PLATE.w * 0.62, PLATE.h * 0.72), this.card);
    face.position.set(0, PLATE.h * 0.06, PLATE.d + 0.0015);
    this.add(face);
    const pushes: THREE.Mesh[] = [];
    for (let i = 0; i < ROWS * 2; i++) {
      const col = i < ROWS ? -1 : 1;
      const row = i % ROWS;
      const y = PLATE.h * 0.06 + (PLATE.h * 0.72) * (0.5 - (row + 0.5) / ROWS);
      pushes.push(part(this, 0.014, 0.014, 0.008, METAL.brass(), { x: col * PLATE.w * 0.4, y, z: PLATE.d + 0.003 }));
    }
    const dark = snowPaint(0x2a2622, 0.7);
    for (let i = 0; i < 4; i++) part(this, PLATE.w * 0.5, 0.004, 0.002, dark, { y: -PLATE.h * 0.4 + i * 0.012, z: PLATE.d + 0.0005 });
    this.glint = HoverGlint.of(...pushes);
    const hitbox = invisibleHitbox(PLATE.w + 0.06, PLATE.h + 0.06, 0.08, { z: 0.04 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string | null {
    const door = this.book?.door();
    if (door?.kind === 'open') return `${SELLERS_BUILDING} · ring ${door.ad.name} (${door.ad.flat})`;
    return `${SELLERS_BUILDING} · ring ${flatName(this.nextFlat())}`;
  }

  /** The flat a click rings now: the one whose favour is being brought, else the next down the plate. */
  private nextFlat(): number {
    const { favour } = mansionDay(this.options.day());
    if (favour && pocket.count(favour.want.item) > 0) return favour.flat;
    return this.cursor;
  }

  activate(session: SessionActions): void {
    const door = this.book?.door();
    if (door && this.book && door.kind === 'open') {
      if (this.buzzing) return;
      this.buzzing = true;
      playDoorbell(0.12);
      this.book.arrive(door.ad);
      window.setTimeout(() => { // convention-ok: the buzz answers a click, a second of the player's own time while they stand at the door
        this.buzzing = false;
        playIntercomLine(0.8, 0.1);
        session.travel('sellerFlat');
      }, BUZZ_AFTER * 1000);
      return;
    }
    if (door?.kind === 'early') {
      playDoorbell(0.12);
      session.react(`No answer from ${door.ad.flat}. ${door.ad.name} said from ${formatClock(door.from)}.`);
      return;
    }
    this.ringResident(session);
  }

  /** A resident's bell: their word over the intercom, a favour asked or thanked, a find put out on the step. */
  private ringResident(session: SessionActions): void {
    const flat = this.nextFlat();
    const day = this.options.day();
    playDoorbell(0.12);
    const answer = ringFlat(flat, day, (item) => pocket.count(item) > 0);
    if (answer.kind === 'thanks') {
      pocket.take(answer.item);
      this.options.purse?.earnCoins(answer.coins);
      markStreet('mansionFavour');
      session.reward({ title: 'A good turn', detail: answer.text, coins: answer.coins });
    } else {
      if (answer.kind !== 'line') playIntercomLine(0.8, 0.1);
      session.react(answer.text);
      if (answer.kind === 'find') this.layStep(answer.games);
    }
    // The next click rings the next flat down the plate (a favour asked stays on its flat while it is carried).
    if (flat === this.cursor) this.cursor = (this.cursor + 1) % RESIDENTS.length;
  }

  /** Lays today's find on the step if it is out and not laid yet (a reload, the street rebuilt). */
  private layStep(count: number): void {
    const day = this.options.day();
    if (this.laidOn === day) return;
    this.laidOn = day;
    const { randomGames, owns, isWanted, covers, wallet, host } = this.options;
    void randomGames(`mansion-step:${day}`, count + 4)
      .catch(() => [])
      .then((games) => {
        if (!this.parent) return;
        const { taken } = findOnStep(day);
        const left = games.filter((g) => !owns(g.id) && !taken.includes(g.id)).slice(0, count);
        left.forEach((game, i) => {
          const box = new ForSaleBox(new StockItem(game, 'worn', 'bin', { list: 0, final: true }), covers, {
            pose: { kind: 'flat' },
            tag: false,
            wallet,
            where: `the step of ${SELLERS_BUILDING}`,
            free: true,
            isWanted: () => isWanted(game.id),
            thanks: () => 'Out of a cupboard at the Mansions, for whoever rang.',
          });
          const world = this.localToWorld(new THREE.Vector3(STEP.x + i * STEP.spread, 0, STEP.out));
          const at = host.toLocal(world);
          at.y = groundHeight(at.x, at.z) + 0.016;
          box.onSold = () => {
            host.remove(box);
            takeFromStep(day, game.id);
            markStreet('mansionFind');
          };
          box.restock = () => void host.place(box, at, this.rotation.y + 0.3 * i);
          host.place(box, at, this.rotation.y + 0.3 * i);
          this.onStep.push(box);
        });
      });
  }

  /** On the first frame: a find put out earlier today (before a reload) is on the step again. */
  update(): void {
    const day = this.options.day();
    if (this.lookedOn === day) return;
    this.lookedOn = day;
    const { find } = mansionDay(day);
    if (find && findOnStep(day).out) this.layStep(find.games);
  }

  dispose(): void {
    for (const box of this.onStep) box.dispose();
    this.card.map?.dispose();
    this.card.dispose();
  }
}

/** The residents' names, two columns of six, in a typed hand on cream card. */
function paintCard(ctx: CanvasRenderingContext2D): void {
  const [w, h] = CARD_PX;
  ctx.fillStyle = '#ece4cf';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2a2622';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 22px ${FONT}`;
  for (let i = 0; i < ROWS * 2; i++) {
    const left = i < ROWS;
    const row = i % ROWS;
    const y = (row + 0.5) * (h / ROWS);
    ctx.textAlign = left ? 'left' : 'right';
    ctx.fillText(`${i + 1} ${RESIDENTS[i]}`, left ? 12 : w - 12, y);
    ctx.fillStyle = 'rgba(42,38,34,0.25)';
    ctx.fillRect(8, y + h / ROWS / 2 - 1, w - 16, 2);
    ctx.fillStyle = '#2a2622';
  }
}
