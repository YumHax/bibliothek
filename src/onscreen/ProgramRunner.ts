import * as THREE from 'three';
import type { Game } from '@/catalog/types';
import type { Updatable } from '@/core/Engine';
import type { Input } from '@/core/Input';
import { audioBus, audioContext } from '@/audio/audioContext';
import { ACTIONS } from '@/input/actions';
import { createCanvas, toTexture } from '@/graphics/canvas';
import type { ScreenFeed, VideoScreen } from '@/world/screen';
import { NO_PAD, type Pad, type ScreenProgram } from './ScreenProgram';

/** The pad's keys: the arcade stick's for the d-pad, then A, B, Start, Select (`input/actions`, context `arcade`). */
const PAD_KEYS = {
  up: ACTIONS.stickUp.codes,
  down: ACTIONS.stickDown.codes,
  left: ACTIONS.stickLeft.codes,
  right: ACTIONS.stickRight.codes,
  a: ACTIONS.padA.codes,
  b: ACTIONS.padB.codes,
  start: ACTIONS.padStart.codes,
  select: ACTIONS.padSelect.codes,
} as const satisfies Record<keyof Pad, readonly string[]>;

/**
 * A controller's buttons on the NES pad (standard mapping): the bottom face button is B and the right one A, the
 * RetroPad's way; Start is the controller's Y and Select its LB, because its own Start pauses the room
 * (`PointerLockFlow`) and X walks away (E's alias). The d-pad and the left stick are the d-pad.
 */
const GAMEPAD = { b: 0, a: 1, start: 3, select: 4, up: 12, down: 13, left: 14, right: 15 } as const;
/** Left-stick tilt that presses a d-pad direction. */
const STICK_PRESS = 0.5;
/** The longest step one frame may take (s): a hitch never makes a program jump. */
const MAX_DT = 0.1;

/** Something that hears when a program comes on or goes off. */
interface ProgramListener {
  started?(program: ScreenProgram, game: Game, screen: VideoScreen): void;
  stopped?(program: ScreenProgram): void;
}

/**
 * Runs one `ScreenProgram` at a time on a screen of the flat: paints its canvas onto the glass
 * (`VideoScreen.showFeed`), routes its sound through the set (level and pan follow the listener, the screens'
 * bus), reads pad one from the keys and the first controller while the player holds the pad (`setHolding`) and pad
 * two from a second controller (a program with `players: 2`), holds it still while paused or dormant, and switches it off with the set.
 * Ticked by the engine; `game/Screens.playOn` starts it, `game/ProgramPlay` parks the player. Docs: docs/media.md
 * "Programs on the screen".
 */
export class ProgramRunner implements Updatable {
  private program: ScreenProgram | null = null;
  private game: Game | null = null;
  private screen: VideoScreen | null = null;
  private feed: ScreenFeed | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private texture: THREE.CanvasTexture | null = null;
  private gain: GainNode | null = null;
  private panner: StereoPannerNode | null = null;
  private ready = false;
  private holding = false;
  private paused = false;
  /** Whether the program was last told to hold still (pause, dormant zone), so it hears each change once. */
  private heldStill = false;
  private offState: (() => void) | null = null;
  private readonly listeners = new Set<ProgramListener>();

  constructor(private readonly input: Input) {}

  /** The program on, if any. */
  get current(): ScreenProgram | null {
    return this.program;
  }

  /** The game it was started for. */
  get currentGame(): Game | null {
    return this.game;
  }

  /** The screen it shows on. */
  get currentScreen(): VideoScreen | null {
    return this.screen;
  }

  /** Whether the player holds pad one (their keys are the program's). */
  get isHolding(): boolean {
    return this.holding;
  }

  /** Hears every program coming on and going off; returns an unsubscribe function. */
  listen(listener: ProgramListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Switches whatever ran off and puts `program` on `screen`: false (nothing started) when the screen cannot show a
   * feed. The program is stepped once its `start` resolved.
   */
  run(screen: VideoScreen, program: ScreenProgram, game: Game): boolean {
    if (!screen.showFeed) return false;
    this.stop();
    const [canvas, ctx] = createCanvas(program.width, program.height);
    const texture = toTexture(canvas);
    texture.magFilter = THREE.NearestFilter; // crisp pixels up close
    this.program = program;
    this.game = game;
    this.screen = screen;
    this.ctx = ctx;
    this.texture = texture;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, program.width, program.height);
    texture.needsUpdate = true;
    this.feed = screen.showFeed(texture);
    // The set switched off (its button, a travel, another longplay): the program goes with it.
    this.offState = screen.onStateChange(() => {
      if (this.feed && !this.feed.live) this.stop();
    });
    const audio = this.audioOut();
    this.ready = false;
    this.heldStill = false;
    void Promise.resolve(program.start({ audio })).then(
      () => {
        if (this.program === program) this.ready = true;
      },
      (err: unknown) => {
        console.warn(`[program] ${program.title} would not start`, err);
        if (this.program === program) this.stop();
      },
    );
    for (const l of this.listeners) l.started?.(program, game, screen);
    return true;
  }

