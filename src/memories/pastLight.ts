import type * as THREE from 'three';
import { RoomWindow } from '@/world/props/Window';
import { SwitchableLamp } from '@/world/props/SwitchableLamp';
import { setShownKeepingLights } from '@/world/lighting/keepLights';
import type { WeatherKind } from '@/world/weather/Weather';
import type { PastLight } from './memoryReel';

/*
 * The past's light in a zone (`MemoryScene.light`, docs/story.md "Adding a memory"): its windows' curtains drawn or
 * open, its switchable lamps on or off (a room's ceiling light follows its lamp), the weather shown outside; each put
 * back as it was by the function returned. And the things of the present a scene puts aside. The game's clock is not
 * touched: a jump of it would count a market day.
 */

/** Shows the weather `kind` settled, until the returned function puts today's back (the wiring's `Sky`). */
export type WeatherHold = (kind: WeatherKind) => () => void;

/** Sets `light` in `zone` (its group); returns what puts the present's back. */
export function setPastLight(group: THREE.Object3D, light: PastLight, holdWeather: WeatherHold | null): () => void {
  const undo: (() => void)[] = [];
  group.traverse((obj) => {
    if (light.curtains && obj instanceof RoomWindow) {
      const drawn = obj.curtainsDrawn;
      obj.setCurtainsDrawn(light.curtains === 'drawn');
      undo.push(() => obj.setCurtainsDrawn(drawn));
    } else if (light.lamps && obj instanceof SwitchableLamp) {
      const on = obj.isOn;
      obj.setOn(light.lamps === 'on');
      undo.push(() => obj.setOn(on));
    }
  });
  if (light.weather && holdWeather) undo.push(holdWeather(light.weather));
  return () => {
    for (const step of undo.reverse()) step();
  };
}

/** Hides `objects` (their lamps dimmed, not hidden: the `LightCuller` owns a light's `visible`); returns what shows them again. */
export function hideDuring(objects: Iterable<THREE.Object3D>): () => void {
  const hidden = [...objects].filter((obj) => obj.visible);
  for (const obj of hidden) setShownKeepingLights(obj, false);
  return () => {
    for (const obj of hidden) setShownKeepingLights(obj, true);
  };
}
