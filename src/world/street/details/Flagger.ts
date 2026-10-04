import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../../Furniture';
import { snowPaint, snowStandard } from '../snowCover';
import { Walker } from '../../people/Walker';
import { randomLook } from '../../people/looks';
import type { DayNight } from '../../props/DayNight';
import { KERB_HEIGHT } from '@/world/measures/street';
import { distanceFade } from '../life/fade';
import { outOfSight } from '../life/sight';
import { closureBox, type Closure } from './roadworks';

interface FlaggerOptions {
  closure: Closure;
  seed: number;
  /** The camera: someone walking up the road to him gets told. */
  viewer: THREE.Object3D;
  /** Places his walker in the zone (ticked and clickable), zone-local. */
  place: (walker: Walker, at: THREE.Vector3) => void;
  /** What he says when clicked (why the street is shut, which way to go). */
  lines: readonly string[];
  /** The clock, and his shift (hours): out of it he has gone home and the night board stands in the gap. */
  dayNight: DayNight;
  hours: readonly [number, number];
  /** Beyond `drawDistance` (m) he is not drawn, fading out over the last `fade` metres (people are the costly meshes). */
  drawDistance: number;
  fade: number;
}

/** He stands this far short of the works (local x), on the centre line between the traffic lanes. */
const STAND = -0.8;
/** Someone on foot nearer than this (m) gets a word, at most every `COOLDOWN` seconds. */
const WARN = 3;
const COOLDOWN = 6;
const SHOUTS = ['No way through!', 'Road’s shut, sorry!', 'Not on foot, mate!', 'Go round, love!'];
/** The portable signals' red lamps glow this much (HDR, unlit: no light of their own). */
const SIGNAL_GLOW = 2.2;

/**
 * The roadworker in the traffic lanes' gap at a roadworks (`closures()`): hi-vis jacket and white
 * helmet, a STOP / GO board on its pole beside him, on the centre line where the cars pass him on
 * either side. The gap is the one stretch across the street no barrier closes (the traffic drives
 * through it), so he closes it to walkers: a collider across the lanes at the works' line, and a
 * word in his bubble for anyone on foot who walks up the road to him. Clicked, he says why. Out of
 * his shift (`hours`) he has gone home: a ROAD CLOSED board stands where he did, between two
 * portable signals showing red, and the collider stays. He fades with distance like the crowd and
 * comes and goes only out of the player's sight.
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
  /** On his shift (drawn, talking) or gone home (the night board out). */
  private onShift: boolean | null = null;
  private readonly night = new THREE.Group();
  private readonly signalLamp: THREE.MeshBasicMaterial;
  private readonly worldSpot = new THREE.Vector3();

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
    this.walker = new Walker({ viewer: options.viewer, seed: options.seed, look, lines: options.lines, label: 'Roadworker · ask the way', fade: true });
    options.place(this.walker, this.spot.clone());
    // He faces the walkable street (local -x).
    this.walker.stand(closure.rotation - Math.PI / 2, 'hips');

    // The STOP / GO board on its pole, beside him on the far side of the centre line.
    const board = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.7, 8), snowStandard({ color: 0x2a2a2e, roughness: 0.5 }));
    pole.position.y = 0.85;
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.06, 12), snowPaint(0x1a1a1a, 0.9));
    foot.position.y = 0.03;
    const sign = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.02, 32).rotateZ(Math.PI / 2), [
      snowPaint(0xe8e8e2, 0.6),
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

    // Gone home: a ROAD CLOSED A-board on the centre line, a portable signal either side of it showing red.
    this.signalLamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2a1a).multiplyScalar(SIGNAL_GLOW) });
    const closed = new THREE.MeshStandardMaterial({ map: closedTexture(), roughness: 0.6 });
    const frame = snowPaint(0x2a2a2e, 0.6);
    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.03), [frame, frame, frame, frame, closed, closed]);
      leaf.position.set(0, 0.42, side * 0.16);
      leaf.rotation.x = side * 0.2;
      leaf.castShadow = true;
      this.night.add(leaf);
    }
    for (const side of [-1, 1]) {
      const unit = new THREE.Group();
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.1, 8), snowStandard({ color: 0xe8e4d8, roughness: 0.5 }));
      post.position.y = 1.05;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.55), snowPaint(0x2a2d33, 0.8));
      base.position.y = 0.11;
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.62, 0.18), snowPaint(0x1a1a1a, 0.7));
      head.position.y = 2.2;
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.075, 16), this.signalLamp);
      lamp.position.set(0, 2.38, 0.095);
      for (const m of [post, base, head]) m.castShadow = true;
      unit.add(post, base, head, lamp);
      // Before and behind the board on the centre line (night-local z is along the road): beside it, across the
      // lanes, they stood in the cars' way (a car on its line at 1.6 m reaches 0.73 m from the middle).
      unit.position.set(0, 0, side * 0.75);
      this.night.add(unit);
    }
    // The night pieces stand where he did, their faces (+z) to the walkable street (local -x of the closure).
    this.night.position.copy(this.spot);
    this.night.rotation.y = closure.rotation - Math.PI / 2;
    this.night.visible = false;
    this.add(this.night);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(dt: number): void {
    const { hours, viewer, drawDistance, fade } = this.options;
    const h = this.options.dayNight.state.hours;
    const shift = h >= hours[0] && h < hours[1];
    // He comes to work and goes home only out of sight (or on the first update: the player has just arrived).
    this.worldSpot.copy(this.spot);
    this.localToWorld(this.worldSpot);
    if (shift !== this.onShift && (this.onShift === null || outOfSight(viewer, this.worldSpot))) {
      this.onShift = shift;
      this.walker.setPresent(shift, this.spot);
      this.night.visible = !shift;
    }
    viewer.getWorldPosition(this.eye);
    if (this.onShift) this.walker.setFade(distanceFade(this.eye.distanceTo(this.worldSpot), drawDistance, fade));
    this.quiet = Math.max(0, this.quiet - dt);
    if (this.quiet > 0 || !this.onShift) return;
    this.worldToLocal(this.eye);
    this.eye.y = this.spot.y;
    if (!this.gap.containsPoint(this.eye)) return;
    this.quiet = COOLDOWN;
    this.walker.say(SHOUTS[this.shout++ % SHOUTS.length]!, 2.6);
  }
}

/** The night board's face: ROAD CLOSED, and no way through on foot. */
function closedTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 200);
  ctx.fillStyle = '#f4f2ea';
  ctx.fillRect(0, 0, 256, 200);
  ctx.strokeStyle = '#c8201a';
  ctx.lineWidth = 12;
  ctx.strokeRect(8, 8, 240, 184);
  ctx.fillStyle = '#1a1a1a';
  ctx.textAlign = 'center';
  ctx.font = 'bold 46px sans-serif';
  ctx.fillText('ROAD', 128, 72);
  ctx.fillText('CLOSED', 128, 122, 220);
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText('NO PEDESTRIANS', 128, 168);
  return toTexture(canvas, 'facing');
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
  return toTexture(canvas, 'facing');
}
