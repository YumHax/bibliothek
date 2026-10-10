import * as THREE from 'three';
import type { Game } from '@/catalog/types';
import { easeInCubic } from '@/math/easing';
import { clamp, smooth } from '@/math/scalar';
import { setShownKeepingLights } from '@/world/lighting/keepLights';
import type { StagedPiece } from '@/world/build/owned';
import type { Shelf } from '@/world/Shelf';
import { DreamShelves } from '@/world/shelving/DreamShelves';
import { DreamAtlas } from './dreamAtlas';
import { VANISH } from './introPlan';

/** What the dream is made of: the staged pieces, the collection room's bookcases, the covers for its boxes. */
export interface DreamFlatDeps {
  /** What is staged now (`build/owned`). */
  staged(): readonly StagedPiece[];
  /** The collection room's bookcases: every slot stood for the dream, or back to those bought. */
  living: { readonly bookcaseCount: number; standEveryBookcase(every: boolean): readonly Shelf[] };
  /** The zone the sale is filmed in: what stands elsewhere goes at once. */
  filmedZone: string;
  games: readonly Game[];
  /** Each thing the sale takes, as it starts going (the music's chime). */
  onGoing(): void;
}

/** A staged piece the dream shows: its pose and its lights' levels to put back, and whether it is staged again. */
interface Shown {
  piece: StagedPiece;
  scale: THREE.Vector3;
  y: number;
  lights: { light: THREE.Light; intensity: number }[];
  hidden: boolean;
}

/** Something the sale takes: when it starts going and how it goes (0 there .. 1 gone), then put away. */
interface Vanisher {
  at: number;
  seconds: number;
  step(k: number): void;
  gone(): void;
  started: boolean;
  done: boolean;
}

/**
 * UNCLE FÉLIX'S FLAT, for the opening (docs/story.md "The opening"): the bare flat with everything staged shown (the
 * cat left out: it would stand frozen), every bookcase slot of the collection room stood and full of boxes that are
 * not games (`DreamShelves`). `sell` schedules the sale (the farthest things first: rows fade, pieces rise and shrink
 * away with their lamps dimming, the unbought bookcases after their rows); `putAway` stages everything again exactly
 * as it was, whatever the sale reached. Nothing is bought, collides or is saved.
 */
export class DreamFlat {
  private readonly shown: Shown[] = [];
  private readonly extraBookcases: Shelf[] = [];
  private readonly atlas: DreamAtlas;
  private readonly shelves: DreamShelves;
  private vanishers: Vanisher[] = [];
  private away = false;

  constructor(private readonly deps: DreamFlatDeps) {
    for (const piece of deps.staged()) {
      if (piece.owned === 'cat') continue;
      setShownKeepingLights(piece.item, true);
      const lights: Shown['lights'] = [];
      piece.item.traverse((obj) => {
        const light = obj as THREE.Light;
        if (light.isLight) lights.push({ light, intensity: light.intensity });
      });
      this.shown.push({ piece, scale: piece.item.scale.clone(), y: piece.item.position.y, lights, hidden: false });
    }
    const bought = deps.living.bookcaseCount;
    const bookcases = deps.living.standEveryBookcase(true);
    this.extraBookcases = bookcases.slice(bought);
    this.atlas = new DreamAtlas(deps.games);
    this.shelves = new DreamShelves(bookcases, this.atlas);
  }

  /** Sends the covers that arrived to the GPU (a few megabytes: called while the screen is black, where a hitch shows nothing). */
  flushCovers(): void {
    this.atlas.flush();
  }

