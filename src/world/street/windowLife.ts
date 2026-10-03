import type { FacadeSpec } from './streetPlan';

/*
 * What a `Buildings` may be told about its lit windows beyond the curfews (`BuildingsOptions.windowLife`): whose home a
 * window is (lit while they are in and up: our building's residents, `building/rearWindows`), and a story played in it
 * at night, drawn over its light by the facade's shader (silhouettes at dinner, a party, a removal, the trader's shelves
 * filling up across the courtyard). Types only, so the street never imports the building's rules.
 */

/** A lit window of a facade, as the painter laid it: along its face (m from its left end), over the street (m), its floor (0 ground, 1 the first...). */
export interface FacadeWindow {
  facade: FacadeSpec;
  along: readonly [s0: number, s1: number];
  height: readonly [y0: number, y1: number];
  floor: number;
}

/** What is going on behind a story window right now: a `STORY` kind (-1: just its light), and that kind's 0..1 parameter. */
export interface WindowStory {
  kind: number;
  param: number;
}

/** What a window is claimed for: lit only while `lit` says (instead of the curfew), and a story drawn in it. */
export interface WindowClaim {
  lit?: () => boolean;
  story?: () => WindowStory;
}

/** Hands each lit window its claim (null: the curfew as usual), all at once so a plan can pick the best window for a story. */
export interface WindowLife {
  claim(windows: readonly FacadeWindow[]): readonly (WindowClaim | null)[];
}

/** How many story windows one `Buildings` draws (its shader's uniform arrays). */
export const STORY_WINDOWS = 8;

/** The stories a window can show (the shader's `kind`). */
export const STORY = {
  /** Two at a table, a candle: `param` unused. */
  dinner: 0,
  /** Someone doing squats. */
  workout: 1,
  /** A painter at an easel: `param` how far the canvas has come (0 bare .. 1 finished). */
  painter: 2,
  /** A crowd bobbing under coloured light. */
  party: 3,
  /** Boxes stacked under a bare bulb, someone carrying one across. */
  removal: 4,
  /** Shelves of boxes, `param` the share filled: the trader's collection. */
  shelves: 5,
  /** A cat on the sill, someone reading behind. */
  cat: 6,
  /** Someone at a desk, their back turned, a monitor's blue glow. */
  gamer: 7,
  /** Someone reading in an armchair under a lamp. */
  reader: 8,
} as const;
