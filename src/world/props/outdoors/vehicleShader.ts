import * as THREE from 'three';
import { QUALITY } from '@/graphics/quality';
import { BIKE_KIND, VEHICLE_KINDS, VEHICLE_LOOKS } from './LifeVehicles';

/*
 * The vehicles of `Life`, drawn by the pane shader as solids: every pixel's ray is intersected with
 * each vehicle's volumes (body, cabin with its sloping screens, load box, taxi sign, wheels) at the
 * vehicle's real place, so it is seen in true perspective from any window or the balcony and never
 * slides against the road. A sprite stretched over its place could not: its picture was painted
 * for one viewing angle and distance and drifted off the road between two of them (a 12 m bus seen
 * from 14 m fills 50° of the view). The shapes are `Car.ts`'s box models (`VEHICLE_LOOKS`), written
 * into the GLSL below; per vehicle the CPU sends only where it is, which way it points, its paint
 * and its fade (`Life.vehiclePose`, `vehicleLook`). Its shadow on the road and its headlight beam
 * after dark come from the same loop. The cyclists are drawn the same way (`bikeHit`). Plain strings:
 * no backtick in the GLSL, not even a comment.
 */

/**
 * How many vehicles and cyclists the shader can draw at once (two vec4 uniforms each): the traffic's
 * `MAX_CARS` + 2, and the cyclists' 5, fit; low quality draws the 8 nearest the camera.
 */
export const VEHICLE_COUNT = QUALITY.level === 'low' ? 8 : 20;

/** How far ahead a headlight beam lights the road, in metres. */
const BEAM = 4.5;

const f = (v: number): string => v.toFixed(4);

/** A colour in linear light as a GLSL vec3. */
function vec3Of(hex: string): string {
  const c = new THREE.Color(hex);
  return `vec3(${f(c.r)}, ${f(c.g)}, ${f(c.b)})`;
}

/** `shapeOf(kind)`: every kind's box model, in the order of `VEHICLE_KINDS`. */
function shapeFunction(): string {
  const branches = VEHICLE_KINDS.map((kind, i) => {
    const { body: b, stripe } = VEHICLE_LOOKS[kind];
    return `  if (kind == ${i}) {
    s.a = vec4(${f(b.length)}, ${f(b.width)}, ${f(b.height)}, ${f(b.body)});
    s.b = vec4(${f(b.floor)}, ${f(b.cab0)}, ${f(b.roof0)}, ${f(b.roof1)});
    s.c = vec4(${f(b.cab1)}, ${f(b.inset)}, ${f(b.wheel)}, ${f(b.wheelIn)});
    s.e = vec4(${f(b.cargo?.length ?? 0)}, ${f(b.cargo?.height ?? 0)}, ${f(b.roofTop ?? 0)}, ${f(b.pillars)});
    s.stripe = vec2(${f(stripe?.from ?? 0)}, ${f(stripe?.to ?? 0)});
    s.stripeColor = ${vec3Of(stripe?.color ?? '#000000')};
    return s;
  }`;
  }).join('\n');
  // The bicycle and its rider (bikeHit): only its size is read here (the skip test, its shadow); e.w -1 marks it.
  const bike = `  if (kind == ${BIKE_KIND}) {
    s.a = vec4(1.75, 0.5, 1.75, 0.7);
    s.b = vec4(0.0);
    s.c = vec4(0.0);
    s.e = vec4(0.0, 0.0, 0.0, -1.0);
    s.stripe = vec2(0.0);
    s.stripeColor = vec3(0.0);
    return s;
  }`;
  return `Shape shapeOf(int kind) {
  Shape s;
${branches}
${bike}
  return s;
}`;
}

export const VEHICLE_UNIFORMS = /* glsl */ `
  #define VEHICLES ${VEHICLE_COUNT}
  uniform vec4 vehiclePose[VEHICLES]; // x, z (metres from the painting's eye), heading, kind (negative: none)
  uniform vec4 vehicleLook[VEHICLES]; // packed paint (linear), alpha, unused, unused
`;

