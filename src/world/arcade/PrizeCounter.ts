import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../Furniture';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../meshUtils';
import { PIXEL_FONT, drawText } from './games/ArcadeGame';
import { repaintWhenFontLoads } from '@/graphics/fontReady';
import { PooledLight } from '../lighting/LightPool';
import { WARM_STRIP, bakedGlow, poolTexture } from '../showcase/glow';
import { CABINET_CHROME } from './cabinetModel';
import { PROUD } from '../props/joinery';
import { paint, standard, timber } from '@/world/materials/palette';
import { type OwnedPrize, type Prize, soldOnce } from '@/economy/Prizes';
import type { Updatable } from '@/core/Engine';
import { prizeModel } from '../prizes/prizeModel';
import { formatTickets } from '@/text/money';

/** The prizes taken home, as the counter reads them: what was taken today leaves a gap, a new one is handed over. */
interface TakenPrizes {
  readonly owned: readonly OwnedPrize[];
  takenOn(id: string, day: number): boolean;
  subscribe(cb: () => void): () => void;
}

interface PrizeCounterOptions {
  /** Tickets one coin is worth, written on the sign. */
  ticketsPerCoin: number;
  /** What the glass case shows: the prizes on sale, left to right (their price tagged on the pegboard behind). */
  prizes?: readonly Prize[];
  /** Gap between the counter's back and the wall the sign hangs on (room for an attendant behind). Default 0.02. */
  wallBehind?: number;
  /** The prizes taken: today's leave their gap in the case till the next game day, the newest is set on the counter top. */
  taken?: TakenPrizes;
  /** The pocket: the pegboard's tags light up over what it covers. */
  wallet?: { readonly tickets: number; subscribe(cb: () => void): () => void };
  /** Today's game day (the market calendar's): the case is restocked on the next. */
  today?: () => number;
}

const WIDTH = 1.5;
const DEPTH = 0.6;
const HEIGHT = 1.02;
const SIGN_Y = 1.75;

const WOOD = timber(0x4a3524, 0.6);
const TOP = paint(0x8b6a44, 0.5);
const GLASS = standard({ color: 0xbfd8e6, roughness: 0.1, transparent: true, opacity: 0.35 });
/** The glass case's inside: its top (under the counter top) and the two floors the strip lights. */
const CASE_TOP = 0.16 + (HEIGHT - 0.3);
const CASE_FLOORS = [0.12, 0.12 + 0.35] as const;
/** The pegboard on the wall behind, under the sign: size, centre height, how many prizes a row. */
const PEGBOARD = { width: 1.4, height: 0.52, y: 1.28, perRow: 7 };
const PEG_PX = 400;
/** The pegboard's thickness, and the case's LED strip's height. */
const PEG_T = 0.008;
const STRIP_H = 0.012;
/** Where the attendant sets a prize just taken, counter-local (on the top, on the hall's side of the bowl), and its size there. */
const HANDOVER = { x: -0.32, z: 0.08, scale: 1.5 };
/** How often the case checks the day for its restock (s). */
const RESTOCK_CHECK_S = 2;

/**
 * The arcade's prize counter: a glass-fronted desk showing the prizes on two glass shelves, a lit
 * sign giving the rate. Clicking it opens the counter's panel (`SessionActions.openPrizeCounter`):
 * prizes for tickets, tickets for coins. Local +z faces the room.
 */
