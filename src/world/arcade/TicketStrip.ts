import * as THREE from 'three';
import { createCanvas, canvasTexture } from '@/covers/generated/canvasUtils';
import { reduceMotion } from '@/settings/motion';
import { boxMesh } from '../meshUtils';
import { markShared } from '../props/Prop';
import { METAL, paint } from '../materials/palette';
import { drawText } from './games/ArcadeGame';

/** One ticket's length along the strip, metres. */
const TICKET_LENGTH = 0.022;
const WIDTH = 0.035;
/** How fast the strip feeds out, tickets per second. */
const FEED_RATE = 24;
/** One ticket folded onto the pile on the floor (m), and the tallest the pile grows: past it a win still feeds, the pile just stops rising. */
const FOLD = 0.0011;
const PILE_MAX = 0.14;
/** The strip sways as it comes out: how fast (rad/s) and how far (rad), dying away this fast once it stops (1/s). */
const WAVE_RATE = 7;
const WAVE_SWING = 0.07;
const WAVE_DECAY = 2.5;
/** Taking the tickets: the strip and its pile are pulled up and out towards the player's hand over this long (s). */
const TEAR_S = 0.35;
const TEAR_REACH = new THREE.Vector3(0, 0.45, 0.35);

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
  ticketArt = markShared(canvasTexture(canvas, { anisotropy: 'facing' }));
  ticketArt.wrapT = THREE.RepeatWrapping; // convention-ok: tiles along the strip only
  return ticketArt;
}

/**
 * The paper tickets a machine pays out: a chrome slot plate, and a strip that feeds out of it one
 * ticket at a time as the end card counts up, swaying as it comes, and hangs down the front to the
 * floor; past the floor the tickets fold up on a pile there that grows with the win, so a big strip
 * looks big. `tear()` takes it all, pulled up and out towards the player's hand. Local origin at the
 * slot, the strip hanging along -y, facing +z.
 */
export class TicketStrip extends THREE.Group {
  private readonly strip: THREE.Mesh;
  private readonly texture: THREE.Texture;
  private readonly pile: THREE.Mesh;
  /** What moves when the tickets are taken: the strip and the pile together. */
  private readonly paper = new THREE.Group();
  private readonly maxLength: number;
  private target = 0;
  private shown = 0;
  private wave = 0;
  private clock = 0;
  /** Seconds left of the tear (0: none under way). */
  private tearing = 0;

  /** `drop`: metres from the slot down to the floor (the strip never goes further). */
  constructor(drop: number) {
    super();
    this.maxLength = Math.max(0.05, drop - 0.01);
    this.add(boxMesh(0.07, 0.025, 0.01, METAL.satinSteel(), { z: 0.005 }));
    this.add(boxMesh(0.045, 0.004, 0.012, paint(0x050505, 0.8), { z: 0.006 }));
    this.add(this.paper);
    this.texture = art().clone();
    this.texture.wrapT = THREE.RepeatWrapping; // convention-ok: wraps one way only
    const geometry = new THREE.PlaneGeometry(WIDTH, 1);
    geometry.translate(0, -0.5, 0);
    this.strip = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.8, side: THREE.DoubleSide }));
    this.strip.position.z = 0.013;
    this.strip.visible = false;
    this.strip.castShadow = false;
    this.paper.add(this.strip);
    // The folded tickets on the floor at the strip's foot: a stack of the same card, its height the overflow.
    const pileGeometry = new THREE.BoxGeometry(WIDTH * 1.05, 1, TICKET_LENGTH * 1.5);
    pileGeometry.translate(0, 0.5, 0);
    this.pile = new THREE.Mesh(pileGeometry, new THREE.MeshStandardMaterial({ map: art(), roughness: 0.85 }));
    this.pile.position.set(0, -drop, 0.013 + TICKET_LENGTH);
    this.pile.visible = false;
    this.pile.castShadow = false;
    this.paper.add(this.pile);
  }

  /** How many tickets should be out; the strip feeds towards it. */
  setTickets(tickets: number): void {
    this.target = Math.max(0, tickets);
  }

  /** Takes the strip off (the player pockets them): pulled away towards the hand, then nothing hangs out. */
  tear(): void {
    const out = this.shown > 0;
    this.target = 0;
    if (out && !reduceMotion()) {
      this.tearing = TEAR_S;
      return;
    }
    this.shown = 0;
    this.layout();
  }

  update(dt: number): void {
    if (this.tearing > 0) {
      this.tearing = Math.max(0, this.tearing - dt);
      const k = 1 - this.tearing / TEAR_S;
      this.paper.position.copy(TEAR_REACH).multiplyScalar(k * k);
      this.paper.scale.setScalar(Math.max(0.001, 1 - k));
      if (this.tearing > 0) return;
      this.paper.position.set(0, 0, 0);
      this.paper.scale.setScalar(1);
      this.shown = 0;
      this.layout();
      return;
    }
    const feeding = this.shown < this.target;
    if (feeding) this.wave = 1;
    else if (this.wave > 0) this.wave = Math.max(0, this.wave - WAVE_DECAY * dt);
    if (this.shown === this.target && this.wave === 0) return;
    this.clock += dt;
    if (this.shown !== this.target) this.shown = feeding ? Math.min(this.target, this.shown + FEED_RATE * dt) : this.target;
    this.layout();
  }

  private layout(): void {
    const fed = this.shown * TICKET_LENGTH;
    const length = Math.min(this.maxLength, fed);
    this.strip.visible = length > 0.001;
    this.strip.scale.y = Math.max(0.001, length);
    this.texture.repeat.y = Math.max(0.001, length / TICKET_LENGTH);
    // Past the floor the strip folds onto its pile, which grows with every ticket.
    const folded = Math.max(0, fed - this.maxLength) / TICKET_LENGTH;
    this.pile.visible = folded >= 1;
    this.pile.scale.y = Math.max(0.001, Math.min(PILE_MAX, folded * FOLD));
    // Reaching the floor the strip curls out towards its pile; on the way it sways as it comes out of the slot.
    const sway = this.wave * WAVE_SWING * Math.sin(this.clock * WAVE_RATE);
    this.strip.rotation.x = (length >= this.maxLength ? 0.12 : 0.03) + sway * 0.6;
    this.strip.rotation.z = sway * 0.5;
  }
}
