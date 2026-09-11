import type { Fill } from './Sheet';
import { shade } from './paint';

/** A small hatchback, in metres. */
export const CAR_LENGTH = 4.4;
export const CAR_WIDTH = 1.8;
export const CAR_HEIGHT = 1.45;
/** Height of the bonnet and boot line, and of the floor above the road. */
const BODY = 0.85;
const FLOOR = 0.3;
/** Where along the car the windscreen, the roof and the rear window start and end. */
const CAB0 = 1.1;
const ROOF0 = 1.75;
const ROOF1 = 3.35;
const CAB1 = 3.9;
/** Cabin inset from the sides. */
const INSET = 0.15;
const WHEEL_RADIUS = 0.33;
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
}

/**
 * A car as a little box model seen from above and from its near side: shadow, wheels, near
 * flank, whichever end faces the eye, bonnet and boot, windscreen, rear window, side windows,
 * roof. Faces are painted back to front, so the same painter serves the parked cars on the
 * scenery and the moving ones in the sprite atlas.
 */
export function paintCar(brush: CarBrush, frame: CarFrame, color: string): void {
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
  const L = CAR_LENGTH;
  const W = CAR_WIDTH;
  const vi0 = INSET;
  const vi1 = W - INSET;

  // Shadow on the road, spilling a little beyond the far side.
  brush.detail(quad([-0.1, -0.15, 0], [L + 0.1, -0.15, 0], [L + 0.25, W + 0.35, 0], [-0.25, W + 0.35, 0]), 'rgba(0,0,0,0.38)');
  // Near wheels, then the flank over their upper halves.
  for (const u of [0.85, L - 0.85]) {
    const [wx, wy] = P(u, 0, WHEEL_RADIUS);
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
  // Cabin: windscreen and rear window slope up to the roof, side windows on the near flank.
  brush.fill(quad([CAB0, vi0, BODY], [CAB0, vi1, BODY], [ROOF0, vi1, CAR_HEIGHT], [ROOF0, vi0, CAR_HEIGHT]), GLASS, 0.45);
  brush.detail(quad([CAB0, vi0, BODY], [CAB0, vi1, BODY], [ROOF0, vi1, CAR_HEIGHT], [ROOF0, vi0, CAR_HEIGHT]), 'rgba(200,220,240,0.22)');
  brush.fill(quad([CAB1, vi0, BODY], [CAB1, vi1, BODY], [ROOF1, vi1, CAR_HEIGHT], [ROOF1, vi0, CAR_HEIGHT]), GLASS, 0.45);
  brush.fill(quad([ROOF0 - 0.3, vi0, BODY], [ROOF1 + 0.3, vi0, BODY], [ROOF1, vi0, CAR_HEIGHT], [ROOF0, vi0, CAR_HEIGHT]), GLASS, 0.4);
  brush.detail(quad([ROOF0 - 0.3, vi0, BODY], [ROOF1 + 0.3, vi0, BODY], [ROOF1, vi0, CAR_HEIGHT], [ROOF0, vi0, CAR_HEIGHT]), 'rgba(160,190,220,0.18)');
  const pillar = (ROOF0 + ROOF1) / 2;
  brush.detail(quad([pillar - 0.05, vi0, BODY], [pillar + 0.05, vi0, BODY], [pillar + 0.05, vi0, CAR_HEIGHT], [pillar - 0.05, vi0, CAR_HEIGHT]), shade(color, 0.6));
  // Roof.
  brush.fill(quad([ROOF0, vi0, CAR_HEIGHT], [ROOF1, vi0, CAR_HEIGHT], [ROOF1, vi1, CAR_HEIGHT], [ROOF0, vi1, CAR_HEIGHT]), shade(color, 1.22), 0.15);
  brush.detail(quad([ROOF0, vi0, CAR_HEIGHT], [ROOF1, vi0, CAR_HEIGHT], [ROOF1, vi0 + 0.12, CAR_HEIGHT], [ROOF0, vi0 + 0.12, CAR_HEIGHT]), 'rgba(255,255,255,0.28)');
}
