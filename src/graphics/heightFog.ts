import * as THREE from 'three';

/**
 * The outdoor air's shape, shared by reference with every fogged program (a `Float32Array` uniform value is
 * not copied when three clones a material's uniforms): x how much the fog hugs the ground (0 a plain
 * `FogExp2`, 1 the dawn mist: thick at the feet, half as thick 9 m up, as the window panes' `fogAt`), y the
 * ground's height, z the scale height (metres); all zero indoors, where the haze stays uniform.
 */
const AIR = new Float32Array(4);
/** The sun's direction (xyz, world) and how much light the air scatters towards the eye round it (w). */
const SUN = new Float32Array(4);
/** The colour that scattered light adds to the fog. */
const SUN_COLOR = new Float32Array(3);

/** The scale height of the ground mist (metres), the panes' `fogAt`'s. */
const SCALE_HEIGHT = 9;

/**
 * Patches three's fog chunks once, before any program compiles (called by `quality.ts`, as
 * `brightenMetalReflections`): the exponential fog thickens towards the ground when `setOutdoorAir`
 * says so (the street's dawn mist lies in the road while the roofs stand clear, as from the window), and
 * brightens towards the sun (in-scatter: the haze glows round a low sun). Uniform values left at zero
 * (indoors, or a material whose uniforms were made without them) give three's plain fog back.
 * Only `mvPosition`, `viewMatrix` and `cameraPosition` are read: every program that includes the fog
 * chunks has them, sprites and the shops' window interiors (`ShopInteriors`) too.
 */
export function shapeOutdoorFog(): void {
  if (THREE.ShaderChunk.fog_pars_vertex.includes('vFogWorld')) return;
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif
`;
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  // From the eye to here in world space (the view matrix's rotation, transposed).
  vFogWorld = transpose( mat3( viewMatrix ) ) * mvPosition.xyz;
#endif
`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  uniform vec4 fogAir;
  uniform vec4 fogSun;
  uniform vec3 fogSunColor;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
#endif
`;
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    // The air's mean thickness along the ray, from the eye's height above the ground to here's
    // (graphics/heightFog): 1 for a plain fog (fogAir.x 0).
    float fogH0 = max( cameraPosition.y - fogAir.y, 0.0 );
    float fogH1 = max( cameraPosition.y + vFogWorld.y - fogAir.y, 0.0 );
    float fogScale = max( fogAir.z, 1.0 );
    float fogDh = fogH1 - fogH0;
    float fogMist = abs( fogDh ) < 0.05 ? exp( - fogH0 / fogScale ) : fogScale * ( exp( - fogH0 / fogScale ) - exp( - fogH1 / fogScale ) ) / fogDh;
    float fogThick = mix( 1.0, 0.5, fogAir.x ) + 1.1 * fogAir.x * fogMist;
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth * fogThick * fogThick );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  // Light scattered towards the eye round the sun (fogSun.w 0 indoors).
  float fogToSun = max( dot( normalize( vFogWorld + vec3( 0.0, 1e-4, 0.0 ) ), fogSun.xyz ), 0.0 );
  vec3 fogLit = fogColor + fogSunColor * fogSun.w * ( pow( fogToSun, 8.0 ) + 0.25 * pow( fogToSun, 2.0 ) );
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogLit, fogFactor );
#endif
`;
  // The built-in materials take their uniforms from ShaderLib (merged once, when three loaded), the
  // ShaderMaterials with fog from UniformsLib.fog: both get the shared arrays.
  const extra = { fogAir: { value: AIR }, fogSun: { value: SUN }, fogSunColor: { value: SUN_COLOR } };
  Object.assign(THREE.UniformsLib.fog, extra);
  for (const shader of Object.values(THREE.ShaderLib)) {
    if ('fogDensity' in shader.uniforms) Object.assign(shader.uniforms, extra);
  }
}

/**
 * The street's air this frame (`StreetLighting`): how much it lies as a ground mist (`mist` 0..1), the
 * ground's height, and the sun's direction, colour and how much it lights the haze round it (0..1).
 */
export function setOutdoorAir(mist: number, groundY: number, sunDir: THREE.Vector3, sunColor: THREE.Color, scatter: number): void {
  AIR[0] = THREE.MathUtils.clamp(mist, 0, 1);
  AIR[1] = groundY;
  AIR[2] = SCALE_HEIGHT;
  SUN[0] = sunDir.x;
  SUN[1] = sunDir.y;
  SUN[2] = sunDir.z;
  SUN[3] = Math.max(scatter, 0);
  SUN_COLOR[0] = sunColor.r;
  SUN_COLOR[1] = sunColor.g;
  SUN_COLOR[2] = sunColor.b;
}

/** Back indoors: three's plain fog. */
export function clearOutdoorAir(): void {
  AIR.fill(0);
  SUN.fill(0);
}