  /** Off: the program is disposed and the set goes dark. */
  stop(): void {
    const program = this.program;
    if (!program) return;
    this.program = null;
    this.game = null;
    this.offState?.();
    this.offState = null;
    const feed = this.feed;
    this.feed = null;
    this.screen = null;
    this.holding = false;
    this.paused = false;
    this.ready = false;
    program.dispose();
    feed?.stop();
    this.gain?.disconnect();
    this.panner?.disconnect();
    this.gain = null;
    this.panner = null;
    this.texture?.dispose();
    this.texture = null;
    this.ctx = null;
    for (const l of this.listeners) l.stopped?.(program);
  }

  /** The player picks pad one up (their keys and controller drive it) or puts it down (pad one reads nothing). */
  setHolding(holding: boolean): void {
    this.holding = holding && this.program !== null;
  }

  /** Holds the program still (the pointer was unlocked) or lets it go on. */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  update(dt: number): void {
    const { program, ctx, texture, feed } = this;
    if (!program || !ctx || !texture || !feed) return;
    if (!feed.live) return this.stop();
    if (program.over) return this.stop();
    // Sound follows the set: its level where the listener stands, from its side of the room.
    const now = this.gain?.context.currentTime ?? 0;
    this.gain?.gain.setTargetAtTime(feed.zoneActive && !this.paused ? feed.loudness : 0, now, 0.03);
    this.panner?.pan.setTargetAtTime(feed.pan, now, 0.03);
    const still = this.paused || !feed.zoneActive || !this.ready;
    if (still !== this.heldStill) {
      this.heldStill = still;
      program.setPaused?.(still);
      if (still && this.ready) this.paint(program, ctx, texture);
    }
    if (still) return;
    const pads: [Pad, Pad] = [this.holding ? this.readPad(0) : NO_PAD, program.players === 2 && this.holding ? this.readPad(1) : NO_PAD];
    program.update(Math.min(dt, MAX_DT), pads);
    this.paint(program, ctx, texture);
  }

  private paint(program: ScreenProgram, ctx: CanvasRenderingContext2D, texture: THREE.CanvasTexture): void {
    program.draw(ctx);
    texture.needsUpdate = true;
  }

  /** The set's speaker: a gain (its level) and a pan into the screens' bus; null before any click started the audio. */
  private audioOut(): { ctx: AudioContext; out: AudioNode } | null {
    const ctx = audioContext();
    if (!ctx) return null;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const panner = ctx.createStereoPanner();
    gain.connect(panner).connect(audioBus(ctx, 'screens'));
    this.gain = gain;
    this.panner = panner;
    return { ctx, out: gain };
  }

  /** Pad `index`: the first pad's keys (any of each button's) and the first controller, the second controller for pad two; buttons and left stick. */
  private readPad(index: 0 | 1): Pad {
    const pad: Pad = { ...NO_PAD };
    if (index === 0) for (const button of Object.keys(PAD_KEYS) as (keyof Pad)[]) pad[button] = this.input.isDown(...PAD_KEYS[button]);
    const gamepad = gamepadAt(index);
    if (gamepad) {
      const held = (i: number): boolean => gamepad.buttons[i]?.pressed ?? false;
      for (const button of Object.keys(GAMEPAD) as (keyof typeof GAMEPAD)[]) if (held(GAMEPAD[button])) pad[button] = true;
      const [x = 0, y = 0] = gamepad.axes;
      if (x < -STICK_PRESS) pad.left = true;
      if (x > STICK_PRESS) pad.right = true;
      if (y < -STICK_PRESS) pad.up = true;
      if (y > STICK_PRESS) pad.down = true;
    }
    return pad;
  }
}

/** The `index`-th connected controller (standard-mapped ones first): pad one's, then pad two's; null without one. */
function gamepadAt(index: number): Gamepad | null {
  if (typeof navigator.getGamepads !== 'function') return null;
  const standard: Gamepad[] = [];
  const others: Gamepad[] = [];
  try {
    for (const pad of navigator.getGamepads()) {
      if (!pad || !pad.connected) continue;
      (pad.mapping === 'standard' ? standard : others).push(pad);
    }
  } catch {
    return null;
  }
  return [...standard, ...others][index] ?? null;
}
