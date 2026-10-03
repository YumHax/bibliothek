import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { Prop, part } from '../../props/Prop';
import { ShutDoor } from '../../props/ShutDoor';
import { METAL, basic, paint, standard } from '../../materials/palette';
import { invisibleHitbox } from '../../meshUtils';
import { RENDER_ORDER } from '../../surface/layers';
import { STAIRWELL_PLAN as plan } from '../stairwellPlan';

/** What the sign hung on the lodge's door says (none: she is in). */
export type LodgeSign = keyof typeof plan.concierge.closed;

const WALLS = paint(0xd8ccae, 0.9);
const FLOOR = paint(0x6b4a3a, 0.5);
const CEILING = paint(0xeee6d4, 0.95);
const FRAME = paint(0x4a2c1c, 0.55);
const SILL = paint(0xcfc8ba, 0.6);
const GLASS = standard({ color: 0xdfe8e4, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.12, depthWrite: false });
const WOOD = paint(0x6a4428, 0.55);
const DARK = paint(0x222226, 0.4);
/** The reveal of the window and the door through the wall (m). */
const REVEAL = 0.15;

/**
 * The concierge's lodge behind the entrance hall's east wall (`STAIRWELL_PLAN.lodge`): her glazed door (a sign hung on
 * it when she is not in), the brass LOGE plate over it, the window she is seen through with its lace half-curtain, a
 * stone sill on the hall side with her Christmas box on it (`tipBox`, placed by the builder), and the little room
 * behind the glass: a table and its lamp, the television glowing, a chair, a calendar. Seen only through the glass:
 * nothing collides. Zone-local, placed at the origin.
 */
export class Lodge extends Prop {
  readonly contactShadow = false;
  private readonly sign: THREE.Mesh;
  private readonly signs: Record<LodgeSign, THREE.MeshBasicMaterial>;

