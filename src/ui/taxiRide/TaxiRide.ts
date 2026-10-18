import { isAction } from '@/input/actions';
import { actionKeyLabel } from '@/ui/keys';
import { lastDevice } from '@/input/lastDevice';
import { reduceMotion } from '@/settings/motion';
import { clamp, ramp, smooth } from '@/math/scalar';
import { playTaxiRide as playTaxiSound, type TaxiSound } from '@/audio/taxiRideSounds';
import { html, paint } from '../panel/html';
import { formatCoins } from '@/text/money';
import { TaxiRideScene } from './taxiRideScene';
import './taxiRide.css';

/** The town's cabbie: the name on the rank's "Where to?" card and the look seed their face is painted from. */
export const CABBIE = { name: 'The cabbie', seed: 5813 } as const;

/** What the back seat shows: where to, the fare the meter runs up to, what the driver says, and whether it is dark out. */
interface TaxiRideOptions {
  to: string;
  fare: number;
  chat: string;
  night: boolean;
}

/** The ride's clock (s): its length, the fade in and out, pulling away and pulling in, when the driver speaks, the door. */
const RIDE = { seconds: 6.2, fade: 0.55, pullAway: 1.4, pullIn: 1.6, chatAt: 0.9, doorAt: 5.75 } as const;
/** How fast the town goes by at full speed (m/s). */
const CRUISE = 13;
/** A skip's fade to black (s). */
const SKIP_S = 0.3;
/** Keys that skip besides the put-back key the caption names (rebindable: `isAction`). */
const SKIP_KEYS = new Set(['Escape', 'Space', 'Enter']);

/** The back seat of a taxi over the travel curtain (`traffic/TaxiRank`): resolves when it has played or was skipped. */
export function playTaxiRide(container: HTMLElement, options: TaxiRideOptions): Promise<void> {
  return new Promise((resolve) => new TaxiRide(container, options, resolve));
}

/** The speed at `t` (0..1): pulling away from the rank, cruising, pulling in at the address. */
function speedAt(t: number): number {
  const away = smooth(ramp(t, 0.2, 0.2 + RIDE.pullAway));
  const pull = 1 - smooth(ramp(t, RIDE.doorAt - 0.3 - RIDE.pullIn, RIDE.doorAt - 0.3));
  return clamp(Math.min(away, pull), 0, 1);
}

/** When the meter's figure goes up, for the fare to be reached a little before the stop (s). */
function meterTicks(fare: number): number[] {
  const span = RIDE.doorAt - 0.8;
  return Array.from({ length: fare }, (_, i) => 0.5 + ((i + 1) / fare) * (span - 0.5));
}

/**
 * The ride from the back seat (`taxiRideScene`): the road through the windscreen, the town past the side windows,
 * the driver's head over the front seat and their eyes in the mirror, the pine tree swinging; on the dash, the meter
 * ticking up to the fare in red digits and the card with where to; what the driver says in a balloon from their
 * seat. Engine, indicator, meter clicks and the door (`audio/taxiRideSounds`). A key, a click, a tap or a
 * controller's button skips it; with reduced motion the town stands still and the meter shows the fare at once.
 */
class TaxiRide {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly scene: TaxiRideScene;
  private readonly meter: HTMLElement;
  private readonly balloon: HTMLElement;
  private readonly sound: TaxiSound | null;
  private readonly ticks: number[];
  private readonly still = reduceMotion();
  private readonly started = performance.now();
  private readonly padDown = new Set<string>();
  private travelled = 0;
  private last = 0;
  private frame = 0;
  private skippedAt: number | null = null;
  private done = false;

