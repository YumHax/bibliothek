import * as THREE from 'three';
import { createCanvas } from '@/covers/generated/canvasUtils';
import { boxMesh } from '../meshUtils';
import { matte } from '../props/Prop';
import { drawText } from './games/ArcadeGame';

/** One ticket's length along the strip, metres. */
const TICKET_LENGTH = 0.022;
const WIDTH = 0.035;
/** How fast the strip feeds out, tickets per second. */
const FEED_RATE = 24;

let ticketArt: THREE.CanvasTexture | null = null;

/** One ticket, tiled along the strip: orange card, a perforation, ADMIT ONE. Painted once. */
function art(): THREE.CanvasTexture {
  if (ticketArt) return ticketArt;
  const [canvas, ctx] = createCanvas(64, 40);
  ctx.fillStyle = '#ff9a2a';
  ctx.fillRect(0, 0, 64, 40);
  ctx.fillStyle = '#ffd08a';
  ctx.fillRect(4, 4, 56, 32);
  drawText(ctx, 'TICKET', 32, 20, 10, '#8a3a10');
  ctx.fillStyle = 'rgba(80,30,0,0.8)';
  for (let x = 0; x < 64; x += 4) ctx.fillRect(x, 0, 2, 1.5);
  ticketArt = new THREE.CanvasTexture(canvas);
  ticketArt.colorSpace = THREE.SRGBColorSpace;
  ticketArt.wrapT = THREE.RepeatWrapping;
  return ticketArt;
}

/**
 * The paper tickets a machine pays out: a chrome slot plate, and a strip that feeds out of it one
 * ticket at a time as the end card counts up and hangs down the front, up to the floor. `tear()`
 * takes it (the player pockets them). Local origin at the slot, the strip hanging along -y, facing +z.
 */
export class TicketStrip extends THREE.Group {
  private readonly strip: THREE.Mesh;
  private readonly texture: THREE.Texture;
  private readonly maxLength: number;
  private target = 0;
  private shown = 0;

  /** `drop`: metres from the slot down to the floor (the strip never goes further). */
  constructor(drop: number) {
    super();
    this.maxLength = Math.max(0.05, drop - 0.01);
    this.add(boxMesh(0.07, 0.025, 0.01, new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.6, roughness: 0.35 }), { z: 0.005 }));
    this.add(boxMesh(0.045, 0.004, 0.012, matte(0x050505, 0.8), { z: 0.006 }));
    this.texture = art().clone();
    this.texture.wrapT = THREE.RepeatWrapping;
    const geometry = new THREE.PlaneGeometry(WIDTH, 1);
    geometry.translate(0, -0.5, 0);
    this.strip = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.8, side: THREE.DoubleSide }));
    this.strip.position.z = 0.013;
    this.strip.visible = false;
    this.strip.castShadow = false;
    this.add(this.strip);
  }

  /** How many tickets should be out; the strip feeds towards it. */
  setTickets(tickets: number): void {
    this.target = Math.max(0, tickets);
  }

  /** Takes the strip off: nothing hangs out any more. */
  tear(): void {
    this.target = 0;
    this.shown = 0;
    this.layout();
  }

  update(dt: number): void {
    if (this.shown === this.target) return;
    this.shown = this.shown < this.target ? Math.min(this.target, this.shown + FEED_RATE * dt) : this.target;
    this.layout();
  }

  private layout(): void {
    const length = Math.min(this.maxLength, this.shown * TICKET_LENGTH);
    this.strip.visible = length > 0.001;
    this.strip.scale.y = Math.max(0.001, length);
    this.texture.repeat.y = Math.max(0.001, length / TICKET_LENGTH);
    // A strip longer than the drop would pile on the floor: curl its bottom out a little instead.
    this.strip.rotation.x = length >= this.maxLength ? 0.12 : 0.03;
  }
}
