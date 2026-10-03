import * as THREE from 'three';
import { createCanvas, toTexture, repeatTexture } from '@/covers/generated/canvasUtils';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../../meshUtils';
import { paint, standard } from '../../materials/palette';
import { layMesh, WALL } from '../../surface/layers';
import { TicketStrip } from '../TicketStrip';
import { type MachineDisplay, displayScreen, outOfOrderNote, paintMarquee } from '../machineParts';
import { BACK_Z, BALLS, BALL_R, BOARD, CAGE_H, FRONT_Z, GUTTER_Z, HOOP, RAMP, WIDTH } from './HoopSim';

/** The parts of a hoop cage that move or change once built. */
export interface HoopModel {
  readonly marquee: THREE.MeshBasicMaterial;
  readonly display: MachineDisplay;
  readonly note: THREE.Mesh;
  /** The ring, its bracket and net: slides across with the sim's hoop. */
  readonly hoop: THREE.Group;
  /** One mesh per ball of the sim, in its order. */
  readonly balls: readonly THREE.Mesh[];
  readonly strip: TicketStrip;
  readonly hitbox: THREE.Mesh;
}

/**
 * Builds a basketball cage into `root` (origin on the floor under the middle of the cage, +z the
 * player's end) to `HoopSim`'s sizes: the cabinet under the ramp, the ramp and its gutter, the
 * steel cage with side nets, the back panel with the backboard, marquee and scoreboard (the
 * out-of-order note on it), the hoop on its bracket with its net, the balls, the ticket strip at
 * the front, the hitbox. Everything but the nets, the marquee and the scoreboard receives shadows.
 */
