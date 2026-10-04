import type { SfxEvent } from '@/audio/ChipSpeaker';
import type { ArcadeControls, ArcadeGame, RunContext } from './ArcadeGame';

/**
 * A game that is another game under a different name or look (STARFALL is COMET DASH on a green
 * tube): everything a cabinet reads is the inner game's, forwarded here once, and a subclass gives
 * only its own `id`, `title`, `summary`, and what it changes (a `draw` over the inner one). The
 * two-player members are not forwarded on purpose: a cabinet builds a second stick for any game
 * that has `setOpponent`, so a wrapper of a two-player game declares them itself.
 */
export abstract class WrappedGame implements ArcadeGame {
  abstract readonly id: string;
  abstract readonly title: string;
  abstract readonly summary: string;

  constructor(protected readonly inner: ArcadeGame) {}

  get hint(): string {
    return this.inner.hint;
  }

  get score(): number {
    return this.inner.score;
  }

  get over(): boolean {
    return this.inner.over;
  }

  get gun(): boolean | undefined {
    return this.inner.gun;
  }

  get demoable(): boolean | undefined {
    return this.inner.demoable;
  }

  get unreported(): boolean | undefined {
    return this.inner.unreported;
  }

  reset(run: RunContext): void {
    this.inner.reset(run);
  }

  update(dt: number, controls: ArcadeControls): void {
    this.inner.update(dt, controls);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.inner.draw(ctx);
  }

  takeSounds(): SfxEvent[] {
    return this.inner.takeSounds();
  }

  autopilot(skill: number): ArcadeControls {
    return this.inner.autopilot(skill);
  }
}
