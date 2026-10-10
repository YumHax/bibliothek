import * as THREE from 'three';
import { readMs } from './readingTime';
import { noteSaid } from './speechLog';

/** How a line is said: to the player (named, queued, kept until read) or in passing (a word to nobody). */
export interface SpeechOptions {
  /** Said to the player: the speaker's name on it, a line after another instead of over it, a subtitle when the speaker is out of view. */
  addressed?: boolean;
  name?: string;
  /** How long a line in passing stays (s); a line to the player stays its reading time. */
  seconds?: number;
  /** Called when the line actually shows (after the lines queued before it): the speaker's murmur and nod start then. */
  onShow?: () => void;
}

interface Line {
  text: string;
  name?: string;
  addressed: boolean;
  ms: number;
  onShow?: () => void;
}

interface Bubble {
  /** Null for a voice without a body: always a subtitle. */
  anchor: THREE.Object3D | null;
  el: HTMLDivElement;
  current: Line | null;
  queue: Line[];
  left: number;
  /** 'world': over the head; 'subtitle': in the strip at the bottom; 'hidden': out of view, in passing. */
  place: 'world' | 'subtitle' | 'hidden';
  /** A wall between the eye and the speaker, checked every `SIGHT_S` (a bubble is not drawn over a wall). */
  hiddenByWall: boolean;
  sightAge: number;
}

/** Past this, a line in passing is not heard (m). */
const AMBIENT_RANGE = 14;
/** Past this, a line to the player goes to the subtitles (m). */
const ADDRESSED_RANGE = 22;
/** Kept this far from the screen's edges (px) to count as in view. */
const MARGIN_X = 60;
const MARGIN_TOP = 70;
const MARGIN_BOTTOM = 90;
const QUEUE_MAX = 4;
/** Lines queued for one voice beyond this many are dropped oldest first; a subtitle strip holds at most this many voices. */
const SUBTITLES_MAX = 3;
const FADE_MS = 260;
/** A bubble over a head leaves for the subtitles this much further out than it came in (px), so it does not flicker at the edge. */
const EDGE_HYSTERESIS = 30;
/** How often a bubble checks for a wall between the eye and the speaker (s). */
const SIGHT_S = 0.2;

const world = new THREE.Vector3();
const view = new THREE.Vector3();

/**
 * THE SPEECH: what people say, where they are. A line from someone in view is a bubble over their
 * head (HTML, so it reads at any distance and in any light), the speaker's name on it when it is
 * said to the player; out of view, or from a voice without a body, a line to the player goes to the
 * subtitle strip at the bottom of the screen, named. A line to the player waits for the one before
 * it and stays its reading time; a word in passing replaces the last and is dropped out of view.
 * An `Updatable`-style `update(dt, attending)` places the bubbles each frame.
 */
export class SpeechLayer {
  private readonly layer: HTMLDivElement;
  private readonly subtitles: HTMLDivElement;
  private readonly bubbles = new Map<THREE.Object3D | string, Bubble>();
  /** True when a wall stands between the eye and a point (world); none set: nothing hides a speaker. */
  private blocked: ((from: THREE.Vector3, to: THREE.Vector3) => boolean) | null = null;
  private readonly eye = new THREE.Vector3();
  /** A conversation is going on: a line to the player replaces the speaker's current one (`converse`). */
  private conversing = false;

  constructor(container: HTMLElement, private readonly camera: THREE.Camera) {
    this.layer = document.createElement('div');
    this.layer.className = 'speech-layer';
    this.subtitles = document.createElement('div');
    this.subtitles.className = 'subtitles';
    this.subtitles.setAttribute('role', 'log');
    this.subtitles.setAttribute('aria-live', 'polite');
    // The bubbles go first in the page: the crosshair's caption and reaction (same layer, later) draw over them.
    container.prepend(this.layer);
    container.append(this.subtitles);
  }

  /** `anchor` says `text`: a point over a head, followed while the line lasts. */
  speak(anchor: THREE.Object3D, text: string, options: SpeechOptions = {}): void {
    this.enqueue(anchor, text, options);
  }

  /** A voice without a body: `name` on the subtitle. */
  voice(text: string, name?: string): void {
    this.enqueue(null, text, { addressed: true, name });
  }

  /** While on (a conversation is open), a line to the player takes the speaker's bubble at once instead of waiting its turn. */
  converse(on: boolean): void {
    this.conversing = on;
  }

  /** What hides a speaker behind a wall (the interactor's occluders). */
  setLineOfSight(blocked: (from: THREE.Vector3, to: THREE.Vector3) => boolean): void {
    this.blocked = blocked;
  }

  /** The subtitle strip cleared by hand (docs/notices.md): the lines in it and those waiting behind them go. False when it was empty. */
  clearSubtitles(): boolean {
    let cleared = false;
    for (const [key, bubble] of this.bubbles) {
      if (bubble.place !== 'subtitle' || !bubble.current) continue;
      bubble.queue.length = 0;
      this.next(key, bubble);
      cleared = true;
    }
    return cleared;
  }

