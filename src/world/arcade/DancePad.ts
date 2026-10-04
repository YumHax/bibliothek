import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { boxMesh, cylinderMesh } from '../meshUtils';
import { markShared } from '../props/Prop';
import { paint, standard } from '../materials/palette';
import type { AttachmentFrame, CabinetAttachment } from './CabinetAttachment';
import type { Performer } from '../people/performer';

type Lane = 'left' | 'down' | 'up' | 'right';

interface DancePadOptions {
  /** How far in front of the cabinet's origin the pad's centre is (cabinet-local z). Default 1.0. */
  centreZ?: number;
  /** How bright each lane's panel is this frame beyond the feet on it (the game's beat, its FEVER), 0..1. */
  glow?: (lane: Lane) => number;
}

const SIZE = 0.92;
const HEIGHT = 0.07;
const PANEL = 0.27;
const EYE_HEIGHT = 1.7;
/** Where each lane's panel is on the 3 x 3 grid (column, row; row 0 at the front, towards the screen). */
const GRID: Record<Lane, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const COLORS: Record<Lane, number> = { left: 0xff7ad9, down: 0x63b3ff, up: 0x7ee787, right: 0xffb347 };
const ROT: Record<Lane, number> = { up: 0, right: -Math.PI / 2, down: Math.PI, left: Math.PI / 2 };
const STEEL = standard({ color: 0x9a9ea6, metalness: 1, roughness: 0.4 });
const PLATE = paint(0x1c1c22, 0.5);

/**
 * The dance cabinet's stage: a steel platform in front of it with four arrow panels (up, down,
 * left, right) round a plain centre plate, and a bar along each side to hold. A panel sinks and
 * lights up in its colour while its direction is held, and glows with the game's beat. The player
 * stands on it to play (their eye over the middle of the pad), a regular too, hands on the side
 * bars and feet on the arrows: each arrow the game steps on takes the foot on its side (up and down
 * whichever is free), which stays there until it is wanted elsewhere or the music leaves it idle.
 * A `CabinetAttachment` for `ArcadeCabinet`; the pad itself is not solid (it is stood on).
 */

/** A foot left on an arrow this long (s) with nothing to step comes back to the middle. */
const FOOT_IDLE = 0.7;
export class DancePad implements CabinetAttachment {
  readonly object = new THREE.Group();
  readonly eye: THREE.Vector3;
  readonly standAt: THREE.Vector3;
  readonly lean = 0;
  private readonly panels = new Map<Lane, { mesh: THREE.Mesh; material: THREE.MeshStandardMaterial; press: number }>();
  private readonly centreZ: number;
  private readonly glow: ((lane: Lane) => number) | undefined;
  /** The regular dancing (their body), the arrow each foot is on and for how long it has had nothing to do. */
  private performer: Performer | null = null;
  private readonly feet: [Lane | null, Lane | null] = [null, null];
  private readonly idle = [0, 0];
  private readonly footPoint = new THREE.Vector3();

