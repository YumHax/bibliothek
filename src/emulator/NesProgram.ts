import type { ButtonKey, NES } from 'jsnes';
import type { Pad, ProgramContext, ScreenProgram } from '@/onscreen';

/** The NES's picture (pixels). */
const NES_W = 256;
const NES_H = 240;
/** NTSC frame rate. */
const NES_FPS = 60.0988;
/** At most this many frames caught up in one tick: a hitch slows the game, it never races. */
const MAX_FRAMES_PER_TICK = 3;
/** The audio ring holds this long (s); past it the oldest samples go, so the sound never lags the picture. */
const RING_SECONDS = 0.08;
/** The script node's block (samples): about 20 ms at 48 kHz. */
const BLOCK = 1024;
/** The APU is loud next to the room's other sounds. */
const LEVEL = 0.7;

/** The pad's buttons as jsnes numbers them (`Controller.BUTTON_*`). */
const BUTTONS: readonly [keyof Pad, ButtonKey][] = [
  ['a', 0],
  ['b', 1],
  ['select', 2],
  ['start', 3],
  ['up', 4],
  ['down', 5],
  ['left', 6],
  ['right', 7],
];

export interface NesProgramOptions {
  title: string;
  /** Where the ROM is served (`public/roms/...`), or its bytes. */
  rom: string | Uint8Array;
  /** Controls line for the HUD. */
  hint: string;
  /** Whether the cart reads controller two. */
  players: 1 | 2;
}

/**
 * The NES emulator (jsnes, Apache-2.0) as a `ScreenProgram`: a cart's ROM booted, stepped at the NES's own 60.1 Hz
 * from the frame clock (catching up at most a few frames), its picture painted 256 x 240, its APU's samples through
 * a small ring into the set's speaker (`ProgramContext.audio`). Both pads are the NES's two controllers.
 */
export class NesProgram implements ScreenProgram {
  readonly width = NES_W;
  readonly height = NES_H;
  readonly title: string;
  readonly hint: string;
  readonly players: 1 | 2;

  private nes: NES | null = null;
  private readonly image: ImageData;
  private readonly pixels: Uint32Array;
  private clock = 0;
  private paused = false;
  private readonly held: [Set<ButtonKey>, Set<ButtonKey>] = [new Set(), new Set()];
  private node: ScriptProcessorNode | null = null;
  private ring = new Float32Array(1);
  private readAt = 0;
  private writeAt = 0;
  private count = 0;
  private disposed = false;

  constructor(private readonly options: NesProgramOptions) {
    this.title = options.title;
    this.hint = options.hint;
    this.players = options.players;
    this.image = new ImageData(NES_W, NES_H);
    this.pixels = new Uint32Array(this.image.data.buffer);
    this.pixels.fill(0xff000000);
  }

  async start({ audio }: ProgramContext): Promise<void> {
    // The emulator comes in its own chunk, the first time a cart is put in.
    const [bytes, { NES }] = await Promise.all([typeof this.options.rom === 'string' ? fetchRom(this.options.rom) : this.options.rom, import('jsnes')]);
    if (this.disposed) return;
    const sampleRate = audio?.ctx.sampleRate ?? 48000;
    this.ring = new Float32Array(Math.ceil(sampleRate * RING_SECONDS));
    const nes = new NES({
      emulateSound: audio !== null,
      sampleRate,
      onFrame: (frame) => {
        // jsnes hands 0xBBGGRR per pixel: with full alpha, that is the canvas's little-endian RGBA.
        for (let i = 0; i < frame.length; i++) this.pixels[i] = 0xff000000 | frame[i]!;
      },
      onAudioSample: (left) => this.push(left),
    });
    nes.loadROM(bytes);
    this.nes = nes;
    if (audio) {
      const node = audio.ctx.createScriptProcessor(BLOCK, 0, 1);
      node.onaudioprocess = (e) => this.pull(e.outputBuffer.getChannelData(0));
      node.connect(audio.out);
      this.node = node;
    }
  }

  update(dt: number, pads: readonly [Pad, Pad]): void {
    const nes = this.nes;
    if (!nes) return;
    pads.forEach((pad, i) => this.press(nes, (i + 1) as 1 | 2, pad));
    this.clock += dt;
    let frames = 0;
    while (this.clock >= 1 / NES_FPS && frames < MAX_FRAMES_PER_TICK) {
      nes.frame();
      this.clock -= 1 / NES_FPS;
      frames++;
    }
    if (frames === MAX_FRAMES_PER_TICK) this.clock = 0;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.putImageData(this.image, 0, 0);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.clock = 0;
    if (paused) this.count = 0;
  }

  dispose(): void {
    this.disposed = true;
    this.node?.disconnect();
    if (this.node) this.node.onaudioprocess = null;
    this.node = null;
    this.nes = null;
  }

  /** The pad's buttons down and up as they change (jsnes keeps the state per controller). */
  private press(nes: NES, controller: 1 | 2, pad: Pad): void {
    const held = this.held[controller - 1];
    for (const [name, button] of BUTTONS) {
      if (pad[name] === held.has(button)) continue;
      if (pad[name]) {
        held.add(button);
        nes.buttonDown(controller, button);
      } else {
        held.delete(button);
        nes.buttonUp(controller, button);
      }
    }
  }

  private push(sample: number): void {
    const ring = this.ring;
    if (this.count === ring.length) {
      this.readAt = (this.readAt + 1) % ring.length; // full: the oldest goes
      this.count--;
    }
    ring[this.writeAt] = sample * LEVEL;
    this.writeAt = (this.writeAt + 1) % ring.length;
    this.count++;
  }

  private pull(out: Float32Array): void {
    const ring = this.ring;
    for (let i = 0; i < out.length; i++) {
      if (this.paused || this.count === 0) {
        out[i] = 0;
        continue;
      }
      out[i] = ring[this.readAt]!;
      this.readAt = (this.readAt + 1) % ring.length;
      this.count--;
    }
  }
}

async function fetchRom(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`ROM ${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
