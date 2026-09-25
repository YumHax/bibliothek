import type { Fill } from './Sheet';
import { shade } from './paint';

/**
 * The shape of a vehicle's box model, in metres: overall `length`, `width`, `height`; the `body`
 * line (bonnet and boot, or a bus's waist) and the `floor` above the road; where along it the
 * windscreen starts (`cab0`) and meets the roof (`roof0`), where the roof ends and the rear window
 * comes down (`roof1`, `cab1`); how far the cabin is inset from the sides; the wheels' radius and
 * how far in from each end they stand; and how many window pillars split the side glass.
 */
export interface VehicleBody {
  length: number;
  width: number;
  height: number;
  body: number;
  floor: number;
  cab0: number;
  roof0: number;
  roof1: number;
  cab1: number;
  inset: number;
  wheel: number;
  wheelIn: number;
  pillars: number;
  /** A box behind the cab (a van's or a lorry's load space): from the rear (u = 0) to `length`, `height` tall. */
  cargo?: { length: number; height: number };
  /** Something standing on the roof, this many metres tall (a taxi's sign): the sprite leaves room for it. */
  roofTop?: number;
}

/** A small hatchback. */
export const CAR_BODY: VehicleBody = { length: 4.4, width: 1.8, height: 1.45, body: 0.85, floor: 0.3, cab0: 1.1, roof0: 1.75, roof1: 3.35, cab1: 3.9, inset: 0.15, wheel: 0.33, wheelIn: 0.85, pillars: 1 };
/** A city bus: a long box, nearly all window above the waist, the windscreen almost upright. */
export const BUS_BODY: VehicleBody = { length: 11.5, width: 2.5, height: 3.05, body: 1.15, floor: 0.35, cab0: 0.05, roof0: 0.3, roof1: 11.25, cab1: 11.4, inset: 0.06, wheel: 0.5, wheelIn: 2.4, pillars: 7 };
/** A taxi: the hatchback with its sign on the roof. */
export const TAXI_BODY: VehicleBody = { ...CAR_BODY, roofTop: 0.3 };
/** A delivery van: a short cab with a steep windscreen in front of a tall box. */
export const VAN_BODY: VehicleBody = { length: 6, width: 2.05, height: 2.15, body: 1.1, floor: 0.35, cab0: 4.2, roof0: 4.3, roof1: 5.1, cab1: 5.65, inset: 0.08, wheel: 0.36, wheelIn: 1.05, pillars: 0, cargo: { length: 4.25, height: 2.75 } };
/** An ambulance: a van chassis with a box body a little longer and lower than the delivery van's. */
export const AMBULANCE_BODY: VehicleBody = { ...VAN_BODY, length: 6.3, height: 2.25, cab0: 4.5, roof0: 4.6, roof1: 5.4, cab1: 5.95, cargo: { length: 4.55, height: 2.7 } };
/** A dustcart: a high cab over the front wheels, the long compactor body behind. */
export const TRUCK_BODY: VehicleBody = { length: 9, width: 2.5, height: 2.95, body: 1.55, floor: 0.5, cab0: 6.9, roof0: 7, roof1: 8.2, cab1: 8.85, inset: 0.06, wheel: 0.52, wheelIn: 1.5, pillars: 0, cargo: { length: 6.8, height: 3.35 } };
export const CAR_LENGTH = CAR_BODY.length;
export const CAR_WIDTH = CAR_BODY.width;
export const CAR_HEIGHT = CAR_BODY.height;
const GLASS = '#1f2a34';

export const CAR_COLORS = ['#e8e8e6', '#c4c6c8', '#1c1e22', '#2f3f66', '#8a2a2a', '#5a5d62', '#3a4a3a', '#d9d4c4', '#6b3f2a', '#b8b0a0'];

/**
 * Where the car stands: `x, z` is the near-side rear corner (u = 0, v = 0), `along` the unit
 * direction it points to (u axis, its length), `across` the unit direction away from the eye
 * (v axis, its width). Positions are metres from the eye.
 */
export interface CarFrame {
  x: number;
  z: number;
  along: [number, number];
  across: [number, number];
}

/** What the car is painted with: a projection of world points and fills on some canvas. */
export interface CarBrush {
  point(x: number, z: number, height: number): [number, number];
  /** A face of the car: `glass` is how much of it mirrors the sky. */
  fill(p: Path2D, fill: Fill, glass: number): void;
  /** Shading inside a face already filled. */
  detail(p: Path2D, fill: string): void;
  /** Radius of a wheel in canvas pixels. */
  wheelRadius: number;
  /** The car's shadow on the road, when the canvas keeps shadows apart (see `Sheet.shadow`); else it is a darker `detail`. */
  shadow?(p: Path2D): void;
}

