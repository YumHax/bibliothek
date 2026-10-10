import './BusRide.css';
import { playBusRide, type RideSound } from '@/audio/busRideSounds';
import { clamp, ramp, smooth } from '@/math/scalar';
import { actionKeyLabel } from '@/ui/keys';
import { BusRideScene } from './busRideScene';

/*
 * THE BUS RIDE (docs/story.md "Mémé"): the trip on line 38 between Front Street and Mémé's, played while the travel
 * curtain is down (`Travel`'s interlude) and the far zone builds behind it. The player is on a seat by the window,
 * the town goes past (`busRideScene`), someone presses the STOP button, the bus pulls in, the doors open: the black
 * comes back and the curtain lifts on the other end. Any of the skip keys or a click cuts it short; with reduced
 * motion there is no ride, only the curtain (the caller asks `reduceMotion` first).
 */

/** The ride's clock (s): its length, the fade in and out, how long the bus takes to get going and to pull in, the bell, the doors. */
const RIDE = { seconds: 10.5, fade: 0.7, pullAway: 2.2, pullIn: 3.2, bellAt: 5.2, doorsAt: 9.4 } as const;
/** Cruising speed (m/s): how fast the town goes past at full speed. */
const CRUISE = 11;
/** The keys that cut it short (physical codes, docs: never `event.key`). */
const SKIP_KEYS = new Set(['KeyE', 'Escape', 'Space', 'Enter']);
/** A skip's fade to black (s). */
const SKIP_FADE = 0.3;

/** What the ride shows: what the display reads, and the light of the hour. */
interface RideOptions {
  /** The display over the window: "38 LINDEN AVENUE". */
  board: string;
  /** 0 night .. 1 day (`DayNight.state.daylight`), and the game hour (the dusk's colours). */
  daylight: number;
  hours: number;
  /** A seed for the town drawn past the window (a ride there and back are not the same street). */
  seed: number;
}

/** Plays a ride in `container`, over everything; resolves once it has ended in black (played out or skipped). */
export function playRide(container: HTMLElement, options: RideOptions): Promise<void> {
  return new Promise((resolve) => new BusRide(container, options, resolve));
}

/** The speed at `t` (0..1): pulling away, cruising, pulling in to a stand before the doors open. */
function speedAt(t: number): number {
  const stopAt = RIDE.doorsAt - 0.3;
  const away = smooth(ramp(t, 0.3, 0.3 + RIDE.pullAway));
  const pull = 1 - smooth(ramp(t, stopAt - RIDE.pullIn, stopAt));
  return clamp(Math.min(away, pull), 0, 1);
}

/** How dusky the hour is: sunrise round 7:30, sunset round 19:30 (0..1). */
function duskAt(hours: number): number {
  return Math.max(0, 1 - Math.abs(hours - 19.5) / 1.6, 1 - Math.abs(hours - 7.3) / 1.2);
}

class BusRide {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly scene: BusRideScene;
  private readonly sound: RideSound | null;
  private readonly started = performance.now();
  private travelled = 0;
  private last = 0;
  private frame = 0;
  /** The ride's clock when a skip was asked (it fades out from there), or null. */
  private skippedAt: number | null = null;
  private done = false;

  constructor(container: HTMLElement, private readonly options: RideOptions, private readonly resolve: () => void) {
    this.root = document.createElement('div');
    this.root.className = 'bus-ride';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bus-ride__view';
    this.ctx = this.canvas.getContext('2d');
    const skip = document.createElement('p');
    skip.className = 'bus-ride__skip';
    const key = document.createElement('kbd');
    // E, not Esc: under the pointer lock Esc also lets the mouse go, and the curtain would lift on the pause menu.
    key.textContent = actionKeyLabel('putBack');
    skip.append('Skip ', key);
    this.root.append(this.canvas, skip);
    container.appendChild(this.root);
    this.scene = new BusRideScene(options.seed);
    this.sound = playBusRide({ seconds: RIDE.seconds, speed: speedAt, bellAt: RIDE.bellAt, doorsAt: RIDE.doorsAt });
    // In the capture phase, ahead of the game's own keys and clicks: nothing else acts while the ride plays.
    window.addEventListener('keydown', this.onKey, { capture: true }); // convention-ok: not a panel (the ride plays over the travel curtain, ahead of the game's keys)
    window.addEventListener('mousedown', this.onClick, { capture: true });
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.frame = requestAnimationFrame(this.tick);
  }

  private readonly onKey = (event: KeyboardEvent): void => {
    event.stopImmediatePropagation();
    // The browser's own shortcuts (reload, quit, tabs) still reach it; only the game is kept out.
    if (event.metaKey || event.ctrlKey) return;
    event.preventDefault();
    if (SKIP_KEYS.has(event.code) && !event.repeat) this.skip();
  };

  private readonly onClick = (event: MouseEvent): void => {
    event.stopImmediatePropagation();
    event.preventDefault();
    this.skip();
  };

  private readonly onResize = (): void => {
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(window.innerWidth * ratio);
    this.canvas.height = Math.round(window.innerHeight * ratio);
  };

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
    const dt = Math.min(0.1, t - this.last);
    this.last = t;
    const speed = speedAt(t);
    this.travelled += speed * CRUISE * dt;
    const { width, height } = this.canvas;
    if (this.ctx) {
      this.scene.draw(this.ctx, width, height, {
        t,
        travelled: this.travelled,
        speed,
        stopping: t >= RIDE.bellAt,
        daylight: clamp(this.options.daylight, 0, 1),
        dusk: duskAt(this.options.hours),
        board: this.options.board,
      });
    }
    // The black: up at the start, down at the end (or from a skip, quicker).
    const end = this.skippedAt === null ? RIDE.seconds : this.skippedAt + SKIP_FADE;
    const fadeOut = this.skippedAt === null ? ramp(t, RIDE.seconds - RIDE.fade, RIDE.seconds) : ramp(t, this.skippedAt, end);
    const black = Math.max(1 - ramp(t, 0, RIDE.fade), fadeOut);
    this.root.style.setProperty('--bus-ride-black', black.toFixed(3));
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
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
    this.resolve();
  }
}
