import type { ButtonKey, EmulatorData, NES } from 'jsnes';
import type { Pad, ProgramContext, ScreenProgram } from '@/onscreen';
import { paintSavedMark } from '@/onscreen/programOsd';
import { batteryOf, keepBattery } from './nesBattery';

/** What the emulator's insides give for the battery saves (not in jsnes's types): the cart's header, the CPU's memory. */
interface NesInsides {
  rom?: { batteryRam?: unknown };
  cpu?: { mem?: number[] };
}
/** The cart's save RAM in the CPU's memory map. */
const SRAM_FROM = 0x6000;
const SRAM_TO = 0x8000;

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
/** Frames without a battery write after a burst before the save counts as done (a quarter second). */
const SAVE_SETTLE_FRAMES = 15;
/** Frames a cart runs before its battery writes count as a save (three seconds: its boot checks the RAM). */
const BOOT_FRAMES = 180;
/** How long the "SAVED" mark stays in the corner (s). */
const SAVED_MARK_S = 1.6;

/**
 * Where each cart was when its pad went down, by ROM: picked up again, it carries on from there (a platformer's level
 * is not lost to a walk to the kitchen). Kept for the page's life only: a whole machine state (64 KB of memory and the
 * picture buffers as JSON) is too big for the save. A cart with a battery keeps its save RAM in the save file
 * (`nesBattery`): its saved games outlive the page.
 */
const resumeAt = new Map<string, EmulatorData>();

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

interface NesProgramOptions {
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
  /** The cart's key in `resumeAt` (its ROM's address), none for bytes handed in. */
  private readonly resumeKey: string | null;
  /** The cart wrote to its battery-backed RAM since it was put in: kept when it comes out. */
  private batteryDirty = false;
  /** Frames since the battery was last written (a game writes its save in a burst), and the "SAVED" mark's time left (s). */
  private sinceWrite = Infinity;
  private savedMark = 0;
  /** The cart's header says it has a battery (only then is its RAM a save, and the mark shown). */
  private hasBattery = false;
  /** Frames run since the cart went in, counted up to `BOOT_FRAMES`. */
  private ran = 0;

  constructor(private readonly options: NesProgramOptions) {
    this.title = options.title;
    this.hint = options.hint;
    this.players = options.players;
    this.resumeKey = typeof options.rom === 'string' ? options.rom : null;
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
      onBatteryRamWrite: () => {
        this.batteryDirty = true;
        this.sinceWrite = 0;
      },
    });
    nes.loadROM(bytes);
    // A cart with a battery: its saved games back in its RAM, as they were when it last came out.
    const insides = nes as unknown as NesInsides;
    this.hasBattery = !!insides.rom?.batteryRam;
    const sram = this.resumeKey && this.hasBattery ? batteryOf(this.resumeKey) : null;
    if (sram && insides.cpu?.mem) for (let i = 0; i < sram.length; i++) insides.cpu.mem[SRAM_FROM + i] = sram[i]!;
    const saved = this.resumeKey ? resumeAt.get(this.resumeKey) : undefined;
    if (saved) {
      try {
        nes.fromJSON(saved);
        // The state keeps the pads as they were when it was put down: a button held then would stay held (`press`
        // only sends changes), so every button starts released.
        for (const controller of [1, 2] as const) for (const [, button] of BUTTONS) nes.buttonUp(controller, button);
      } catch (error) {
        console.warn('[nes] could not resume, starting afresh', error);
        resumeAt.delete(this.resumeKey!);
        nes.loadROM(bytes);
      }
    }
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
      // A burst of writes to the battery, then quiet for a moment: the save is done, the mark shows.
      // (Not the cart checking its RAM as it boots: only once it has run a few seconds.)
      if (this.ran < BOOT_FRAMES) this.ran++;
      if (++this.sinceWrite === SAVE_SETTLE_FRAMES && this.hasBattery && this.ran >= BOOT_FRAMES) this.savedMark = SAVED_MARK_S;
    }
    if (frames === MAX_FRAMES_PER_TICK) this.clock = 0;
    this.savedMark = Math.max(0, this.savedMark - dt);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.putImageData(this.image, 0, 0);
    // In the last half second the mark fades out.
    paintSavedMark(ctx, this.savedMark / 0.5);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.clock = 0;
    if (paused) this.count = 0;
  }

  dispose(): void {
    // A battery cart's RAM written: into the save file.
    // (A cart without one writes its work RAM there too: not kept, it would never be loaded back.)
    const insides = this.nes as unknown as NesInsides | null;
    const mem = insides?.cpu?.mem;
    if (this.batteryDirty && this.resumeKey && insides?.rom?.batteryRam && mem) keepBattery(this.resumeKey, mem.slice(SRAM_FROM, SRAM_TO));
    // The pad goes down: where the cart was, to carry on from next time.
    if (this.nes && this.resumeKey) {
      try {
        resumeAt.set(this.resumeKey, this.nes.toJSON());
      } catch (error) {
        console.warn('[nes] could not keep the state', error);
      }
    }
    this.disposed = true;
    this.node?.disconnect();
    if (this.node) this.node.onaudioprocess = null;
    this.node = null;
    this.nes = null;
  }

  /** The pad's buttons down and up as they change (jsnes keeps the state per controller). */
  private press(nes: NES, controller: 1 | 2, pad: Pad): void {
    // One set per controller, 1 and 2.
    const held = this.held[controller - 1]!;
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