/**
 * A car as a little box model seen from above and from its near side: shadow, wheels, near
 * flank, whichever end faces the eye, bonnet and boot, windscreen, rear window, side windows,
 * roof. Faces are painted back to front, so the same painter serves the parked cars on the
 * scenery and the moving ones in the sprite atlas.
 */
export function paintCar(brush: CarBrush, frame: CarFrame, color: string, shape: VehicleBody = CAR_BODY): void {
  const { body: BODY, floor: FLOOR, cab0: CAB0, roof0: ROOF0, roof1: ROOF1, cab1: CAB1, inset: INSET, height: CAR_HEIGHT } = shape;
  const P = (u: number, v: number, h: number): [number, number] =>
    brush.point(frame.x + frame.along[0] * u + frame.across[0] * v, frame.z + frame.along[1] * u + frame.across[1] * v, h);
  const quad = (...pts: [number, number, number][]): Path2D => {
    const p = new Path2D();
    pts.forEach(([u, v, h], i) => {
      const [x, y] = P(u, v, h);
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    });
    p.closePath();
    return p;
  };
  const L = shape.length;
  const W = shape.width;
  const vi0 = INSET;
  const vi1 = W - INSET;

  // Shadow on the road: a dark core right under the body (always there), and the sun's share around it.
  brush.detail(quad([0.1, 0.05, 0], [L - 0.1, 0.05, 0], [L - 0.1, W - 0.05, 0], [0.1, W - 0.05, 0]), 'rgba(0,0,0,0.3)');
  const cast = quad([-0.15, -0.2, 0], [L + 0.15, -0.2, 0], [L + 0.15, W + 0.2, 0], [-0.15, W + 0.2, 0]);
  if (brush.shadow) brush.shadow(cast);
  else brush.detail(cast, 'rgba(0,0,0,0.22)');
  // Near wheels, then the flank over their upper halves.
  for (const u of [shape.wheelIn, L - shape.wheelIn]) {
    const [wx, wy] = P(u, 0, shape.wheel);
    const wheel = new Path2D();
    wheel.ellipse(wx, wy, brush.wheelRadius, brush.wheelRadius, 0, 0, Math.PI * 2);
    brush.fill(wheel, '#141414', 0);
    const hub = new Path2D();
    hub.ellipse(wx, wy, brush.wheelRadius * 0.45, brush.wheelRadius * 0.45, 0, 0, Math.PI * 2);
    brush.detail(hub, '#5a5a5e');
  }
  brush.fill(quad([0, 0, FLOOR], [L, 0, FLOOR], [L, 0, BODY], [0, 0, BODY]), shade(color, 0.72), 0.1);
  brush.detail(quad([0, 0, FLOOR], [L, 0, FLOOR], [L, 0, FLOOR + 0.14], [0, 0, FLOOR + 0.14]), 'rgba(0,0,0,0.45)');
  brush.detail(quad([0, 0, BODY - 0.3], [L, 0, BODY - 0.3], [L, 0, BODY - 0.22], [0, 0, BODY - 0.22]), 'rgba(255,255,255,0.18)');
  // The end that faces the eye (if either does): the one whose outward normal points back at the origin.
  const nearEnd = (u: number, sign: number): void => {
    const [fx, fz] = [frame.x + frame.along[0] * u, frame.z + frame.along[1] * u];
    if (frame.along[0] * sign * -fx + frame.along[1] * sign * -fz <= 0) return;
    brush.fill(quad([u, 0, FLOOR], [u, W, FLOOR], [u, W, BODY], [u, 0, BODY]), shade(color, 0.86), 0.1);
  };
  nearEnd(0, -1);
  nearEnd(L, 1);
  // Bonnet and boot: the whole body top, lit from above.
  brush.fill(quad([0, 0, BODY], [L, 0, BODY], [L, W, BODY], [0, W, BODY]), shade(color, 1.12), 0.12);
  brush.detail(quad([CAB0 - 0.04, 0, BODY], [CAB0 + 0.04, 0, BODY], [CAB0 + 0.04, W, BODY], [CAB0 - 0.04, W, BODY]), 'rgba(0,0,0,0.3)');
  brush.detail(quad([CAB1 - 0.04, 0, BODY], [CAB1 + 0.04, 0, BODY], [CAB1 + 0.04, W, BODY], [CAB1 - 0.04, W, BODY]), 'rgba(0,0,0,0.3)');
  // A load box behind the cab: painted before the cab when the vehicle comes towards the eye (the
  // cab is then in front of it), after it when it drives away (the taller box then hides the cab).
  const cargo = shape.cargo;
  const [tipX, tipZ] = [frame.x + frame.along[0] * L, frame.z + frame.along[1] * L];
  const cabFirst = cargo !== undefined && frame.along[0] * -tipX + frame.along[1] * -tipZ <= 0;
  const paintCargo = (): void => {
    if (!cargo) return;
    const { length: CL, height: CH } = cargo;
    brush.fill(quad([0, 0, FLOOR], [CL, 0, FLOOR], [CL, 0, CH], [0, 0, CH]), shade(color, 0.8), 0.06);
    brush.detail(quad([0, 0, FLOOR], [CL, 0, FLOOR], [CL, 0, FLOOR + 0.18], [0, 0, FLOOR + 0.18]), 'rgba(0,0,0,0.4)');
    brush.detail(quad([0.02, 0, CH - 0.12], [CL - 0.02, 0, CH - 0.12], [CL - 0.02, 0, CH], [0.02, 0, CH]), 'rgba(255,255,255,0.2)');
    // Whichever end of the box faces the eye: the rear doors, or its front standing over the cab.
    if (frame.along[0] * frame.x + frame.along[1] * frame.z > 0) {
      brush.fill(quad([0, 0, FLOOR], [0, W, FLOOR], [0, W, CH], [0, 0, CH]), shade(color, 0.9), 0.06);
      brush.detail(quad([0, W / 2 - 0.02, FLOOR + 0.1], [0, W / 2 + 0.02, FLOOR + 0.1], [0, W / 2 + 0.02, CH - 0.1], [0, W / 2 - 0.02, CH - 0.1]), 'rgba(0,0,0,0.35)');
    }
    const [bx, bz] = [frame.x + frame.along[0] * CL, frame.z + frame.along[1] * CL];
    if (frame.along[0] * -bx + frame.along[1] * -bz > 0) brush.fill(quad([CL, 0, CAR_HEIGHT], [CL, W, CAR_HEIGHT], [CL, W, CH], [CL, 0, CH]), shade(color, 0.92), 0.06);
    brush.fill(quad([0, 0, CH], [CL, 0, CH], [CL, W, CH], [0, W, CH]), shade(color, 1.15), 0.1);
    brush.detail(quad([0, 0, CH], [CL, 0, CH], [CL, 0.1, CH], [0, 0.1, CH]), 'rgba(255,255,255,0.25)');
  };
  if (cargo && !cabFirst) paintCargo();
  // Cabin: windscreen and rear window slope up to the roof, side windows on the near flank.
  brush.fill(quad([CAB0, vi0, BODY], [CAB0, vi1, BODY], [ROOF0, vi1, CAR_HEIGHT], [ROOF0, vi0, CAR_HEIGHT]), GLASS, 0.45);
  brush.detail(quad([CAB0, vi0, BODY], [CAB0, vi1, BODY], [ROOF0, vi1, CAR_HEIGHT], [ROOF0, vi0, CAR_HEIGHT]), 'rgba(200,220,240,0.22)');
  brush.fill(quad([CAB1, vi0, BODY], [CAB1, vi1, BODY], [ROOF1, vi1, CAR_HEIGHT], [ROOF1, vi0, CAR_HEIGHT]), GLASS, 0.45);
  brush.fill(quad([ROOF0 - 0.3, vi0, BODY], [ROOF1 + 0.3, vi0, BODY], [ROOF1, vi0, CAR_HEIGHT], [ROOF0, vi0, CAR_HEIGHT]), GLASS, 0.4);
  brush.detail(quad([ROOF0 - 0.3, vi0, BODY], [ROOF1 + 0.3, vi0, BODY], [ROOF1, vi0, CAR_HEIGHT], [ROOF0, vi0, CAR_HEIGHT]), 'rgba(160,190,220,0.18)');
  for (let i = 1; i <= shape.pillars; i++) {
    const pillar = ROOF0 + ((ROOF1 - ROOF0) * i) / (shape.pillars + 1);
    brush.detail(quad([pillar - 0.05, vi0, BODY], [pillar + 0.05, vi0, BODY], [pillar + 0.05, vi0, CAR_HEIGHT], [pillar - 0.05, vi0, CAR_HEIGHT]), shade(color, 0.6));
  }
  if (shape.pillars > 1) {
    // A bus's roof rim above its windows, in its own colour.
    brush.detail(quad([ROOF0 - 0.3, vi0, CAR_HEIGHT - 0.35], [ROOF1 + 0.3, vi0, CAR_HEIGHT - 0.35], [ROOF1, vi0, CAR_HEIGHT], [ROOF0, vi0, CAR_HEIGHT]), shade(color, 0.95));
  }
  // Roof.
  brush.fill(quad([ROOF0, vi0, CAR_HEIGHT], [ROOF1, vi0, CAR_HEIGHT], [ROOF1, vi1, CAR_HEIGHT], [ROOF0, vi1, CAR_HEIGHT]), shade(color, 1.22), 0.15);
  brush.detail(quad([ROOF0, vi0, CAR_HEIGHT], [ROOF1, vi0, CAR_HEIGHT], [ROOF1, vi0 + 0.12, CAR_HEIGHT], [ROOF0, vi0 + 0.12, CAR_HEIGHT]), 'rgba(255,255,255,0.28)');
  if (cargo && cabFirst) paintCargo();
}
