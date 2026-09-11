import * as THREE from 'three';
import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { BoxArtUrls, CoverArtProvider } from './CoverArtProvider';
import { createPlaceholderTexture } from './PlaceholderCover';
import { createSpineTexture } from './generated/SpineTexture';
import { createBackTexture } from './generated/BackTexture';
import { dominantColor } from './generated/palette';
import { LoadQueue } from './LoadQueue';
import { FrameBudget } from './FrameBudget';

/** Everything needed to dress one box. `accent` colours the untextured top/bottom faces. */
export interface BoxArt {
  front: THREE.Texture;
  back: THREE.Texture;
  /** -x face (viewer's left when facing the cover). */
  left: THREE.Texture;
  /** +x face. */
  right: THREE.Texture;
  accent: THREE.Color;
}

export interface BoxArtOptions {
  /**
   * Receives intermediate sets as soon as they exist: first the generated one (placeholder
   * front, procedural spines and back), then the one with the real front cover. The promise
   * returned by `load()` still resolves with the final set. Faces that did not change between
   * two sets are the same texture object, so skip the swap (and the dispose) when `map === tex`.
   */
  onUpdate?: (art: BoxArt) => void;
  /** The box itself (or anything at its position): nearer to the priority origin loads first. */
  anchor?: THREE.Object3D;
}

/** Fronts of every box come before any back-cover source; the generated back is already readable. */
const BACK_PRIORITY_OFFSET = 1e6;
const CONCURRENCY = 6;

interface Entry {
  readonly listeners: Set<(art: BoxArt) => void>;
  readonly anchors: THREE.Object3D[];
  current: BoxArt | null;
  done: boolean;
  final: Promise<BoxArt>;
}

/**
 * Resolves a game to a full set of face textures, progressively.
 * Real scans are used where a provider has them; missing faces are generated from the front
 * cover's dominant colour, the game's metadata and an in-game screenshot when one exists.
 * Images go through a small priority queue (`CONCURRENCY` in flight, nearest to the camera first;
 * feed the camera position with `setPriorityOrigin`) and generated faces are drawn in idle time,
 * so the first frame is never blocked. Cached by game id so nothing is downloaded or drawn twice.
 * Textures handed out belong to the consumer, which disposes the ones it replaces.
 */
