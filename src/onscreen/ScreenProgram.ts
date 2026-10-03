import type { Game } from '@/catalog/types';

/** One controller's buttons this frame, held or not (an NES pad's: the d-pad, A, B, Start, Select). */
export interface Pad {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  a: boolean;
  b: boolean;
  start: boolean;
  select: boolean;
}

/** Nothing held. */
export const NO_PAD: Readonly<Pad> = { up: false, down: false, left: false, right: false, a: false, b: false, start: false, select: false };

/** What a program is handed when it comes on. */
export interface ProgramContext {
  /**
   * Where its sound goes: the set's speaker (level and pan follow where the listener stands, the walls between, the
   * screens' mixer bus), or null when no click has started the audio yet (it plays silent then).
   */
  readonly audio: { readonly ctx: AudioContext; readonly out: AudioNode } | null;
}

/**
 * Something that runs on a screen of the flat instead of a longplay: the NES emulator with a homebrew cart, a canvas
 * game for two. It draws on a canvas of its own size (`width` x `height`, shown on the glass), reads both pads every
 * frame and makes its own sound (into `ProgramContext.audio.out`). No DOM, no three.js, no key handling of its own:
 * the `ProgramRunner` polls the keys and the controller, steps it and puts its picture on the set. Docs: docs/media.md
 * "Programs on the screen".
 */
export interface ScreenProgram {
  /** What the set shows it is running, for the TV's label and the reactions. */
  readonly title: string;
  /** Logical picture size in pixels (the canvas it draws on; the set stretches it to its 4:3 glass). */
  readonly width: number;
  readonly height: number;
  /** One line of controls, for the HUD tip when the player takes the pad. */
  readonly hint: string;
  /** 2 when the second pad is read: `ProgramRunner.setSecondPad` (a friend, a CPU) fills it, else it stays `NO_PAD`. */
  readonly players: 1 | 2;
  /** Set true when the program is done by itself (a canvas game's last round): the runner switches the set off. */
  readonly over?: boolean;
  /** Comes on: load what it needs (a ROM), connect its sound. May be async; nothing is stepped before it resolves. */
  start(context: ProgramContext): void | Promise<void>;
  /** One frame: `dt` seconds of real time, pad one (the player) and pad two. Never called while paused or dormant. */
  update(dt: number, pads: readonly [Pad, Pad]): void;
  /** Paints the latest picture (called after `update`, and once on a pause so the frame stays). */
  draw(ctx: CanvasRenderingContext2D): void;
  /** Held still (the pointer unlocked, the zone dormant) or let go on: silence its sound meanwhile. */
  setPaused?(paused: boolean): void;
  /** Off for good: stop the sound, let go of everything. */
  dispose(): void;
}

/** Makes the program a game runs as (a fresh one per play), or null when the game is played as a longplay. */
export type ProgramProvider = (game: Game) => (() => ScreenProgram) | null;
