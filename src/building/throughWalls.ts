import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { AmbientVoice } from '@/audio/ambient';
import { FLOOR_WALLS, MusicUpstairs, playStepsAbove } from '@/audio/throughFloor';
import { DoorPiano, DoorTelevision } from '@/world/stairwell/stairSounds';
import { Prop } from '@/world/props/Prop';
import type { ActivityAware } from '@/world/zone/lifecycle';
import { gameDayRandom } from '@/time/daily';
import { NEIGHBOUR_NOISE as plan, type HourSpan, type ThroughWall } from './neighbourNoisePlan';

/** What the sounds through the walls need to know. */
export interface ThroughWallsOptions {
  /** The ears (the camera). */
  listener: THREE.Object3D;
  /** Whether a world point is inside the flat (`stairwell/flatHeard.BuildingSpaces`). */
  inFlat: (p: THREE.Vector3) => boolean;
  /** The game clock's hour, 0..24, and the game day. */
  hours: () => number;
  day: () => number;
  /** Whether whoever lives behind a door (its key) is in. */
  isHome: (key: string) => boolean;
  /** Whether the building has power (a cut silences the TV and the music; the piano plays on). */
  powered?: () => boolean;
}

/** The level eases this fast (1/s): stepping in at the door, a sound comes up over a second. */
const EASE = 2.5;

/** Whether `hours` falls in `span` (which may run past midnight: `to` over 24). */
export function inHours(hours: number, span: HourSpan): boolean {
  return (hours >= span.from && hours < span.to) || (span.to > 24 && hours + 24 >= span.from && hours + 24 < span.to);
}

/** The game day an evening belongs to: the small hours are still last night's. */
export function nightOf(day: number, hours: number): number {
  return hours < 12 ? day - 1 : day;
}

function voiceFor(kind: ThroughWall['voice']): AmbientVoice {
  switch (kind) {
    case 'piano':
      return new DoorPiano();
    case 'tv':
      return new DoorTelevision();
    case 'music':
      return new MusicUpstairs();
  }
}

/**
 * The neighbours heard from inside the flat, faintly, through the floor and the ceiling
 * (`NEIGHBOUR_NOISE.throughWalls`): Mrs Moreau's piano downstairs before dinner, their TV of an
 * evening, the attic student's music some nights, steps upstairs now and then. Each only while its
 * neighbour is in, on its days and hours, and only while the player is in the flat (the stairwell
 * hears them behind their doors already). Heard dull and from below or above, not from a side.
 * An empty prop; placed in a zone of the flat (always active), it ticks every frame (the music's beat).
 */
export class NeighboursThroughWalls extends Prop implements Updatable, ActivityAware {
  readonly contactShadow = false;
  readonly tickEveryFrame = true;
  private readonly sounds: { plan: ThroughWall; voice: AmbientVoice; level: number }[];
  private readonly ear = new THREE.Vector3();
  private stepsIn = 30;
  private active = true;

  constructor(private readonly options: ThroughWallsOptions) {
    super();
    this.name = 'NeighboursThroughWalls';
    this.sounds = plan.throughWalls.map((p) => {
      const voice = voiceFor(p.voice);
      voice.setSpatial?.(0, FLOOR_WALLS);
      return { plan: p, voice, level: 0 };
    });
  }

  update(dt: number): void {
    const { listener, inFlat, hours, day, isHome, powered } = this.options;
    listener.getWorldPosition(this.ear);
    const here = this.active && inFlat(this.ear);
    const power = powered?.() ?? true;
    const h = hours();
    const d = day();
    for (const sound of this.sounds) {
      const { plan: p } = sound;
      const on = here && (power || p.voice === 'piano') && inHours(h, p.hours) && (p.who === 'attic' || isHome(p.who)) && playsOn(p, nightOf(d, h));
      const target = on ? p.level : 0;
      sound.level += (target - sound.level) * Math.min(1, dt * EASE);
      sound.voice.setLevel(sound.level < 0.002 ? 0 : sound.level);
      sound.voice.update(dt);
    }
    // Steps upstairs: a few now and then, of an evening.
    this.stepsIn -= dt;
    if (this.stepsIn <= 0) {
      const { stepsAbove } = plan;
      this.stepsIn = THREE.MathUtils.randFloat(stepsAbove.everyS.min, stepsAbove.everyS.max);
      if (here && inHours(h, stepsAbove.hours)) playStepsAbove(stepsAbove.level);
    }
  }

  setZoneActive(active: boolean): void {
    this.active = active;
    for (const sound of this.sounds) sound.voice.setZoneActive?.(active);
  }

  dispose(): void {
    for (const sound of this.sounds) sound.voice.dispose();
  }
}

/** Whether `p` plays on the evening of game day `night` (one in `oneIn`, the same all evening). */
function playsOn(p: ThroughWall, night: number): boolean {
  return p.oneIn <= 1 || gameDayRandom(`throughWall:${p.voice}:${p.who}`, night)() < 1 / p.oneIn;
}