  constructor() {
    super();
    this.name = 'Lodge';
    const { hall } = plan;
    const { window: pane, room, door } = plan.lodge;
    const x = hall.x1;
    const inner = x + REVEAL;
    const w0 = pane.z - pane.width / 2;
    const w1 = pane.z + pane.width / 2;
    const top = pane.sill + pane.height;

    // The room: floor, ceiling, its walls facing in (the west one round the window).
    const face = (w: number, h: number, material: THREE.Material, at: THREE.Vector3, yaw: number): void => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
      mesh.position.copy(at);
      mesh.rotation.y = yaw;
      mesh.receiveShadow = true;
      this.add(mesh);
    };
    const depth = room.z1 - room.z0;
    const width = room.x1 - inner;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(width, depth).rotateX(-Math.PI / 2), FLOOR);
    floor.position.set((inner + room.x1) / 2, 0.002, (room.z0 + room.z1) / 2);
    this.add(floor);
    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth).rotateX(Math.PI / 2), CEILING);
    ceiling.position.set((inner + room.x1) / 2, room.height, (room.z0 + room.z1) / 2);
    this.add(ceiling);
    face(depth, room.height, WALLS, new THREE.Vector3(room.x1, room.height / 2, (room.z0 + room.z1) / 2), -Math.PI / 2);
    face(width, room.height, WALLS, new THREE.Vector3((inner + room.x1) / 2, room.height / 2, room.z0), 0);
    face(width, room.height, WALLS, new THREE.Vector3((inner + room.x1) / 2, room.height / 2, room.z1), Math.PI);
    // The west wall from inside, round the window.
    face(w0 - room.z0, room.height, WALLS, new THREE.Vector3(inner, room.height / 2, (room.z0 + w0) / 2), Math.PI / 2);
    face(room.z1 - w1, room.height, WALLS, new THREE.Vector3(inner, room.height / 2, (w1 + room.z1) / 2), Math.PI / 2);
    face(pane.width, pane.sill, WALLS, new THREE.Vector3(inner, pane.sill / 2, pane.z), Math.PI / 2);
    face(pane.width, room.height - top, WALLS, new THREE.Vector3(inner, (top + room.height) / 2, pane.z), Math.PI / 2);
    // The window's reveal through the wall, its frame and glazing bar, the glass, the stone sill on the hall's side.
    part(this, REVEAL, 0.02, pane.width, WALLS, { x: x + REVEAL / 2, y: pane.sill - 0.01, z: pane.z });
    part(this, REVEAL, 0.02, pane.width, WALLS, { x: x + REVEAL / 2, y: top + 0.01, z: pane.z });
    part(this, REVEAL, pane.height, 0.02, WALLS, { x: x + REVEAL / 2, y: pane.sill + pane.height / 2, z: w0 - 0.01 });
    part(this, REVEAL, pane.height, 0.02, WALLS, { x: x + REVEAL / 2, y: pane.sill + pane.height / 2, z: w1 + 0.01 });
    const fx = x + 0.06;
    part(this, 0.05, 0.05, pane.width, FRAME, { x: fx, y: pane.sill + 0.025, z: pane.z });
    part(this, 0.05, 0.05, pane.width, FRAME, { x: fx, y: top - 0.025, z: pane.z });
    part(this, 0.05, pane.height, 0.05, FRAME, { x: fx, y: pane.sill + pane.height / 2, z: w0 + 0.025 });
    part(this, 0.05, pane.height, 0.05, FRAME, { x: fx, y: pane.sill + pane.height / 2, z: w1 - 0.025 });
    part(this, 0.04, pane.height, 0.03, FRAME, { x: fx, y: pane.sill + pane.height / 2, z: pane.z });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(pane.width - 0.1, pane.height - 0.1), GLASS);
    glass.position.set(fx, pane.sill + pane.height / 2, pane.z);
    glass.rotation.y = -Math.PI / 2;
    glass.renderOrder = RENDER_ORDER.glass;
    this.add(glass);
    part(this, 0.16, 0.04, pane.width + 0.16, SILL, { x: x - 0.06, y: pane.sill - 0.02, z: pane.z });
    // The lace half-curtain on its brass rod, inside.
    const curtainH = pane.height * pane.curtain;
    const lace = new THREE.Mesh(new THREE.PlaneGeometry(pane.width - 0.08, curtainH), new THREE.MeshStandardMaterial({ map: laceTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 }));
    lace.position.set(x + 0.11, pane.sill + 0.04 + curtainH / 2, pane.z);
    lace.rotation.y = -Math.PI / 2;
    this.add(lace);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, pane.width - 0.04, 6).rotateX(Math.PI / 2), METAL.brass());
    rod.position.set(x + 0.11, pane.sill + 0.05 + curtainH, pane.z);
    this.add(rod);

    // Her glazed door, the LOGE plate over it, the sign hung on it while she is out.
    const leaf = new ShutDoor({ style: 'glazed', leafColor: 0x5a3a26 });
    leaf.position.set(x - 0.005, 0, door.z);
    leaf.rotation.y = -Math.PI / 2;
    this.add(leaf);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.09), new THREE.MeshStandardMaterial({ map: plateTexture('LOGE'), metalness: 0.6, roughness: 0.35 }));
    plate.position.set(x - 0.006, 2.25, door.z);
    plate.rotation.y = -Math.PI / 2;
    this.add(plate);
    this.signs = {
      lunch: new THREE.MeshBasicMaterial({ map: signTexture(plan.concierge.closed.lunch) }),
      night: new THREE.MeshBasicMaterial({ map: signTexture(plan.concierge.closed.night) }),
      stairs: new THREE.MeshBasicMaterial({ map: signTexture(plan.concierge.closed.stairs) }),
    };
    this.sign = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.12), this.signs.night);
    this.sign.position.set(x - 0.04, 1.42, door.z);
    this.sign.rotation.y = -Math.PI / 2;
    this.add(this.sign);

    // Inside: the table and its lamp, the television on its stand, a chair at the glass, the calendar on the wall.
    const tx = room.x1 - 0.45;
    const tz = (room.z0 + w0) / 2 + 0.2;
    part(this, 0.6, 0.03, 0.8, WOOD, { x: tx, y: 0.74, z: tz });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) part(this, 0.04, 0.73, 0.04, WOOD, { x: tx + sx * 0.26, y: 0.365, z: tz + sz * 0.36 });
    part(this, 0.1, 0.02, 0.1, DARK, { x: tx, y: 0.765, z: tz - 0.25 });
    part(this, 0.02, 0.3, 0.02, DARK, { x: tx, y: 0.92, z: tz - 0.25 });
    part(this, 0.22, 0.16, 0.22, basic({ color: 0xf4d9a0 }), { x: tx, y: 1.1, z: tz - 0.25 });
    const tvz = room.z1 - 0.35;
    part(this, 0.45, 0.6, 0.45, WOOD, { x: room.x1 - 0.3, y: 0.3, z: tvz });
    part(this, 0.42, 0.36, 0.4, DARK, { x: room.x1 - 0.3, y: 0.78, z: tvz });
    part(this, 0.005, 0.28, 0.34, basic({ color: 0x6f8fb4 }), { x: room.x1 - 0.51, y: 0.79, z: tvz });
    const [sx, sz] = plan.lodge.stand;
    part(this, 0.42, 0.04, 0.42, WOOD, { x: sx + 0.45, y: 0.45, z: sz - 0.55 });
    part(this, 0.04, 0.45, 0.42, WOOD, { x: sx + 0.66, y: 0.7, z: sz - 0.55 });
    const calendar = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.42), new THREE.MeshStandardMaterial({ map: plateTexture('1987', '#f2ecdc', '#7a2a22'), roughness: 0.9 }));
    calendar.position.set(room.x1 - 0.005, 1.55, (room.z0 + room.z1) / 2);
    calendar.rotation.y = -Math.PI / 2;
    this.add(calendar);
    this.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = false;
    });
  }

  /** Hangs the sign saying where she is (null: she is in, the sign comes off). */
  setSign(sign: LodgeSign | null): void {
    this.sign.visible = sign !== null;
    if (sign) this.sign.material = this.signs[sign];
  }
}

