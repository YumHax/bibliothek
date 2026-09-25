import type * as THREE from 'three';
import { setVolumes } from '@/audio/audioContext';
import type { GameSettings, SettingsStore } from './Settings';

/** What the settings reach, structurally (main passes the real ones). */
export interface SettingsTargets {
  camera: THREE.PerspectiveCamera;
  input: { setBindings(bindings: Readonly<Record<string, string>>): void };
  mouse: { setMouseLook(options: { sensitivity: number; invertY: boolean }): void };
  gamepad: { setLook(options: { speed: number; invertY: boolean }): void };
  touch: { setLook(options: { sensitivity: number; invertY: boolean }): void };
  hud: { setHud(hud: { crosshair: boolean; hoverLabel: boolean }): void };
  /** Key names shown anywhere follow a new binding. */
  onBindingsChange(): void;
}

/** Applies every setting now and on each change: the camera, the look of each device, the mixer, the HUD, the keys. */
export function applySettings(store: SettingsStore, targets: SettingsTargets): void {
  let bindings: GameSettings['bindings'] | null = null;
  store.subscribe((s) => {
    if (targets.camera.fov !== s.fov) {
      targets.camera.fov = s.fov;
      targets.camera.updateProjectionMatrix();
    }
    targets.mouse.setMouseLook({ sensitivity: s.mouseSensitivity, invertY: s.invertY });
    targets.gamepad.setLook({ speed: s.padSensitivity, invertY: s.invertY });
    targets.touch.setLook({ sensitivity: s.touchSensitivity, invertY: s.invertY });
    setVolumes(s.volume);
    targets.hud.setHud({ crosshair: s.crosshair, hoverLabel: s.hoverLabel });
    const root = document.documentElement.classList;
    root.toggle('reduce-motion', s.reduceMotion);
    root.toggle('ui-scale-small', s.uiScale === 'small');
    root.toggle('ui-scale-large', s.uiScale === 'large');
    if (s.bindings !== bindings) {
      bindings = s.bindings;
      targets.input.setBindings(s.bindings);
      targets.onBindingsChange();
    }
  });
}
