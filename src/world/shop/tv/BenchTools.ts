import * as THREE from 'three';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { paint, standard, METAL } from '../../materials/palette';
import { labelSheet } from './labels';

const YELLOW = paint(0xe8b820, 0.5);
const DARK = paint(0x1e1e20, 0.55);
const RED = paint(0xb02a22, 0.5);
const VALVE = standard({ color: 0xd8dcd8, roughness: 0.1, metalness: 0.2 });
const MUG = paint(0xe8e2d4, 0.35);
const COFFEE = paint(0x2a1a10, 0.2);
const PAPER = paint(0xf0ece0, 0.9);
const HANDLES: readonly number[] = [0xc83a2a, 0xe8b820, 0x2a5a9a];

/**
 * The small things strewn over the repair bench: the yellow multimeter reading a voltage with its red and black
 * probes, three screwdrivers, a tray of spare valves, the desoldering pump, a half-drunk mug of coffee and the service
 * manual open at a schematic. Origin on the bench top at its middle, the repairer's side +z. Decoration: never
 * collides; its parts (and its two painted faces, on one sheet) merge.
 */
export class BenchTools extends Prop {
  readonly contactShadow = false;

  constructor() {
    super();
    this.name = 'BenchTools';
    // The multimeter, lying tilted back on its stand, and its probes.
    const meter = new THREE.Group();
    meter.position.set(-0.2, 0, 0.02);
    meter.rotation.y = 0.2;
    this.add(meter);
    part(meter, 0.09, 0.035, 0.16, YELLOW, { y: 0.0175 });
    part(meter, 0.07, 0.006, 0.12, DARK, { y: 0.037, z: 0.005 });
    const dial = cylinderMesh(0.02, 0.008, DARK, { y: 0.04, z: 0.03 }, { segments: 14 });
    meter.add(dial);
    for (const [x, color] of [[-0.02, RED], [0.02, DARK]] as const) meter.add(cylinderMesh(0.005, 0.01, color, { x, y: 0.04, z: 0.068 }, { segments: 8 }));
    for (const [dx, color, yaw] of [[-0.02, RED, 0.5], [0.02, DARK, -0.3]] as const) {
      const lead = cylinderMesh(0.0025, 0.22, color, { x: -0.2 + dx + Math.sin(yaw) * 0.11, y: 0.004, z: 0.1 + Math.cos(yaw) * 0.11 }, { segments: 6 });
      lead.rotation.set(Math.PI / 2, 0, -yaw);
      this.add(lead);
    }
    // Screwdrivers side by side.
    HANDLES.forEach((color, i) => {
      const x = 0.02 + i * 0.03;
      const handle = cylinderMesh(0.011, 0.09, paint(color, 0.45), { x, y: 0.011, z: 0.12 }, { segments: 8 });
      handle.rotation.x = Math.PI / 2;
      this.add(handle);
      const shaft = cylinderMesh(0.003, 0.1, METAL.chrome(), { x, y: 0.011, z: 0.025 }, { segments: 6 });
      shaft.rotation.x = Math.PI / 2;
      this.add(shaft);
    });
    // The tray of spare valves.
    part(this, 0.14, 0.012, 0.08, DARK, { x: 0.22, y: 0.006, z: -0.02 });
    for (let i = 0; i < 8; i++) this.add(cylinderMesh(0.009, 0.04 + (i % 3) * 0.008, VALVE, { x: 0.165 + (i % 4) * 0.036, y: 0.034, z: -0.04 + Math.floor(i / 4) * 0.04 }, { segments: 10 }));
    // The desoldering pump.
    const pump = cylinderMesh(0.011, 0.17, paint(0x3a7a4a, 0.4), { x: 0.14, y: 0.011, z: 0.1 }, { segments: 10 });
    pump.rotation.set(0, 0, Math.PI / 2);
    pump.rotation.y = 0.4;
    this.add(pump);
    // The mug, half drunk.
    this.add(cylinderMesh(0.038, 0.09, MUG, { x: 0.33, y: 0.045, z: 0.08 }, { segments: 16 }));
    this.add(cylinderMesh(0.033, 0.002, COFFEE, { x: 0.33, y: 0.07, z: 0.08 }, { segments: 16 }));
    const grip = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 6, 12, Math.PI), MUG);
    grip.position.set(0.37, 0.045, 0.08);
    grip.rotation.z = -Math.PI / 2;
    this.add(grip);
    // The manual, open flat: its pages and the meter's reading on one sheet.
    part(this, 0.3, 0.012, 0.21, PAPER, { x: -0.02, y: 0.006, z: -0.16 });
    const [pages, reading] = labelSheet([
      { width: 0.29, height: 0.2, paint: paintSchematic },
      { width: 0.06, height: 0.025, paint: paintReading },
    ], 1400);
    pages!.rotation.x = -Math.PI / 2;
    pages!.position.set(-0.02, 0.012 + 0.001, -0.16);
    this.add(pages!);
    reading!.rotation.x = -Math.PI / 2;
    reading!.position.set(0, 0.041, -0.015);
    meter.add(reading!);
  }
}

/** Two pages of a service manual: a schematic of lines, resistors, a valve's circle, the page numbers. */
function paintSchematic(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#f2eee2';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(w / 2 - 2, 0, 4, h);
  ctx.strokeStyle = '#2a2a2e';
  ctx.lineWidth = 2;
  let seed = 7;
  const r = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (const page of [0, 1]) {
    const x0 = page * (w / 2) + w * 0.04;
    const pw = w / 2 - w * 0.08;
    ctx.font = `700 ${Math.round(h * 0.05)}px sans-serif`;
    ctx.fillStyle = '#2a2a2e';
    ctx.fillText(page ? 'FIG. 14  LINE OUTPUT' : 'FIG. 13  VIDEO AMP', x0, h * 0.08);
    for (let i = 0; i < 9; i++) {
      const y = h * (0.18 + r() * 0.72);
      const a = x0 + r() * pw * 0.5;
      const b = a + pw * (0.2 + r() * 0.5);
      ctx.beginPath();
      ctx.moveTo(a, y);
      ctx.lineTo(Math.min(b, x0 + pw), y);
      ctx.lineTo(Math.min(b, x0 + pw), y + h * 0.1 * (r() - 0.5));
      ctx.stroke();
      // A resistor's zigzag on some.
      if (r() < 0.6) {
        const m = (a + Math.min(b, x0 + pw)) / 2;
        ctx.beginPath();
        for (let k = 0; k <= 6; k++) ctx.lineTo(m - 12 + k * 4, y + (k % 2 ? -5 : 5) * (k && k < 6 ? 1 : 0));
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ctx.arc(x0 + pw * 0.7, h * 0.5, h * 0.09, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = `${Math.round(h * 0.04)}px sans-serif`;
    ctx.fillText(String(46 + page), x0 + pw / 2, h * 0.96);
  }
}

/** The multimeter's grey LCD reading 12.6. */
function paintReading(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = '#a8b098';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#1a1e18';
  ctx.font = `700 ${Math.round(h * 0.8)}px "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('12.6', w / 2, h / 2 + 1);
}