  /** Schedules the sale between `from` and `to` (s, on the caller's clock), the farthest from `eye` first. */
  sell(eye: THREE.Vector3, from: number, to: number): void {
    const { shelves } = this;
    const units: { distance: number; shelf?: Shelf; make: (at: number) => Vanisher }[] = [];
    for (const entry of this.shown) {
      if (entry.piece.zone.id !== this.deps.filmedZone) {
        this.hide(entry);
        continue;
      }
      const where = entry.piece.item.getWorldPosition(new THREE.Vector3());
      units.push({ distance: where.distanceTo(eye), make: (at) => this.shrinking(entry, at) });
    }
    shelves.rows.forEach((row, i) => {
      units.push({
        distance: row.centre.distanceTo(eye),
        shelf: row.shelf,
        make: (at) => vanisher(at, VANISH.row, (k) => shelves.setOpacity(i, 1 - smooth(k)), () => shelves.setOpacity(i, 0)),
      });
    });
    units.sort((a, b) => b.distance - a.distance);
    const span = to - from - VANISH.piece - VANISH.afterRows;
    const step = units.length > 1 ? span / (units.length - 1) : 0;
    const starts = units.map((_, i) => from + i * step);
    this.vanishers = units.map((unit, i) => unit.make(starts[i]!));
    // Each bookcase nobody bought, once the last of its rows has started fading.
    for (const bookcase of this.extraBookcases) {
      const lastRow = Math.max(from, ...units.map((unit, i) => (unit.shelf === bookcase ? starts[i]! : from)));
      const scale = bookcase.scale.clone();
      this.vanishers.push(
        vanisher(
          lastRow + VANISH.afterRows,
          VANISH.piece,
          (k) => setScale(bookcase, scale, 1 - easeInCubic(k)),
          () => {
            bookcase.visible = false;
            setScale(bookcase, scale, 1);
          },
        ),
      );
    }
  }

  /** The sale at `t` (the caller's clock): what has started going goes on, what is gone is put away. */
  update(t: number): void {
    for (const v of this.vanishers) {
      if (v.done || t < v.at) continue;
      if (!v.started) {
        v.started = true;
        this.deps.onGoing();
      }
      const k = clamp((t - v.at) / v.seconds, 0, 1);
      v.step(k);
      if (k >= 1) {
        v.gone();
        v.done = true;
      }
    }
  }

  /** Everything staged again as it was (whatever the sale reached), the dream's boxes gone, the bookcases bought back. Once. */
  putAway(): void {
    if (this.away) return;
    this.away = true;
    for (const v of this.vanishers) if (!v.done) v.gone();
    this.vanishers = [];
    for (const entry of this.shown) this.hide(entry);
    this.shelves.dispose();
    this.atlas.dispose();
    for (const bookcase of this.extraBookcases) bookcase.visible = true;
    this.deps.living.standEveryBookcase(false);
  }

  /** A piece rising a little and shrinking to nothing, its lights dimming with it; staged again (exactly as it was) once gone. */
  private shrinking(entry: Shown, at: number): Vanisher {
    return vanisher(
      at,
      VANISH.piece,
      (k) => {
        const s = 1 - easeInCubic(k);
        entry.piece.item.position.y = entry.y + VANISH.rise * smooth(k);
        setScale(entry.piece.item, entry.scale, s);
        for (const { light, intensity } of entry.lights) light.intensity = intensity * s * s;
      },
      () => this.hide(entry),
    );
  }

  /** Back to staged: pose and lights as they were, then hidden the way `placerFor` hides it. */
  private hide(entry: Shown): void {
    if (entry.hidden) return;
    entry.hidden = true;
    entry.piece.item.position.y = entry.y;
    setScale(entry.piece.item, entry.scale, 1);
    for (const { light, intensity } of entry.lights) light.intensity = intensity;
    setShownKeepingLights(entry.piece.item, false);
  }
}

function vanisher(at: number, seconds: number, step: (k: number) => void, gone: () => void): Vanisher {
  return { at, seconds, step, gone, started: false, done: false };
}

/** `object` at `share` of `scale` (never quite 0: a zero scale makes a singular matrix), its matrices brought up to date. */
function setScale(object: THREE.Object3D, scale: THREE.Vector3, share: number): void {
  object.scale.copy(scale).multiplyScalar(Math.max(share, 1e-4));
  object.updateMatrix();
  object.updateMatrixWorld(true);
}
