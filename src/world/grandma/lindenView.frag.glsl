// Linden Avenue through Mémé's window (LindenView.ts): the eye's ray through the pane, out along -z, meets the
// avenue's layers far to near (the town past the side street, the ground, the facades across, the trees on both kerbs)
// and takes the nearest; then the light of the hour, the lit windows and street lamps at night, the haze.
// Distances and sizes are TS_* defines (lindenPainters LINDEN, LindenView), metres in the pane's frame. The near
// kerb's trees stand at x = 6 m (mod 12), the far kerb's at 0; the lamps between them.
uniform sampler2D facades;
uniform sampler2D facadeLights;
uniform sampler2D trees;
uniform sampler2D road;
uniform sampler2D town;
uniform vec3 zenith;
uniform vec3 horizon;
uniform vec3 lit;
uniform float night;
uniform float haze;
uniform float snow;
uniform float wet;
uniform float time;
uniform float groundY;
varying vec3 vLocal;
varying vec3 vEye;

// One upright layer at `depth` past the glass: its texel where the ray meets it (alpha 0 off its strip).
vec4 upright(sampler2D map, vec3 eye, vec3 dir, float depth, float period, float height, float shift) {
  float t = (-depth - eye.z) / dir.z;
  vec3 p = eye + dir * t;
  float v = (p.y - groundY) / height;
  if (t <= 0.0 || v < 0.0 || v > 1.0) return vec4(0.0);
  return texture2D(map, vec2((p.x + shift) / period, v));
}

// A layer laid over what is behind it.
vec3 over(vec3 behind, vec4 layer) {
  return mix(behind, layer.rgb, layer.a);
}

float hash(float n) {
  return fract(sin(n * 12.9898) * 43758.5453);
}

// A car going by in a lane (seen from above), at `speed` m/s along x: 1 inside its body, 0 out.
float car(vec2 p, float lane, float speed, float offset) {
  float span = 160.0;
  float x = mod(time * speed + offset, span) - span * 0.5;
  vec2 d = abs(p - vec2(x, lane)) - vec2(2.1, 0.85);
  return 1.0 - smoothstep(0.0, 0.08, max(d.x, d.y));
}

// Distance (along x) to the nearest of a row spaced 12 m starting at `x0`.
float rowDistance(float x, float x0) {
  return abs(mod(x - x0 + 6.0, 12.0) - 6.0);
}

// The street at the point `g` where the ray comes down, `d` past the glass: its colour, lit by the hour.
vec3 street(vec3 g, float d) {
  vec3 ground;
  if (d > TS_ROAD_NEAR && d < TS_ROAD_FAR) {
    ground = texture2D(road, vec2(g.x / TS_ROAD_PERIOD, 1.0 - (d - TS_ROAD_NEAR) / (TS_ROAD_FAR - TS_ROAD_NEAR))).rgb;
    // The traffic: a car each way.
    float a = car(vec2(g.x, d), TS_ROAD_NEAR + 4.6, 9.0, 0.0);
    float b = car(vec2(g.x, d), TS_ROAD_FAR - 4.6, -8.0, 70.0);
    ground = mix(ground, vec3(hash(floor(time * 9.0 / 160.0)), 0.3, 0.35), a);
    ground = mix(ground, vec3(0.25, 0.3, hash(floor((time * -8.0 + 70.0) / 160.0) + 3.0)), b);
  } else if (d < TS_FACADE_D) {
    // The pavements: pale slabs and their joints.
    vec2 slab = fract(vec2(g.x, d) / vec2(1.2, 0.8));
    float joint = clamp(step(slab.x, 0.03) + step(slab.y, 0.04), 0.0, 1.0);
    ground = mix(vec3(0.62, 0.6, 0.56), vec3(0.45, 0.44, 0.42), joint);
  } else {
    // Down the side street: its asphalt.
    ground = vec3(0.3, 0.31, 0.33);
  }
  // The trees' shade under them by day, a wet street darker, snow lying.
  float nearShade = 1.0 - smoothstep(1.5, 4.0, length(vec2(rowDistance(g.x, 6.0), d - TS_TREE_NEAR_D)));
  float farShade = 1.0 - smoothstep(1.5, 4.0, length(vec2(rowDistance(g.x, 0.0), d - TS_TREE_FAR_D)));
  ground *= 1.0 - 0.35 * max(nearShade, farShade) * (1.0 - night);
  ground *= 1.0 - 0.35 * wet;
  ground = mix(ground, vec3(0.92, 0.94, 0.96), 0.85 * snow);
  vec3 lighted = ground * lit;
  // The street lamps' pools at night, between the trees along both kerbs.
  float nearLamp = length(vec2(rowDistance(g.x, 0.0), d - TS_LAMP_NEAR_D));
  float farLamp = length(vec2(rowDistance(g.x, 6.0), d - TS_LAMP_FAR_D));
  float lamp = min(nearLamp, farLamp);
  return lighted + vec3(1.0, 0.72, 0.4) * exp(-lamp * lamp / 5.0) * night * 0.55;
}

void main() {
  vec3 eye = vEye;
  vec3 dir = normalize(vLocal - vEye);
  // The sky: horizon to zenith with the ray's height.
  vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.55, dir.y));
  float depth = TS_TOWN_D * 2.0;
  if (dir.z < -0.001) {
    // The town, far off past the side street.
    vec4 far = upright(town, eye, dir, TS_TOWN_D, TS_TOWN_PERIOD, TS_TOWN_H, 0.0);
    col = over(col, vec4(far.rgb * lit, far.a));
    if (far.a > 0.5) depth = TS_TOWN_D;
    // The ground, where the ray comes down to the street (the layers in front of it are laid over it below).
    if (dir.y < 0.0) {
      vec3 g = eye + dir * ((groundY - eye.y) / dir.y);
      float d = -g.z;
      if (d > 0.0 && d < TS_TOWN_D) {
        col = street(g, d);
        depth = d;
      }
    }
    // The facades across, their lit windows at night.
    vec4 front = upright(facades, eye, dir, TS_FACADE_D, TS_FACADE_PERIOD, TS_FACADE_H, TS_FACADE_SHIFT);
    float glow = upright(facadeLights, eye, dir, TS_FACADE_D, TS_FACADE_PERIOD, TS_FACADE_H, TS_FACADE_SHIFT).r;
    col = over(col, vec4(front.rgb * lit + vec3(1.0, 0.76, 0.46) * glow * night * 0.9, front.a));
    if (front.a > 0.5) depth = min(depth, TS_FACADE_D);
    // The trees along the far kerb, then along ours.
    vec4 farTrees = upright(trees, eye, dir, TS_TREE_FAR_D, TS_TREE_PERIOD, TS_TREE_H, TS_TREE_PERIOD * 0.25);
    col = over(col, vec4(farTrees.rgb * lit, farTrees.a));
    if (farTrees.a > 0.5) depth = min(depth, TS_TREE_FAR_D);
    vec4 nearTrees = upright(trees, eye, dir, TS_TREE_NEAR_D, TS_TREE_PERIOD, TS_TREE_H, 0.0);
    col = over(col, vec4(nearTrees.rgb * lit * 0.92, nearTrees.a));
    if (nearTrees.a > 0.5) depth = min(depth, TS_TREE_NEAR_D);
  }
  // The air between: the farther, the more of the horizon's colour.
  col = mix(col, horizon * (0.55 + 0.45 * (1.0 - night)), 1.0 - exp(-depth * haze));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
