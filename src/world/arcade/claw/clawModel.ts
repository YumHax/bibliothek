import * as THREE from 'three';
import { createCanvas, toTexture, FONT } from '@/covers/generated/canvasUtils';
import { boxMesh, cylinderMesh, invisibleHitbox } from '../../meshUtils';
import { matte } from '../../props/Prop';
import { paint, standard } from '../../materials/palette';
import { PooledLight } from '../../lighting/LightPool';
import { WALL } from '../../surface/layers';
import { CHROME, type MachineDisplay, displayScreen, outOfOrderNote, paintMarquee } from '../machineParts';
import { BASE_H, CARRIAGE_Y, CASE_H, type ClawPlush, DEPTH, RAIL_Y, TOP_H, TOTAL_H, WIDTH } from './ClawSim';

const BLACK = paint(0x111116, 0.5);

/** The parts of a claw machine that move or change once built. */
export interface ClawModel {
  readonly marquee: THREE.MeshBasicMaterial;
  /** The chaser bulbs' strip: its offset slides. */
  readonly chaser: THREE.Texture;
  readonly beam: THREE.Mesh;
  readonly carriage: THREE.Group;
  readonly cable: THREE.Mesh;
  readonly hub: THREE.Mesh;
  readonly prongs: readonly THREE.Group[];
  readonly stick: THREE.Group;
  readonly stickBall: THREE.Mesh;
  readonly button: THREE.Mesh;
  readonly display: MachineDisplay;
  readonly note: THREE.Mesh;
  readonly hitbox: THREE.Mesh;
  /** One group per plush of the sim, in its order, and each one's recolourable fur. */
  readonly plush: readonly { group: THREE.Group; fur: THREE.MeshStandardMaterial }[];
}

/**
 * Builds a crane game into `root` (origin on the floor under its centre, +z the player's side) to
 * `ClawSim`'s sizes: the painted base with its chute door, front print, control panel, stick,
 * button and countdown display; the glass case on chrome posts with the out-of-order note; the lit
 * top with the marquee and its chaser bulbs; the case light; the heap of `plush`; the gantry, its
 * carriage, cable and three-pronged claw; the hitbox. Every mesh receives shadows.
 */