export function buildHoopModel(root: THREE.Group, color: number, title: string): HoopModel {
  const body = paint(color, 0.5);
  const steel = standard({ color: 0xb9bcc0, metalness: 1, roughness: 0.35 });
  const dark = paint(0x131318, 0.6);
  const length = FRONT_Z - BACK_Z;
  const midZ = (FRONT_Z + BACK_Z) / 2;

  // The cabinet under the ramp, its sides painted, the front with the gutter and the ticket slot.
  // The dark core stops inside the painted sides and front (flush with them, it would z-fight).
  root.add(boxMesh(WIDTH - 0.01, RAMP.frontY - 0.04, length - 0.03, dark, { y: (RAMP.frontY - 0.04) / 2, z: midZ - 0.015 }));
  for (const sx of [-1, 1]) root.add(boxMesh(0.04, 1.0, length, body, { x: sx * (WIDTH / 2 - 0.02), y: 0.5, z: midZ }));
  root.add(boxMesh(WIDTH, 0.9, 0.06, body, { y: 0.45, z: FRONT_Z - 0.03 }));
  const rampMat = paint(0x2a2a30, 0.7);
  const ramp = boxMesh(WIDTH - 0.08, 0.02, Math.hypot(RAMP.frontZ - RAMP.backZ, RAMP.backY - RAMP.frontY), rampMat, { y: (RAMP.frontY + RAMP.backY) / 2 - 0.01, z: (RAMP.frontZ + RAMP.backZ) / 2 });
  ramp.rotation.x = -Math.atan2(RAMP.backY - RAMP.frontY, RAMP.frontZ - RAMP.backZ);
  root.add(ramp);
  root.add(boxMesh(WIDTH - 0.08, 0.05, 0.14, rampMat, { y: RAMP.frontY - 0.03, z: GUTTER_Z + 0.03 }));
  // The cage: four posts, top rails, nets on the sides and over the top.
  for (const sx of [-1, 1]) {
    for (const z of [BACK_Z + 0.03, FRONT_Z - 0.06]) root.add(cylinderMesh(0.018, CAGE_H - 0.9, steel, { x: sx * (WIDTH / 2 - 0.02), y: 0.9 + (CAGE_H - 0.9) / 2, z }, { segments: 8 }));
    const rail = cylinderMesh(0.015, length - 0.06, steel, { x: sx * (WIDTH / 2 - 0.02), y: CAGE_H, z: midZ }, { segments: 8 });
    rail.rotation.x = Math.PI / 2;
    root.add(rail);
  }
  const net = new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, depthWrite: false, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(length - 0.1, CAGE_H - 1.0), net);
    side.rotation.y = Math.PI / 2;
    side.position.set(sx * (WIDTH / 2 - 0.02), 1.0 + (CAGE_H - 1.0) / 2, midZ);
    root.add(side);
  }
  // The back: the machine's tall panel, the backboard, the scoreboard and the marquee.
  root.add(boxMesh(WIDTH, CAGE_H + 0.15, 0.05, body, { y: (CAGE_H + 0.15) / 2, z: BACK_Z - 0.025 }));
  const board = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.3 }));
  board.position.set(0, BOARD.y, BOARD.z);
  root.add(board);
  root.add(boxMesh(BOARD.w + 0.03, BOARD.h + 0.03, 0.02, steel, { y: BOARD.y, z: BOARD.z - 0.012 }));
  for (const sx of [-1, 1]) root.add(boxMesh(0.03, 0.03, BOARD.z - BACK_Z, steel, { x: sx * 0.3, y: BOARD.y, z: (BOARD.z + BACK_Z) / 2 }));
  const marqueeMap = paintMarquee(title, { stops: ['#ff5a1a', '#ffd23a'], ink: '#1a0c04', size: 40 });
  const marqueeMat = new THREE.MeshBasicMaterial({ map: marqueeMap, color: 0xdddddd });
  const marquee = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.06, 0.2), marqueeMat);
  marquee.position.set(0, CAGE_H + 0.03, BACK_Z + WALL.notice.lift);
  layMesh(marquee, WALL.notice);
  root.add(marquee);
  const display = displayScreen([256, 96], [0.5, 0.19]);
  const screen = display.mesh;
  screen.position.set(0, BOARD.y + BOARD.h / 2 + 0.12, BOARD.z + WALL.notice.lift);
  layMesh(screen, WALL.notice);
  root.add(screen);
  const note = outOfOrderNote(0.26);
  note.position.z = WALL.flyer.lift;
  screen.add(note);
  // The hoop: an orange ring on a bracket, a net hanging under it.
  const hoop = new THREE.Group();
  hoop.position.set(HOOP.x, HOOP.y, HOOP.z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(HOOP.r, HOOP.tube, 8, 32), paint(0xff5a1a, 0.4));
  ring.rotation.x = Math.PI / 2;
  hoop.add(ring, boxMesh(0.06, 0.02, BOARD.z - HOOP.z + HOOP.r, steel, { z: -(HOOP.r + (HOOP.z - BOARD.z - HOOP.r) / 2) - 0.01 }));
  const hoopNet = new THREE.Mesh(new THREE.CylinderGeometry(HOOP.r, HOOP.r * 0.65, 0.26, 16, 1, true), net);
  hoopNet.position.y = -0.13;
  hoop.add(hoopNet);
  root.add(hoop);
  // The balls, waiting in the gutter.
  const leather = new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.65 });
  const balls: THREE.Mesh[] = [];
  for (let i = 0; i < BALLS; i++) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 16, 12), leather);
    mesh.castShadow = true;
    root.add(mesh);
    balls.push(mesh);
  }
  const strip = new TicketStrip(0.45);
  strip.position.set(WIDTH / 2 - 0.16, 0.45, FRONT_Z + 0.001);
  root.add(strip);

  const hitbox = invisibleHitbox(WIDTH + 0.04, CAGE_H + 0.2, length + 0.04, { y: (CAGE_H + 0.2) / 2, z: midZ });
  root.add(hitbox);
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && mesh.material !== net && mesh !== marquee && mesh !== screen) mesh.receiveShadow = true;
  });
  return { marquee: marqueeMat, display, note, hoop, balls, strip, hitbox };
}

function netTexture(): THREE.Texture {
  const [canvas, ctx] = createCanvas(256, 256);
  ctx.clearRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(230,230,235,0.4)';
  ctx.lineWidth = 2;
  for (let i = -256; i < 512; i += 22) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.moveTo(i + 256, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
  }
  const texture = toTexture(canvas);
  repeatTexture(texture);
  texture.repeat.set(3, 2);
  return texture;
}

function boardTexture(): THREE.Texture {
  const [canvas, ctx] = createCanvas(320, 220);
  ctx.fillStyle = '#f4f4f0';
  ctx.fillRect(0, 0, 320, 220);
  ctx.strokeStyle = '#e8303a';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, 308, 208);
  ctx.strokeRect(110, 100, 100, 76);
  return toTexture(canvas, 'facing');
}

function ballTexture(): THREE.Texture {
  const [canvas, ctx] = createCanvas(128, 64);
  ctx.fillStyle = '#e0701e';
  ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = '#2a1408';
  ctx.lineWidth = 2;
  for (const x of [0, 32, 64, 96]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 64);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, 32);
  ctx.lineTo(128, 32);
  ctx.stroke();
  return toTexture(canvas, 'facing');
}
