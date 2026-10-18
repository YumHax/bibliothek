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
import { FACADE, GROUND, layMesh } from '../../surface/layers';
import { lcg } from '@/random';

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
  /** The pane's size (m), and how far behind its origin the glass is (the dust is drawn on it). */
  size: readonly [number, number];
  glass: number;
}

/** The dust on the pane, painted (px per metre); how it looks rubbed: none, a clean patch, the scratches in it read. */
const DUST_PX = 420;
type DustStep = 0 | 1 | 2;

/**
 * The empty shop's window under our building: GAME OVER in the dust. Rubbed clean, CONTINUE? F.A. scratched from
 * inside; looked through again, a cartridge on the mat, fished out through the letterbox (a free `ForSaleBox` on the
 * pavement, once ever). Origin on the glass, +z towards the street.
 */
export class DustyPane extends Secret {
  private step = 0;
  private out: ForSaleBox | null = null;
  private readonly dust: THREE.CanvasTexture;
  private readonly canvas: HTMLCanvasElement;

  constructor(private readonly options: DustyPaneOptions) {
    super();
    this.name = 'DustyPane';
    const [w, h] = options.size;
    const hitbox = invisibleHitbox(w, h, 0.06, { z: 0.03 });
    this.hitboxes.push(hitbox);
    this.add(hitbox);
    // The dust itself, on the glass: GAME OVER fingered in it; rubbed, a clean patch, CONTINUE? F.A. scratched in that.
    const [canvas] = createCanvas(Math.round(w * DUST_PX), Math.round(h * DUST_PX));
    this.canvas = canvas;
    paintDust(canvas, streetMarked('secret:dust') ? 2 : 0);
    this.dust = toTexture(canvas);
    const film = layMesh(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: this.dust, transparent: true, roughness: 1, depthWrite: false })), FACADE.lettering);
    film.position.z = -options.glass + FACADE.lettering.lift;
    this.add(film);
  }

  /** The dust as rubbed so far (a step on: painted again). */
  private rub(step: DustStep): void {
    paintDust(this.canvas, step);
    this.dust.needsUpdate = true;
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
      this.rub(1);
      session.react('Someone has written GAME OVER in the dust on the glass. You rub a clean patch with your sleeve.');
      return;
    }
    if (this.step === 1) {
      this.step = 2;
      this.rub(2);
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

/**
 * The pane's dust onto `canvas`: a grey-brown film, streaky, thicker towards the bottom; GAME OVER fingered through it
 * (cleaner strokes); from step 1 a sleeve-rubbed patch in the middle, and from step 2 CONTINUE? F.A. scratched small
 * into the glass there (thin pale lines, read once the patch is clean).
 */
function paintDust(canvas: HTMLCanvasElement, step: DustStep): void {
  const ctx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  const film = ctx.createLinearGradient(0, 0, 0, h);
  film.addColorStop(0, 'rgba(150,138,118,0.55)');
  film.addColorStop(1, 'rgba(128,116,96,0.8)');
  ctx.fillStyle = film;
  ctx.fillRect(0, 0, w, h);
  // Streaks of old rain down the film.
  const streak = lcg(4242);
  ctx.fillStyle = 'rgba(170,160,140,0.25)';
  for (let i = 0; i < 40; i++) ctx.fillRect(streak() * w, streak() * h * 0.4, 1 + streak() * 2, h * (0.3 + streak() * 0.6));
  // The fingered words: the dust wiped through in strokes.
  ctx.globalCompositeOperation = 'destination-out';
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.lineCap = 'round';
  ctx.font = `bold ${Math.round(h * 0.15)}px "Comic Sans MS", "Chalkboard SE", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = w * 0.012;
  for (const [word, y] of [['GAME', 0.22], ['OVER', 0.38]] as const) {
    ctx.strokeText(word, w / 2, h * y, w * 0.9);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillText(word, w / 2, h * y, w * 0.9);
  }
  if (step >= 1) {
    // The sleeve's patch: rubbed round and round, clearest in its middle.
    const patch = ctx.createRadialGradient(w / 2, h * 0.66, 0, w / 2, h * 0.66, w * 0.38);
    patch.addColorStop(0, 'rgba(0,0,0,0.95)');
    patch.addColorStop(0.7, 'rgba(0,0,0,0.8)');
    patch.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = patch;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalCompositeOperation = 'source-over';
  if (step >= 2) {
    // Scratched from the inside, small, to be read from the street.
    ctx.strokeStyle = 'rgba(235,235,225,0.85)';
    ctx.lineWidth = 1.2;
    ctx.font = `${Math.round(h * 0.06)}px "Courier New", monospace`;
    ctx.strokeText('CONTINUE?', w / 2, h * 0.63, w * 0.6);
    ctx.strokeText('F.A.', w / 2, h * 0.71, w * 0.3);
  }
}

/** The old code, square by square. */
const CODE = ['↑', '↑', '↓', '↓', '←', '→', '←', '→', 'B', 'A'] as const;
type Glyph = (typeof CODE)[number];
/** How the children laid the squares (two columns, five rows): every glyph of the code once, out of order. */
const GRID: readonly Glyph[] = ['B', '↓', '←', '↑', '→', 'A', '↑', '←', '↓', '→'];
/** What stepping the whole code pays, once ever. */
const CHALK_COINS = 5;

/** Where the code stands (shared by the squares): how far along it the player has stepped, and on which squares. */
class ChalkCode {
  private at = 0;
  /** The squares stepped on the way so far (their index in `GRID`): scuffed in the chalk. */
  readonly stepped: number[] = [];
  /** Repaints the chalk (the drawing's, set once it is made). */
  repaint: () => void = () => {};

  /** Square `index` (its `glyph`) stepped on: on through the code, or back to its start (a wrong square). True when the code is done. */
  step(glyph: Glyph, index: number): boolean {
    if (glyph === CODE[this.at]) {
      this.at++;
      this.stepped.push(index);
    } else {
      this.at = glyph === CODE[0] ? 1 : 0;
      this.stepped.length = 0;
      if (this.at) this.stepped.push(index);
    }
    const done = this.at >= CODE.length;
    if (done) {
      this.at = 0;
      this.stepped.length = 0;
    }
    this.repaint();
    return done;
  }

  get progress(): number {
    return this.at;
  }
}

/** One square of the chalk: its glyph answers a click (the code's step). */
class ChalkSquare extends Secret {
  constructor(private readonly glyph: Glyph, private readonly index: number, private readonly code: ChalkCode, side: number, private readonly pay: { earnCoins(coins: number): void } | undefined) {
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
    const before = this.code.progress;
    const done = this.code.step(this.glyph, this.index);
    if (!done) {
      // Each right square scuffs under the shoe (the drawing shows it); a wrong one after a good start wipes them.
      if (this.code.progress <= 1 && before >= 3) session.react('Your heel smudges the chalk. From behind the workshop’s gate, a child groans.');
      else if (this.code.progress > 3 && this.code.progress === before + 1 && this.code.progress % 3 === 1) session.react('The chalk squeaks under your shoe. Somewhere, a child is watching.');
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
 * the order of the old code (up, up, down, down, left, right, left, right, B, A) they pay out once; each right square
 * is scuffed by the shoe on the way (a wrong one and the scuffs are gone). Origin at the first square's middle on the
 * pavement; `step` is the way down the rows (zone frame), the columns across it.
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
    return { square: new ChalkSquare(glyph, i, code, side, pay), at };
  });
  // One drawing for all the squares (a canvas: wobbly white lines, the glyphs), laid on the pavement.
  const px = 96;
  const [canvas, ctx] = createCanvas(px * 2, px * rows);
  const paint = (): void => {
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
    // The squares stepped on the way: a shoe's scuff smeared across the chalk.
    ctx.fillStyle = 'rgba(245,245,240,0.32)';
    for (const i of code.stepped) {
      const x = (i % 2) * px;
      const y = Math.floor(i / 2) * px;
      ctx.beginPath();
      ctx.ellipse(x + px / 2, y + px / 2, px * 0.34, px * 0.2, 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  paint();
  const texture = toTexture(canvas);
  code.repaint = () => {
    paint();
    texture.needsUpdate = true;
  };
  const material = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 1, depthWrite: false });
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