/**
 * Her Christmas box on the lodge's sill (les étrennes): a little tin with a slot. A few coins in it are thanked, and
 * before she has handed it over they buy the player the cellar key. `onTip` says what she answers.
 */
export class TipBox extends Prop implements Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly tin: THREE.MeshStandardMaterial;

  constructor(private readonly onTip: (session: SessionActions) => string) {
    super();
    this.name = 'TipBox';
    this.tin = new THREE.MeshStandardMaterial({ color: 0x8a2a24, metalness: 0.5, roughness: 0.4 });
    part(this, 0.12, 0.08, 0.09, this.tin, { y: 0.04 });
    part(this, 0.05, 0.004, 0.006, DARK, { y: 0.081 });
    const hit = invisibleHitbox(0.18, 0.14, 0.16, { y: 0.06 });
    this.add(hit);
    this.hitboxes = [hit];
  }

  setHovered(hovered: boolean): void {
    this.tin.emissive.setHex(hovered ? 0x2a0c0a : 0x000000);
  }

  label(): string {
    return `The concierge's Christmas box · tip ${plan.lodge.tipBox.price}`;
  }

  activate(session: SessionActions): void {
    session.pay({ price: plan.lodge.tipBox.price, paid: () => this.onTip(session) });
  }
}

/** A brass plate (or a printed card) with `text`. */
function plateTexture(text: string, ground = '#c9a75b', ink = '#3a2812'): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 72);
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, 256, 72);
  ctx.strokeStyle = 'rgba(60, 40, 16, 0.6)';
  ctx.lineWidth = 3;
  ctx.strokeRect(5, 5, 246, 62);
  ctx.fillStyle = ink;
  ctx.font = 'bold 40px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 38, 230);
  return toTexture(canvas, 2);
}

/** The card hung on her door: handwritten. */
function signTexture(text: string): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 128);
  ctx.fillStyle = '#f4efe2';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#2a2a2a';
  ctx.lineWidth = 2;
  ctx.strokeRect(4, 4, 248, 120);
  ctx.fillStyle = '#1f2a4a';
  ctx.font = 'italic 34px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 66, 236);
  return toTexture(canvas, 2);
}

/** A lace net: rows of little flowers and holes, cut out by its alpha. */
function laceTexture(): THREE.CanvasTexture {
  const size = 128;
  const [canvas, ctx] = createCanvas(size, size);
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#f6f2ea';
  ctx.strokeStyle = '#f6f2ea';
  ctx.lineWidth = 3;
  for (let y = 0; y <= size; y += 32) for (let x = 0; x <= size; x += 32) {
    const ox = (y / 32) % 2 ? 16 : 0;
    ctx.beginPath();
    ctx.arc(x + ox, y, 9, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(x + ox + Math.cos(a) * 5, y + Math.sin(a) * 5, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // The net between the flowers.
  ctx.lineWidth = 1.5;
  for (let i = -size; i < size * 2; i += 8) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + size, size);
    ctx.moveTo(i + size, 0);
    ctx.lineTo(i, size);
    ctx.stroke();
  }
  const texture = toTexture(canvas, 2);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 2);
  return texture;
}
