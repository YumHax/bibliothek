import type * as THREE from 'three';
import type { Game } from '@/catalog/types';
import { boxDimensionsOf } from '@/catalog/media';
import { getPlatform } from '@/catalog/platforms';
import { StaticArtProvider } from '@/covers/StaticArtProvider';
import { createCanvas, canvasTexture } from '@/graphics/canvas';
import { FONT, fitParagraph } from '@/covers/generated/canvasUtils';
import type { AtlasRect, DreamFronts } from '@/world/shelving/DreamShelves';

/** The atlas's grid: columns and rows of cells, each cell's size in pixels (a box front's proportions, roughly). */
const COLUMNS = 8;
const ROWS = 8;
const CELL = { width: 160, height: 216 };

/**
 * THE DREAM'S COVERS: the baked fronts of the built-in games (`public/boxart`, `StaticArtProvider`) painted into one
 * texture, a cell each, for the dream's shelves (`DreamShelves`). Every cell starts as a painted stand-in (the
 * platform's colour, the title), so the shelves are full from the first frame; a cover drawn over it as it arrives,
 * uploaded when the director says the screen is black (`flush`: one upload is a few megabytes, a hitch nobody sees
 * there). The last cell is the boxes' plain sides.
 */
export class DreamAtlas implements DreamFronts {
  readonly texture: THREE.CanvasTexture;
  readonly fronts: { rect: AtlasRect; dims: ReturnType<typeof boxDimensionsOf> }[] = [];
  readonly side: AtlasRect;
  private readonly ctx: CanvasRenderingContext2D;
  private dirty = false;
  private disposed = false;

  constructor(games: readonly Game[]) {
    const [canvas, ctx] = createCanvas(COLUMNS * CELL.width, ROWS * CELL.height);
    this.ctx = ctx;
    this.texture = canvasTexture(canvas, { anisotropy: 'facing' });
    const cells = COLUMNS * ROWS - 1;
    const art = new StaticArtProvider(['front']);
    games.slice(0, cells).forEach((game, i) => {
      this.fronts.push({ rect: this.rect(i), dims: boxDimensionsOf(game) });
      this.paintStandIn(game, i);
      void art.getBoxArt(game).then((urls) => {
        if (urls?.front) this.load(urls.front, i);
      });
    });
    // The sides: a dark, slightly warm card (the spines' printed colours would be lost at this size anyway).
    const last = COLUMNS * ROWS - 1;
    const [x, y] = this.origin(last);
    const gradient = ctx.createLinearGradient(x, y, x + CELL.width, y);
    gradient.addColorStop(0, '#2a2622');
    gradient.addColorStop(0.5, '#3a342d');
    gradient.addColorStop(1, '#25211d');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, CELL.width, CELL.height);
    this.side = this.rect(last, 0.2);
    this.texture.needsUpdate = true;
  }

  /** Sends the atlas to the GPU again if a cover arrived since the last time. */
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.disposed = true;
    this.texture.dispose();
  }

  /** Cell `i`'s top-left corner in pixels. */
  private origin(i: number): [number, number] {
    return [(i % COLUMNS) * CELL.width, Math.floor(i / COLUMNS) * CELL.height];
  }

  /** Cell `i` in UV space (v up), inset by `inset` pixels so the mipmaps do not bleed the neighbours in. */
  private rect(i: number, inset = 1.5): AtlasRect {
    const [x, y] = this.origin(i);
    const w = COLUMNS * CELL.width;
    const h = ROWS * CELL.height;
    return [(x + inset) / w, 1 - (y + CELL.height - inset) / h, (x + CELL.width - inset) / w, 1 - (y + inset) / h];
  }

  /** The stand-in: the platform's colour, a darker band at the top, the title in white. */
  private paintStandIn(game: Game, i: number): void {
    const { ctx } = this;
    const [x, y] = this.origin(i);
    const accent = getPlatform(game.platform).accentColor;
    ctx.fillStyle = `#${accent.toString(16).padStart(6, '0')}`;
    ctx.fillRect(x, y, CELL.width, CELL.height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(x, y, CELL.width, CELL.height * 0.16);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const { lines, lineHeight } = fitParagraph(ctx, game.title, CELL.width * 0.8, CELL.height * 0.5, 22, 12, FONT, 'bold');
    lines.forEach((line, n) => ctx.fillText(line, x + CELL.width / 2, y + CELL.height * 0.3 + n * lineHeight));
  }

  private load(url: string, i: number): void {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (this.disposed) return;
      const [x, y] = this.origin(i);
      this.ctx.drawImage(image, x, y, CELL.width, CELL.height);
      this.dirty = true;
    };
    image.src = url;
  }
}
