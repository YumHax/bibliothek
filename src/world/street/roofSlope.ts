import { ROOF_SLOPE, type FacadeStyle } from '../city/facadeStyle';
import type { FacadeSpec } from './streetPlan';

/**
 * A face's roof slope (rise over its foot, run back from the wall), none on a flat roof: its building's own
 * (`FacadeStyle.slope`), but our building keeps the plan's, as the roof zone (`world/roof`) is built on it.
 */
export function roofSlopeOf(spec: FacadeSpec, style: FacadeStyle): { rise: number; run: number } | null {
  if (style.roof === 'flat') return null;
  return spec.id.startsWith('ours') ? ROOF_SLOPE[style.roof] : (style.slope ?? ROOF_SLOPE[style.roof]);
}
