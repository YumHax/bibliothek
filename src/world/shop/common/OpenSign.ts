import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { cylinderMesh } from '../../meshUtils';
import { Prop, part } from '../../props/Prop';
import { paint } from '../../materials/palette';
import type { DayNight } from '../../props/DayNight';
import type { ShopKind } from '../../street/streetPlan';
import { SHOP_HOURS, clockTime, isShopOpen } from '../../street/shops/shopHours';
import { HAND, POSTER, hex, setLines } from './lettering';

export interface OpenSignOptions {
  /** The card's colour and the OPEN side's lettering. Default cream and the shop's accent. */
  card?: number;
  ink?: number;
  /** The CLOSED side's lettering. Default a dark red. */
  closedInk?: number;
}

const W = 0.24;
const H = 0.12;
const DROP = 0.1;
const PX = 1200;
/** Seconds between two looks at the clock; how far the card swings (radians) and how fast it settles when it is turned. */
const CHECK_EVERY = 1;
const SWING = 0.35;
const SETTLE = 1.6;
const CORD = paint(0x3a3430, 0.8);
const SUCKER = paint(0xd8e0e4, 0.2);

/**
 * The OPEN / CLOSED card hung on a cord from a sucker on the inside of the shop door's glass, turned by the
 * shopkeeper at opening and closing time (`SHOP_HOURS`, the game clock): the side facing the street reads OPEN while
 * the shop is open, so from inside the player reads its back, "SORRY, WE'RE CLOSED", as in any shop, with the hours
 * under it. It swings a little when turned. Wall-hung on the door (`plans/shared.OPEN_SIGN_AT`): origin at the sucker,
 * +z into the shop. Decoration: never collides.
 */
export class OpenSign extends Prop implements Updatable {
  private readonly card = new THREE.Group();
  private readonly inside: THREE.MeshStandardMaterial;
  private readonly outside: THREE.MeshStandardMaterial;
  private readonly faces: { open: THREE.Texture; closed: THREE.Texture };
  private open: boolean | null = null;
  private check = 0;
  private swing = 0;
  private time = 0;

  constructor(
    private readonly kind: ShopKind,
    private readonly dayNight: DayNight,
    accent: number,
    options: OpenSignOptions = {},
  ) {
    super();
    this.name = 'OpenSign';
    const card = hex(options.card ?? 0xf4eedc);
    const hours = SHOP_HOURS[kind];
    const note = hours ? `open ${clockTime(hours.open)} – ${clockTime(hours.close % 24)}` : '';
    this.faces = {
      open: paintFace(card, hex(options.ink ?? accent), ['OPEN', 'come in!'], POSTER),
      closed: paintFace(card, hex(options.closedInk ?? 0x9a2a22), ['SORRY', "WE'RE CLOSED", note], HAND),
    };
    const sucker = cylinderMesh(0.018, 0.008, SUCKER, { z: 0.004 }, { segments: 14 });
    sucker.rotation.x = Math.PI / 2;
    this.add(sucker);
    // The cord: two strands from the sucker to the card's top corners.
    for (const side of [-1, 1]) {
      const strand = part(this, 0.003, Math.hypot(DROP, W * 0.35), 0.003, CORD, { x: side * W * 0.175, y: -DROP / 2, z: 0.012 });
      strand.rotation.z = side * Math.atan2(W * 0.35, DROP);
    }
    this.card.position.set(0, -DROP, 0.012);
    this.add(this.card);
    // Card, both faces back to back (each culled from behind: a sheet, no edge worth drawing).
    this.inside = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    this.outside = new THREE.MeshStandardMaterial({ roughness: 0.7 });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this.inside);
    front.position.set(0, -H / 2, 0.001);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), this.outside);
    back.position.set(0, -H / 2, -0.001);
    back.rotation.y = Math.PI;
    this.card.add(front, back);
    this.traverse((o) => (o.castShadow = false));
    this.show(isShopOpen(kind, dayNight.state.hours), false);
  }

  update(dt: number): void {
    this.time += dt;
    if (this.swing > 0.001) {
      this.swing *= Math.exp(-dt * SETTLE);
      this.card.rotation.y = Math.sin(this.time * 5.5) * this.swing;
    }
    this.check -= dt;
    if (this.check > 0) return;
    this.check = CHECK_EVERY;
    this.show(isShopOpen(this.kind, this.dayNight.state.hours), true);
  }

  /** Turns the card: the street's side OPEN while `open` (so the room's side reads CLOSED). */
  private show(open: boolean, swing: boolean): void {
    if (open === this.open) return;
    this.open = open;
    this.inside.map = open ? this.faces.closed : this.faces.open;
    this.outside.map = open ? this.faces.open : this.faces.closed;
    this.inside.needsUpdate = this.outside.needsUpdate = true;
    if (swing) this.swing = SWING;
  }

  dispose(): void {
    this.faces.open.dispose();
    this.faces.closed.dispose();
  }
}

function paintFace(card: string, ink: string, lines: string[], family: string): THREE.Texture {
  const w = Math.round(W * PX);
  const h = Math.round(H * PX);
  const [canvas, ctx] = createCanvas(w, h);
  ctx.fillStyle = card;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = ink;
  ctx.lineWidth = h * 0.04;
  ctx.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
  setLines(ctx, { lines: lines.filter(Boolean), x: w * 0.08, y: h * 0.12, w: w * 0.84, h: h * 0.76, family, color: ink, weight: '800', firstScale: lines.length > 2 ? 1.2 : 2.2 });
  return toTexture(canvas);
}
