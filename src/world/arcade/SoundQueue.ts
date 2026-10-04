import type { Sfx, SfxEvent } from '@/audio/ChipSpeaker';

/**
 * The sounds a game or a machine's simulation asks for in a frame, taken by whoever owns the
 * speaker (`take`, once a frame): the same sound twice in one frame plays once, and at most
 * `limit` are kept (a board clearing is one chord, not a clip). Every game and every physical
 * machine's sim queues through this, so a speaker hears them all the same way.
 */
export class SoundQueue {
  private events: SfxEvent[] = [];

  constructor(private readonly limit = 6) {}

  push(sfx: Sfx, pitch = 1): void {
    if (this.events.some((e) => e.sfx === sfx)) return;
    if (this.events.length < this.limit) this.events.push({ sfx, pitch });
  }

  /** What was queued since the last call, cleared. */
  take(): SfxEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  clear(): void {
    this.events = [];
  }
}