  constructor(container: HTMLElement, private readonly options: TaxiRideOptions, private readonly resolve: () => void) {
    this.root = document.createElement('div');
    this.root.className = `taxi-ride${options.night ? ' taxi-ride--night' : ''}`;
    const device = lastDevice();
    const skip = device === 'touch' ? html`Tap to skip` : html`Skip <kbd>${device === 'gamepad' ? 'A' : actionKeyLabel('putBack')}</kbd>`;
    paint(
      this.root,
      html`<canvas class="taxi-ride__view" aria-hidden="true"></canvas>
      <div class="taxi-ride__card" aria-label="${`Where to: ${options.to}`}"><span class="taxi-ride__card-head">Fare to</span><span class="taxi-ride__card-to">${options.to}</span></div>
      <div class="taxi-ride__meter" role="img" aria-label="${`The meter, up to ${formatCoins(options.fare)}`}">
        <span class="taxi-ride__meter-flag">HIRED</span>
        <span class="taxi-ride__meter-digits">0</span>
        <span class="taxi-ride__meter-unit">coins</span>
      </div>
      <p class="taxi-ride__balloon">${options.chat}</p>
      <p class="taxi-ride__skip">${skip}</p>`,
    );
    this.canvas = this.root.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d');
    this.meter = this.root.querySelector('.taxi-ride__meter-digits')!;
    this.balloon = this.root.querySelector('.taxi-ride__balloon')!;
    container.appendChild(this.root);
    this.scene = new TaxiRideScene(Math.floor(options.fare * 131 + options.to.length * 17), CABBIE.seed);
    this.ticks = meterTicks(options.fare);
    this.sound = playTaxiSound({
      seconds: RIDE.seconds,
      speed: this.still ? () => 0 : speedAt,
      ticks: this.still ? [] : this.ticks,
      indicators: [
        [0.15, 1.1],
        [RIDE.doorAt - 1.9, RIDE.doorAt - 0.4],
      ],
      doorAt: RIDE.doorAt,
    });
    // In the capture phase, ahead of the game's keys and clicks: nothing else acts while the ride plays.
    window.addEventListener('keydown', this.onKey, { capture: true }); // convention-ok: not a panel (the ride plays over the travel curtain, ahead of the game's keys)
    window.addEventListener('mousedown', this.onClick, { capture: true });
    window.addEventListener('touchstart', this.onClick, { capture: true, passive: false });
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.readPad(false);
    this.frame = requestAnimationFrame(this.tick);
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    event.stopImmediatePropagation();
    if (event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    if ((SKIP_KEYS.has(event.code) || isAction(event.code, 'putBack')) && !event.repeat) this.skip();
  };

  private readonly onClick = (event: MouseEvent | TouchEvent): void => {
    event.stopImmediatePropagation();
    event.preventDefault();
    this.skip();
  };

  private readonly onResize = (): void => {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(window.innerWidth * ratio);
    this.canvas.height = Math.round(window.innerHeight * ratio);
  };

  /** The controllers' buttons: one newly pressed skips (`skips` false: only noted, at the start). */
  private readPad(skips: boolean): void {
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      pad.buttons.forEach((button, i) => {
        const id = `${pad.index}:${i}`;
        if (!button.pressed) this.padDown.delete(id);
        else if (!this.padDown.has(id)) {
          this.padDown.add(id);
          if (skips) this.skip();
        }
      });
    }
  }

  private skip(): void {
    if (this.skippedAt !== null || this.done) return;
    this.skippedAt = this.clock();
    this.sound?.stop();
  }

  private clock(): number {
    return (performance.now() - this.started) / 1000;
  }

  private readonly tick = (): void => {
    if (this.done) return;
    const t = this.clock();
    this.readPad(true);
    const dt = Math.min(0.1, t - this.last);
    this.last = t;
    const speed = this.still ? 0 : speedAt(t);
    this.travelled += speed * CRUISE * dt;
    if (this.ctx) this.scene.draw(this.ctx, this.canvas.width, this.canvas.height, { t: this.still ? 0 : t, travelled: this.travelled, speed, daylight: this.options.night ? 0.08 : 1 });
    // The meter: each figure up on its tick (all at once when nothing moves).
    const shown = this.still ? this.options.fare : this.ticks.filter((at) => at <= t).length;
    const text = String(shown);
    if (this.meter.textContent !== text) {
      this.meter.textContent = text;
      this.meter.classList.remove('is-ticked');
      void this.meter.offsetWidth;
      this.meter.classList.add('is-ticked');
    }
    if (t >= RIDE.chatAt) this.balloon.classList.add('is-said');
    const end = this.skippedAt === null ? RIDE.seconds : this.skippedAt + SKIP_S;
    const fadeOut = this.skippedAt === null ? ramp(t, RIDE.seconds - RIDE.fade, RIDE.seconds) : ramp(t, this.skippedAt, end);
    const black = Math.max(1 - ramp(t, 0, RIDE.fade), fadeOut);
    this.root.style.setProperty('--taxi-ride-black', black.toFixed(3));
    if (t >= end) {
      this.finish();
      return;
    }
    this.frame = requestAnimationFrame(this.tick);
  };

  private finish(): void {
    this.done = true;
    cancelAnimationFrame(this.frame);
    window.removeEventListener('keydown', this.onKey, { capture: true });
    window.removeEventListener('mousedown', this.onClick, { capture: true });
    window.removeEventListener('touchstart', this.onClick, { capture: true });
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
    this.resolve();
  }
}
