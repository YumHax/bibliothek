import * as THREE from 'three';
import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import type { BoxArtUrls, CoverArtProvider } from './CoverArtProvider';
import { createPlaceholderTexture } from './PlaceholderCover';
import { createSpineTexture } from './generated/SpineTexture';
import { dominantColor } from './generated/palette';
import { LoadQueue } from './LoadQueue';
import { FrameBudget } from './FrameBudget';

/** What a box shows from outside when it stands closed. `accent` colours the untextured top/bottom faces. */
export interface BoxArt {
  front: THREE.Texture;
  /** -x face (viewer's left when facing the cover). */
  left: THREE.Texture;
  /** +x face. */
  right: THREE.Texture;
  accent: THREE.Color;
}

/** What only a box in hand needs: its scanned back, else a screenshot for the generated back (both may be missing). */
export interface BoxDetails {
  back: THREE.Texture | null;
  screenshot: CanvasImageSource | null;
}

export interface BoxArtOptions {
  /**
   * Receives intermediate sets as soon as they exist: first the generated one (placeholder
   * front, procedural spines), then the one with the real front cover. The promise returned by
   * `load()` still resolves with the final set. Faces that did not change between two sets are
   * the same texture object, so skip the swap (and the dispose) when `map === tex`.
   */
  onUpdate?: (art: BoxArt) => void;
  /** The box itself (or anything at its position): nearer to the priority origin loads first. */
  anchor?: THREE.Object3D;
}

const CONCURRENCY = 6;
/** Games nobody shows any more whose art is kept anyway, in case they come back (a shelf rebuilt, a stall restocked). */
const IDLE_KEPT = 24;
/** Queue priorities: a box in hand first, then nearest first, then work nobody waits for. */
const URGENT = -1;
const UNWATCHED = 1e12;

interface Entry {
  readonly game: Game;
  readonly listeners: Set<(art: BoxArt) => void>;
  readonly anchors: THREE.Object3D[];
  /** Consumers between `load()` and `release()`. */
  refs: number;
  current: BoxArt | null;
  done: boolean;
  final: Promise<BoxArt>;
  urls: Promise<BoxArtUrls> | null;
  details: Promise<BoxDetails> | null;
  /** Someone has the box in hand: its downloads jump the queue. */
  urgent: boolean;
  /** Out of the cache for good: whatever has not started yet is skipped. */
  dropped: boolean;
}

/**
 * Resolves a game to a full set of face textures, progressively.
 * Real scans are used where a provider has them; missing faces are generated from the front
 * cover's dominant colour and the game's metadata. Images go through a small priority queue
 * (`CONCURRENCY` in flight, nearest to the camera first; feed the camera position with
 * `setPriorityOrigin`) and generated faces are drawn in idle time, so the first frame is never
 * blocked. The back-cover sources are fetched only when a box is taken in hand (`details()`).
 * Cached by game id while someone shows the game (`load()` ... `release()`) and for the last
 * `IDLE_KEPT` games after that, so nothing is downloaded or drawn twice in a row and games that
 * left the scene free their images. Textures handed out belong to the consumer, which disposes
 * the ones it replaces.
 */
export class BoxArtLoader {
  private readonly textures = new THREE.TextureLoader();
  private readonly images = new THREE.ImageLoader();
  private readonly entries = new Map<string, Entry>();
  /** Entries nobody holds, oldest first (a Map keeps insertion order). */
  private readonly idle = new Map<string, Entry>();
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
    this.queue.reprioritize();
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
   * Call `release()` with the same `options` once the game is no longer shown.
   */
  load(game: Game, options: BoxArtOptions = {}): Promise<BoxArt> {
    let entry = this.entries.get(game.id) ?? this.idle.get(game.id);
    if (!entry) entry = this.start(game);
    this.idle.delete(game.id);
    this.entries.set(game.id, entry);
    entry.refs++;
    if (options.anchor) entry.anchors.push(options.anchor);
    if (options.onUpdate && !entry.done) {
      entry.listeners.add(options.onUpdate);
      if (entry.current) options.onUpdate(entry.current);
    }
    return entry.final;
  }

  /** Undoes one `load()`: once nobody shows the game, its art waits among the idle ones and is dropped when they are too many. */
  release(game: Game, options: BoxArtOptions = {}): void {
    const entry = this.entries.get(game.id);
    if (!entry) return;
    if (options.onUpdate) entry.listeners.delete(options.onUpdate);
    const at = options.anchor ? entry.anchors.indexOf(options.anchor) : -1;
    if (at >= 0) entry.anchors.splice(at, 1);
    if (--entry.refs > 0) return;
    this.entries.delete(game.id);
    this.idle.set(game.id, entry);
    for (const [id, old] of this.idle) {
      if (this.idle.size <= IDLE_KEPT) break;
      this.idle.delete(id);
      old.dropped = true;
      this.placeholders.delete(id);
    }
  }

  /**
   * The back-cover sources, fetched on first ask (a box taken in hand) ahead of everything else:
   * the scanned back when there is one, else an in-game screenshot or the title screen. Never rejects.
   */
  details(game: Game): Promise<BoxDetails> {
    const entry = this.entries.get(game.id);
    if (!entry) return Promise.resolve({ back: null, screenshot: null });
    if (!entry.urgent) {
      entry.urgent = true; // its front too, if it is still waiting
      this.queue.reprioritize();
    }
    entry.details ??= this.queue.run(async () => {
      const urls = await this.urlsOf(entry);
      // One image at a time: a scanned back makes the screenshots useless, a snap the title screen.
      const back = await this.loadTexture(urls.back, false);
      const screenshot = back ? null : ((await this.loadImage(urls.snap)) ?? (await this.loadImage(urls.title)));
      return { back, screenshot };
    }, () => URGENT);
    return entry.details;
  }

  private start(game: Game): Entry {
    const entry: Entry = {
      game,
      listeners: new Set(),
      anchors: [],
      refs: 0,
      current: null,
      done: false,
      final: Promise.resolve(null as never),
      urls: null,
      details: null,
      urgent: false,
      dropped: false,
    };
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

    // Stage 0: everything generated, drawn in idle time, only if someone is watching.
    await this.budget.run(() => {
      if (!entry.listeners.size) return;
      this.emit(entry, { front: this.placeholder(game), ...this.spines(game, platformAccent), accent: platformAccent });
    });

    // Stage 1: provider URLs and the real front cover, nearest box first.
    const front = await this.queue.run(async () => (entry.dropped ? null : this.loadTexture((await this.urlsOf(entry)).front, true)), () => this.priorityOf(entry));
    const frontTex = front ?? this.placeholder(game);
    const accent = front ? dominantColor(front.image as CanvasImageSource, platformAccent) : platformAccent;
    return { front: frontTex, ...this.spines(game, accent), accent };
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
    if (entry.urgent) return URGENT;
    if (!entry.anchors.length) return entry.refs > 0 ? 0 : UNWATCHED;
    if (!this.hasOrigin) return 0;
    let best = Infinity;
    for (const anchor of entry.anchors) {
      const d = anchor.getWorldPosition(this.tmp).distanceToSquared(this.origin);
      if (d < best) best = d;
    }
    return best;
  }

  private urlsOf(entry: Entry): Promise<BoxArtUrls> {
    entry.urls ??= this.resolveUrls(entry.game);
    return entry.urls;
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