export class BoxArtLoader {
  private readonly textures = new THREE.TextureLoader();
  private readonly images = new THREE.ImageLoader();
  private readonly entries = new Map<string, Entry>();
  /** Placeholders handed out by `placeholder()`, reused by the first generated set. */
  private readonly placeholders = new Map<string, THREE.Texture>();
  private readonly queue = new LoadQueue(CONCURRENCY);
  private readonly budget = new FrameBudget();
  private readonly origin = new THREE.Vector3();
  private hasOrigin = false;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly provider: CoverArtProvider,
    private readonly maxAnisotropy: number,
  ) {
    this.textures.setCrossOrigin('anonymous');
    this.images.setCrossOrigin('anonymous');
  }

  /** Point (camera position) that boxes are loaded nearest-first from. Once a second is plenty. */
  setPriorityOrigin(position: THREE.Vector3): void {
    this.origin.copy(position);
    this.hasOrigin = true;
  }

  /** Downloads still waiting or in flight (for a HUD or a loading indicator). */
  get pending(): number {
    return this.queue.size;
  }

  /** Immediate front placeholder; use while the real art is in flight. */
  placeholder(game: Game): THREE.Texture {
    let tex = this.placeholders.get(game.id);
    if (!tex) {
      tex = createPlaceholderTexture(game);
      tex.anisotropy = this.maxAnisotropy;
      this.placeholders.set(game.id, tex);
    }
    return tex;
  }

  /**
   * Resolves with the complete, final art. With `options.onUpdate` the caller also gets the
   * intermediate sets, so it can show generated faces immediately and swap the real cover in later.
   */
  load(game: Game, options: BoxArtOptions = {}): Promise<BoxArt> {
    let entry = this.entries.get(game.id);
    if (!entry) {
      entry = this.start(game);
      this.entries.set(game.id, entry);
    }
    if (options.anchor) entry.anchors.push(options.anchor);
    if (options.onUpdate && !entry.done) {
      entry.listeners.add(options.onUpdate);
      if (entry.current) options.onUpdate(entry.current);
    }
    return entry.final;
  }

  private start(game: Game): Entry {
    const entry: Entry = { listeners: new Set(), anchors: [], current: null, done: false, final: Promise.resolve(null as never) };
    entry.final = this.build(game, entry).finally(() => {
      entry.done = true;
      entry.current = null;
      entry.listeners.clear();
      entry.anchors.length = 0;
      this.placeholders.delete(game.id);
    });
    return entry;
  }

  private async build(game: Game, entry: Entry): Promise<BoxArt> {
    const platformAccent = new THREE.Color(getPlatform(game.platform).accentColor);
    const priority = () => this.priorityOf(entry);

    // Stage 0: everything generated, drawn in idle time, only if someone is watching.
    await this.budget.run(() => {
      if (!entry.listeners.size) return;
      const back = createBackTexture(game, platformAccent, null, this.maxAnisotropy);
      this.emit(entry, { front: this.placeholder(game), back, ...this.spines(game, platformAccent), accent: platformAccent });
    });

    // Stage 1: provider URLs and the real front cover, nearest box first.
    const { urls, front } = await this.queue.run(async () => {
      const urls = await this.resolveUrls(game);
      return { urls, front: await this.loadTexture(urls.front, true) };
    }, priority);
    const frontTex = front ?? this.placeholder(game);
    const accent = front ? dominantColor(front.image as CanvasImageSource, platformAccent) : platformAccent;

    let spines: Pick<BoxArt, 'left' | 'right'> | null = null;
    let plainBack: THREE.Texture | null = null;
    if (entry.listeners.size) {
      spines = this.spines(game, accent);
      plainBack = createBackTexture(game, accent, null, this.maxAnisotropy);
      this.emit(entry, { front: frontTex, back: plainBack, ...spines, accent });
    }

    // Stage 2: back-cover sources, after all fronts (the generated back is already readable).
    const [back, snap, title] = await this.queue.run(
      () => Promise.all([this.loadTexture(urls.back, false), this.loadImage(urls.snap), this.loadImage(urls.title)]),
      () => priority() + BACK_PRIORITY_OFFSET,
    );
    const screenshot = snap ?? title;

    return {
      front: frontTex,
      back: back ?? (screenshot || !plainBack ? createBackTexture(game, accent, screenshot, this.maxAnisotropy) : plainBack),
      ...(spines ?? this.spines(game, accent)),
      accent,
    };
  }

  private emit(entry: Entry, art: BoxArt): void {
    entry.current = art;
    for (const listener of entry.listeners) listener(art);
  }

  private spines(game: Game, accent: THREE.Color): Pick<BoxArt, 'left' | 'right'> {
    return {
      left: createSpineTexture(game, accent, 'right', this.maxAnisotropy),
      right: createSpineTexture(game, accent, 'left', this.maxAnisotropy),
    };
  }

  /** Squared distance from the priority origin to the nearest anchor; submission order without an origin. */
  private priorityOf(entry: Entry): number {
    if (!this.hasOrigin || !entry.anchors.length) return 0;
    let best = Infinity;
    for (const anchor of entry.anchors) {
      const d = anchor.getWorldPosition(this.tmp).distanceToSquared(this.origin);
      if (d < best) best = d;
    }
    return best;
  }

  private async resolveUrls(game: Game): Promise<BoxArtUrls> {
    try {
      return (await this.provider.getBoxArt(game)) ?? {};
    } catch (err) {
      console.warn(`[covers] provider "${this.provider.id}" failed for ${game.title}`, err);
      return {};
    }
  }

  private async loadTexture(url: string | undefined, warn: boolean): Promise<THREE.Texture | null> {
    if (!url) return null;
    try {
      const tex = await this.textures.loadAsync(url);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = this.maxAnisotropy;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.needsUpdate = true;
      return tex;
    } catch {
      if (warn) console.warn(`[covers] failed to load ${url}`);
      return null;
    }
  }

  private async loadImage(url: string | undefined): Promise<HTMLImageElement | null> {
    if (!url) return null;
    try {
      return await this.images.loadAsync(url);
    } catch {
      return null;
    }
  }
}