export const VEHICLE_FUNCTIONS = /* glsl */ `
  // A vehicle's box model, in its own frame: u along it from the rear (0) to the front (length), y up
  // from the road, v across it from its middle. a: length, width, height, body line; b: floor, cab0,
  // roof0, roof1; c: cab1, cabin inset, wheel radius, wheels in from the ends; e: load box length and
  // height, roof sign height, window pillars; stripe: the livery band's heights on the flanks.
  struct Shape { vec4 a; vec4 b; vec4 c; vec4 e; vec2 stripe; vec3 stripeColor; };
  const float VEHICLE_BEAM = ${f(BEAM)};
  const int PART_BODY = 0;
  const int PART_CABIN = 1;
  const int PART_CARGO = 2;
  const int PART_SIGN = 3;
  const int PART_TYRE = 4;
  const int PART_HUB = 5;
  const int PART_FRAME = 6;
  const int PART_LEGS = 7;
  const int PART_JERSEY = 8;
  const int PART_SKIN = 9;
  const int PART_LAMP_FRONT = 10;
  const int PART_LAMP_REAR = 11;
${shapeFunction()}
  // Local vectors are (u, y, v). A ray component of exactly zero would divide by zero.
  vec3 safeDir(vec3 d) {
    return vec3(abs(d.x) < 1e-6 ? 1e-6 : d.x, abs(d.y) < 1e-6 ? 1e-6 : d.y, abs(d.z) < 1e-6 ? 1e-6 : d.z);
  }
  // Where the ray enters the box lo..hi, if that is nearer than best: best, its face's normal and the part.
  void boxHit(vec3 ro, vec3 rd, vec3 lo, vec3 hi, int part, inout float best, inout vec3 bestN, inout int bestPart) {
    vec3 inv = 1.0 / rd;
    vec3 t0 = (lo - ro) * inv;
    vec3 t1 = (hi - ro) * inv;
    vec3 tmin = min(t0, t1);
    vec3 tmax = max(t0, t1);
    float tn = max(max(tmin.x, tmin.y), tmin.z);
    float tf = min(min(tmax.x, tmax.y), tmax.z);
    if (tn > tf || tn <= 0.0 || tn >= best) return;
    best = tn;
    bestPart = part;
    bestN = tn == tmin.x ? vec3(-sign(rd.x), 0.0, 0.0) : tn == tmin.y ? vec3(0.0, -sign(rd.y), 0.0) : vec3(0.0, 0.0, -sign(rd.z));
  }
  // One face of a convex solid (inside where dot(n, p) <= k): narrows the ray's span inside it.
  void clipPlane(vec3 ro, vec3 rd, vec3 n, float k, inout float tn, inout float tf, inout vec3 nn) {
    float den = dot(n, rd);
    float num = k - dot(n, ro);
    if (abs(den) < 1e-7) {
      if (num < 0.0) tn = 1e9;
      return;
    }
    float t = num / den;
    if (den < 0.0) {
      if (t > tn) {
        tn = t;
        nn = n;
      }
    } else tf = min(tf, t);
  }
  // The cabin: from the body line up to the roof, inset from the flanks, its windscreen and rear
  // window sloping in from cab0 to roof0 and from cab1 to roof1.
  void cabinHit(vec3 ro, vec3 rd, Shape s, inout float best, inout vec3 bestN, inout int bestPart) {
    float h = s.a.z;
    float bodyLine = s.a.w;
    float halfW = s.a.y * 0.5 - s.c.y;
    float s0 = (s.b.z - s.b.y) / max(h - bodyLine, 0.01);
    float s1 = (s.c.x - s.b.w) / max(h - bodyLine, 0.01);
    float tn = -1e9;
    float tf = 1e9;
    vec3 nn = vec3(0.0, 1.0, 0.0);
    clipPlane(ro, rd, vec3(0.0, 1.0, 0.0), h, tn, tf, nn);
    clipPlane(ro, rd, vec3(0.0, -1.0, 0.0), -bodyLine, tn, tf, nn);
    clipPlane(ro, rd, vec3(0.0, 0.0, 1.0), halfW, tn, tf, nn);
    clipPlane(ro, rd, vec3(0.0, 0.0, -1.0), halfW, tn, tf, nn);
    clipPlane(ro, rd, vec3(-1.0, s0, 0.0), -s.b.y + s0 * bodyLine, tn, tf, nn);
    clipPlane(ro, rd, vec3(1.0, s1, 0.0), s.c.x + s1 * bodyLine, tn, tf, nn);
    if (tn > tf || tn <= 0.0 || tn >= best) return;
    best = tn;
    bestN = normalize(nn);
    bestPart = PART_CABIN;
  }
  // An axle's pair of wheels: a cylinder across the vehicle at u = uc, radius r, its ends at v = +-hw.
  void wheelHit(vec3 ro, vec3 rd, float uc, float r, float hw, inout float best, inout vec3 bestN, inout int bestPart) {
    vec2 oc = vec2(ro.x - uc, ro.y - r);
    vec2 dd = rd.xy;
    float a = dot(dd, dd);
    float b = dot(oc, dd);
    float c = dot(oc, oc) - r * r;
    float disc = b * b - a * c;
    if (disc > 0.0 && a > 1e-8) {
      float t = (-b - sqrt(disc)) / a;
      if (t > 0.0 && t < best && abs(ro.z + t * rd.z) <= hw) {
        best = t;
        bestN = vec3((oc + t * dd) / r, 0.0);
        bestPart = PART_TYRE;
      }
    }
    for (int k = 0; k < 2; k++) {
      float side = k == 0 ? 1.0 : -1.0;
      float t = (side * hw - ro.z) / rd.z;
      vec2 q = oc + t * dd;
      if (t > 0.0 && t < best && dot(q, q) <= r * r) {
        best = t;
        bestN = vec3(0.0, 0.0, side);
        bestPart = dot(q, q) < r * r * 0.2 ? PART_HUB : PART_TYRE;
      }
    }
  }
  // The nearest of a vehicle's volumes along the ray (local frame): its distance t (or 1e9), normal and part.
  float vehicleHit(vec3 ro, vec3 rd, Shape s, out vec3 n, out int part) {
    float best = 1e9;
    n = vec3(0.0, 1.0, 0.0);
    part = PART_BODY;
    float len = s.a.x;
    float halfW = s.a.y * 0.5;
    boxHit(ro, rd, vec3(0.0, s.b.x, -halfW), vec3(len, s.a.w, halfW), PART_BODY, best, n, part);
    cabinHit(ro, rd, s, best, n, part);
    if (s.e.x > 0.0) boxHit(ro, rd, vec3(0.0, s.b.x, -halfW), vec3(s.e.x, s.e.y, halfW), PART_CARGO, best, n, part);
    if (s.e.z > 0.0) {
      float mid = (s.b.z + s.b.w) * 0.5;
      boxHit(ro, rd, vec3(mid - 0.3, s.a.z, -0.35), vec3(mid + 0.3, s.a.z + s.e.z, 0.35), PART_SIGN, best, n, part);
    }
    wheelHit(ro, rd, s.c.w, s.c.z, halfW - 0.04, best, n, part);
    wheelHit(ro, rd, len - s.c.w, s.c.z, halfW - 0.04, best, n, part);
    return best;
  }
  // A bicycle's spoked wheel at u = uc, radius r, hw thick: the tyre's ring and the hub are solid, the spokes let the view through.
  void bikeWheelHit(vec3 ro, vec3 rd, float uc, float r, float hw, inout float best, inout vec3 bestN, inout int bestPart) {
    for (int k = 0; k < 2; k++) {
      float side = k == 0 ? 1.0 : -1.0;
      float t = (side * hw - ro.z) / rd.z;
      vec2 q = vec2(ro.x + t * rd.x - uc, ro.y + t * rd.y - r);
      float q2 = dot(q, q);
      if (t > 0.0 && t < best && (q2 <= r * r && q2 >= r * r * 0.72 || q2 < r * r * 0.02)) {
        best = t;
        bestN = vec3(0.0, 0.0, side);
        bestPart = q2 < r * r * 0.02 ? PART_HUB : PART_TYRE;
      }
    }
    vec2 oc = vec2(ro.x - uc, ro.y - r);
    float a = dot(rd.xy, rd.xy);
    float b = dot(oc, rd.xy);
    float disc = b * b - a * (dot(oc, oc) - r * r);
    if (disc > 0.0 && a > 1e-8) {
      float t = (-b - sqrt(disc)) / a;
      if (t > 0.0 && t < best && abs(ro.z + t * rd.z) <= hw) {
        best = t;
        bestN = vec3((oc + t * rd.xy) / r, 0.0);
        bestPart = PART_TYRE;
      }
    }
  }
  // A cyclist, in the bicycle's frame (u from the back wheel's rear to the front one's front, 1.75 m):
  // two wheels, the frame, the rider's legs, body, arms and head, a lamp on the bars and one under the saddle.
  float bikeHit(vec3 ro, vec3 rd, out vec3 n, out int part) {
    float best = 1e9;
    n = vec3(0.0, 1.0, 0.0);
    part = PART_FRAME;
    bikeWheelHit(ro, rd, 0.36, 0.34, 0.025, best, n, part);
    bikeWheelHit(ro, rd, 1.39, 0.34, 0.025, best, n, part);
    boxHit(ro, rd, vec3(0.36, 0.56, -0.025), vec3(1.39, 0.66, 0.025), PART_FRAME, best, n, part);
    boxHit(ro, rd, vec3(0.62, 0.3, -0.025), vec3(0.78, 0.66, 0.025), PART_FRAME, best, n, part);
    boxHit(ro, rd, vec3(0.62, 0.34, -0.15), vec3(0.9, 0.98, 0.15), PART_LEGS, best, n, part);
    boxHit(ro, rd, vec3(0.68, 0.98, -0.2), vec3(1.1, 1.5, 0.2), PART_JERSEY, best, n, part);
    boxHit(ro, rd, vec3(1.0, 1.08, -0.21), vec3(1.36, 1.24, 0.21), PART_JERSEY, best, n, part);
    boxHit(ro, rd, vec3(0.9, 1.5, -0.1), vec3(1.12, 1.74, 0.1), PART_SKIN, best, n, part);
    boxHit(ro, rd, vec3(1.37, 0.86, -0.04), vec3(1.44, 0.95, 0.04), PART_LAMP_FRONT, best, n, part);
    boxHit(ro, rd, vec3(0.17, 0.76, -0.03), vec3(0.23, 0.83, 0.03), PART_LAMP_REAR, best, n, part);
    return best;
  }
  // A lamp's disc on an end face: how much of it the point (v, y) is in, soft-edged.
  float lampAt(vec2 p, vec2 c, float r) {
    return 1.0 - smoothstep(r * 0.7, r, length(p - c));
  }
  // What a vehicle's surface looks like where the ray meets it: its own colour (albedo, linear), how
  // much of it is glass, and what it gives out after dark (lamps, a lit bus saloon, the taxi sign).
  void vehicleSurface(Shape s, int part, vec3 p, vec3 n, vec3 paint, out vec3 albedo, out float glass, out vec3 emit) {
    albedo = paint;
    glass = 0.0;
    emit = vec3(0.0);
    float len = s.a.x;
    float halfW = s.a.y * 0.5;
    bool flank = abs(n.z) > 0.5;
    bool top = n.y > 0.5;
    if (part == PART_TYRE) {
      albedo = vec3(0.018);
      return;
    }
    if (part == PART_FRAME) {
      albedo = vec3(0.14, 0.15, 0.16);
      return;
    }
    if (part == PART_LEGS) {
      albedo = vec3(0.05, 0.06, 0.09);
      return;
    }
    if (part == PART_JERSEY) {
      albedo = paint;
      return;
    }
    if (part == PART_SKIN) {
      albedo = vec3(0.55, 0.38, 0.27);
      return;
    }
    if (part == PART_LAMP_FRONT) {
      albedo = vec3(0.8);
      emit = vec3(1.0, 0.95, 0.85) * 2.5 * lightsOn;
      return;
    }
    if (part == PART_LAMP_REAR) {
      albedo = vec3(0.5, 0.03, 0.02);
      emit = vec3(1.0, 0.1, 0.05) * 2.0 * lightsOn;
      return;
    }
    if (part == PART_HUB) {
      albedo = vec3(0.22, 0.22, 0.23);
      return;
    }
    if (part == PART_SIGN) {
      albedo = vec3(0.9, 0.78, 0.38);
      emit = WARM * 0.9 * lightsOn;
      return;
    }
    if (part == PART_CABIN) {
      if (top) {
        albedo = paint * 1.15;
        return;
      }
      albedo = vec3(0.016, 0.022, 0.03);
      glass = 0.5;
      if (flank) {
        // Window pillars down the side glass, and a bus's roof rim over its windows.
        float pillars = s.e.w;
        if (pillars > 0.5) {
          float k = (p.x - s.b.z) / max(s.b.w - s.b.z, 0.01) * (pillars + 1.0);
          if (abs(k - floor(k + 0.5)) * (s.b.w - s.b.z) / (pillars + 1.0) < 0.05 && k > 0.5 && k < pillars + 0.5) {
            albedo = paint * 0.6;
            glass = 0.0;
          }
        }
        if (pillars > 1.5) {
          if (p.y > s.a.z - 0.35) {
            albedo = paint * 0.95;
            glass = 0.0;
          } else emit = WARM * 0.22 * lightsOn;
        }
      }
      return;
    }
    // The body and the load box.
    if (top) albedo = paint * 1.12;
    if (flank) {
      if (p.y < s.b.x + 0.14) albedo = paint * 0.35;
      if (s.stripe.y > s.stripe.x && p.y >= s.stripe.x && p.y <= s.stripe.y) albedo = s.stripeColor;
    }
    if (n.x > 0.5 && p.y < 1.2) {
      // The front: headlights either side, white by day, lit after dark.
      float lamp = max(lampAt(vec2(p.z, p.y), vec2(halfW - 0.32, 0.62), 0.15), lampAt(vec2(p.z, p.y), vec2(-halfW + 0.32, 0.62), 0.15));
      albedo = mix(albedo * 0.9, vec3(0.85, 0.85, 0.8), lamp);
      emit += vec3(1.0, 0.92, 0.78) * lamp * 2.5 * lightsOn;
    }
    if (n.x < -0.5) {
      // The rear: tail lights, and the doors' seam on a load box.
      float lamp = max(lampAt(vec2(p.z, p.y), vec2(halfW - 0.25, 0.75), 0.11), lampAt(vec2(p.z, p.y), vec2(-halfW + 0.25, 0.75), 0.11));
      albedo = mix(albedo * 0.88, vec3(0.5, 0.03, 0.02), lamp);
      emit += vec3(1.0, 0.12, 0.06) * lamp * 1.6 * lightsOn;
      if (part == PART_CARGO && abs(p.z) < 0.02) albedo *= 0.4;
    }
  }
`;