export function buildClawModel(root: THREE.Group, color: number, plush: readonly ClawPlush[]): ClawModel {
  const body = paint(color, 0.5);

  // Base: the box, a kick plate, the chute door with its chrome frame, the control panel.
  root.add(boxMesh(WIDTH, 0.06, DEPTH, BLACK, { y: 0.03 }));
  root.add(boxMesh(WIDTH, BASE_H - 0.06, DEPTH, body, { y: 0.06 + (BASE_H - 0.06) / 2 }));
  root.add(boxMesh(0.3, 0.3, 0.02, CHROME, { x: -WIDTH / 2 + 0.22, y: 0.3, z: DEPTH / 2 + 0.006 }));
  root.add(boxMesh(0.25, 0.25, 0.02, standard({ color: 0x8fb8d8, roughness: 0.1, transparent: true, opacity: 0.5 }), { x: -WIDTH / 2 + 0.22, y: 0.3, z: DEPTH / 2 + 0.012 }));
  const front = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.04, 0.26), new THREE.MeshStandardMaterial({ map: paintFront(color), roughness: 0.6 }));
  front.position.set(0, BASE_H - 0.2, DEPTH / 2 + WALL.notice.lift);
  root.add(front);
  const panel = boxMesh(0.4, 0.05, 0.16, BLACK, { x: 0.1, y: BASE_H + 0.02, z: DEPTH / 2 - 0.06 });
  panel.rotation.x = -0.2;
  root.add(panel);
  const stick = new THREE.Group();
  stick.position.set(0, BASE_H + 0.04, DEPTH / 2 - 0.07);
  stick.add(cylinderMesh(0.008, 0.1, CHROME, { y: 0.05 }, { segments: 8 }));
  const stickBall = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), paint(0xd23a3a, 0.4));
  stickBall.position.y = 0.11;
  stick.add(stickBall);
  root.add(stick);
  const button = cylinderMesh(0.02, 0.015, paint(0xffd23a, 0.4), { x: 0.16, y: BASE_H + 0.05, z: DEPTH / 2 - 0.08 }, { segments: 14 });
  root.add(button);
  // The countdown display beside the button.
  const display = displayScreen([128, 48], [0.12, 0.045]);
  const screen = display.mesh;
  screen.position.set(0.28, BASE_H - 0.035, DEPTH / 2 + WALL.sign.lift);
  root.add(screen);

  // The case: chrome posts at the corners, glass all round, a lit top with the marquee.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) root.add(boxMesh(0.03, CASE_H, 0.03, CHROME, { x: sx * (WIDTH / 2 - 0.015), y: BASE_H + CASE_H / 2, z: sz * (DEPTH / 2 - 0.015) }));
  const glassMat = standard({ color: 0xdde8ee, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false });
  const pane = (w: number, x: number, z: number, ry: number): void => {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, CASE_H), glassMat);
    glass.position.set(x, BASE_H + CASE_H / 2, z);
    glass.rotation.y = ry;
    glass.castShadow = false;
    root.add(glass);
  };
  pane(WIDTH - 0.06, 0, DEPTH / 2 - 0.005, 0);
  pane(WIDTH - 0.06, 0, -DEPTH / 2 + 0.005, Math.PI);
  pane(DEPTH - 0.06, -WIDTH / 2 + 0.005, 0, Math.PI / 2);
  pane(DEPTH - 0.06, WIDTH / 2 - 0.005, 0, -Math.PI / 2);
  // Out of order: a note taped on the front glass.
  const note = outOfOrderNote();
  note.position.set(0.12, BASE_H + CASE_H * 0.45, DEPTH / 2 - 0.002);
  root.add(note);
  root.add(boxMesh(WIDTH, TOP_H, DEPTH, body, { y: BASE_H + CASE_H + TOP_H / 2 }));
  const marqueeMap = paintMarquee('GRAB A PRIZE!', { width: 768, height: 128, stops: ['#ff2fa0', '#ffe23a', '#33e0ff'], ink: '#2a0f3a', size: 48, textY: 66, decorate: starburst });
  const marqueeMat = new THREE.MeshBasicMaterial({ map: marqueeMap, toneMapped: false, color: 0xdddddd });
  const marquee = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.06, TOP_H - 0.1), marqueeMat);
  marquee.position.set(0, BASE_H + CASE_H + TOP_H / 2, DEPTH / 2 + WALL.notice.lift);
  root.add(marquee);
  // Chaser bulbs along the top and bottom edges of the marquee: a repeating strip whose texture slides.
  const chaser = paintChaser();
  chaser.wrapS = THREE.RepeatWrapping;
  chaser.repeat.set(12, 1);
  const chaserMat = new THREE.MeshBasicMaterial({ map: chaser, toneMapped: false });
  for (const y of [BASE_H + CASE_H + 0.025, BASE_H + CASE_H + TOP_H - 0.025]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.06, 0.04), chaserMat);
    strip.position.set(0, y, DEPTH / 2 + WALL.notice.lift);
    root.add(strip);
  }
  // The case is lit from the top: a strip and a small light so the plush reads through the glass.
  const strip = boxMesh(WIDTH - 0.1, 0.015, 0.03, standard({ color: 0xffffff, emissive: 0xfff2dc, emissiveIntensity: 2 }), { y: BASE_H + CASE_H - 0.01, z: -DEPTH / 2 + 0.06 });
  strip.castShadow = false;
  root.add(strip);
  const light = new PooledLight(0xfff0dc, 1.4, 1.8, 2); // lent a real one by the arcade's `LightPool` when near
  light.position.set(0, BASE_H + CASE_H - 0.1, 0);
  root.add(light);

  // The plush: soft blobs with heads and ears where the sim heaped them.
  const toys = plush.map((p) => {
    const toy = plushToy(p.r, p.color, p.yaw);
    toy.group.position.copy(p.pos);
    root.add(toy.group);
    return toy;
  });

  // The gantry: two rails along z, a beam across them carrying the carriage, the cable and the claw.
  for (const sx of [-1, 1]) root.add(boxMesh(0.02, 0.02, DEPTH - 0.1, CHROME, { x: sx * (WIDTH / 2 - 0.06), y: RAIL_Y }));
  const beam = boxMesh(WIDTH - 0.12, 0.02, 0.02, CHROME, { y: RAIL_Y - 0.02 });
  root.add(beam);
  const carriage = new THREE.Group();
  carriage.position.y = CARRIAGE_Y;
  carriage.add(boxMesh(0.08, 0.05, 0.08, BLACK));
  const cable = cylinderMesh(0.003, 1, BLACK, {}, { segments: 6 });
  carriage.add(cable);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), CHROME);
  carriage.add(hub);
  const prongs: THREE.Group[] = [];
  for (let i = 0; i < 3; i++) {
    const prong = new THREE.Group();
    prong.rotation.y = (i / 3) * Math.PI * 2;
    const finger = boxMesh(0.012, 0.11, 0.02, CHROME, { y: -0.055, z: 0.02 });
    finger.rotation.x = 0.35;
    const tip = boxMesh(0.012, 0.05, 0.02, CHROME, { y: -0.12, z: 0.045 });
    tip.rotation.x = -0.3;
    prong.add(finger, tip);
    prongs.push(prong);
    carriage.add(prong);
  }
  root.add(carriage);

  const hitbox = invisibleHitbox(WIDTH + 0.04, TOTAL_H, DEPTH + 0.04, { y: TOTAL_H / 2 });
  root.add(hitbox);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) mesh.receiveShadow = true;
  });
  return { marquee: marqueeMat, chaser, beam, carriage, cable, hub, prongs, stick, stickBall, button, display, note, hitbox, plush: toys };
}

