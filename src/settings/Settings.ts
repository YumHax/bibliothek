import { clamp } from '@/math/scalar';
import { KEYS, PersistedStore } from '@/persistence';

const SETTINGS_STORAGE_KEY = KEYS.settings;

/** The mixer's buses under the master volume (see `audio/mixer`). */
export type VolumeChannel = 'master' | 'screens' | 'arcade' | 'world' | 'ui';
const VOLUME_CHANNELS: readonly VolumeChannel[] = ['master', 'screens', 'arcade', 'world', 'ui'];

export type UiScale = 'small' | 'normal' | 'large';
export const UI_SCALES: readonly UiScale[] = ['small', 'normal', 'large'];
/** Settings > Display > Text size: the speech's three sizes, and two more for the whole interface. */
export type TextSize = UiScale | 'larger' | 'largest';
export const TEXT_SIZES: readonly TextSize[] = ['small', 'normal', 'large', 'larger', 'largest'];

/** Settings > Display: motion as the system asks, or cut, or kept whatever the system says. */
export type MotionMode = 'system' | 'reduce' | 'full';
export const MOTION_MODES: readonly MotionMode[] = ['system', 'reduce', 'full'];
/** Settings > Display: how long speech and notes stay up, over the time it takes to read them. */
export type ReadingPace = 'normal' | 'longer' | 'longest';
export const READING_PACES: readonly ReadingPace[] = ['normal', 'longer', 'longest'];
/** Settings > Display > Resolution: the GPU decides (`AdaptiveResolution`), or a fixed share of the screen's pixels. */
export type RenderScale = 'auto' | 'full' | 'threeQuarters' | 'half';
export const RENDER_SCALES: readonly RenderScale[] = ['auto', 'full', 'threeQuarters', 'half'];
/** Settings > Display > Frame rate: the quality level's cap, 30, 60, or every refresh of the screen. */
export type FrameCap = 'auto' | 'fps30' | 'fps60' | 'off';
export const FRAME_CAPS: readonly FrameCap[] = ['auto', 'fps30', 'fps60', 'off'];
/** Settings > Display > Brightness, a multiplier of the frame's exposure. */
export const BRIGHTNESS_RANGE = { min: 0.6, max: 1.6 } as const;

/** Settings > Controls: sprint while Shift is held (the crouch then on Z), or on a double tap of forward (Shift crouches). */
export type SprintMode = 'doubleTap' | 'hold';
export const SPRINT_MODES: readonly SprintMode[] = ['doubleTap', 'hold'];
/** Settings > Controls: crouch while the key is held, or a press to crouch and another to stand. */
export type CrouchMode = 'hold' | 'toggle';
export const CROUCH_MODES: readonly CrouchMode[] = ['hold', 'toggle'];

/** The player's preferences: how the view feels, what is heard, what the HUD shows, which key does what. */
export interface GameSettings {
  /** Multiplier of the mouse look (1 = three.js's default 0.002 rad per pixel). */
  mouseSensitivity: number;
  /** Multiplier of the right stick's look speed. */
  padSensitivity: number;
  /** Multiplier of the touch drag look. */
  touchSensitivity: number;
  /** Pushing up looks down, for every device. */
  invertY: boolean;
  /** Vertical field of view, degrees. */
  fov: number;
  volume: Record<VolumeChannel, number>;
  crosshair: boolean;
  /** The caption naming what the crosshair is on. */
  hoverLabel: boolean;
  uiScale: TextSize;
  /** The handwriting, the comic speech and the marker drawn in the plain face (easier to read). */
  plainLettering: boolean;
  /** How long speech and notes stay up (`notices/readingTime`). */
  readingPace: ReadingPace;
  /**
   * Cuts the menus' and panels' animations (and the head bob, the eased sit, the flash: `settings/motion`): as the
   * system asks, always, or never.
   */
  reduceMotion: MotionMode;
  /** The frame's exposure times this (`graphics/brightness`). */
  brightness: number;
  renderScale: RenderScale;
  frameCap: FrameCap;
  sprintMode: SprintMode;
  crouchMode: CrouchMode;
  /** A few millimetres of bob with the stride. */
  headBob: boolean;
  /** The size of the speech bubbles and subtitles, over the interface's text size. */
  speechSize: UiScale;
  /** The "how to" tips top left (the first day's to-do list included). */
  showTips: boolean;
  /**
   * Settings > Display: the room fills the screen (asked on the click that enters it), and Esc is the game's
   * (`navigator.keyboard.lock`): a press closes the card or panel first, a long press still leaves.
   */
  fullscreen: boolean;
  /** Rebound keys, physical `KeyboardEvent.code` -> the code the game reads (see `Input.setBindings`). */
  bindings: Record<string, string>;
}

