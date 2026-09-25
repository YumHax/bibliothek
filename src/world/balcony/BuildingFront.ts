import * as THREE from 'three';
import { createCanvas, seededRandom } from '@/covers/generated/canvasUtils';
import type { SkyState } from '../props/DayNight';
import { wakefulnessAt } from '../props/outdoors/wakefulness';
import { Prop } from '../props/Prop';

export interface BuildingFrontOptions {
  /** Extent along the wall (local x) and from the street to the parapet (local y), metres. */
  x: [number, number];
  street: number;
  top: number;
  /** Height of a storey; the flat's floor is local y 0, the storeys below count down from it. */
  storey: number;
  /** Window pitch along the neighbours' part and the lower floors. */
  pitch: number;
  /** The opening cut through it (the balcony door): local x of its middle, width and height. */
  door: { x: number; width: number; height: number };
  /** The collection room's own windows (local x of the middle, width, sill and head over the floor): painted glass. */
  ourWindows: readonly { x: number; width: number; bottom: number; top: number }[];
  /** Local x range of the collection room's front (its windows are not repeated on this floor there). */
  ours: [number, number];
}

/** Texels per metre of the painted front. */
const PX = 36;
const PLASTER = '#8f7a63';
const TRIM = '#b3a38c';
const GLASS = '#1c242c';
/** How the lit windows glow at night, and the wakefulness below which each goes out (random per window). */
const WINDOW_LIGHT = '#ffc27a';

interface Pane {
  x: number;
  y: number;
  w: number;
  h: number;
  curfew: number;
}

/**
 * The building's own front seen from the balcony: the one wall the panorama cannot paint, since it
 * was painted from inside it. A single plane (the balcony door cut out of it) with a painted
 * texture: rendered plaster, a string course at every floor and a cornice under the parapet, the
 * collection room's windows beside the door, the neighbours' windows along the same floor and
 * every floor down to the shops at street level. Glass is glossy (it catches the sky), and at night
 * windows light up one by one and go out through the night like the ones across the street
 * (`wakefulnessAt`). It faces +z, the street; from inside the flat it is its back, not drawn.
 */
export class BuildingFront extends Prop {
  readonly contactShadow = false;

  private readonly material: THREE.MeshStandardMaterial;
  private readonly lights: CanvasRenderingContext2D;
  private readonly lightTexture: THREE.CanvasTexture;
  private readonly panes: Pane[] = [];
  private shownAwake = -1;