/** A plush: a body sphere, a head on top, two ears; the plush's eyes as two dark dots facing `yaw`. Its fur is its own, so a restock can recolour it. */
function plushToy(r: number, color: number, yaw: number): { group: THREE.Group; fur: THREE.MeshStandardMaterial } {
  const g = new THREE.Group();
  const fur = matte(color, 1);
  const body = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), fur);
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(r * 0.7, 14, 10), fur);
  head.position.set(0, r * 1.15, r * 0.2);
  head.castShadow = true;
  const dark = paint(0x222222, 0.4);
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(r * 0.28, 8, 6), fur);
    ear.position.set(sx * r * 0.55, r * 1.75, r * 0.1);
    g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(r * 0.09, 6, 5), dark);
    eye.position.set(sx * r * 0.28, r * 1.25, r * 0.85);
    g.add(eye);
  }
  g.add(body, head);
  g.rotation.y = yaw;
  return { group: g, fur };
}

/** The marquee's starburst behind GRAB A PRIZE!: pale rays from the middle. */
function starburst(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const cx = width / 2;
  const cy = height / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 12; i++) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos((i / 12) * Math.PI * 2) * 500, cy + Math.sin((i / 12) * Math.PI * 2) * 500);
    ctx.lineTo(cx + Math.cos(((i + 0.5) / 12) * Math.PI * 2) * 500, cy + Math.sin(((i + 0.5) / 12) * Math.PI * 2) * 500);
    ctx.closePath();
    ctx.fill();
  }
}

/** One bulb per tile, lit at the left and fading right, so sliding the texture chases the lit one along. */
function paintChaser(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(64, 32);
  ctx.fillStyle = '#2a0f1a';
  ctx.fillRect(0, 0, 64, 32);
  ctx.fillStyle = '#ffe680';
  ctx.beginPath();
  ctx.arc(16, 16, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6a4a2a';
  ctx.beginPath();
  ctx.arc(48, 16, 9, 0, Math.PI * 2);
  ctx.fill();
  return toTexture(canvas);
}

/** The base's front print: the rules and the price. */
function paintFront(color: number): THREE.Texture {
  const [canvas, ctx] = createCanvas(760, 260);
  ctx.fillStyle = `#${new THREE.Color(color).getHexString()}`;
  ctx.fillRect(0, 0, 760, 260);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(40, 40, 680, 180);
  ctx.fillStyle = '#2a0f3a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 54px ${FONT}`;
  ctx.fillText('1 COIN = 1 TRY', 380, 100);
  ctx.font = `28px ${FONT}`;
  ctx.fillText('move the claw · press to drop · every play wins*', 380, 160);
  ctx.font = `18px ${FONT}`;
  ctx.fillText('*not every play wins', 380, 200);
  return toTexture(canvas, 4);
}
