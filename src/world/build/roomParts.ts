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
import { type Hearing, heardBy, pointSound } from './hearing';

/** Where a clock's tick sits: just proud of its face. */
const CLOCK_TICK_AT = new THREE.Vector3(0, 0, 0.03);

/**
 * The room's ceiling light: the visible fixture (a `PendantLamp`, or a `FlushLamp` where a pendant
 * would hang in the way) switching the `Room`'s own lamp, and the wall switch by the door driving
 * the same lamp, so either works. Returns the fixture.
 */
export function placeRoomLight(zone: Zone, room: Room, kind: 'pendant' | 'flush', at: Placement, switchAt: Placement): SwitchableLamp {
  const onSwitch = (on: boolean): void => room.setLampOn(on);
  const lamp = zone.placeAt(kind === 'pendant' ? new PendantLamp({ onSwitch }) : new FlushLamp({ onSwitch }), at);
  zone.placeAt(new WallSwitch({ lamp }), switchAt);
  return lamp;
}

/** A wall clock reading the sky's time (click: the time, twice: an alarm), and its tick heard across the room. */
export function placeClock(zone: Zone, { sky, ...hearing }: Pick<BuildContext, 'sky'> & Hearing, at: Placement): WallClock {
  const clock = zone.placeAt(new WallClock(sky.dayNight), at);
  placeWith(zone, clock, pointSound(hearing, new ClockTick(), { maxDistance: 5 }), CLOCK_TICK_AT);
  return clock;
}

/** Places a room's `decor` list and gives its radiators their ticking; returns the radiators (the cat naps by them). */
export function furnishDecor(zone: Zone, hearing: Hearing, decor: readonly DecorEntry[]): Radiator[] {
  return tickRadiators(zone, placeDecor(zone, decor), heardBy(hearing));
}

/** A spot on a surface for a `StrayBox`: `at` is `[x, z]` on the host's top, `yaw` about its local y. */
export interface StraySpot {
  readonly at: readonly [number, number];
  readonly yaw: number;
}

/**
 * A game from the shelves left on `host`'s top (the kitchen table, a nightstand), a different one
 * each in-game day, in slot `slot`; null when the build has no strays.
 */
export function placeStrayBox(
  zone: Zone,
  { collection: { strays }, covers, sky, market: { stock: market } }: Pick<BuildContext, 'collection' | 'covers' | 'sky' | 'market'>,
  slot: string,
  host: THREE.Object3D & { readonly topHeight: number },
  spot: StraySpot,
): StrayBox | null {
  if (!strays) return null;
  const stray = new StrayBox({ strays, slot, covers });
  stray.position.set(spot.at[0], host.topHeight, spot.at[1]);
  stray.rotation.y = spot.yaw;
  placeWith(zone, host, stray);
  zone.onUnload(sky.dayNight.onChange(() => stray.setDay(market.day)));
  return stray;
}
