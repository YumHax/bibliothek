import * as THREE from 'three';

/** Past this many rects waiting, the whole canvas goes up once instead. */
const MAX_REGIONS = 96;

/**
 * Uploads only the repainted rects of a big canvas texture (a facade atlas, the window view's scenery) instead of the
 * whole of it: each `mark`ed rect is copied into the texture already on the GPU (`copyTextureToTexture` from a
 * scratch canvas holding just that rect), the mipmaps regenerated once after the last. The renderer is the one that
 * draws the mesh it is `attach`ed to, at its next draw; a texture not on the GPU yet goes up whole as usual.
 */
export class RegionUploader {
  private readonly regions: { x: number; y: number; w: number; h: number }[] = [];
  private readonly scratch: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly at = new THREE.Vector2();

  constructor(private readonly texture: THREE.Texture) {
    const canvas = document.createElement('canvas');
    this.ctx = canvas.getContext('2d')!;
    this.scratch = new THREE.CanvasTexture(canvas);
  }

  /** The rect (canvas pixels, y down) was repainted: it goes up at the next draw. */
  mark(x: number, y: number, w: number, h: number): void {
    const image = this.texture.image as { width: number; height: number };
    const x0 = Math.max(0, Math.floor(x));
    const y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(image.width, Math.ceil(x + w));
    const y1 = Math.min(image.height, Math.ceil(y + h));
    if (x1 <= x0 || y1 <= y0) return;
    if (this.regions.length >= MAX_REGIONS) {
      this.regions.length = 0;
      this.texture.needsUpdate = true;
      return;
    }
    this.regions.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }

  /** Flushes the waiting rects whenever `target` (a mesh, or a material shared by many) is drawn (chained to its `onBeforeRender`). */
  attach(target: THREE.Object3D | THREE.Material): void {
    const host = target as unknown as { onBeforeRender: (renderer: THREE.WebGLRenderer, ...rest: unknown[]) => void };
    const previous = host.onBeforeRender;
    host.onBeforeRender = (renderer, ...rest) => {
      previous.call(target, renderer, ...rest);
      this.flush(renderer);
    };
  }

  private flush(renderer: THREE.WebGLRenderer): void {
    if (this.regions.length === 0) return;
    // Not on the GPU yet (or a whole upload already due): the draw uploads all of it, mipmaps and all. Copying rects
    // now would make that first upload happen inside the copy with `generateMipmaps` off for all but the last rect,
    // and three would allocate the texture's storage with one level for good (no mipmaps ever after).
    if ((renderer.properties.get(this.texture) as { __version?: number }).__version !== this.texture.version) {
      this.regions.length = 0;
      return;
    }
    const source = this.texture.image as CanvasImageSource & { height: number };
    const canvas = this.ctx.canvas;
    const mipmaps = this.texture.generateMipmaps;
    this.regions.forEach((r, i) => {
      canvas.width = r.w;
      canvas.height = r.h;
      this.ctx.drawImage(source, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
      // The texture went up flipped: its rows count from the canvas's bottom.
      this.at.set(r.x, source.height - r.y - r.h);
      this.texture.generateMipmaps = mipmaps && i === this.regions.length - 1;
      renderer.copyTextureToTexture(this.scratch, this.texture, null, this.at);
    });
    this.texture.generateMipmaps = mipmaps;
    this.regions.length = 0;
  }

  dispose(): void {
    this.scratch.dispose();
  }
}
