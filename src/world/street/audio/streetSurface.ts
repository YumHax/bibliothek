import type * as THREE from 'three';
import type { FootSurface } from '@/audio/footSurface';
import { FRONT, PARK_STREET, SIDE_STREET } from '../streetPlan';

/**
 * What is underfoot at a zone-local point of the street (the same areas `StreetGround` lays):
 * asphalt on the roads (Front Street between the kerbs, Park Street and the side street running
 * south), grass in the park beyond the hedge, the paving slabs everywhere else.
 */
export function streetSurfaceAt(local: THREE.Vector3): FootSurface {
  const { x, z } = local;
  if (x < PARK_STREET.hedge - 0.6) return 'grass';
  const onFront = z > FRONT.nearKerb && z < FRONT.farKerb && x > PARK_STREET.farKerb;
  const onPark = x > PARK_STREET.farKerb && x < PARK_STREET.nearKerb && z <= FRONT.nearKerb;
  const onSide = x > SIDE_STREET.nearKerb && x < SIDE_STREET.farKerb && z <= FRONT.nearKerb;
  return onFront || onPark || onSide ? 'asphalt' : 'stone';
}
