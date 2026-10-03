import * as THREE from 'three';
import { createCanvas, toTexture, repeatTexture } from '@/covers/generated/canvasUtils';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../../meshUtils';
import { paint } from '../../materials/palette';
import { drawText } from '../games/ArcadeGame';
import { TicketStrip } from '../TicketStrip';
import { layMesh, WALL } from '../../surface/layers';
import { CHROME, type MachineDisplay, displayScreen, outOfOrderNote, paintMarquee } from '../machineParts';
import { BALLS, BALL_R, BOARD_BACK, BOARD_FRONT, BOARD_V, BOARD_W, LANE_FAR, LANE_NEAR, LANE_W, POCKETS, POCKET_R, RINGS, RING_CENTRE } from './AlleySim';

/** The cabinet round the lane: its width, and the backboard's z and top. */
export const WIDTH = 0.8;
export const BACK_Z = -1.16;
export const BACK_H = 2.2;

const WOOD = paint(0xb7874f, 0.55);
const BLACK = paint(0x131318, 0.6);
const BALL_MAT = paint(0xf2e6c8, 0.35);

/** The parts of an alley that move or change once built. */
export interface AlleyModel {
  readonly marquee: THREE.MeshBasicMaterial;
  readonly display: MachineDisplay;
  readonly note: THREE.Mesh;
  /** The ball in play, and the balls waiting in the trough. */
  readonly ball: THREE.Mesh;
  readonly trough: readonly THREE.Mesh[];
  readonly strip: TicketStrip;
  readonly hitbox: THREE.Mesh;
}

/**
 * Builds a ball alley into `root` (origin on the floor under the middle of the lane, +z the
 * player's end) to `AlleySim`'s sizes: the painted cabinet with its rising side rails, the plinth,
 * the wooden lane and its hump, the tilted ring board, the backboard with the marquee, the score
 * display (the out-of-order note on it) and the wire net, the ball and the trough, the ticket
 * strip at the front, the hitbox. Everything but the net receives shadows.
 */
export function buildAlleyModel(root: THREE.Group, color: number, title: string): AlleyModel {
  const body = paint(color, 0.5);

  // The cabinet: side walls the length of the machine, rising to the backboard.
  const length = LANE_NEAR.z - BACK_Z + 0.15;
  const centreZ = (LANE_NEAR.z + 0.15 + BACK_Z) / 2;
  for (const sx of [-1, 1]) {
    root.add(boxMesh(0.1, 0.7, length, body, { x: sx * (WIDTH / 2 - 0.05), y: 0.35, z: centreZ }));
    // The side rail rises with the lane, then with the board.
    const rail = boxMesh(0.1, 0.3, LANE_NEAR.z - LANE_FAR.z, body, { x: sx * (WIDTH / 2 - 0.05), y: (LANE_NEAR.y + LANE_FAR.y) / 2 - 0.02, z: (LANE_NEAR.z + LANE_FAR.z) / 2 });
    rail.rotation.x = Math.atan2(LANE_FAR.y - LANE_NEAR.y, LANE_NEAR.z - LANE_FAR.z);
    root.add(rail);
    const cage = boxMesh(0.1, BACK_H - 1.0, BOARD_FRONT.z - BACK_Z, body, { x: sx * (WIDTH / 2 - 0.05), y: 1.0 + (BACK_H - 1.0) / 2, z: (BOARD_FRONT.z + BACK_Z) / 2 });
    root.add(cage);
    root.add(boxMesh(0.012, 0.012, LANE_NEAR.z - LANE_FAR.z, CHROME, { x: sx * (WIDTH / 2 - 0.1), y: LANE_NEAR.y + 0.1, z: (LANE_NEAR.z + LANE_FAR.z) / 2 }));
  }
  // A plinth under it all, and the front with the ball trough.
  root.add(boxMesh(WIDTH - 0.2, 0.7, length, BLACK, { y: 0.35, z: centreZ }));
  root.add(boxMesh(WIDTH, 0.08, 0.2, body, { y: LANE_NEAR.y - 0.04, z: LANE_NEAR.z + 0.08 }));
  // The lane: wood, inclined up to the hump.
  const laneLen = Math.hypot(LANE_NEAR.z - LANE_FAR.z, LANE_FAR.y - LANE_NEAR.y);
  const lane = boxMesh(LANE_W, 0.02, laneLen, WOOD, { y: (LANE_NEAR.y + LANE_FAR.y) / 2 - 0.01, z: (LANE_NEAR.z + LANE_FAR.z) / 2 });
  lane.rotation.x = Math.atan2(LANE_FAR.y - LANE_NEAR.y, LANE_NEAR.z - LANE_FAR.z);
  root.add(lane);
  const hump = cylinderMesh(0.05, LANE_W, WOOD, { y: LANE_FAR.y - 0.02, z: LANE_FAR.z }, { segments: 16 });
  hump.rotation.z = Math.PI / 2;
  root.add(hump);
  // The target board with its rings, tilted back.
  const board = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_V), new THREE.MeshStandardMaterial({ map: paintBoard(), roughness: 0.6 }));
  board.position.set(0, (BOARD_FRONT.y + BOARD_BACK.y) / 2, (BOARD_FRONT.z + BOARD_BACK.z) / 2);
  board.rotation.x = -Math.PI / 2 + Math.atan2(BOARD_BACK.y - BOARD_FRONT.y, BOARD_FRONT.z - BOARD_BACK.z);
  board.receiveShadow = true;
  root.add(board);
  root.add(boxMesh(BOARD_W, BOARD_BACK.y - 0.2, 0.04, BLACK, { y: (BOARD_BACK.y - 0.2) / 2 + 0.2, z: BOARD_BACK.z - 0.03 }));
  // The backboard: marquee, the score display, and a mesh screen in front of the rings.
  root.add(boxMesh(WIDTH, BACK_H - BOARD_BACK.y, 0.06, body, { y: BOARD_BACK.y + (BACK_H - BOARD_BACK.y) / 2, z: BACK_Z }));
  const marqueeMap = paintMarquee(title, { height: 128, stops: ['#ffd23a', '#ff7a33'], ink: '#3a0f10', size: 52, textY: 70, decorate: notches });
  const marqueeMat = new THREE.MeshBasicMaterial({ map: marqueeMap, color: 0xdddddd });
  const marquee = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.06, 0.2), marqueeMat);
  marquee.position.set(0, BACK_H - 0.14, BACK_Z + 0.03 + WALL.notice.lift);
  layMesh(marquee, WALL.notice);
  root.add(marquee);
  const display = displayScreen([320, 200], [0.56, 0.35]);
  const screen = display.mesh;
  screen.position.set(0, BACK_H - 0.47, BACK_Z + 0.03 + WALL.notice.lift);
  layMesh(screen, WALL.notice);
  root.add(screen);
  const note = outOfOrderNote();
  note.position.set(0.02, -0.02, WALL.flyer.lift);
  screen.add(note);
  // The net over the rings starts above the ball's flight, so the player sees the board under it.
  const NET_Y = 1.45;
  const net = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.2, BACK_H - NET_Y), new THREE.MeshBasicMaterial({ map: paintNet(), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  net.position.set(0, NET_Y + (BACK_H - NET_Y) / 2 - 0.05, BOARD_FRONT.z - 0.05);
  net.rotation.x = 0.35;
  root.add(net);

  // The ball in play, and the trough of balls waiting at the front.
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 16, 12), BALL_MAT);
  ball.castShadow = true;
  root.add(ball);
  const trough: THREE.Mesh[] = [];
  for (let i = 0; i < BALLS - 1; i++) {
    const waiting = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 12, 10), BALL_MAT);
    waiting.position.set(-LANE_W / 2 + BALL_R + 0.005 + i * (BALL_R * 2 + 0.004), LANE_NEAR.y + BALL_R - 0.02, LANE_NEAR.z + 0.08);
    trough.push(waiting);
    root.add(waiting);
  }
  const strip = new TicketStrip(0.55);
  strip.position.set(WIDTH / 2 - 0.16, 0.55, LANE_NEAR.z + 0.15 + 0.001);
  root.add(strip);

  const hitbox = invisibleHitbox(WIDTH + 0.04, BACK_H, length + 0.04, { y: BACK_H / 2, z: centreZ });
  root.add(hitbox);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh !== net) mesh.receiveShadow = true;
  });
  return { marquee: marqueeMat, display, note, ball, trough, strip, hitbox };
}

