import type { Pad, ProgramContext, ScreenProgram } from '@/onscreen/ScreenProgram';
import { DEMO_H, DEMO_W, MoonpostDemo } from './MoonpostDemo';
import { MoonpostSound } from './moonpostSound';

/**
 * The prototype cart in the NES, on the TV: `MoonpostDemo` run as a `ScreenProgram` (pad one's A or up
 * fires the jet pack, Start starts and skips). `onFinished` hears once that it was played to its end
 * (the credits rolled): the trail's last step.
 */
export class MoonpostProgram implements ScreenProgram {
  readonly title = 'MOONPOST (prototype)';
  readonly width = DEMO_W;
  readonly height = DEMO_H;
  readonly hint = 'A or up: jet pack · left / right: steer · Start: start · land softly on the yellow pads';
  readonly players = 1 as const;
  private readonly demo = new MoonpostDemo();
  private sound: MoonpostSound | null = null;
  private told = false;
  private fireHeld = false;

  constructor(private readonly onFinished: () => void) {}

  get over(): boolean {
    return this.demo.over;
  }

  start(context: ProgramContext): void {
    if (context.audio) this.sound = new MoonpostSound(context.audio.ctx, context.audio.out);
  }

  update(dt: number, pads: readonly [Pad, Pad]): void {
    const pad = pads[0];
    const fire = pad.a || pad.b;
    this.demo.update(dt, { left: pad.left, right: pad.right, up: pad.up, down: pad.down, fire, firePressed: fire && !this.fireHeld, start: pad.start });
    this.fireHeld = fire;
    for (const s of this.demo.takeSounds()) this.sound?.play(s);
    this.sound?.update(this.demo.musicOn, this.demo.thrusting);
    if (this.demo.finished && !this.told) {
      this.told = true;
      this.onFinished();
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.demo.draw(ctx);
  }

  setPaused(paused: boolean): void {
    this.sound?.setPaused(paused);
  }

  dispose(): void {
    this.sound?.dispose();
    this.sound = null;
  }
}
