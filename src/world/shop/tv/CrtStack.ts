import { Prop } from '../../props/Prop';
import { PortableTv } from '../shopModels';
import type { ScreenLook } from '../snowScreen';

export interface CrtStackOptions {
  /** The sets' widths, bottom first. Default a big one, a middling one, a small one. */
  widths?: readonly number[];
  /** What each shows, bottom first (`snowScreen`). Default snow on all. */
  screens?: readonly ScreenLook[];
}

const CASES: readonly number[] = [0x2a2a2c, 0xd8d2c4, 0x8a3a2a];

/**
 * The window display the street sees: three portable sets stacked one on another, big to small, each a little turned,
 * all on the same snowstorm (the shared `snowScreen`, repainted by the shop's `SnowTicker`). Origin on the surface
 * under the bottom set, the screens +z. Decoration: never collides; its parts merge.
 */
export class CrtStack extends Prop {
  readonly contactShadow = false;

  constructor(options: CrtStackOptions = {}) {
    super();
    this.name = 'CrtStack';
    const widths = options.widths ?? [0.42, 0.34, 0.27];
    let y = 0;
    widths.forEach((width, i) => {
      const tv = new PortableTv({ width, case: CASES[i % CASES.length]!, screen: options.screens?.[i] ?? 'snow', aerial: i === widths.length - 1 });
      tv.position.set((i % 2 ? 1 : -1) * 0.015, y, i * 0.01);
      tv.rotation.y = (i % 2 ? -1 : 1) * 0.07;
      this.add(tv);
      // The next set rests on this one's carrying handle (`PortableTv`: the case is 0.84 of its width, the handle 0.125 over it).
      y += width * (0.84 + 0.125);
    });
  }
}