export class PrizeCounter extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly hitboxes: THREE.Object3D[];
  private readonly sign: THREE.MeshBasicMaterial;
  private readonly rate: number;
  /** The case's models by prize id: one taken today is a gap till tomorrow. */
  private readonly inCase = new Map<string, THREE.Object3D>();
  private readonly options: PrizeCounterOptions;
  /** The pegboard's face, repainted when the tags the pocket covers change. */
  private pegboard: { texture: THREE.CanvasTexture; repaint: (lit: ReadonlySet<string>) => void; lit: string } | null = null;
  /** The prize just handed over, on the counter top. */
  private handedOver: THREE.Object3D | null = null;
  private seen: number;
  private day: number;
  private checkIn = 0;
  private readonly unsubscribe: (() => void)[] = [];

  constructor(options: PrizeCounterOptions) {
    super();
    const { ticketsPerCoin, wallBehind = 0.02, prizes = [] } = options;
    this.name = 'PrizeCounter';
    this.options = options;
    this.rate = ticketsPerCoin;
    this.seen = options.taken?.owned.length ?? 0;
    this.day = options.today?.() ?? 0;

    // Desk: a wooden carcass, a glass display in the front, a thicker top.
    this.add(boxMesh(WIDTH, HEIGHT - 0.04, DEPTH * 0.55, WOOD, { y: (HEIGHT - 0.04) / 2, z: -DEPTH * 0.22 }));
    const glass = boxMesh(WIDTH - 0.08, HEIGHT - 0.3, DEPTH * 0.42, GLASS, { y: 0.16 + (HEIGHT - 0.3) / 2, z: DEPTH * 0.28 });
    glass.castShadow = false;
    this.add(glass);
    this.add(boxMesh(WIDTH, 0.12, DEPTH * 0.45, WOOD, { y: 0.06, z: DEPTH * 0.28 }));
    this.add(boxMesh(WIDTH + 0.04, 0.04, DEPTH + 0.04, TOP, { y: HEIGHT - 0.02 }));
    // The prizes in the case, on two glass shelves, facing the hall.
    const perRow = Math.ceil(prizes.length / 2);
    prizes.forEach((prize, i) => {
      const row = i < perRow ? 0 : 1;
      const col = row === 0 ? i : i - perRow;
      const count = row === 0 ? perRow : prizes.length - perRow;
      const model = prizeModel(prize.kind, prize.color);
      model.scale.setScalar(1.4);
      model.position.set(-WIDTH / 2 + 0.12 + ((WIDTH - 0.24) * (col + 0.5)) / count, 0.12 + row * 0.36, DEPTH * 0.28);
      this.add(model);
      this.inCase.set(prize.id, model);
    });
    this.add(boxMesh(WIDTH - 0.1, 0.006, DEPTH * 0.4, GLASS, { y: 0.12 + 0.35, z: DEPTH * 0.28 }));
    this.lightCase();
    // A bowl of coins on the top.
    const bowl = cylinderMesh(0.09, 0.04, paint(0x2a2a30, 0.4), { x: 0.5, y: HEIGHT + 0.02, z: 0.05 }, { radiusBottom: 0.06, segments: 20 });
    const coins = cylinderMesh(0.08, 0.01, standard({ color: 0xd4a52a, metalness: 1, roughness: 0.3 }), { x: 0.5, y: HEIGHT + 0.04, z: 0.05 }, { segments: 20 });
    this.add(bowl, coins);

    // Lit sign on the wall behind (a hair off it, whatever the gap to the counter), hung from two rods.
    const signZ = -DEPTH / 2 - wallBehind + 0.04;
    this.sign = new THREE.MeshBasicMaterial({ map: this.paintSign() });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.3), this.sign);
    sign.position.set(0, SIGN_Y, signZ);
    this.add(sign);
    for (const x of [-0.5, 0.5]) this.add(cylinderMesh(0.006, 0.4, paint(0x2a2a30, 0.5), { x, y: SIGN_Y + 0.35, z: signZ }, { segments: 8 }));
    this.addPegboard(-DEPTH / 2 - wallBehind, prizes);

    const hitbox = invisibleHitbox(WIDTH + 0.06, HEIGHT + 0.1, DEPTH + 0.06, { y: (HEIGHT + 0.1) / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);

    this.restock();
    this.lightTags();
    if (options.taken) this.unsubscribe.push(options.taken.subscribe(() => this.onTaken()));
    if (options.wallet) this.unsubscribe.push(options.wallet.subscribe(() => this.lightTags()));
  }

  update(dt: number): void {
    this.checkIn -= dt;
    if (this.checkIn > 0 || !this.options.today) return;
    this.checkIn = RESTOCK_CHECK_S;
    const day = this.options.today();
    if (day === this.day) return;
    this.day = day;
    this.restock();
  }

  dispose(): void {
    for (const off of this.unsubscribe) off();
  }

  /** A gap in the case where a prize was taken today; the rest in their places (a new day fills every gap). */
  private restock(): void {
    const taken = this.options.taken;
    for (const [id, model] of this.inCase) model.visible = !taken?.takenOn(id, this.day);
  }

  /** A prize was just taken: its gap in the case, and the attendant sets it down on the counter top for the player. */
  private onTaken(): void {
    const taken = this.options.taken!;
    const fresh = taken.owned.slice(this.seen);
    this.seen = taken.owned.length;
    this.restock();
    this.lightTags();
    const prize = [...fresh].reverse().map((o) => this.options.prizes?.find((p) => p.id === o.id)).find(Boolean);
    if (!prize) return;
    if (this.handedOver) this.remove(this.handedOver);
    const model = prizeModel(prize.kind, prize.color);
    model.scale.setScalar(HANDOVER.scale);
    model.position.set(HANDOVER.x, HEIGHT + PROUD, HANDOVER.z); // stood on the top, not in its face
    model.rotation.y = 0.3;
    this.handedOver = model;
    this.add(model);
  }

  /** The pegboard's tags over what the pocket covers glow (a prize sold once and home already stays dark). */
  private lightTags(): void {
    const board = this.pegboard;
    if (!board) return;
    const wallet = this.options.wallet;
    // Without a pocket to read, every tag is lit.
    const covered = (p: Prize): boolean => !wallet || (p.tickets !== null && p.tickets <= wallet.tickets && !(soldOnce(p) && this.options.taken?.owned.some((o) => o.id === p.id)));
    const lit = new Set((this.options.prizes ?? []).filter(covered).map((p) => p.id));
    const key = [...lit].sort().join(',');
    if (key === board.lit) return;
    board.lit = key;
    board.repaint(lit);
    board.texture.needsUpdate = true;
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-WIDTH / 2, 0, -DEPTH / 2), new THREE.Vector3(WIDTH / 2, HEIGHT, DEPTH / 2));
  }

  setHovered(hovered: boolean): void {
    this.sign.color.setHex(hovered ? 0xffffff : 0xdddddd);
  }

  label(): string {
    return `Prize counter · swap tickets for prizes or coins (${formatTickets(this.rate)} = 1 coin)`;
  }

  activate(session: SessionActions): void {
    session.openPrizeCounter();
  }

  /**
   * The case lit from inside: a warm LED strip under its top, its light baked as a pool on each
   * floor (the showcase kit's), and one pooled light so the prizes throw their glow onto the
   * attendant and the carpet when the player is near. The payoff of the tickets should look it.
   */
  private lightCase(): void {
    const z = DEPTH * 0.28;
    const strip = boxMesh(WIDTH - 0.14, STRIP_H, 0.02, WARM_STRIP, { y: CASE_TOP - STRIP_H / 2 - PROUD, z: z + DEPTH * 0.14 });
    strip.castShadow = false;
    this.add(strip);
    const pool = poolTexture();
    CASE_FLOORS.forEach((y, i) => {
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.12, DEPTH * 0.38), bakedGlow(0xffd9a0, i === 1 ? 0.32 : 0.22, pool));
      glow.rotation.x = -Math.PI / 2;
      // Over the floor's top face (the glass shelf is 6 mm thick round its centre; the case's floor is the wooden plinth's top).
      glow.position.set(0, y + (i === 1 ? 0.0035 : 0.0015), z);
      glow.castShadow = false;
      glow.receiveShadow = false;
      glow.raycast = () => {};
      this.add(glow);
    });
    const light = new PooledLight(0xffd9a0, 0.7, 2.2, 2);
    light.position.set(0, CASE_TOP - 0.05, z + 0.2);
    this.add(light);
  }

  /**
   * The pegboard on the wall behind the attendant: brown hardboard, its holes in rows, every prize
   * on sale hung on a hook with its ticket price on a tag under it. What a coin of tickets buys, at
   * a glance from across the hall.
   */
  private addPegboard(wallZ: number, prizes: readonly Prize[]): void {
    const hung = prizes.filter((p) => p.tickets !== null);
    const { width, height, y, perRow } = PEGBOARD;
    const rows = Math.max(1, Math.ceil(hung.length / perRow));
    const slots = hung.map((prize, i) => ({ prize, col: i % perRow, row: Math.floor(i / perRow) }));
    const cellW = width / perRow;
    const cellH = height / rows;
    const face = paintPegboard(width, height, slots, rows);
    this.pegboard = { ...face, lit: '' };
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, PEG_T),
      [PEG_EDGE, PEG_EDGE, PEG_EDGE, PEG_EDGE, new THREE.MeshStandardMaterial({ map: face.texture, roughness: 0.85, emissiveMap: face.texture, emissive: 0xffffff, emissiveIntensity: 0.35 }), PEG_EDGE],
    );
    board.position.set(0, y, wallZ + PEG_T / 2 + PROUD);
    board.receiveShadow = true;
    this.add(board);
    for (const { prize, col, row } of slots) {
      const x = -width / 2 + cellW * (col + 0.5);
      const top = y + height / 2 - cellH * row;
      // A hook out of the board, the prize hanging under it.
      const hook = cylinderMesh(0.003, 0.05, CABINET_CHROME, { x, y: top - 0.03, z: wallZ + 0.035 }, { segments: 6 });
      hook.rotation.x = Math.PI / 2;
      this.add(hook);
      const model = prizeModel(prize.kind, prize.color);
      model.scale.setScalar(0.8);
      model.position.set(x, top - cellH * 0.62, wallZ + 0.06);
      this.add(model);
    }
  }

  private paintSign(): THREE.CanvasTexture {
    const [canvas, ctx] = createCanvas(1024, 256);
    const paintIt = (): void => {
      ctx.fillStyle = '#1a0f2a';
      ctx.fillRect(0, 0, 1024, 256);
      ctx.strokeStyle = '#ff8a80';
      ctx.lineWidth = 10;
      ctx.strokeRect(12, 12, 1000, 232);
      drawText(ctx, 'PRIZES', 512, 95, 90, '#ffd23a');
      drawText(ctx, `${this.rate} TICKETS = 1 COIN`, 512, 190, 40, '#c9c4ff');
    };
    paintIt();
    const texture = toTexture(canvas, 'facing');
    repaintWhenFontLoads(`90px ${PIXEL_FONT}`, () => {
      paintIt();
      texture.needsUpdate = true;
    });
    return texture;
  }
}

