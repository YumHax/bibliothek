import { STREET_PLAN, type Vec2 } from './streetPlan';

/*
 * What keeps the pavement's slabs from repeating (the paving texture comes round every 2.4 m, `groundTextures`): each
 * 0.6 m slab, by its place in the street (zone-local metres, as the texture lays them), takes its own shade and settles
 * at its own tilt; chewing gum trodden flat dots the slabs, thick where people stop (the bins, the bus stop, the
 * benches, the terraces), and old stains spread round the bins and under the terraces. Spliced into the paving's
 * material by `StreetGround` (`varying vec2 vGroundXZ`, the value noise in scope).
 */

const f = (n: number): string => n.toFixed(2);

/** Where people stop and what they drop there: a spot and its reach (metres). */
function busySpots(): [number, number, number][] {
  const plan = STREET_PLAN;
  const spots: [number, number, number][] = [];
  for (const [x, z] of plan.bins as readonly Vec2[]) spots.push([x, z, 2.2]);
  for (const b of plan.benches) spots.push([b.at[0], b.at[1], 2]);
  spots.push([plan.shelter.at[0], plan.shelter.at[1], 3.5]);
  for (const t of plan.terraces) spots.push([(t.from[0] + t.to[0]) / 2, (t.from[1] + t.to[1]) / 2, Math.abs(t.to[0] - t.from[0]) / 2 + 1.5]);
  spots.push([plan.kiosk.at[0], plan.kiosk.at[1], 2]);
  return spots;
}

/** After `map_fragment`: each slab's shade, the gum, the stains. */
export const SLAB_COLOR = /* glsl */ `
  vec2 slabCell = floor(vec2(vGroundXZ.x, -vGroundXZ.y) / 0.6);
  diffuseColor.rgb *= 0.91 + 0.18 * patchHash(slabCell + 31.7);
  float busy = 0.0;
  ${busySpots()
    .map(([x, z, r]) => `busy = max(busy, 1.0 - smoothstep(${f(r * 0.3)}, ${f(r)}, length(vGroundXZ - vec2(${f(x)}, ${f(z)}))));`)
    .join('\n  ')}
  vec2 gumCell = floor(vGroundXZ * 7.0);
  vec2 gumAt = fract(vGroundXZ * 7.0) - 0.5 + (vec2(patchHash(gumCell + 1.1), patchHash(gumCell + 2.2)) - 0.5) * 0.5;
  float gumFade = 1.0 - smoothstep(0.1, 0.25, length(fwidth(vGroundXZ * 7.0)));
  float gum = step(patchHash(gumCell + 5.3), 0.012 + 0.11 * busy) * (1.0 - smoothstep(0.07, 0.1, length(gumAt))) * gumFade;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.24, 0.23, 0.22) + 0.2 * vec3(patchHash(gumCell + 9.0)), gum * 0.75);
  diffuseColor.rgb *= 1.0 - 0.2 * busy * smoothstep(0.45, 0.75, patchNoise(vGroundXZ * 1.3 + 40.0));
`;

/** After `normal_fragment_maps`: each slab settled at its own tilt (a few degrees at most), in view space. */
export const SLAB_TILT = /* glsl */ `
  {
    vec2 slabAt = floor(vec2(vGroundXZ.x, -vGroundXZ.y) / 0.6);
    vec2 slabTilt = (vec2(patchHash(slabAt + 3.3), patchHash(slabAt + 4.4)) - 0.5) * 0.05;
    normal = normalize(normal + (viewMatrix * vec4(slabTilt.x, 0.0, -slabTilt.y, 0.0)).xyz);
  }
`;