/** The board: concentric rings round the 50, the numbers, the two 100 pockets in the top corners. */
function paintBoard(): THREE.Texture {
  const PX = 700;
  const W = Math.round(BOARD_W * PX);
  const H = Math.round(BOARD_V * PX);
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#1b3a6b';
  ctx.fillRect(0, 0, W, H);
  // Canvas y grows down; the board's v grows up from the front edge.
  const at = (u: number, v: number): [number, number] => [(u + BOARD_W / 2) * PX, H - v * PX];
  const [cx, cy] = at(RING_CENTRE.u, RING_CENTRE.v);
  const colours = ['#e8e2d0', '#c8443a', '#e8e2d0', '#c8443a'];
  [...RINGS].reverse().forEach((ring, i) => {
    ctx.fillStyle = colours[i]!;
    ctx.beginPath();
    ctx.arc(cx, cy, ring.within * PX, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(cx, cy, 0.03 * PX, 0, Math.PI * 2);
  ctx.fill();
  RINGS.forEach((ring, i) => drawText(ctx, `${ring.points}`, cx, cy - (i === 0 ? 0.035 : (ring.within - 0.025)) * PX, 18, i % 2 ? '#e8e2d0' : '#1b3a6b'));
  for (const p of POCKETS) {
    const [px, py] = at(p.u, p.v);
    ctx.fillStyle = '#ffd23a';
    ctx.beginPath();
    ctx.arc(px, py, POCKET_R * PX + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(px, py, POCKET_R * PX, 0, Math.PI * 2);
    ctx.fill();
    drawText(ctx, '100', px, py - POCKET_R * PX - 16, 16, '#ffd23a');
  }
  drawText(ctx, '10', W / 2, H - 22, 18, '#e8e2d0');
  return toTexture(canvas, 'facing');
}

/** The marquee's top edge: dark notches, like a fairground booth's. */
function notches(ctx: CanvasRenderingContext2D, width: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let x = 0; x < width; x += 32) ctx.fillRect(x, 0, 16, 10);
}

/** A see-through wire mesh in front of the rings (it keeps the balls in). */
function paintNet(): THREE.Texture {
  const [canvas, ctx] = createCanvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(200,200,210,0.35)';
  ctx.lineWidth = 2;
  for (let i = -256; i < 512; i += 24) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.moveTo(i + 256, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
  }
  const texture = toTexture(canvas);
  repeatTexture(texture);
  texture.repeat.set(2, 3);
  return texture;
}