const PEG_EDGE = paint(0x6a4a2c, 0.8);

/**
 * The pegboard's face: hardboard with its grid of holes, a tag under each hook with the prize's price; a tag the pocket
 * covers is lit (`repaint(lit)`), the rest of the board stays dim under the face's faint emissive.
 */
function paintPegboard(width: number, height: number, slots: readonly { prize: Prize; col: number; row: number }[], rows: number): { texture: THREE.CanvasTexture; repaint: (lit: ReadonlySet<string>) => void } {
  const W = Math.round(width * PEG_PX);
  const H = Math.round(height * PEG_PX);
  const [canvas, ctx] = createCanvas(W, H);
  const cellW = W / PEGBOARD.perRow;
  const cellH = H / rows;
  let lit: ReadonlySet<string> = new Set();
  const paint = (): void => {
    // Dark hardboard: the face's emissive only lifts what is pale on it, the lit tags.
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(12,6,2,0.8)';
    for (let x = 10; x < W; x += 20) for (let y = 10; y < H; y += 20) ctx.fillRect(x - 2, y - 2, 4, 4);
    for (const { prize, col, row } of slots) {
      const x = cellW * (col + 0.5);
      const y = cellH * row + cellH * 0.86;
      const on = lit.has(prize.id);
      ctx.fillStyle = on ? '#fff8e6' : '#6e665a';
      ctx.fillRect(x - cellW * 0.36, y - 13, cellW * 0.72, 26);
      ctx.fillStyle = on ? '#ff2fa0' : '#5a3a4a';
      ctx.fillRect(x - cellW * 0.36, y - 13, 5, 26);
      drawText(ctx, `${prize.tickets ?? 0} TIX`, x + 2, y + 1, 13, on ? '#1a0f2a' : '#2a241e');
    }
  };
  paint();
  const texture = toTexture(canvas, 'facing');
  repaintWhenFontLoads(`13px ${PIXEL_FONT}`, () => {
    paint();
    texture.needsUpdate = true;
  });
  return {
    texture,
    repaint: (next) => {
      lit = next;
      paint();
    },
  };
}
