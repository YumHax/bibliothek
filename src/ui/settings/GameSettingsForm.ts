import {
  BRIGHTNESS_RANGE,
  CROUCH_MODES,
  FOV_RANGE,
  FRAME_CAPS,
  MOTION_MODES,
  READING_PACES,
  RENDER_SCALES,
  SENSITIVITY_RANGE,
  SPRINT_MODES,
  TEXT_SIZES,
  UI_SCALES,
  type CrouchMode,
  type FrameCap,
  type MotionMode,
  type ReadingPace,
  type RenderScale,
  type SettingsStore,
  type SprintMode,
  type TextSize,
  type VolumeChannel,
} from '@/settings';
import { playVolumeSample } from './sampleSound';
import type { ConfirmOptions, SettingsTab } from '../Overlay';
import { action, choice, group, slider, toggle, type Field } from './fields';
import { KeyBindingsForm } from './KeyBindingsForm';
import { downloadSave } from './SaveFileSettings';
import { actionKeyLabel, onKeyLabelsChange } from '../keys';
import { setControlModes } from '../controls';

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

const SCALE_LABELS: Record<TextSize, string> = { small: 'Small', normal: 'Normal', large: 'Large', larger: 'Larger', largest: 'Largest' };
const PACE_LABELS: Record<ReadingPace, string> = { normal: 'Normal', longer: 'Longer', longest: 'Much longer' };
const MOTION_LABELS: Record<MotionMode, string> = { system: 'Like the system', reduce: 'On', full: 'Off' };
const RESOLUTION_LABELS: Record<RenderScale, string> = { auto: 'Automatic', full: 'Full', threeQuarters: '75%', half: 'Half' };
const FRAME_CAP_LABELS: Record<FrameCap, string> = { auto: 'Automatic', fps30: '30 a second', fps60: '60 a second', off: 'No limit' };
/** Named after the keys as bound and printed now (`actionKeyLabel`): "Hold Shift", or whatever took its place. */
const sprintLabels = (): Record<SprintMode, string> => ({ doubleTap: `Double-tap ${actionKeyLabel('forward')}`, hold: `Hold ${actionKeyLabel('crouch')}` });
/** The Walking section's note: where the crouch goes while the crouch key sprints, and the controller's buttons. */
const walkingNote = (): string =>
  `While ${actionKeyLabel('crouch')} sprints, crouch is on ${actionKeyLabel('crouchAlt')}; both can be moved under Keyboard. A controller sprints with the left stick, crouches with LB.`;
const CROUCH_LABELS: Record<CrouchMode, string> = { hold: 'Hold', toggle: 'Toggle' };

