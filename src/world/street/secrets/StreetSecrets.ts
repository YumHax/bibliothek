import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { BoxArtLoader } from '@/covers/BoxArtLoader';
import type { Game } from '@/catalog/types';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { StockItem } from '@/economy/StockItem';
import { markStreet, streetMarked } from '@/social/street/streetMarks';
import type { Furniture } from '../../Furniture';
import { invisibleHitbox } from '../../meshUtils';
import { ForSaleBox } from '../../market/ForSaleBox';
import { GROUND, layMesh } from '../../surface/layers';

/*
 * Front Street's secrets (docs/zones.md "The street", "Secrets"): small things nobody points out. The TO LET window
 * under our building with GAME OVER in its dust (rubbed clean: CONTINUE? F.A., and a cartridge on the mat inside,
 * fished out through the letterbox); the children's chalk squares on Park Street, which pay out to whoever steps the
 * old code on them; the initials in the park's railing. Each found is a moment of the street's (`streetMarks`).
 */

/** Something fixed in the street that answers a click and never collides. */
abstract class Secret extends THREE.Group implements Furniture, Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[] = [];

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(): void {
    // Nothing glows: it is a secret.
  }

  abstract label(): string | null;
  abstract activate(session: SessionActions): void;
}

/** Where a found game is put down: the zone (it must be placed to be clickable). */
interface FindHost {
  place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F;
  remove(item: Furniture): void;
}

interface DustyPaneOptions {
  host: FindHost;
  covers: BoxArtLoader;
  wallet: { readonly coins: number; subscribe(cb: () => void): () => void };
  /** A game from the loft of somebody long gone (`MarketStock.randomGames`). */
  randomGames: (seed: string, count: number) => Promise<Game[]>;
  owns: (id: string) => boolean;
  isWanted: (id: string) => boolean;
  /** Where the cartridge lands on the pavement (zone-local), and its turn. */
  find: { at: THREE.Vector3; yaw: number };
  /** The pane's size (m). */
  size: readonly [number, number];
}

/**
 * The empty shop's window under our building: GAME OVER in the dust. Rubbed clean, CONTINUE? F.A. scratched from
 * inside; looked through again, a cartridge on the mat, fished out through the letterbox (a free `ForSaleBox` on the
 * pavement, once ever). Origin on the glass, +z towards the street.
 */
export class DustyPane extends Secret {
  private step = 0;
  private out: ForSaleBox | null = null;

  constructor(private readonly options: DustyPaneOptions) {
    super();
    this.name = 'DustyPane';
    const [w, h] = options.size;
    const hitbox = invisibleHitbox(w, h, 0.06, { z: 0.03 });
    this.hitboxes.push(hitbox);
    this.add(hitbox);
  }

  label(): string {
    return this.step === 0 && !streetMarked('secret:dust') ? 'Empty shop · the dusty window' : 'Empty shop · look through the clean patch';
  }

  activate(session: SessionActions): void {
    if (streetMarked('secret:dust') || this.out) {
      session.react('CONTINUE? F.A., scratched small into the glass. Your sleeve is still grey.');
      return;
    }
    if (this.step === 0) {
      this.step = 1;
      session.react('Someone has written GAME OVER in the dust on the glass. You rub a clean patch with your sleeve.');
      return;
    }
    if (this.step === 1) {
      this.step = 2;
      session.react('Under the dust, scratched into the glass from the inside, very small: CONTINUE? F.A.');
      return;
    }
    this.step = 3;
    session.react('Through the clean patch, on the mat inside the door: a cartridge, pushed through the letterbox years ago. The flap is loose. You fish it out.');
    void this.fishOut();
  }

  /** The cartridge on the mat, put down on the pavement under the letterbox: a game the player lacks, as the years left it. */
  private async fishOut(): Promise<void> {
    const { randomGames, owns, isWanted, covers, wallet, host, find } = this.options;
    const games = await randomGames('secret:dust', 8).catch(() => [] as Game[]);
    const game = games.find((g) => !owns(g.id));
    if (!game || !this.parent) {
      markStreet('secret:dust');
      return;
    }
    const box = new ForSaleBox(new StockItem(game, 'worn', 'bin', { list: 0, final: true }), covers, {
      pose: { kind: 'flat' },
      tag: false,
      wallet,
      where: 'behind the letterbox of an empty shop',
      free: true,
      isWanted: () => isWanted(game.id),
      thanks: () => 'Dusty, the label sun-faded. CONTINUE?',
    });
    box.onSold = () => {
      host.remove(box);
      markStreet('secret:dust');
    };
    box.restock = () => void host.place(box, find.at, find.yaw);
    host.place(box, find.at, find.yaw);
    this.out = box;
  }

  dispose(): void {
    this.out?.dispose();
  }
}

/** The old code, square by square. */
const CODE = ['↑', '↑', '↓', '↓', '←', '→', '←', '→', 'B', 'A'] as const;
type Glyph = (typeof CODE)[number];
/** How the children laid the squares (two columns, five rows): every glyph of the code once, out of order. */
const GRID: readonly Glyph[] = ['B', '↓', '←', '↑', '→', 'A', '↑', '←', '↓', '→'];
/** What stepping the whole code pays, once ever. */
const CHALK_COINS = 5;

/** Where the code stands (shared by the squares): how far along it the player has stepped. */
class ChalkCode {
  private at = 0;

