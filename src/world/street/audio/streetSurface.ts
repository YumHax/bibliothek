import type * as THREE from 'three';
import type { FootSurface } from '@/audio/footSurface';
import { FRONT, FLAT_IN_STREET, PARK_STREET, SIDE_STREET } from '@/world/measures/street';
import { PLAYGROUND, offPaths } from '@/world/city/park';
import { currentSeason } from '@/time/season';
import { puddleSpots, type Puddle } from '../relief/WetGround';
import { STREET_PLAN } from '../streetPlan';

/** The playground's soft surface: its radius round the playground's middle (`StreetParkFeatures` `PLAY.surface`). */
const PLAY_SURFACE = 9;
/** Autumn's leaves lie this far round a street tree's trunk, and in a strip this wide against the kerbs (`relief/Leaves`). */
const LEAVES = { round: 2.6, kerb: 0.7, kerbFrom: -34, kerbTo: 96, from: 0.15 };
/** A puddle is stepped in inside this share of its painted half-size (its edge is a feathered rim). */
const PUDDLE_CORE = 0.42;

let puddles: readonly Puddle[] | null = null;

/**
 * What is underfoot at a zone-local point of the street (the same areas `StreetGround` lays):
 * asphalt on the roads (Front Street between the kerbs, Park Street and the side street running
 * south), in the park beyond the hedge its gravel paths (`city/park` `PARK_PATHS`), the playground's
 * rubber and the lawn, the paving slabs everywhere else; a puddle where `relief/WetGround` lays one
 * (the footfall splashes in it only while the ground is wet), and in autumn the leaves fallen round
 * the street trees and swept against the kerbs.
 */
export function streetSurfaceAt(local: THREE.Vector3): FootSurface {
  const { x, z } = local;
  if (x < PARK_STREET.hedge - 0.6) return parkSurfaceAt(x, z);
  if (inPuddle(x, z)) return 'puddle';
  const onFront = z > FRONT.nearKerb && z < FRONT.farKerb && x > PARK_STREET.farKerb;
  const onPark = x > PARK_STREET.farKerb && x < PARK_STREET.nearKerb && z <= FRONT.nearKerb;
  const onSide = x > SIDE_STREET.nearKerb && x < SIDE_STREET.farKerb && z <= FRONT.nearKerb;
  const road = onFront || onPark || onSide;
  if (onLeaves(x, z, road)) return 'leaves';
  return road ? 'asphalt' : 'stone';
}

/** The park's ground: the playground's rubber, a gravel path, else the lawn (`city/park` is in the flat's frame). */
function parkSurfaceAt(x: number, z: number): FootSurface {
  const fx = x - FLAT_IN_STREET.x;
  const fz = z - FLAT_IN_STREET.z;
  if (Math.hypot(fx - PLAYGROUND.x, fz - PLAYGROUND.z) < PLAY_SURFACE) return 'rubber';
  return offPaths(fx, fz, 0) ? 'grass' : 'gravel';
}

function inPuddle(x: number, z: number): boolean {
  puddles ??= puddleSpots();
  for (const p of puddles) {
    const dx = x - p.at[0];
    const dz = z - p.at[1];
    const reach = Math.max(p.sx, p.sz);
    if (Math.abs(dx) > reach || Math.abs(dz) > reach) continue;
    // Into the puddle's own frame (turned by its yaw), then its ellipse.
    const c = Math.cos(p.yaw);
    const s = Math.sin(p.yaw);
    const u = (dx * c - dz * s) / (p.sx * PUDDLE_CORE);
    const v = (dx * s + dz * c) / (p.sz * PUDDLE_CORE);
    if (u * u + v * v < 1) return true;
  }
  return false;
}

/** Autumn's leaves underfoot: round a street tree, or swept against a kerb on the road side. */
function onLeaves(x: number, z: number, road: boolean): boolean {
  const season = currentSeason();
  if (season.name !== 'autumn' || season.depth < LEAVES.from) return false;
  if (road) return Math.abs(Math.abs(z) - FRONT.farKerb) < LEAVES.kerb && x > LEAVES.kerbFrom && x < LEAVES.kerbTo;
  const reach = LEAVES.round * (0.6 + 0.4 * season.depth);
  return STREET_PLAN.trees.some(([tx, tz]) => Math.abs(tx - x) < reach && Math.hypot(tx - x, tz - z) < reach);
}
