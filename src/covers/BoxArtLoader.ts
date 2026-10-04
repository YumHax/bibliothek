import * as THREE from 'three';
import type { Game } from '@/catalog/types';
import { getPlatform } from '@/catalog/platforms';
import { boxDimensionsOf, caseOf, isLandscape } from '@/catalog/media';
import type { BoxArtUrls, CoverArtProvider } from './CoverArtProvider';
import { createPlaceholderTexture } from './PlaceholderCover';
import { createSpineTexture, createTopSpineTexture, JEWEL_PRINT } from './generated/SpineTexture';
import { jewelFront } from './generated/JewelFront';
import { dominantColor } from './generated/palette';
import { LoadQueue } from './LoadQueue';
import { FrameBudget } from './FrameBudget';
import { ImageFetch } from './ImageFetch';
import { cartFromScan, discFromScan, scanIsTop, spineFacesFromScan, topFaceFromScan } from './scanFaces';

/** What a box shows from outside when it stands closed. `accent` colours the untextured top/bottom faces. */
export interface BoxArt {
  front: THREE.Texture;
  /** -x face (viewer's left when facing the cover). */
  left: THREE.Texture;
  /** +x face. */
  right: THREE.Texture;
  /** A landscape box's +y and -y faces, where its spine runs (see `catalog/media` `isLandscape`); absent: plain flaps. */
  top?: THREE.Texture;
  accent: THREE.Color;
}

/**
 * What only a box in hand needs, each possibly missing: its scanned back, else a screenshot for the
 * generated back; a photo of its cartridge's front (alpha kept, trimmed to the cartridge's outline
 * box so it spans the front face edge to edge, the cartridge's top up, as it stands in the box);
 * its disc's printed side (alpha kept round the disc, square, the print's top up).
 */
export interface BoxDetails {
  back: THREE.Texture | null;
  screenshot: CanvasImageSource | null;
  cart: THREE.Texture | null;
  disc: THREE.Texture | null;
}

interface BoxArtLoaderOptions {
  /**
   * Where the scans come from (backs, spines, cartridges, discs): slow sources (LaunchBox), asked
   * only for what can wait: the spines after every front, the rest when a box is in hand.
   */
  scans?: CoverArtProvider;
  /** How images are fetched (retries, mirrors, misses remembered); a plain one by default. */
  fetch?: ImageFetch;
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
/** A real spine waits for every watched front: its priority is this plus the box's distance. */
const SPINES = 1e6;
/** Scan lookups at once: each is slow (the server asks LaunchBox a second apart). */
const SCAN_CONCURRENCY = 2;
/** A front that failed (not missing) is asked again after these waits (ms): a busy server, a dropped connection. */
const FRONT_RETRY_MS = [0, 8_000, 50_000];
const NO_DETAILS: BoxDetails = { back: null, screenshot: null, cart: null, disc: null };

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
  /** What the scan sources have for it, asked on first need. */
  scans: Promise<BoxArtUrls> | null;
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
 * blocked. Once the fronts are in, the scanned spines follow (nearest first, `options.scans`); the
 * back, cartridge and disc are fetched only when a box is taken in hand (`details()`). Images go
 * through `ImageFetch` (retries, mirrors, misses remembered).
 * Cached by game id while someone shows the game (`load()` ... `release()`) and for the last
 * `IDLE_KEPT` games after that, so nothing is downloaded or drawn twice in a row and games that
 * left the scene free their images. Textures handed out belong to the consumer, which disposes
 * the ones it replaces.
 */
export class BoxArtLoader {
  private readonly entries = new Map<string, Entry>();
  /** Entries nobody holds, oldest first (a Map keeps insertion order). */
  private readonly idle = new Map<string, Entry>();
  /** Placeholders handed out by `placeholder()`, reused by the first generated set. */
  private readonly placeholders = new Map<string, THREE.Texture>();
  private readonly queue = new LoadQueue(CONCURRENCY);
  private readonly scanQueue = new LoadQueue(SCAN_CONCURRENCY);
  private readonly scans: CoverArtProvider | null;
  private readonly fetch: ImageFetch;
  private readonly budget = new FrameBudget();
  private readonly origin = new THREE.Vector3();
  private hasOrigin = false;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly provider: CoverArtProvider,
    private readonly maxAnisotropy: number,
    options: BoxArtLoaderOptions = {},
  ) {
    this.scans = options.scans ?? null;
    this.fetch = options.fetch ?? new ImageFetch();
  }

