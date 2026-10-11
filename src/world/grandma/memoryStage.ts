import * as THREE from 'three';
import type { MemorySet } from '@/memories/memoryReel';
import type { Zone } from '../zone/Zone';
import type { Walker } from '../people/Walker';
import { HandheldScreens, handheldModel } from '../courtyard/handheldModel';

/*
 * What the reels filmed at Mémé's share (docs/story.md "Adding a memory"): beats fired once on the film's clock, the
 * table's top as it stands today, today's things of hers put aside by name, the child's Game Boy held up to the face.
 */

/**
 * Beats on the film's clock, each fired once the first frame the clock passes it; `now` fires one at once (a cue
 * played out early), `skip` marks one fired without running it (the moment the player let pass); `reset` at every staging.
 */
export function beats(): { at(t: number, when: number, key: string, run: () => void): void; now(key: string, run: () => void): void; skip(key: string): void; reset(): void } {
  let fired = new Set<string>();
  return {
    at: (t, when, key, run) => {
      if (t < when || fired.has(key)) return;
      fired.add(key);
      run();
    },
    now: (key, run) => {
      if (fired.has(key)) return;
      fired.add(key);
      run();
    },
    skip: (key) => {
      fired.add(key);
    },
    reset: () => {
      fired = new Set();
    },
  };
}

/** Where a plate stands on her dining table today (m over the floor): the cloth's top if one is on it, else the table's. */
export function tableTop(zone: Zone): number {
  let table = 0;
  let cloth = 0;
  zone.group.traverse((obj) => {
    const top = (obj as { topHeight?: unknown }).topHeight;
    if (typeof top !== 'number') return;
    if (obj.name === 'KitchenTable') table = Math.max(table, top);
    else if (obj.name === 'TableCloth') cloth = Math.max(cloth, top);
  });
  return cloth || table || 0.75;
}

/** The bare table's top (under any cloth), for a cloth of the past laid in place of today's. */
export function bareTableTop(zone: Zone): number {
  let table = 0;
  zone.group.traverse((obj) => {
    const top = (obj as { topHeight?: unknown }).topHeight;
    if (obj.name === 'KitchenTable' && typeof top === 'number') table = Math.max(table, top);
  });
  return table || 0.75;
}

/** Hides, for the scene, every object of the zone bearing one of `names` (today's things the past had not: her Sunday table, her cloth). */
export function hideNamed(set: MemorySet, ...names: string[]): void {
  const found: THREE.Object3D[] = [];
  set.zone.group.traverse((obj) => {
    if (names.includes(obj.name)) found.push(obj);
  });
  if (found.length) set.hide(...found);
}

/** What a reel's `returned` needs of the present to play her after-line (`albumWiring`'s `Present`). */
interface Returning {
  meme: Walker;
  reseat(): void;
  afterLine: string;
  after(seconds: number, fn: () => void): void;
}

/** Her beats back in the room after a hard memory, and after a gentler one (s after the room comes back under the black). */
const MOVED = {
  /** The row, the sale, the keys: her glasses off (as near as her hands go), a long breath out, then her words slowly. */
  hard: { glasses: 1.6, sigh: 3.4, speak: 5.8, between: 3, face: { frown: 0.5, squint: 0.45, browsUp: 0.3, smile: 0 }, hold: 9 },
  /** The last Wednesday: a sigh and a small smile, then her words. */
  soft: { glasses: null, sigh: 1.8, speak: 3.6, between: 2.4, face: { smile: 0.3, frown: 0.2, browsUp: 0.2 }, hold: 6 },
} as const;

/**
 * Mémé back in her chair after a memory, under the last black: at once her line for a light one; after a hard one
 * (`moved`) she is shaken first, and says it a sentence at a time. Mémé of today shown again and seated.
 */
export function backInTheRoom(present: Returning, moved: keyof typeof MOVED | null = null): void {
  // Put aside while her younger self was in the picture (a memory filmed at hers): back in her chair.
  if (!present.meme.isPresent) present.meme.setPresent(true);
  present.reseat();
  if (!moved) {
    present.meme.speak(present.afterLine);
    return;
  }
  const { meme } = present;
  const beat = MOVED[moved];
  meme.feel(beat.face, beat.hold);
  if (beat.glasses !== null) present.after(beat.glasses, () => meme.gesture('adjustGlasses'));
  present.after(beat.sigh, () => meme.gesture('sigh'));
  present.afterLine
    .split(/(?<=[.?!…])\s+/)
    .forEach((sentence, i) => present.after(beat.speak + i * beat.between, () => meme.speak(sentence)));
}

/** The yaw that turns someone standing at zone-local `at` towards Mémé where she is now (her spot for the hour). */
export function turnedTo(present: { meme: THREE.Object3D }, at: readonly [x: number, z: number]): number {
  const { x, z } = present.meme.position;
  return Math.atan2(-(x - at[0]), -(z - at[1]));
}

/** A Game Boy in a person's hands, as the reel holds it: where the hands go and the eyes, its screen's little game. */
export interface HeldHandheld {
  /** For `Walker.stand` / `sit`'s `hands`: its two grips, world (read every frame; moves `screen` too). */
  hands(): readonly [THREE.Vector3, THREE.Vector3];
  /** Its screen's middle, world: the eyes' focus while playing (kept up to date by `hands`). */
  readonly screen: THREE.Vector3;
  /** Shown or not (in the box until it is unwrapped). */
  show(shown: boolean): void;
  /** The screen's game moved on (from the scene's `beat`). */
  tick(dt: number): void;
  /** Its screen and glass freed (the scene's strike; the walker's tree takes the rest). */
  dispose(): void;
}

/**
 * Puts the grey pocket handheld (the courtyard kids' kind: `courtyard/handheldModel`) in `walker`'s hands, held up
 * under the face and tipped to the eyes: standing, or seated on a seat `seat` metres high. `height` is the person's.
 */
export function holdHandheld(walker: Walker, height: number, seat: number | null = null): HeldHandheld {
  const screens = new HandheldScreens();
  const model = handheldModel('pocket', screens.material('pocket'));
  const device = model.object;
  device.position.set(0, seat !== null ? seat + 0.25 * height : 0.6 * height, seat !== null ? 0.3 : 0.26);
  device.rotation.set(-0.64, Math.PI, 0, 'YXZ');
  walker.add(device);
  const grips: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  const screen = new THREE.Vector3();
  const place = (): readonly [THREE.Vector3, THREE.Vector3] => {
    device.updateMatrixWorld(true);
    device.localToWorld(grips[0].copy(model.grips[0]));
    device.localToWorld(grips[1].copy(model.grips[1]));
    device.localToWorld(screen.copy(model.screen));
    return grips;
  };
  walker.updateMatrixWorld(true);
  place();
  return {
    hands: place,
    screen,
    show: (shown) => {
      device.visible = shown;
    },
    tick: (dt) => screens.tick(dt),
    dispose: () => {
      model.dispose();
      screens.dispose();
    },
  };
}
