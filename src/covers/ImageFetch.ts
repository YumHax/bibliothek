import * as THREE from 'three';
import type { BrowserCache } from '@/persistence/BrowserCache';

interface ImageFetchOptions {
  /** Other addresses of the same image, tried in turn when one fails (not when it is missing): a proxy's upstream. */
  mirrors?: (url: string) => readonly string[];
  /** Addresses answered "not found" lately, kept across reloads so they are not asked again. */
  misses?: BrowserCache<1> | null;
}

/** Waits before the retries of an address that failed (a 5xx, a dropped connection). */
const RETRY_DELAYS_MS = [1000, 4000];
/** A source failing this many addresses in a row is left alone for a while: no failure storm. */
const ORIGIN_BREAK_AFTER = 6;
const ORIGIN_PAUSE_MS = 30_000;
/** A request that hangs gives its queue slot back after this long (ms). */
const FETCH_TIMEOUT_MS = 20_000;
/** An address that failed is asked again after this long (a server that was busy, a dropped connection). */
const DEAD_FOR_MS = 45_000;

type Outcome = HTMLImageElement | 'missing' | 'failed';

/**
 * Loads box art with `fetch` first, so a missing image (404) is told from a failing one. A missing image
 * is remembered (for the session, and across reloads through `misses`) and never asked again; a
 * failing one is retried twice with a growing wait, then its mirrors are tried, then it is given
 * up for the session. An origin that keeps failing is paused for a minute. Never rejects.
 */
export class ImageFetch {
  private readonly missing = new Set<string>();
  /** Addresses that failed, and until when they are not asked again. */
  private readonly dead = new Map<string, number>();
  private readonly origins = new Map<string, { failures: number; pausedUntil: number }>();

  constructor(private readonly options: ImageFetchOptions = {}) {}

  /** Whether `url` is known not to exist (a 404): asking again would not help, unlike after a failure. */
  isMissing(url: string | undefined): boolean {
    return !!url && (this.missing.has(url) || !!this.options.misses?.has(url));
  }

  /** The image at `url` (or one of its mirrors), or null. */
  async image(url: string | undefined): Promise<HTMLImageElement | null> {
    if (!url) return null;
    for (const candidate of [url, ...(this.options.mirrors?.(url) ?? [])]) {
      const outcome = await this.one(candidate);
      if (outcome === 'missing') return null; // a mirror would not have it either
      if (outcome !== 'failed') return outcome;
    }
    return null;
  }

  /** The image as a texture set up like every box face: sRGB, anisotropic, mipmapped. */
  async texture(url: string | undefined, anisotropy: number): Promise<THREE.Texture | null> {
    const image = await this.image(url);
    if (!image) return null;
    const tex = new THREE.Texture(image);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = anisotropy;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.needsUpdate = true;
    return tex;
  }

  private async one(url: string): Promise<Outcome> {
    if (this.missing.has(url) || this.options.misses?.has(url)) return 'missing';
    if ((this.dead.get(url) ?? 0) > Date.now()) return 'failed';
    const origin = this.originOf(url);
    if (origin.pausedUntil > Date.now()) return 'failed';
    for (let attempt = 0; ; attempt++) {
      let status = 0;
      try {
        const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        status = response.status;
        if (response.ok) {
          await response.arrayBuffer(); // the body lands in the HTTP cache, where the image element reads it
          const image = await loadElement(url);
          origin.failures = 0;
          if (image) return image;
          this.dead.set(url, Infinity); // not an image we can draw: asking again would not change it
          return 'failed';
        }
      } catch {
        status = 0; // offline, refused, CORS
      }
      if (status === 404 || status === 410 || status === 400 || status === 403) {
        origin.failures = 0;
        this.missing.add(url);
        this.options.misses?.set(url, 1);
        return 'missing';
      }
      // A 503 is our proxy leaving its upstream alone for minutes: no point waiting here, the mirror is next.
      const delay = status === 503 ? undefined : RETRY_DELAYS_MS[attempt];
      if (delay === undefined || origin.pausedUntil > Date.now()) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    this.dead.set(url, Date.now() + DEAD_FOR_MS);
    if (++origin.failures >= ORIGIN_BREAK_AFTER) {
      origin.pausedUntil = Date.now() + ORIGIN_PAUSE_MS;
      origin.failures = 0;
      console.warn(`[covers] ${url.split('?')[0]}'s source keeps failing: left alone for ${ORIGIN_PAUSE_MS / 1000} s`);
    }
    return 'failed';
  }

  /** A source is an origin and its first two path segments: the covers' proxy and the scans' are paused apart. */
  private originOf(url: string): { failures: number; pausedUntil: number } {
    const parsed = new URL(url, location.href);
    const key = parsed.origin + parsed.pathname.split('/').slice(0, 3).join('/');
    let origin = this.origins.get(key);
    if (!origin) {
      origin = { failures: 0, pausedUntil: 0 };
      this.origins.set(key, origin);
    }
    return origin;
  }
}

/**
 * The image as an element with its own URL (not a blob's): the browser may drop the decoded pixels
 * and decode again when the texture is uploaded anew, which a revoked blob URL would break.
 */
async function loadElement(url: string): Promise<HTMLImageElement | null> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.decoding = 'async';
  image.src = url;
  try {
    await image.decode();
    return image;
  } catch {
    return null;
  }
}
