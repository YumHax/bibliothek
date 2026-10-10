import * as THREE from 'three';

/**
 * Penumbra in shadow-map texels per unit of depth between the blocker and the receiver, for the
 * window suns (`props/Window`: a perspective map over 7..21 m, the patch ~9 m from the light): the
 * sun's half-degree disc opens about 6 texels of a 2048 map per metre past a mullion, and a metre
 * is about 0.13 of that map's depth there.
 */
const TEXELS_PER_DEPTH = 48;

/**
 * Contact-hardening shadows (PCSS) for the spot and directional maps that ask for them: a light
 * whose `shadow.radius` is above 1.5 (three's `PCFSoftShadowMap` ignores the radius on those maps,
 * so it is free to mean "up to this many texels of penumbra") first averages the depth of what
 * blocks it round the fragment, then filters over a disc as wide as the gap between that blocker
 * and the fragment: a window's mullions throw sharp shadows on the sill and soft ones across the
 * room. Twelve rotated taps to search and twelve to filter; the same map, no new texture unit.
 * Every other light keeps three's filter exactly. A chunk edit like `metalReflections`, made once
 * before any program compiles (high only: `quality.ts`).
 */
export function contactHardeningShadows(): void {
  const chunk = THREE.ShaderChunk.shadowmap_pars_fragment;
  if (chunk.includes('contactHardenedShadow')) return;
  const getShadow = 'float getShadow( sampler2D shadowMap,';
  const soft = /(#elif defined\( SHADOWMAP_TYPE_PCF_SOFT \)\s*\n)/;
  const vsm = /(\n\s*#elif defined\( SHADOWMAP_TYPE_VSM \)\s*\n\s*shadow = VSMShadow)/;
  if (!chunk.includes(getShadow) || !soft.test(chunk) || !vsm.test(chunk)) throw new Error('[softShadows] three.js shadow chunk changed');
  const helper = /* glsl */ `
	// contactHardenedShadow (graphics/softShadows.ts)
	const vec2 PCSS_DISC[ 12 ] = vec2[](
		vec2( -0.326, -0.406 ), vec2( -0.840, -0.074 ), vec2( -0.696, 0.457 ), vec2( -0.203, 0.621 ),
		vec2( 0.962, -0.195 ), vec2( 0.473, -0.480 ), vec2( 0.519, 0.767 ), vec2( 0.185, -0.893 ),
		vec2( 0.507, 0.064 ), vec2( 0.896, 0.412 ), vec2( -0.322, -0.933 ), vec2( -0.792, -0.598 )
	);
	float contactHardenedShadow( sampler2D shadowMap, vec2 shadowMapSize, float maxRadius, vec3 coord ) {
		vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
		// The disc turned per pixel (interleaved gradient noise): grain the grade's own grain hides, never bands.
		float angle = 6.2831853 * fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
		mat2 spin = mat2( cos( angle ), sin( angle ), - sin( angle ), cos( angle ) );
		float blockers = 0.0;
		float blockerDepth = 0.0;
		for ( int i = 0; i < 12; i ++ ) {
			float d = unpackRGBAToDepth( texture2D( shadowMap, coord.xy + spin * PCSS_DISC[ i ] * texelSize * maxRadius ) );
			if ( d < coord.z ) {
				blockers += 1.0;
				blockerDepth += d;
			}
		}
		if ( blockers < 0.5 ) return 1.0;
		float radius = clamp( ( coord.z - blockerDepth / blockers ) * ${TEXELS_PER_DEPTH.toFixed(1)}, 1.0, maxRadius );
		float lit = 0.0;
		for ( int i = 0; i < 12; i ++ ) lit += texture2DCompare( shadowMap, coord.xy + spin * PCSS_DISC[ i ] * texelSize * radius, coord.z );
		return lit / 12.0;
	}
`;
  THREE.ShaderChunk.shadowmap_pars_fragment = chunk
    .replace(getShadow, `${helper}\n\t${getShadow}`)
    .replace(soft, '$1\t\t\tif ( shadowRadius > 1.5 ) {\n\t\t\t\tshadow = contactHardenedShadow( shadowMap, shadowMapSize, shadowRadius, shadowCoord.xyz );\n\t\t\t} else {\n')
    .replace(vsm, '\n\t\t\t}$1');
}