  /** `glyph` stepped on: on through the code, or back to its start (a wrong square). True when the code is done. */
  step(glyph: Glyph): boolean {
    if (glyph === CODE[this.at]) this.at++;
    else this.at = glyph === CODE[0] ? 1 : 0;
    if (this.at < CODE.length) return false;
    this.at = 0;
    return true;
  }

  get progress(): number {
    return this.at;
  }
}

/** One square of the chalk: its glyph answers a click (the code's step). */
class ChalkSquare extends Secret {
  constructor(private readonly glyph: Glyph, private readonly code: ChalkCode, side: number, private readonly pay: { earnCoins(coins: number): void } | undefined) {
    super();
    this.name = `ChalkSquare:${glyph}`;
    const hitbox = invisibleHitbox(side, 0.04, side, { y: 0.02 });
    this.hitboxes.push(hitbox);
    this.add(hitbox);
  }

  label(): string {
    return `Chalk on the pavement · ${this.glyph}`;
  }

  activate(session: SessionActions): void {
    const done = this.code.step(this.glyph);
    if (!done) {
      if (this.code.progress > 3) session.react('The chalk squeaks under your shoe. Somewhere, a child is watching.');
      return;
    }
    if (streetMarked('secret:chalk')) {
      session.react('Up, up, down, down… You still have it. Nobody claps this time.');
      return;
    }
    markStreet('secret:chalk');
    this.pay?.earnCoins(CHALK_COINS);
    session.reward({ title: 'Thirty lives', detail: 'From behind the workshop’s gate a child shouts “HE KNOWS IT!” and a coin purse lands at your feet: the dares jar, paid out.', coins: CHALK_COINS });
  }
}

/**
 * The children's chalk on Park Street's pavement: ten squares in two columns, an arrow or a letter in each. Clicked in
 * the order of the old code (up, up, down, down, left, right, left, right, B, A) they pay out once. Origin at the
 * first square's middle on the pavement; `step` is the way down the rows (zone frame), the columns across it.
 */
export function chalkSquares(step: THREE.Vector2, side: number, pay?: { earnCoins(coins: number): void }): { square: Secret; at: THREE.Vector3 }[] {
  const code = new ChalkCode();
  const rows = GRID.length / 2;
  const pitch = step.length();
  const along = step.clone().normalize();
  // The columns run to the right of the rows as the drawing is turned (`rotation.z` below).
  const across = new THREE.Vector2(along.y, -along.x);
  const squares = GRID.map((glyph, i) => {
    const row = Math.floor(i / 2);
    const col = i % 2;
    const at = new THREE.Vector3(along.x * pitch * row + across.x * pitch * col, 0, along.y * pitch * row + across.y * pitch * col);
    return { square: new ChalkSquare(glyph, code, side, pay), at };
  });
  // One drawing for all the squares (a canvas: wobbly white lines, the glyphs), laid on the pavement.
  const px = 96;
  const [canvas, ctx] = createCanvas(px * 2, px * rows);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(245,245,240,0.85)';
  ctx.fillStyle = 'rgba(245,245,240,0.85)';
  ctx.lineWidth = 4;
  ctx.font = 'bold 54px "Comic Sans MS", "Chalkboard SE", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  GRID.forEach((glyph, i) => {
    const x = (i % 2) * px;
    const y = Math.floor(i / 2) * px;
    ctx.strokeRect(x + 6, y + 6, px - 12, px - 12);
    ctx.fillText(glyph, x + px / 2, y + px / 2 + 2);
  });
  const material = new THREE.MeshStandardMaterial({ map: toTexture(canvas), transparent: true, roughness: 1, depthWrite: false });
  const drawing = layMesh(new THREE.Mesh(new THREE.PlaneGeometry(pitch * 2, pitch * rows), material), GROUND.marking);
  drawing.rotation.x = -Math.PI / 2;
  // The plane's middle, between the two columns and down the rows; turned so its rows run along `step`.
  drawing.position.set(along.x * pitch * (rows - 1) * 0.5 + across.x * pitch * 0.5, GROUND.marking.lift, along.y * pitch * (rows - 1) * 0.5 + across.y * pitch * 0.5);
  drawing.rotation.z = Math.atan2(along.x, along.y);
  drawing.receiveShadow = true;
  // Carried by the first square (whose origin is the drawing's first corner square): placed with it.
  squares[0]!.square.add(drawing);
  return squares;
}

/** The initials cut into the park's railing: F.A. 1983, and beside them, smaller, O.A. Origin on the rail, +z towards Park Street. */
export class RailingCarving extends Secret {
  constructor() {
    super();
    this.name = 'RailingCarving';
    const hitbox = invisibleHitbox(0.35, 0.12, 0.12, { z: 0.02 });
    this.hitboxes.push(hitbox);
    this.add(hitbox);
  }

  label(): string {
    return 'Park railing · something cut into the paint';
  }

  activate(session: SessionActions): void {
    const first = !streetMarked('secret:carving');
    markStreet('secret:carving');
    session.read({
      title: 'Cut into the railing',
      text: 'Deep in the green paint of the top rail, gone over with a penknife more than once: F.A. 1983. Beside it, smaller and neater, in a grown-up’s hand: O.A. — and a little heart.',
      ...(first ? { effect: 'Félix Aubry, aged eleven. And Odette, his mother, who must have caught him at it.' } : {}),
      look: 'note',
    });
  }
}
