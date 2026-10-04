import { setVolumes } from '@/audio/audioContext';
import type { GameSettings, SettingsStore } from './Settings';
import { setReduceMotion } from './motion';

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
    root.toggle('speech-small', s.speechSize === 'small');
    root.toggle('speech-large', s.speechSize === 'large');
    root.toggle('ui-scale-small', s.uiScale === 'small');
    root.toggle('ui-scale-large', s.uiScale === 'large');
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
