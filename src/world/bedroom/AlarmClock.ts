import * as THREE from 'three';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { cylinderMesh } from '../meshUtils';
import { part } from '../props/Prop';
import { UsableProp, type UseOptions } from '../props/UsableProp';
import { paint } from '../materials/palette';
import { formatClock } from '@/text/clock';

const W = 0.12;
const H = 0.065;
const D = 0.05;
const FACE_W = 0.095;
const FACE_H = 0.038;

/**
 * A plastic bedside alarm clock, its red digits showing the hour it is set to wake the player at
 * (`setAlarm`; the builder wires the click to `Household.cycleAlarm`). Emissive only, no light of its
 * own. Origin under its middle, the face towards +z.
 */
export class AlarmClock extends UsableProp {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly face: THREE.MeshStandardMaterial;

  constructor(use: UseOptions) {
    super(use);
    this.name = 'AlarmClock';
    const body = paint(0x2a2c31, 0.45);
    // A wedge-ish case: a box leaning back a little on two feet.
    const caseGroup = new THREE.Group();
    caseGroup.rotation.x = -0.12;
    caseGroup.position.y = 0.006;
    part(caseGroup, W, H, D, body, { y: H / 2 });
    part(caseGroup, 0.03, 0.008, 0.02, paint(0x9c3a2e, 0.5), { x: W / 2 - 0.025, y: H + 0.004, z: -0.01 }); // the snooze bar
    [this.canvas, this.ctx] = createCanvas(128, 52);
    this.texture = toTexture(this.canvas);
    // Own material: the digits change with the alarm.
    this.face = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, map: this.texture, emissive: 0xffffff, emissiveMap: this.texture, emissiveIntensity: 0.9 });
    part(caseGroup, FACE_W, FACE_H, 0.002, this.face, { y: H / 2, z: D / 2 + 0.001 }).castShadow = false;
    this.add(caseGroup);
    for (const x of [-W / 2 + 0.015, W / 2 - 0.015]) this.add(cylinderMesh(0.006, 0.006, body, { x, y: 0.003, z: 0.012 }, { segments: 8 }));
    this.target(W + 0.02, H + 0.03, D + 0.03, { y: H / 2 });
  }

  /** Shows the wake-up hour (and the bell that says it is armed). */
  setAlarm(hours: number): void {
    const { ctx, canvas } = this;
    ctx.fillStyle = '#0b0b0c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ff3b2f';
    ctx.font = 'bold 34px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(formatClock(hours), canvas.width / 2 + 8, canvas.height / 2 + 2);
    // The little bell of an armed alarm, top left.
    ctx.beginPath();
    ctx.arc(14, 16, 6, Math.PI, 0);
    ctx.lineTo(20, 22);
    ctx.lineTo(8, 22);
    ctx.closePath();
    ctx.fill();
    this.texture.needsUpdate = true;
  }
}