  /** Point (camera position) that boxes are loaded nearest-first from. Once a second is plenty. */
  setPriorityOrigin(position: THREE.Vector3): void {
    this.origin.copy(position);
    this.hasOrigin = true;
    this.queue.reprioritize();
    this.scanQueue.reprioritize();
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
   * What the box in hand shows besides its outside, fetched on first ask ahead of everything else:
   * the scanned back when there is one (else an in-game screenshot or the title screen for the
   * generated back), the cartridge photo and the disc print. Never rejects.
   */
  details(game: Game): Promise<BoxDetails> {
    const entry = this.entries.get(game.id);
    if (!entry) return Promise.resolve({ ...NO_DETAILS });
    if (!entry.urgent) {
      entry.urgent = true; // its front and its scans too, if they are still waiting
      this.queue.reprioritize();
      this.scanQueue.reprioritize();
    }
    entry.details ??= this.loadDetails(entry).catch((err: unknown) => {
      console.warn(`[covers] details failed for ${game.title}`, err);
      return { ...NO_DETAILS };
    });
    return entry.details;
  }

  private async loadDetails(entry: Entry): Promise<BoxDetails> {
    const [urls, scans] = await Promise.all([this.urlsOf(entry), this.scansOf(entry)]);
    const urgent = () => URGENT;
    const anisotropy = this.maxAnisotropy;
    const [backSide, cart, disc] = await Promise.all([
      this.queue.run(async () => {
        // One at a time: a scanned back makes the screenshots useless, a snap the title screen.
        const back = await this.fetch.texture(scans.back ?? urls.back, anisotropy);
        const screenshot = back ? null : ((await this.fetch.image(urls.snap)) ?? (await this.fetch.image(urls.title)));
        return { back, screenshot };
      }, urgent),
      this.queue.run(async () => {
        const image = await this.fetch.image(scans.cart ?? urls.cart);
        return image ? cartFromScan(image, anisotropy) : null;
      }, urgent),
      this.queue.run(async () => {
        const image = await this.fetch.image(scans.disc ?? urls.disc);
        return image ? discFromScan(image, anisotropy) : null;
      }, urgent),
    ]);
    return { ...backSide, cart, disc };
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
      scans: null,
      details: null,
      urgent: false,
      dropped: false,
    };
    entry.final = this.build(game, entry).then((art) => this.withScannedSpines(entry, art)).finally(() => {
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

    // Stage 1: provider URLs and the real front cover, nearest box first; a failed download is tried again a little later.
    let front: THREE.Texture | null = null;
    for (const wait of FRONT_RETRY_MS) {
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      if (entry.dropped) break;
      const url = (await this.urlsOf(entry)).front;
      front = await this.queue.run(async () => (entry.dropped ? null : this.fetch.texture(url, this.maxAnisotropy)), () => this.priorityOf(entry));
      if (front || !url || this.fetch.isMissing(url)) break;
    }
    const accent = front ? dominantColor(front.image as CanvasImageSource, platformAccent) : platformAccent;
    const cover = front ? (front.image as CanvasImageSource) : null;
    // A jewel case's front is its booklet under clear plastic, the hinge down its left: the square art is not stretched over it.
    const frontTex = front && caseOf(game).kind === 'jewel' ? jewelFront(front, this.maxAnisotropy) : (front ?? this.placeholder(game));
    const art = { front: frontTex, ...this.spines(game, accent, cover), accent };
    if (entry.listeners.size) this.emit(entry, art);
    return art;
  }

  /**
   * Stage 2: the scanned spine, once every watched front is in (nearest first), drawn on both
   * sides; the set with it is emitted and becomes the final one. The generated spines stay when
   * there is no scan, or none that fits the box's side (see `spineFacesFromScan`).
   */
  private async withScannedSpines(entry: Entry, art: BoxArt): Promise<BoxArt> {
    if (!this.scans || entry.dropped) return art;
    try {
      const spine = (await this.scansOf(entry)).spine;
      if (!spine || entry.dropped) return art;
      const image = await this.queue.run(() => (entry.dropped ? Promise.resolve(null) : this.fetch.image(spine)), () => this.spinePriority(entry));
      if (!image || entry.dropped) return art;
      const dims = boxDimensionsOf(entry.game);
      // A landscape box's scan may be its long top or its short end: whichever its proportions are nearer.
      const top = isLandscape(dims) && scanIsTop(image, dims) ? topFaceFromScan(image, dims, this.maxAnisotropy) : null;
      const share = caseOf(entry.game).kind === 'jewel' ? JEWEL_PRINT : 1;
      const faces = top ? { top } : spineFacesFromScan(image, dims, this.maxAnisotropy, share);
      if (!faces) return art;
      const next: BoxArt = { ...art, ...faces };
      if (entry.listeners.size) this.emit(entry, next);
      return next;
    } catch (err) {
      console.warn(`[covers] spine scan failed for ${entry.game.title}`, err);
      return art;
    }
  }

  /** The scan sources' urls, asked once per entry through the scan queue (a box in hand first, then nearest). */
  private scansOf(entry: Entry): Promise<BoxArtUrls> {
    const scans = this.scans;
    if (!scans) return Promise.resolve({});
    entry.scans ??= this.scanQueue.run(async () => {
      if (entry.dropped) return {};
      try {
        return (await scans.getBoxArt(entry.game)) ?? {};
      } catch (err) {
        console.warn(`[covers] scans failed for ${entry.game.title}`, err);
        return {};
      }
    }, () => this.spinePriority(entry));
    return entry.scans;
  }

  private spinePriority(entry: Entry): number {
    return entry.urgent ? URGENT : SPINES + this.priorityOf(entry);
  }

  private emit(entry: Entry, art: BoxArt): void {
    entry.current = art;
    for (const listener of entry.listeners) listener(art);
  }

  private spines(game: Game, accent: THREE.Color, cover: CanvasImageSource | null = null): Pick<BoxArt, 'left' | 'right' | 'top'> {
    return {
      left: createSpineTexture(game, accent, 'right', this.maxAnisotropy, cover),
      right: createSpineTexture(game, accent, 'left', this.maxAnisotropy, cover),
      ...(isLandscape(boxDimensionsOf(game)) ? { top: createTopSpineTexture(game, accent, this.maxAnisotropy, cover) } : {}),
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
}
