import { setVolumes } from '@/audio/audioContext';
import { setBrightness } from '@/graphics/brightness';
import { setReadingPace } from '@/notices/readingTime';
import type { FrameCap, GameSettings, ReadingPace, RenderScale, SettingsStore } from './Settings';
import { setReduceMotion } from './motion';
import { setFullscreenWanted } from './fullscreen';

/** How much longer than it takes to read speech and notes stay up. */
const READING_PACE: Record<ReadingPace, number> = { normal: 1, longer: 1.6, longest: 2.6 };
/** The share of the pixels rendered, null for the GPU to decide. */
const RENDER_SHARE: Record<RenderScale, number | null> = { auto: null, full: 1, threeQuarters: 0.75, half: 0.5 };
/** Frames a second, 0 for every refresh, null for the quality level's own cap. */
const FRAME_CAP_FPS: Record<FrameCap, number | null> = { auto: null, fps30: 30, fps60: 60, off: 0 };

/** What the settings reach, structurally (main passes the real ones). */
interface SettingsTargets {
  input: { setBindings(bindings: Readonly<Record<string, string>>): void };
  mouse: { setMouseLook(options: { sensitivity: number; invertY: boolean }): void };
  /** The walk's feel: the sprint and crouch keys, the head bob, the field of view (the sprint widens it over this). */
  player: { setFeel(feel: { sprint: GameSettings['sprintMode']; crouch: GameSettings['crouchMode']; headBob: boolean; fov: number }): void };
  /** The box in hand turns with the sensitivity of the device turning it, and the inverted Y. */
  inspector: { setLook(options: { sensitivity: number; padSensitivity: number; touchSensitivity: number; invertY: boolean }): void };
  /** Settings > Game: the tips top left shown or not. */
  notices: { setTipsShown(shown: boolean): void };
  gamepad: { setLook(options: { speed: number; invertY: boolean }): void };
  touch: { setLook(options: { sensitivity: number; invertY: boolean }): void };
  hud: { setHud(hud: { crosshair: boolean; hoverLabel: boolean }): void };
  /** Settings > Display: the resolution (null: adaptive) and the frame cap (null: the quality level's). */
  display: { setRenderScale(share: number | null): void; setFrameCap(fps: number | null): void };
  /** Key names shown anywhere follow a new binding. */
  onBindingsChange(): void;
}

/**
 * Applies every setting now and on each change: the view and the walk, the look of each device, the
 * mixer, the HUD and the tips, reduced motion (the CSS class and `settings/motion` for code), the keys.
 */
export function applySettings(store: SettingsStore, targets: SettingsTargets): void {
  // Compared by content: every change of any setting hands over a fresh bindings object, and re-applying the keys
  // (which lets go of every key held) on each tick of a slider would stop the walk.
  let bindings: string | null = null;
  store.subscribe((s) => {
    // The player owns the camera's field of view (the sprint widens it over the setting).
    targets.player.setFeel({ sprint: s.sprintMode, crouch: s.crouchMode, headBob: s.headBob, fov: s.fov });
    targets.mouse.setMouseLook({ sensitivity: s.mouseSensitivity, invertY: s.invertY });
    targets.inspector.setLook({ sensitivity: s.mouseSensitivity, padSensitivity: s.padSensitivity, touchSensitivity: s.touchSensitivity, invertY: s.invertY });
    targets.notices.setTipsShown(s.showTips);
    targets.gamepad.setLook({ speed: s.padSensitivity, invertY: s.invertY });
    targets.touch.setLook({ sensitivity: s.touchSensitivity, invertY: s.invertY });
    setVolumes(s.volume);
    targets.hud.setHud({ crosshair: s.crosshair, hoverLabel: s.hoverLabel });
    const root = document.documentElement.classList;
    setReduceMotion(s.reduceMotion); // also `reduce-motion` on <html>, with the system's preference
    setFullscreenWanted(s.fullscreen);
    root.toggle('speech-small', s.speechSize === 'small');
    root.toggle('speech-large', s.speechSize === 'large');
    root.toggle('ui-scale-small', s.uiScale === 'small');
    root.toggle('ui-scale-large', s.uiScale === 'large');
    root.toggle('ui-scale-larger', s.uiScale === 'larger');
    root.toggle('ui-scale-largest', s.uiScale === 'largest');
    root.toggle('plain-lettering', s.plainLettering);
    setReadingPace(READING_PACE[s.readingPace]);
    setBrightness(s.brightness);
    targets.display.setRenderScale(RENDER_SHARE[s.renderScale]);
    targets.display.setFrameCap(FRAME_CAP_FPS[s.frameCap]);
    const keys = bindingsKey(s.bindings);
    if (keys !== bindings) {
      bindings = keys;
      targets.input.setBindings(s.bindings);
      targets.onBindingsChange();
    }
  });
}

function bindingsKey(bindings: GameSettings['bindings']): string {
  return Object.entries(bindings)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join(',');
}