  constructor(options: DancePadOptions = {}) {
    this.centreZ = options.centreZ ?? 1.0;
    this.glow = options.glow;
    this.eye = new THREE.Vector3(0, EYE_HEIGHT + HEIGHT, this.centreZ + 0.05);
    this.standAt = new THREE.Vector3(0, HEIGHT, this.centreZ + 0.05);
    this.object.name = 'DancePad';
    const z = this.centreZ;
    this.object.add(boxMesh(SIZE, HEIGHT - 0.01, SIZE, STEEL, { y: (HEIGHT - 0.01) / 2, z }));
    // The plain squares: the centre and the four corners.
    for (const [cx, cz] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      this.object.add(boxMesh(PANEL, 0.012, PANEL, PLATE, { x: cx * (PANEL + 0.02), y: HEIGHT - 0.004, z: z + cz * (PANEL + 0.02) }));
    }
    for (const lane of Object.keys(GRID) as Lane[]) {
      const [cx, cz] = GRID[lane];
      const material = new THREE.MeshStandardMaterial({ map: arrowTexture(), color: COLORS[lane], emissive: COLORS[lane], emissiveIntensity: 0.15, roughness: 0.4 });
      const mesh = boxMesh(PANEL, 0.014, PANEL, material, { x: cx * (PANEL + 0.02), y: HEIGHT - 0.003, z: z + cz * (PANEL + 0.02) });
      mesh.rotation.y = ROT[lane];
      this.object.add(mesh);
      this.panels.set(lane, { mesh, material, press: 0 });
    }
    // A bar along each side, on two posts, to hold on to.
    for (const sx of [-1, 1]) {
      const x = sx * (SIZE / 2 - 0.03);
      for (const pz of [z - SIZE / 2 + 0.08, z + SIZE / 2 - 0.08]) this.object.add(cylinderMesh(0.018, 0.95, STEEL, { x, y: HEIGHT + 0.475, z: pz }, { segments: 10 }));
      const bar = cylinderMesh(0.02, SIZE - 0.12, STEEL, { x, y: HEIGHT + 0.95, z }, { segments: 10 });
      bar.rotation.x = Math.PI / 2;
      this.object.add(bar);
    }
    this.object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.receiveShadow = true;
        mesh.castShadow = true;
      }
    });
  }

  perform(performer: Performer | null): void {
    if (this.performer && !performer) this.performer.release();
    this.performer = performer;
    this.feet[0] = this.feet[1] = null;
    performer?.standOn(HEIGHT);
  }

  update(dt: number, frame: AttachmentFrame): void {
    if (this.performer && frame.who === 'regular') this.dance(dt, frame);
    const ease = Math.min(1, dt * 20);
    for (const [lane, panel] of this.panels) {
      const held = frame.controls[lane] ? 1 : 0;
      panel.press += (held - panel.press) * ease;
      panel.mesh.position.y = HEIGHT - 0.003 - panel.press * 0.008;
      const beat = frame.who ? (this.glow?.(lane) ?? 0) : 0;
      panel.material.emissiveIntensity = 0.15 + Math.max(panel.press, beat) * 1.4;
    }
  }

  /** The regular's feet onto the arrows being stepped on: a lane's own side's foot, up and down whichever is free. */
  private dance(dt: number, frame: AttachmentFrame): void {
    const body = this.performer!;
    const cabinet = this.object.parent;
    if (!cabinet) return;
    for (const lane of Object.keys(GRID) as Lane[]) {
      if (!frame.controls[lane] || this.feet.includes(lane)) continue;
      // Facing the screen the dancer's +x is the cabinet's -x: the left arrow is under their +x foot.
      const own: 0 | 1 | null = lane === 'left' ? 1 : lane === 'right' ? 0 : null;
      const busy = (i: 0 | 1): boolean => this.feet[i] !== null && !!frame.controls[this.feet[i]!];
      let foot: 0 | 1;
      if (own !== null && !busy(own)) foot = own;
      else if (!busy(0) && (busy(1) || this.idle[0]! >= this.idle[1]!)) foot = 0;
      else if (!busy(1)) foot = 1;
      else foot = own ?? 0;
      this.feet[foot] = lane;
      this.idle[foot] = 0;
      const [cx, cz] = GRID[lane];
      body.footAt(foot, cabinet.localToWorld(this.footPoint.set(cx * (PANEL + 0.02), 0, this.centreZ + cz * (PANEL + 0.02))));
    }
    for (let i = 0; i < 2; i++) {
      const lane = this.feet[i];
      if (!lane) continue;
      if (frame.controls[lane]) this.idle[i] = 0;
      else this.idle[i]! += dt;
      if (this.idle[i]! > FOOT_IDLE) {
        this.feet[i] = null;
        body.footAt(i as 0 | 1, null);
      }
    }
    body.crouch(this.feet.some((lane) => lane && frame.controls[lane]) ? 0.08 : 0.04);
  }

  /** Hands on the side bars, either side of the dancer. */
  handsAt(hands: [THREE.Vector3, THREE.Vector3]): boolean {
    const cabinet = this.object.parent;
    if (!cabinet) return false;
    cabinet.localToWorld(hands[0].set(-(SIZE / 2 - 0.03), HEIGHT + 0.95, this.centreZ + 0.05));
    cabinet.localToWorld(hands[1].set(SIZE / 2 - 0.03, HEIGHT + 0.95, this.centreZ + 0.05));
    return true;
  }
}

let arrow: THREE.Texture | null = null;
/** A white arrow pointing up (-z once laid on the pad) on a light panel; each panel is tinted and turned. */
function arrowTexture(): THREE.Texture {
  if (arrow) return arrow;
  const [canvas, ctx] = createCanvas(128, 128);
  ctx.fillStyle = '#9a9aa2';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(64, 14);
  ctx.lineTo(112, 62);
  ctx.lineTo(84, 62);
  ctx.lineTo(84, 114);
  ctx.lineTo(44, 114);
  ctx.lineTo(44, 62);
  ctx.lineTo(16, 62);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 124);
  arrow = markShared(toTexture(canvas, 'facing'));
  return arrow;
}