const DEFAULT_SETTINGS: Readonly<GameSettings> = {
  mouseSensitivity: 1,
  padSensitivity: 1,
  touchSensitivity: 1,
  invertY: false,
  fov: 70,
  volume: { master: 0.9, screens: 1, arcade: 1, world: 1, ui: 0.6 },
  crosshair: true,
  hoverLabel: true,
  uiScale: 'normal',
  plainLettering: false,
  readingPace: 'normal',
  reduceMotion: 'system',
  brightness: 1,
  renderScale: 'auto',
  frameCap: 'auto',
  sprintMode: 'hold',
  crouchMode: 'hold',
  headBob: true,
  speechSize: 'normal',
  showTips: true,
  fullscreen: false,
  bindings: {},
};

export const SENSITIVITY_RANGE = { min: 0.2, max: 3 } as const;
export const FOV_RANGE = { min: 55, max: 100 } as const;

/** A slider dragged writes the settings once it rests this long (ms), not on every step. */
const SAVE_DEBOUNCE_MS = 400;

/**
 * The player's settings, persisted (`KEYS.settings`, a preference: a new game keeps it). Every change is told to the
 * subscribers at once, which apply it live (the camera, the mixer, the HUD, the key bindings), and saved a moment
 * later (a slider's drag is one write; leaving the page writes what is pending).
 */
export class SettingsStore {
  private current: GameSettings;
  private readonly listeners = new Set<(settings: GameSettings) => void>();
  private readonly store: PersistedStore<GameSettings>;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(key: string = SETTINGS_STORAGE_KEY) {
    // Version 1: the settings object (bare JSON before versions were kept); a missing field takes its default.
    // Version 2: Shift sprints by default; a version-1 save still on the old defaults (double tap, Shift held to crouch) moves over.
    this.store = new PersistedStore<GameSettings>({ key, version: 2, defaults: () => structuredClone(DEFAULT_SETTINGS) as GameSettings, read: readSettings, migrate: { 1: shiftSprints } });
    this.current = this.store.load();
    if (typeof window !== 'undefined') window.addEventListener('pagehide', () => this.flush());
  }

  get settings(): Readonly<GameSettings> {
    return this.current;
  }

  /** Calls `cb` now and on every change. Returns an unsubscribe function. */
  subscribe(cb: (settings: GameSettings) => void): () => void {
    this.listeners.add(cb);
    cb(this.current);
    return () => this.listeners.delete(cb);
  }

  update(patch: Partial<GameSettings>): void {
    this.current = sanitize({ ...this.current, ...patch, volume: { ...this.current.volume, ...patch.volume } });
    this.save();
    for (const cb of this.listeners) cb(this.current);
  }

  setVolume(channel: VolumeChannel, value: number): void {
    this.update({ volume: { ...this.current.volume, [channel]: value } });
  }

  /** Back to the defaults, except the key bindings unless `keys` (they have their own reset). */
  reset(keys = false): void {
    this.update({ ...structuredClone(DEFAULT_SETTINGS), bindings: keys ? {} : this.current.bindings });
  }

