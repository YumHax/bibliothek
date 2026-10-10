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
import type { PrizeKind } from '@/economy/Prizes';
import { prizeModel } from '../prizes/prizeModel';
import { formatTickets } from '@/text/money';

interface PrizeCounterOptions {
  /** Tickets one coin is worth, written on the sign. */
  ticketsPerCoin: number;
  /** What the glass case shows: the prizes on sale, left to right (their price tagged on the pegboard behind). */
  prizes?: readonly { kind: PrizeKind; color: number; tickets?: number }[];
  /** Gap between the counter's back and the wall the sign hangs on (room for an attendant behind). Default 0.02. */
  wallBehind?: number;
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

/**
 * The arcade's prize counter: a glass-fronted desk showing the prizes on two glass shelves, a lit
 * sign giving the rate. Clicking it opens the counter's panel (`SessionActions.openPrizeCounter`):
 * prizes for tickets, tickets for coins. Local +z faces the room.
 */
export class PrizeCounter extends THREE.Group implements Furniture, Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly sign: THREE.MeshBasicMaterial;
  private readonly rate: number;

  constructor({ ticketsPerCoin, wallBehind = 0.02, prizes = [] }: PrizeCounterOptions) {
    super();
    this.name = 'PrizeCounter';
    this.rate = ticketsPerCoin;

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
  private addPegboard(wallZ: number, prizes: readonly { kind: PrizeKind; color: number; tickets?: number }[]): void {
    const hung = prizes.filter((p) => p.tickets !== undefined);
    const { width, height, y, perRow } = PEGBOARD;
    const rows = Math.max(1, Math.ceil(hung.length / perRow));
    const slots = hung.map((prize, i) => ({ prize, col: i % perRow, row: Math.floor(i / perRow) }));
    const cellW = width / perRow;
    const cellH = height / rows;
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, PEG_T),
      [PEG_EDGE, PEG_EDGE, PEG_EDGE, PEG_EDGE, new THREE.MeshStandardMaterial({ map: paintPegboard(width, height, slots, rows), roughness: 0.85 }), PEG_EDGE],
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

/** The pegboard's face: hardboard with its grid of holes, a tag under each hook with the prize's price. */
function paintPegboard(width: number, height: number, slots: readonly { prize: { tickets?: number }; col: number; row: number }[], rows: number): THREE.CanvasTexture {
  const W = Math.round(width * PEG_PX);
  const H = Math.round(height * PEG_PX);
  const [canvas, ctx] = createCanvas(W, H);
  const cellW = W / PEGBOARD.perRow;
  const cellH = H / rows;
  const paint = (): void => {
    ctx.fillStyle = '#8a6440';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(40,24,12,0.75)';
    for (let x = 10; x < W; x += 20) for (let y = 10; y < H; y += 20) ctx.fillRect(x - 2, y - 2, 4, 4);
    for (const { prize, col, row } of slots) {
      const x = cellW * (col + 0.5);
      const y = cellH * row + cellH * 0.86;
      ctx.fillStyle = '#fff8e6';
      ctx.fillRect(x - cellW * 0.36, y - 13, cellW * 0.72, 26);
      ctx.fillStyle = '#ff2fa0';
      ctx.fillRect(x - cellW * 0.36, y - 13, 5, 26);
      drawText(ctx, `${prize.tickets ?? 0} TIX`, x + 2, y + 1, 13, '#1a0f2a');
    }
  };
  paint();
  const texture = toTexture(canvas, 'facing');
  repaintWhenFontLoads(`13px ${PIXEL_FONT}`, () => {
    paint();
    texture.needsUpdate = true;
  });
  return texture;
}
