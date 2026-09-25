import { FOV_RANGE, SENSITIVITY_RANGE, UI_SCALES, type SettingsStore, type UiScale, type VolumeChannel } from '@/settings';
import type { ConfirmOptions, SettingsTab } from '../Overlay';
import { action, choice, group, slider, toggle, type Field } from './fields';
import { KeyBindingsForm } from './KeyBindingsForm';

/** Where the settings go: the Overlay's `addSetting` and `confirm`. */
export interface SettingsHost {
  addSetting(tab: SettingsTab, title: string, element: HTMLElement, note?: string): void;
  confirm(options: ConfirmOptions): void;
}

const VOLUMES: Array<{ channel: VolumeChannel; label: string }> = [
  { channel: 'master', label: 'Master' },
  { channel: 'screens', label: 'TV, projector & radio' },
  { channel: 'arcade', label: 'Arcade machines' },
  { channel: 'world', label: 'Ambience & effects' },
  { channel: 'ui', label: 'Menu sounds' },
];

const SCALE_LABELS: Record<UiScale, string> = { small: 'Small', normal: 'Normal', large: 'Large' };

const percent = (v: number): string => `${Math.round(v * 100)}%`;
const times = (v: number): string => `${v.toFixed(2)}×`;

/**
 * The Settings screen's own sections, all live and saved in the `SettingsStore`: the view and the
 * HUD (Display), the mixer (Audio), look sensitivity and the keyboard (Controls), resets (Game).
 * The graphics level and the cat are added by main beside these.
 */
export function addGameSettings(host: SettingsHost, store: SettingsStore, options: { onEraseProgress(): void; version: string }): void {
  const fields: Array<(s: SettingsStore['settings']) => void> = [];
  const bind = <T>(field: Field<T>, read: (s: SettingsStore['settings']) => T): HTMLElement => {
    fields.push((s) => field.set(read(s)));
    return field.element;
  };

  host.addSetting(
    'display',
    'View',
    group(
      bind(slider('Field of view', { ...FOV_RANGE, step: 1, format: (v) => `${v}°`, onInput: (fov) => store.update({ fov }) }), (s) => s.fov),
      bind(toggle('Crosshair', (crosshair) => store.update({ crosshair })), (s) => s.crosshair),
      bind(toggle('Name what I look at', (hoverLabel) => store.update({ hoverLabel })), (s) => s.hoverLabel),
    ),
  );
  host.addSetting(
    'display',
    'Interface',
    group(
      bind(choice('Text size', UI_SCALES.map((id) => ({ id, label: SCALE_LABELS[id] })), (uiScale) => store.update({ uiScale })), (s) => s.uiScale),
      bind(toggle('Reduce motion', (reduceMotion) => store.update({ reduceMotion })), (s) => s.reduceMotion),
    ),
  );

  host.addSetting(
    'audio',
    'Volume',
    group(
      ...VOLUMES.map(({ channel, label }) =>
        bind(slider(label, { min: 0, max: 1, step: 0.05, format: percent, onInput: (v) => store.setVolume(channel, v) }), (s) => s.volume[channel]),
      ),
    ),
  );

  const sensitivity = { ...SENSITIVITY_RANGE, step: 0.05, format: times };
  host.addSetting(
    'controls',
    'Look',
    group(
      bind(slider('Mouse sensitivity', { ...sensitivity, onInput: (mouseSensitivity) => store.update({ mouseSensitivity }) }), (s) => s.mouseSensitivity),
      bind(slider('Controller sensitivity', { ...sensitivity, onInput: (padSensitivity) => store.update({ padSensitivity }) }), (s) => s.padSensitivity),
      bind(slider('Touch sensitivity', { ...sensitivity, onInput: (touchSensitivity) => store.update({ touchSensitivity }) }), (s) => s.touchSensitivity),
      bind(toggle('Invert vertical look', (invertY) => store.update({ invertY })), (s) => s.invertY),
    ),
  );
  host.addSetting('controls', 'Keyboard', new KeyBindingsForm(store).element, 'Pick an action, then press its new key. The key it had moves to the old one.');

  host.addSetting(
    'game',
    'Reset',
    group(
      action('Reset settings', () =>
        host.confirm({ title: 'Reset settings?', message: 'View, audio, look and interface go back to their defaults. Your keys and your progress stay.', yes: 'Reset', onYes: () => store.reset() }),
      ),
      action(
        'Erase progress…',
        () =>
          host.confirm({
            title: 'Erase progress?',
            message: 'Coins, tickets, your collection, the arcade’s scores and the market’s memory of you are wiped, and the game starts over. Settings stay. This cannot be undone.',
            yes: 'Erase everything',
            danger: true,
            onYes: options.onEraseProgress,
          }),
        true,
      ),
    ),
    `Progress saves automatically in this browser. Version ${options.version}.`,
  );

  store.subscribe((s) => fields.forEach((apply) => apply(s)));
}
