import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../../Furniture';
import { paint, standard } from '../../materials/palette';
import { Walker } from '../../people/Walker';
import { randomLook } from '../../people/looks';
import { KERB_HEIGHT } from '../streetPlan';
import { closureBox, type Closure } from './roadworks';

export interface FlaggerOptions {
  closure: Closure;
  seed: number;
  /** The camera: someone walking up the road to him gets told. */
  viewer: THREE.Object3D;
  /** Places his walker in the zone (ticked and clickable), zone-local. */
  place: (walker: Walker, at: THREE.Vector3) => void;
  /** What he says when clicked (why the street is shut, which way to go). */
  lines: readonly string[];
}

/** He stands this far short of the works (local x), on the centre line between the traffic lanes. */
const STAND = -0.8;
/** Someone on foot nearer than this (m) gets a word, at most every `COOLDOWN` seconds. */
const WARN = 3;
const COOLDOWN = 6;
const SHOUTS = ['No way through!', 'Road’s shut, sorry!', 'Not on foot, mate!', 'Go round, love!'];

/**
 * The roadworker in the traffic lanes' gap at a roadworks (`CLOSURES`): hi-vis jacket and white
 * helmet, a STOP / GO board on its pole beside him, on the centre line where the cars pass him on
 * either side. The gap is the one stretch across the street no barrier closes (the traffic drives
 * through it), so he closes it to walkers: a collider across the lanes at the works' line, and a
 * word in his bubble for anyone on foot who walks up the road to him. Clicked, he says why.
 */
export class Flagger extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[];
  private readonly walker: Walker;
  private readonly spot = new THREE.Vector3();
  private readonly eye = new THREE.Vector3();
  private readonly gap: THREE.Box3;
  private quiet = 0;
  private shout = 0;

  constructor(private readonly options: FlaggerOptions) {
    super();
    this.name = 'Flagger';
    const { closure } = options;
    const [z0, z1] = closure.lanes;
    const mid = (z0 + z1) / 2;
    const road = -KERB_HEIGHT;
    this.spot.set(STAND, road, mid).applyMatrix4(closure.frame);
    // Across the lanes on the works' line, overlapping the parking lanes' barriers.
    this.colliders = [closureBox(closure, -0.15, 0.15, z0 - 0.1, z1 + 0.1, road, 3)];
    // Where a walker on the road gets told: the lanes, a few metres short of the works.
    this.gap = closureBox(closure, -WARN, 0.5, z0, z1, road - 1, 3);

    const look = { ...randomLook(options.seed, 'vendor'), hat: 'cap' as const, hatColor: 0xf2f0ea, top: 'jacket' as const, topColor: 0xff6a12, topAccent: 0xd8e84a, longSleeves: true, trousers: 0x2a2d33 };
    delete look.apron;
    this.walker = new Walker({ viewer: options.viewer, seed: options.seed, look, lines: options.lines, label: 'Roadworker · ask the way' });
    options.place(this.walker, this.spot.clone());
    // He faces the walkable street (local -x).
    this.walker.stand(closure.rotation - Math.PI / 2, 'hips');

    // The STOP / GO board on its pole, beside him on the far side of the centre line.
    const board = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.7, 8), standard({ color: 0x2a2a2e, roughness: 0.5 }));
    pole.position.y = 0.85;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.06, 12), paint(0x1a1a1a, 0.9));
    foot.position.y = 0.03;
    const sign = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 32).rotateZ(Math.PI / 2), [
      paint(0xe8e8e2, 0.6),
      new THREE.MeshStandardMaterial({ map: boardTexture('STOP', '#c8201a'), roughness: 0.5 }),
      new THREE.MeshStandardMaterial({ map: boardTexture('GO', '#1f8a3a'), roughness: 0.5 }),
    ]);
    sign.position.y = 1.85;
    board.add(pole, foot, sign);
    board.traverse((o) => {
      o.castShadow = true;
    });
    board.position.set(STAND + 0.05, road, mid + 0.45).applyMatrix4(closure.frame);
    // The disc's STOP face towards the walkable street.
    board.rotation.y = closure.rotation;
    this.add(board);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    this.quiet = Math.max(0, this.quiet - dt);
    if (this.quiet > 0) return;
    this.options.viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    this.eye.y = this.spot.y;
    if (!this.gap.containsPoint(this.eye)) return;
    this.quiet = COOLDOWN;
    this.walker.say(SHOUTS[this.shout++ % SHOUTS.length]!, 2.6);
  }
}

/** One face of the board: a coloured disc with its word in white. */
function boardTexture(word: string, color: string): THREE.CanvasTexture {
  const size = 128;
  const [canvas, ctx] = createCanvas(size, size);
  ctx.fillStyle = '#e8e8e2';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${word.length > 2 ? 34 : 48}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(word, size / 2, size / 2 + 2);
  return toTexture(canvas, 4);
}