  update(dt: number, attending: boolean): void {
    const ms = attending ? dt * 1000 : 0;
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const [key, bubble] of this.bubbles) {
      const line = bubble.current;
      if (!line) continue;
      bubble.left -= ms;
      if (bubble.left <= 0) {
        this.next(key, bubble);
        continue;
      }
      bubble.sightAge += dt;
      this.place(bubble, line, w, h);
    }
  }

  private enqueue(anchor: THREE.Object3D | null, text: string, options: SpeechOptions): void {
    if (!text) return;
    const addressed = options.addressed === true;
    if (addressed) noteSaid({ name: options.name, text }); // to read again under the pause menu's "What was said"
    const key = anchor ?? `voice:${options.name ?? ''}`;
    const line: Line = { text, name: options.name, addressed, ms: addressed ? readMs(text) : Math.max((options.seconds ?? 2.2) * 1000, readMs(text) * 0.7), onShow: options.onShow };
    let bubble = this.bubbles.get(key);
    if (!bubble) {
      const el = document.createElement('div');
      el.className = 'speech';
      bubble = { anchor, el, current: null, queue: [], left: 0, place: 'hidden', hiddenByWall: false, sightAge: Infinity };
      this.bubbles.set(key, bubble);
    }
    if (bubble.current?.addressed) {
      // Someone talking to the player is not talked over: a line to the player waits its turn, a word in passing is dropped.
      if (!addressed) return;
      // In a conversation the newest answer is the one that matters: it replaces the line said and those waiting.
      if (this.conversing) {
        bubble.queue.length = 0;
        this.show(bubble, line);
        return;
      }
      bubble.queue.push(line);
      if (bubble.queue.length > QUEUE_MAX) bubble.queue.shift();
      return;
    }
    this.show(bubble, line);
  }

  private show(bubble: Bubble, line: Line): void {
    bubble.current = line;
    bubble.left = line.ms;
    line.onShow?.();
    const { el } = bubble;
    el.replaceChildren();
    el.className = `speech${line.addressed ? ' speech--addressed' : ' speech--passing'}`;
    if (line.name) {
      const name = document.createElement('span');
      name.className = 'speech__name';
      name.textContent = line.name;
      el.appendChild(name);
    }
    const text = document.createElement('span');
    text.className = 'speech__text';
    text.textContent = line.text;
    el.appendChild(text);
    // Restart the pop-in for a new line in the same bubble.
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    bubble.place = 'hidden';
    bubble.sightAge = Infinity;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.place(bubble, line, w, h);
  }

  private next(key: THREE.Object3D | string, bubble: Bubble): void {
    const line = bubble.queue.shift();
    if (line) {
      this.show(bubble, line);
      return;
    }
    bubble.current = null;
    this.bubbles.delete(key);
    const el = bubble.el;
    el.classList.add('speech--out');
    window.setTimeout(() => el.remove(), FADE_MS);
  }

  /** Over the head when the head is in view and near enough, else the subtitles (a line to the player) or nowhere. */
  private place(bubble: Bubble, line: Line, w: number, h: number): void {
    let where: Bubble['place'] = line.addressed ? 'subtitle' : 'hidden';
    let x = 0;
    let y = 0;
    let scale = 1;
    const anchor = bubble.anchor;
    if (anchor && shown(anchor)) {
      anchor.getWorldPosition(world);
      view.copy(world).applyMatrix4(this.camera.matrixWorldInverse);
      const distance = view.length();
      const range = line.addressed ? ADDRESSED_RANGE : AMBIENT_RANGE;
      if (view.z < -0.2 && distance < range) {
        world.project(this.camera);
        x = ((world.x + 1) / 2) * w;
        y = ((1 - world.y) / 2) * h;
        // Already over the head, it stays a little further out than it came in.
        const slack = bubble.place === 'world' ? EDGE_HYSTERESIS : 0;
        const inView = x > MARGIN_X - slack && x < w - MARGIN_X + slack && y > MARGIN_TOP - slack && y < h - MARGIN_BOTTOM + slack;
        if (inView && this.blocked && bubble.sightAge >= SIGHT_S) {
          bubble.sightAge = 0;
          anchor.getWorldPosition(world);
          this.camera.getWorldPosition(this.eye);
          bubble.hiddenByWall = this.blocked(this.eye, world);
        }
        if (inView && !bubble.hiddenByWall) {
          where = 'world';
          scale = Math.min(1.05, Math.max(0.72, 3.5 / distance));
        }
      }
    }
    if (where !== bubble.place) {
      bubble.place = where;
      const el = bubble.el;
      el.classList.toggle('speech--subtitle', where === 'subtitle');
      if (where === 'world') {
        // Back from the subtitles while its old strip place was fading: it shows again.
        el.classList.remove('speech--leaving', 'speech--out');
        this.layer.appendChild(el);
      } else if (where === 'subtitle') {
        el.style.transform = '';
        if (el.classList.contains('speech--leaving')) el.classList.remove('speech--leaving', 'speech--out');
        this.subtitles.appendChild(el);
        // Past the strip's lines, the oldest fades out (not cut) to make room.
        const staying = [...this.subtitles.children].filter((child) => !child.classList.contains('speech--leaving'));
        for (const old of staying.slice(0, Math.max(0, staying.length - SUBTITLES_MAX))) {
          old.classList.add('speech--leaving', 'speech--out');
          window.setTimeout(() => {
            if (old.classList.contains('speech--leaving')) old.remove();
          }, FADE_MS);
        }
      } else {
        el.remove();
      }
    }
    if (where === 'world') bubble.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%) scale(${scale.toFixed(3)})`;
  }
}

/** In the scene and drawn: every parent visible, up to a scene. */
function shown(object: THREE.Object3D): boolean {
  let o: THREE.Object3D | null = object;
  let last: THREE.Object3D = object;
  while (o) {
    if (!o.visible) return false;
    last = o;
    o = o.parent;
  }
  return (last as THREE.Scene).isScene === true;
}
