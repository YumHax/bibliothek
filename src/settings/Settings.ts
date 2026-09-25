import { KEYS, PersistedStore } from '@/persistence';

export const SETTINGS_STORAGE_KEY = KEYS.settings;

/** The mixer's buses under the master volume (see `audio/mixer`). */
export type VolumeChannel = 'master' | 'screens' | 'arcade' | 'world' | 'ui';
export const VOLUME_CHANNELS: readonly VolumeChannel[] = ['master', 'screens', 'arcade', 'world', 'ui'];

export type UiScale = 'small' | 'normal' | 'large';
export const UI_SCALES: readonly UiScale[] = ['small', 'normal', 'large'];

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
  uiScale: UiScale;
  /** Cuts the menus' and panels' animations, whatever the system says. */
  reduceMotion: boolean;
  /** Rebound keys, physical `KeyboardEvent.code` -> the code the game reads (see `Input.setBindings`). */
  bindings: Record<string, string>;
}

export const DEFAULT_SETTINGS: Readonly<GameSettings> = {
  mouseSensitivity: 1,
  padSensitivity: 1,
  touchSensitivity: 1,
  invertY: false,
  fov: 70,
  volume: { master: 0.9, screens: 1, arcade: 1, world: 1, ui: 0.6 },
  crosshair: true,
  hoverLabel: true,
  uiScale: 'normal',
  reduceMotion: false,
  bindings: {},
};

export const SENSITIVITY_RANGE = { min: 0.2, max: 3 } as const;
export const FOV_RANGE = { min: 55, max: 100 } as const;

/**
 * The player's settings, persisted (`KEYS.settings`, a preference: a new game keeps it). Every change is saved and told to the
 * subscribers, which apply it live (the camera, the mixer, the HUD, the key bindings).
 */
export class SettingsStore {
  private current: GameSettings;
  private readonly listeners = new Set<(settings: GameSettings) => void>();
  private readonly store: PersistedStore<GameSettings>;

  constructor(key: string = SETTINGS_STORAGE_KEY) {
    // Version 1: the settings object (bare JSON before versions were kept); a missing field takes its default.
    this.store = new PersistedStore<GameSettings>({ key, version: 1, defaults: () => structuredClone(DEFAULT_SETTINGS) as GameSettings, read: readSettings });
    this.current = this.store.load();
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
    this.store.save(this.current);
  }
}

/** Saved settings over the defaults, each field checked; null when what was saved is not a settings object at all. */
function readSettings(data: unknown): GameSettings | null {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const stored = data as Partial<GameSettings>;
  return sanitize({ ...(structuredClone(DEFAULT_SETTINGS) as GameSettings), ...stored, volume: { ...DEFAULT_SETTINGS.volume, ...stored.volume } });
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, n));
}

function sanitize(s: GameSettings): GameSettings {
  const d = DEFAULT_SETTINGS;
  const { min, max } = SENSITIVITY_RANGE;
  const volume = Object.fromEntries(VOLUME_CHANNELS.map((c) => [c, clamp(s.volume?.[c], 0, 1, d.volume[c])])) as Record<VolumeChannel, number>;
  const bindings = Object.fromEntries(
    Object.entries(s.bindings && typeof s.bindings === 'object' ? s.bindings : {}).filter(([k, v]) => typeof k === 'string' && typeof v === 'string' && k !== v),
  );
  return {
    mouseSensitivity: clamp(s.mouseSensitivity, min, max, d.mouseSensitivity),
    padSensitivity: clamp(s.padSensitivity, min, max, d.padSensitivity),
    touchSensitivity: clamp(s.touchSensitivity, min, max, d.touchSensitivity),
    invertY: s.invertY === true,
    fov: clamp(s.fov, FOV_RANGE.min, FOV_RANGE.max, d.fov),
    volume,
    crosshair: s.crosshair !== false,
    hoverLabel: s.hoverLabel !== false,
    uiScale: UI_SCALES.includes(s.uiScale) ? s.uiScale : d.uiScale,
    reduceMotion: s.reduceMotion === true,
    bindings,
  };
}
