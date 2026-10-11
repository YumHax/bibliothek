import * as THREE from 'three';
import { CORNER_BAY, FRONT, PARK_STREET } from '@/world/measures/street';
import type { StreetEcho } from './streetBus';

const SOUND_SPEED = 343;
/** The longest a reflection may come back after (s): the bus's delay lines hold half a second. */
const LONGEST = 0.45;
/** A facade's reflection at a canyon's usual distance (8 m), and how it grows nearer / fades further. */
const WALL = { wet: 0.09, at: 8, most: 1.5, least: 0.35 };
/** What open ground sends back (the park's trees, a far row over a lawn): barely anything. */
const OPEN = { wet: 0.012, distance: 60 };
/** Under a roof (the bus shelter, an awning, the sas's porch): a slap off the roof this soon and this loud. */
const SLAP = { delay: 0.007, wet: 0.15 };

/** A wall that answers: where it is (zone-local floor point) and how loud its answer is. */
interface EchoWall {
  at: THREE.Vector2;
  delay: number;
  wet: number;
}

/**
 * What the walls round a zone-local point send back: the near and the far reflection (`StreetEcho` without the pans,
 * which the caller works out from where the walls stand, `walls`). Front Street is a canyon between its two rows; on
 * Park Street only our side's facades answer, the park across is open; in the park almost nothing comes back; the corner
 * bay is walled close on three sides; `under` a roof (0..1) the near answer is the roof's quick slap.
 */
export function echoAround(local: THREE.Vector3, under: number): { echo: Omit<StreetEcho, 'pans'>; walls: [EchoWall, EchoWall] } {
  const { x, z } = local;
  let near: EchoWall;
  let far: EchoWall;
  if (x < PARK_STREET.hedge - 0.6) {
    // The park: Park Street's facades far behind the railings, open lawn the other way.
    near = wall(PARK_STREET.line, z, PARK_STREET.line - x);
    far = open(x - OPEN.distance, z);
  } else if (z < FRONT.ourLine && x < CORNER_BAY.x0) {
    // Park Street: our side's facades, the park across.
    near = wall(PARK_STREET.line, z, PARK_STREET.line - x);
    far = open(PARK_STREET.hedge - OPEN.distance / 2, z);
  } else if (z < FRONT.ourLine) {
    // The corner bay: walls an arm's length off, the far row across Front Street.
    near = wall(CORNER_BAY.x1, z, Math.max(0.8, Math.min(CORNER_BAY.x1 - x, x - CORNER_BAY.x0, z - CORNER_BAY.z0)));
    far = wall(x, FRONT.farLine, FRONT.farLine - z);
  } else {
    // Front Street: our row and the far row; in front of the park (past Park Street's line) our side is open.
    const ours = x > PARK_STREET.line ? wall(x, FRONT.ourLine, z - FRONT.ourLine) : open(x, FRONT.ourLine - OPEN.distance / 2);
    const across = wall(x, FRONT.farLine, FRONT.farLine - z);
    [near, far] = ours.delay <= across.delay ? [ours, across] : [across, ours];
  }
  if (under > 0) {
    near = { at: near.at, delay: THREE.MathUtils.lerp(near.delay, SLAP.delay, under), wet: THREE.MathUtils.lerp(near.wet, SLAP.wet, under) };
  }
  return { echo: { delays: [near.delay, far.delay], wet: [near.wet, far.wet] }, walls: [near, far] };
}

/** A facade `distance` metres off, at zone-local (x, z). */
function wall(x: number, z: number, distance: number): EchoWall {
  const d = Math.max(0.5, distance);
  return { at: new THREE.Vector2(x, z), delay: Math.min(LONGEST, (2 * d) / SOUND_SPEED), wet: WALL.wet * THREE.MathUtils.clamp(WALL.at / d, WALL.least, WALL.most) };
}

/** Open ground that way: a faint, late answer. */
function open(x: number, z: number): EchoWall {
  return { at: new THREE.Vector2(x, z), delay: Math.min(LONGEST, (2 * OPEN.distance) / SOUND_SPEED), wet: OPEN.wet };
}
