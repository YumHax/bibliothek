import * as THREE from 'three';
import type { Zone } from '../zone/Zone';
import type { Room } from '../Room';
import type { Placement } from '../Placement';
import type { BuildContext } from '../buildContext';
import { placeWith } from '../zone/attach';
import { PendantLamp } from '../props/PendantLamp';
import { FlushLamp } from '../props/FlushLamp';
import type { SwitchableLamp } from '../props/SwitchableLamp';
import { WallSwitch } from '../props/WallSwitch';
import { WallClock } from '../props/WallClock';
import { placeDecor, type DecorEntry } from '../props/decor';
import type { Radiator } from '../props/Radiator';
import { tickRadiators } from '../acoustics/radiatorTicks';
import { StrayBox } from '../strays/StrayBox';
import { ClockTick } from '@/audio/ambient';
import { mainsOn, onMains, zoneOnCircuit } from '@/building/mains';
import { type Hearing, heardBy, pointSound } from './hearing';

/** Where a clock's tick sits: just proud of its face. */
const CLOCK_TICK_AT = new THREE.Vector3(0, 0, 0.03);

/**
 * The room's ceiling light: the visible fixture (a `PendantLamp`, or a `FlushLamp` where a pendant
 * would hang in the way) switching the `Room`'s own lamp, and the wall switch by the door driving
 * the same lamp, so either works; `also` hears every switch too (a shop's other fittings). Returns the fixture.
 */
export function placeRoomLight(zone: Zone, room: Room, kind: 'pendant' | 'flush', at: Placement, switchAt: Placement, also?: (on: boolean) => void): SwitchableLamp {
  // The room's light follows the lamp, and the building's power (a power cut darkens it, `building/mains`).
  const powered = (): boolean => mainsOn() || !zoneOnCircuit(zone.id);
  const onSwitch = (on: boolean): void => {
    room.setLampOn(on && powered());
    also?.(on);
  };
  const lamp = zone.placeAt(kind === 'pendant' ? new PendantLamp({ onSwitch }) : new FlushLamp({ onSwitch }), at);
  zone.placeAt(new WallSwitch({ lamp }), switchAt);
  zone.onUnload(onMains(() => room.setLampOn(lamp.isOn && powered())));
  return lamp;
}

/** A wall clock reading the sky's time (click: the time, twice: an alarm), and its tick heard across the room. */
export function placeClock(zone: Zone, { sky, ...hearing }: Pick<BuildContext, 'sky'> & Hearing, at: Placement): WallClock {
  // The tick strikes as the second hand steps, so what is heard and what is seen agree.
  const tick = new ClockTick();
  const clock = zone.placeAt(new WallClock(sky.dayNight, { onSecond: () => tick.strike() }), at);
  placeWith(zone, clock, pointSound(hearing, tick, { maxDistance: 5 }), CLOCK_TICK_AT);
  return clock;
}

/**
 * Places a room's `decor` list (the entries marked `upgrade` once bought, from `ctx.home.upgrades`) and gives its
 * radiators their ticking; returns the radiators (the cat naps by them).
 */
export function furnishDecor(zone: Zone, ctx: Hearing & { home?: Pick<BuildContext['home'], 'upgrades' | 'furnishings'> }, decor: readonly DecorEntry[]): Radiator[] {
  return tickRadiators(zone, placeDecor(zone, decor, ctx.home?.upgrades, ctx.home?.furnishings), heardBy(ctx));
}

/** A spot on a surface for a `StrayBox`: `at` is `[x, z]` on the host's top, `yaw` about its local y. */
interface StraySpot {
  readonly at: readonly [number, number];
  readonly yaw: number;
  /** How far off square and off the spot the box may lie (radians, m): less than the default on a small top. */
  readonly jitter?: { readonly yaw: number; readonly offset: number };
}

/**
 * A game from the shelves left on `host`'s top (the kitchen table, a nightstand), a different one
 * each in-game day, in slot `slot`; null when the build has no strays.
 */
export function placeStrayBox(
  zone: Zone,
  { collection: { strays }, covers, sky, today }: Pick<BuildContext, 'collection' | 'covers' | 'sky' | 'today'>,
  slot: string,
  host: THREE.Object3D & { readonly topHeight: number },
  spot: StraySpot,
): StrayBox | null {
  if (!strays) return null;
  const stray = new StrayBox({ strays, slot, covers, ...(spot.jitter ? { jitter: spot.jitter } : {}) });
  stray.position.set(spot.at[0], host.topHeight, spot.at[1]);
  stray.rotation.y = spot.yaw;
  placeWith(zone, host, stray);
  zone.onUnload(sky.dayNight.onChange(() => stray.setDay(today.gameDay)));
  return stray;
}
