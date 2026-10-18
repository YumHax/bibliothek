import * as THREE from 'three';
import { QUALITY } from './quality';
import './readingDim.css';

/*
 * The room dimmed round the box being examined (`world/box/ReadingLight` sets it each frame): everything but a soft
 * disc round the box goes a little darker, as a reading lamp leaves the rest of the room in shade. With the post
 * chain (medium, high) `PostFx`'s output pass draws it, before the grain, keeping the video cut-out's alpha; on low
 * (no post passes) a CSS veil over the canvas does, under the HUD.
 */

/** How dark the room goes at most (0..1 of its brightness taken off). */
const MAX_DIM = 0.5;

/** Where the disc is (the canvas's uv, y up), how big (a share of the view's height) and how dim the rest is (0..1). */
interface ReadingDim {
  amount: number;
  at: THREE.Vector2;
  radius: number;
}

const state: ReadingDim = { amount: 0, at: new THREE.Vector2(0.5, 0.5), radius: 0.3 };
let veil: HTMLElement | null = null;

/** The dim this frame: `amount` 0..1 (eased by the caller), the disc at `x`, `y` (uv, y up) of `radius` (share of the height). */
export function setReadingDim(amount: number, x: number, y: number, radius: number): void {
  state.amount = THREE.MathUtils.clamp(amount, 0, 1) * MAX_DIM;
  state.at.set(x, y);
  state.radius = radius;
  if (!QUALITY.postFx) paintVeil();
  else if (veil && !veil.hidden) veil.hidden = true; // the quality raised mid-dim: the post pass draws it from now on
}

/** What `PostFx` darkens this frame. */
export function readingDim(): Readonly<ReadingDim> {
  return state;
}

/** Low quality: the CSS veil, made on first need, its disc and opacity set from the state. */
function paintVeil(): void {
  if (state.amount <= 0.001) {
    if (veil) veil.hidden = true;
    return;
  }
  if (!veil) {
    veil = document.createElement('div');
    veil.className = 'reading-dim';
    veil.setAttribute('aria-hidden', 'true');
    // After the canvas, at its level: over the room, under every HUD element.
    document.body.append(veil);
  }
  veil.hidden = false;
  veil.style.setProperty('--reading-x', `${(state.at.x * 100).toFixed(2)}%`);
  veil.style.setProperty('--reading-y', `${((1 - state.at.y) * 100).toFixed(2)}%`);
  veil.style.setProperty('--reading-r', `${(state.radius * 100).toFixed(2)}vh`);
  veil.style.setProperty('--reading-dim', state.amount.toFixed(3));
}