  private save(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), SAVE_DEBOUNCE_MS);
  }

  /** Writes a pending change now. */
  flush(): void {
    if (this.saveTimer === undefined) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = undefined;
    this.store.save(this.current);
  }
}

/** Version 1 -> 2: a player who never touched the walk keys (double tap to sprint, Shift held to crouch) gets Shift to sprint. */
function shiftSprints(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data;
  const old = data as Partial<GameSettings>;
  const untouched = (old.sprintMode ?? 'doubleTap') === 'doubleTap' && (old.crouchMode ?? 'hold') === 'hold';
  return untouched ? { ...old, sprintMode: 'hold' } : data;
}

/** Saved settings over the defaults, each field checked; null when what was saved is not a settings object at all. */
function readSettings(data: unknown): GameSettings | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const stored = data as Partial<GameSettings>;
  return sanitize({ ...(structuredClone(DEFAULT_SETTINGS) as GameSettings), ...stored, volume: { ...DEFAULT_SETTINGS.volume, ...stored.volume } });
}

/** A saved value read back as a finite number held within `min`..`max`, or `fallback` when it is not a number at all. */
function numberIn(value: unknown, min: number, max: number, fallback: number): number {
  return clamp(typeof value === 'number' && Number.isFinite(value) ? value : fallback, min, max);
}

function sanitize(s: GameSettings): GameSettings {
  const d = DEFAULT_SETTINGS;
  const { min, max } = SENSITIVITY_RANGE;
  const volume = Object.fromEntries(VOLUME_CHANNELS.map((c) => [c, numberIn(s.volume?.[c], 0, 1, d.volume[c])])) as Record<VolumeChannel, number>;
  const bindings = Object.fromEntries(
    Object.entries(s.bindings && typeof s.bindings === 'object' ? s.bindings : {}).filter(([k, v]) => typeof k === 'string' && typeof v === 'string' && k !== v),
  );
  return {
    mouseSensitivity: numberIn(s.mouseSensitivity, min, max, d.mouseSensitivity),
    padSensitivity: numberIn(s.padSensitivity, min, max, d.padSensitivity),
    touchSensitivity: numberIn(s.touchSensitivity, min, max, d.touchSensitivity),
    invertY: s.invertY === true,
    fov: numberIn(s.fov, FOV_RANGE.min, FOV_RANGE.max, d.fov),
    volume,
    crosshair: s.crosshair !== false,
    hoverLabel: s.hoverLabel !== false,
    uiScale: TEXT_SIZES.includes(s.uiScale) ? s.uiScale : d.uiScale,
    plainLettering: s.plainLettering === true,
    readingPace: READING_PACES.includes(s.readingPace) ? s.readingPace : d.readingPace,
    // Saved as a switch before the three-way choice: on was "reduce", off followed the system.
    reduceMotion: (s.reduceMotion as unknown) === true ? 'reduce' : MOTION_MODES.includes(s.reduceMotion) ? s.reduceMotion : d.reduceMotion,
    brightness: numberIn(s.brightness, BRIGHTNESS_RANGE.min, BRIGHTNESS_RANGE.max, d.brightness),
    renderScale: RENDER_SCALES.includes(s.renderScale) ? s.renderScale : d.renderScale,
    frameCap: FRAME_CAPS.includes(s.frameCap) ? s.frameCap : d.frameCap,
    sprintMode: SPRINT_MODES.includes(s.sprintMode) ? s.sprintMode : d.sprintMode,
    crouchMode: CROUCH_MODES.includes(s.crouchMode) ? s.crouchMode : d.crouchMode,
    headBob: s.headBob !== false,
    speechSize: UI_SCALES.includes(s.speechSize) ? s.speechSize : d.speechSize,
    showTips: s.showTips !== false,
    fullscreen: s.fullscreen === true,
    bindings,
  };
}
