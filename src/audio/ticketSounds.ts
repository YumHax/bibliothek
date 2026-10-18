import { oneShot } from './oneShot';
import { noiseBurst, rand } from './synth';

/*
 * Paper torn and handed over in the street (`ui/street/ChoicePanel`): line 38's ticket coming off the driver's roll.
 */

/** The ticket torn along its perforation: a run of tiny ripping clicks, then the stub's flick. */
export function playTicketTear(level = 0.14): void {
  const o = oneShot(level, 0.5, { channel: 'foreground' });
  if (!o) return;
  const { ctx, out, t } = o;
  for (let i = 0; i < 9; i++) noiseBurst(ctx, out, t + i * 0.022 + rand(0, 0.006), { band: rand(2600, 4200), q: 3, level: 0.35 + (i % 3) * 0.1, length: 0.018, offset: 'random' });
  noiseBurst(ctx, out, t + 0.24, { band: 1600, bandTo: 900, q: 1.2, level: 0.3, length: 0.08, offset: 'random' });
}
