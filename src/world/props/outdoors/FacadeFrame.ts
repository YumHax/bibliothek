import { Polygon, Sheet, azimuthX, heightY, sizePx } from './Sheet';

/**
 * A building front as a drawing frame: positions are metres `s` along the facade from its left
 * edge and `h` above the street, optionally `off` metres out from the wall towards the street (a
 * balcony, an awning). Everything a facade painter needs to turn those into texture shapes.
 */
export class FacadeFrame {
  /** Distance of the facade's middle and its width in metres. */
  readonly d: number;
  readonly w: number;
  /** Close enough for fine details (frames, curtains, lettering) to read. */
  readonly fine: boolean;

  constructor(
    readonly sheet: Sheet,
    readonly a0: number,
    readonly a1: number,
    readonly line: (a: number) => number,
  ) {
    this.d = line((a0 + a1) / 2);
    this.w = (a1 - a0) * this.d;
    this.fine = sizePx(1.3, this.d) > 7;
  }

  /** Azimuth of the point `s` metres along the facade. */
  at(s: number): number {
    return this.a0 + (this.a1 - this.a0) * (s / this.w);
  }

  /** Texture point `s` along, `h` up, `off` out from the wall. */
  P(s: number, h: number, off = 0): [number, number] {
    const a = this.at(s);
    return [azimuthX(a), heightY(h, this.line(a) - off)];
  }

  /** Texture pixels per metre, across and up, around the facade's middle. */
  get pxPerMetre(): { x: number; y: number } {
    return { x: azimuthX(this.at(1)) - azimuthX(this.at(0)), y: sizePx(1, this.d) };
  }

  /** A small upright rectangle on the wall (or `off` in front of it): four corners, convex, fit for `Sheet.lit`. */
  quad(s0: number, s1: number, hB: number, hT: number, off = 0): Polygon {
    return new Polygon([this.P(s0, hB, off), this.P(s1, hB, off), this.P(s1, hT, off), this.P(s0, hT, off)]);
  }

  /**
   * A wide rectangle whose top and bottom follow the true curve of the facade's horizontals in the
   * panorama (a straight texture line between two far corners would sag away from the street).
   */
  strip(s0: number, s1: number, hB: number, hT: number, off = 0): Path2D {
    const n = Math.max(1, Math.ceil(Math.abs(azimuthX(this.at(s1)) - azimuthX(this.at(s0))) / 24));
    const p = new Path2D();
    for (let i = 0; i <= n; i++) {
      const [x, y] = this.P(s0 + ((s1 - s0) * i) / n, hB, off);
      if (i === 0) p.moveTo(x, y);
      else p.lineTo(x, y);
    }
    for (let i = n; i >= 0; i--) {
      const [x, y] = this.P(s0 + ((s1 - s0) * i) / n, hT, off);
      p.lineTo(x, y);
    }
    p.closePath();
    return p;
  }

  /** A flat slab lying level `h` up, from the wall `off0` out to `off1` (a balcony floor seen from above or below). */
  slab(s0: number, s1: number, h: number, off0: number, off1: number): Polygon {
    return new Polygon([this.P(s0, h, off0), this.P(s1, h, off0), this.P(s1, h, off1), this.P(s0, h, off1)]);
  }

  /** Paints on the colour canvas only: shading inside a silhouette already stamped. */
  detail(p: Path2D, fill: string | CanvasGradient): void {
    this.sheet.color.fillStyle = fill;
    this.sheet.color.fill(p);
  }

  /** A vertical gradient between heights `hT` (colour `top`) and `hB` (colour `bottom`). */
  vertical(hB: number, hT: number, stops: [number, string][]): CanvasGradient {
    const g = this.sheet.color.createLinearGradient(0, this.P(0, hT)[1], 0, this.P(0, hB)[1]);
    for (const [t, c] of stops) g.addColorStop(t, c);
    return g;
  }
}