/** The setting is the vertical angle; the width it gives on this screen said with it, which is how players compare. */
const fovText = (v: number): string => {
  const aspect = window.innerWidth / Math.max(1, window.innerHeight);
  const wide = (2 * Math.atan(Math.tan((v * Math.PI) / 360) * aspect) * 180) / Math.PI;
  return `${v}° (${Math.round(wide)}° wide)`;
};
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
      bind(slider('Field of view', { ...FOV_RANGE, step: 1, format: fovText, wideOutput: true, onInput: (fov) => store.update({ fov }) }), (s) => s.fov),
      bind(toggle('Crosshair', (crosshair) => store.update({ crosshair })), (s) => s.crosshair),
      bind(toggle('Name what I look at', (hoverLabel) => store.update({ hoverLabel })), (s) => s.hoverLabel),
      // Full screen also keeps Esc for the game (`settings/fullscreen`): a press puts down a card, holding it leaves full screen.
      bind(toggle('Full screen', (fullscreen) => store.update({ fullscreen })), (s) => s.fullscreen),
    ),
  );
  host.addSetting(
    'display',
    'Interface',
    group(
      bind(choice('Text size', TEXT_SIZES.map((id) => ({ id, label: SCALE_LABELS[id] })), (uiScale) => store.update({ uiScale })), (s) => s.uiScale),
      bind(choice('Speech and subtitles', UI_SCALES.map((id) => ({ id, label: SCALE_LABELS[id] })), (speechSize) => store.update({ speechSize })), (s) => s.speechSize),
      bind(choice('Text stays on screen', READING_PACES.map((id) => ({ id, label: PACE_LABELS[id] })), (readingPace) => store.update({ readingPace })), (s) => s.readingPace),
      bind(toggle('Plain lettering', (plainLettering) => store.update({ plainLettering })), (s) => s.plainLettering),
      bind(choice('Reduce motion', MOTION_MODES.map((id) => ({ id, label: MOTION_LABELS[id] })), (reduceMotion) => store.update({ reduceMotion })), (s) => s.reduceMotion),
    ),
    'Plain lettering writes the handwritten notes and the speech in the plain face. Reduce motion “Like the system” follows your computer’s own setting.',
  );
  host.addSetting(
    'display',
    'Picture',
    group(
      bind(slider('Brightness', { ...BRIGHTNESS_RANGE, step: 0.05, format: percent, onInput: (brightness) => store.update({ brightness }) }), (s) => s.brightness),
      bind(choice('Resolution', RENDER_SCALES.map((id) => ({ id, label: RESOLUTION_LABELS[id] })), (renderScale) => store.update({ renderScale })), (s) => s.renderScale),
      bind(choice('Frame rate', FRAME_CAPS.map((id) => ({ id, label: FRAME_CAP_LABELS[id] })), (frameCap) => store.update({ frameCap })), (s) => s.frameCap),
    ),
    'Automatic resolution lowers the picture’s sharpness only while your computer struggles. A lower frame rate keeps a laptop cooler.',
  );

  host.addSetting(
    'audio',
    'Volume',
    group(
      ...VOLUMES.map(({ channel, label }) =>
        bind(slider(label, { min: 0, max: 1, step: 0.05, format: percent, onInput: (v) => store.setVolume(channel, v), onChange: () => playVolumeSample(channel) }), (s) => s.volume[channel]),
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
  const labels = sprintLabels();
  const walking = group(
    bind(choice('Sprint', SPRINT_MODES.map((id) => ({ id, label: labels[id] })), (sprintMode) => store.update({ sprintMode })), (s) => s.sprintMode),
    bind(choice('Crouch', CROUCH_MODES.map((id) => ({ id, label: CROUCH_LABELS[id] })), (crouchMode) => store.update({ crouchMode })), (s) => s.crouchMode),
    // The bob, the sprint's wider view and the dip of a step down: all the walk does to the eye.
    bind(toggle('Head bob and sprint zoom', (headBob) => store.update({ headBob })), (s) => s.headBob),
  );
  host.addSetting('controls', 'Walking', walking, walkingNote());
  // A key moved (or the layout read): the sprint's choice and the note name the keys again.
  onKeyLabelsChange(() => {
    const now = sprintLabels();
    const sprintField = walking.firstElementChild; // the Sprint choice (the Crouch one has a "hold" too)
    for (const id of SPRINT_MODES) {
      const button = sprintField?.querySelector<HTMLElement>(`[data-choice="${id}"]`);
      if (button) button.textContent = now[id];
    }
    const note = walking.parentElement?.querySelector<HTMLElement>('.menu__note');
    if (note) note.textContent = walkingNote();
  });
  host.addSetting('controls', 'Keyboard', new KeyBindingsForm(store).element, 'Pick an action, then press its new key. The key it had moves to the old one. An action with a second key (Right Shift, /) keeps that one where it is.');

  host.addSetting('game', 'Help', group(bind(toggle('Show tips', (showTips) => store.update({ showTips })), (s) => s.showTips)), 'The notes top left on how to do the next thing, the first day’s to-do list included.');
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
            also: { label: 'Download a copy first', run: () => downloadSave(options.version) },
          }),
        true,
      ),
    ),
    `Progress saves automatically in this browser. Version ${options.version}.`,
  );

  store.subscribe((s) => {
    fields.forEach((apply) => apply(s));
    setControlModes({ sprint: s.sprintMode, crouch: s.crouchMode });
  });
}