  constructor(private readonly options: BuildingFrontOptions) {
    super();
    this.name = 'BuildingFront';
    const { x, street, top, door } = options;
    const width = x[1] - x[0];
    const height = top - street;
    const W = Math.round(width * PX);
    const H = Math.round(height * PX);
    const [colorCanvas, color] = createCanvas(W, H);
    const [roughCanvas, rough] = createCanvas(W, H);
    const [lightCanvas, lights] = createCanvas(W, H);
    this.lights = lights;
    this.paint(color, rough, W, H);
    this.paintLights(lightCanvas.width, lightCanvas.height, 0);

    const map = new THREE.CanvasTexture(colorCanvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 8;
    const roughness = new THREE.CanvasTexture(roughCanvas);
    this.lightTexture = new THREE.CanvasTexture(lightCanvas);
    this.lightTexture.colorSpace = THREE.SRGBColorSpace;
    // Roughness from G, metalness from B (the glass catches the sky, the plaster does not).
    this.material = new THREE.MeshStandardMaterial({
      map,
      roughnessMap: roughness,
      metalnessMap: roughness,
      roughness: 1,
      metalness: 1,
      emissive: 0xffffff,
      emissiveMap: this.lightTexture,
      emissiveIntensity: 0,
    });

    // The wall, the door cut out of it.
    const shape = new THREE.Shape();
    shape.moveTo(x[0], street);
    shape.lineTo(x[1], street);
    shape.lineTo(x[1], top);
    shape.lineTo(x[0], top);
    shape.closePath();
    const hole = new THREE.Path();
    hole.moveTo(door.x - door.width / 2, 0);
    hole.lineTo(door.x - door.width / 2, door.height);
    hole.lineTo(door.x + door.width / 2, door.height);
    hole.lineTo(door.x + door.width / 2, 0);
    hole.closePath();
    shape.holes.push(hole);
    const geometry = new THREE.ShapeGeometry(shape);
    const pos = geometry.attributes.position;
    const uv = geometry.attributes.uv;
    for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - x[0]) / width, (pos.getY(i) - street) / height);
    uv.needsUpdate = true;
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.add(mesh);
  }

  /** Lights the windows for the time of day: none by day, then each until its own bedtime. */
  apply(sky: SkyState): void {
    const night = 1 - THREE.MathUtils.smoothstep(sky.sunHeight, -0.2, 0.05);
    this.material.emissiveIntensity = night * 1.4;
    if (night <= 0) return;
    // Repaint only when enough windows would change (the wakefulness moves slowly).
    const awake = Math.round(wakefulnessAt(sky.hours) * 40) / 40;
    if (awake === this.shownAwake) return;
    this.shownAwake = awake;
    this.paintLights(this.lights.canvas.width, this.lights.canvas.height, awake);
    this.lightTexture.needsUpdate = true;
  }

  /** Canvas point of a local (x, y). */
  private px(x: number, y: number): [number, number] {
    return [(x - this.options.x[0]) * PX, (this.options.top - y) * PX];
  }

  private paint(color: CanvasRenderingContext2D, rough: CanvasRenderingContext2D, W: number, H: number): void {
    const { x, street, top, storey, pitch, ourWindows, ours } = this.options;
    const random = seededRandom(3303);
    color.fillStyle = PLASTER;
    color.fillRect(0, 0, W, H);
    // Weathering: soft blotches, darker towards the street, streaks under the sills.
    for (let i = 0; i < 900; i++) {
      color.fillStyle = `rgba(${random() < 0.5 ? '40,30,20' : '255,245,230'},${0.03 + random() * 0.04})`;
      const r = (0.3 + random() * 1.6) * PX;
      color.beginPath();
      color.ellipse(random() * W, random() * H, r, r * (0.4 + random()), 0, 0, Math.PI * 2);
      color.fill();
    }
    const g = color.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.25)');
    color.fillStyle = g;
    color.fillRect(0, 0, W, H);
    rough.fillStyle = 'rgb(0,235,0)';
    rough.fillRect(0, 0, W, H);

    const rect = (ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, style: string): void => {
      const [a, b] = this.px(x0, y1);
      const [c, d] = this.px(x1, y0);
      ctx.fillStyle = style;
      ctx.fillRect(a, b, c - a, d - b);
    };
    // Cornice under the parapet, string courses at each floor.
    rect(color, x[0], top - 0.35, x[1], top - 0.1, TRIM);
    rect(color, x[0], top - 0.12, x[1], top, '#6d5c4a');
    for (let y = 0; y > street; y -= storey) rect(color, x[0], y - 0.18, x[1], y - 0.02, TRIM);

    const window = (cx: number, w: number, y0: number, y1: number, curfew: number): void => {
      rect(color, cx - w / 2 - 0.1, y0 - 0.12, cx + w / 2 + 0.1, y1 + 0.1, TRIM);
      rect(color, cx - w / 2, y0, cx + w / 2, y1, GLASS);
      rect(rough, cx - w / 2, y0, cx + w / 2, y1, 'rgb(0,30,200)');
      // Frame and a glazing bar, the sill.
      rect(color, cx - 0.025, y0, cx + 0.025, y1, '#d8d2c6');
      rect(color, cx - w / 2, y1 - (y1 - y0) * 0.28, cx + w / 2, y1 - (y1 - y0) * 0.28 + 0.04, '#d8d2c6');
      rect(color, cx - w / 2 - 0.14, y0 - 0.16, cx + w / 2 + 0.14, y0 - 0.06, '#c9bfae');
      // Curtains in some.
      if (random() < 0.45) {
        const cw = w * (0.2 + random() * 0.2);
        const tint = ['#c8b8a0', '#9a4a3a', '#e0d8c8', '#3a4a5a'][Math.floor(random() * 4)];
        rect(color, cx - w / 2, y0, cx - w / 2 + cw, y1, tint);
        if (random() < 0.5) rect(color, cx + w / 2 - cw, y0, cx + w / 2, y1, tint);
      }
      this.panes.push({ x: cx - w / 2, y: y1, w, h: y1 - y0, curfew });
    };
    // Our floor: the collection room's windows (never lit from here: the room has its own light), then the neighbours'.
    for (const w of ourWindows) window(w.x, w.width, w.bottom, w.top, -1);
    // About two homes in five light up at night; the others stay dark (away, or asleep early).
    const bedtime = (): number => (random() < 0.4 ? random() : -1);
    for (let cx = ours[1] + pitch / 2; cx < x[1] - 0.8; cx += pitch) window(cx, 1.2, 0.2, 2.45, bedtime());
    // The floors below, down to the first; then the shops and the street door.
    for (let floor = 1; floor * storey < -street - storey * 0.5; floor++) {
      const base = -floor * storey;
      if (base - storey < street + 0.5) break;
      for (let cx = x[0] + pitch / 2; cx < x[1] - 0.8; cx += pitch) window(cx, 1.15, base + 0.25, base + 2.45, bedtime());
    }
    const ground = street + 3.6;
    rect(color, x[0], street, x[1], ground, '#6a5a4a');
    let s = x[0] + 0.6;
    while (s < x[1] - 3) {
      const w = 3 + random() * 3;
      rect(color, s, street + 0.3, s + w, ground - 0.5, GLASS);
      rect(rough, s, street + 0.3, s + w, ground - 0.5, 'rgb(0,30,200)');
      rect(color, s, ground - 0.5, s + w, ground - 0.15, ['#2f4a3a', '#7a2a2a', '#2a3550', '#3a3634'][Math.floor(random() * 4)]);
      this.panes.push({ x: s, y: ground - 0.5, w, h: 3.3 - 0.5, curfew: 0.55 + random() * 0.3 });
      s += w + 1 + random() * 2;
    }
  }

  /** The night light of every window still up at wakefulness `awake` (0 paints none). */
  private paintLights(W: number, H: number, awake: number): void {
    const ctx = this.lights;
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    if (awake <= 0) return;
    for (const pane of this.panes) {
      if (pane.curfew < 0 || pane.curfew > awake) continue;
      const [a, b] = this.px(pane.x, pane.y);
      ctx.fillStyle = WINDOW_LIGHT;
      ctx.globalAlpha = 0.55 + 0.45 * ((pane.curfew * 7) % 1);
      ctx.fillRect(a, b, pane.w * PX, pane.h * PX);
    }
    ctx.globalAlpha = 1;
  }
}
