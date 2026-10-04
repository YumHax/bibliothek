import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { annexPrice } from '@/social/building/roux';
import { boughtLine } from '@/economy/homeGoods';
import { markRouxBought, onRouxPhase, rouxPhase, type RouxPhase } from '@/building/rouxMove';
import type { Zone } from '../zone/Zone';
import type { BuildContext } from '../buildContext';
import { Prop } from '../props/Prop';
import { invisibleHitbox } from '../meshUtils';
import { paint } from '../materials/palette';
import { WALL } from '../surface/layers';
import { HoverGlint } from '../props/hoverGlint';
import { STAIRWELL_PLAN } from '../stairwell/stairwellPlan'; // imports-ok: Mrs Roux's landing is the stairwell's: the annex opens onto it
import { landingY } from '@/world/measures/building';
import { ROUX_LANDING } from './annexPlan';
import { formatCoins } from '@/text/money';

/** The sign's board, a hand's breadth proud of the leaf (whose face is 16 mm out of its frame, `ShutDoor`). */
const SIGN = { width: 0.36, height: 0.26, depth: 0.008, z: 0.03 };
const BOARD = paint(0xf4f1ea, 0.7);
const CARDBOARD = paint(0xb88f5c, 0.95);
const TAPE = paint(0xd9c9a2, 0.6);

/**
 * The agency's sign screwed to Mrs Roux's door while her flat is for sale ("FOR SALE · Duval & Fils"), struck across
 * with SOLD once the player bought it. Clicked while for sale, it buys the flat (`SessionActions.buyUpgrade`: dear as it
 * is, a second click confirms; the coins and the 'annex' good in one save, the move's day with them). Door-local frame
 * (`ShutDoor`'s: origin on the floor at the leaf's middle, +z onto the landing). Never collides.
 */
class RouxDoorSign extends Prop implements Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: THREE.CanvasTexture;
  private readonly glint: HoverGlint;
  private phase: RouxPhase = 'settled';

  constructor(private readonly buy: () => { title: string; price: number; detail: string; bought(): void }) {
    super();
    this.name = 'RouxDoorSign';
    const [canvas, ctx] = createCanvas(360, 260);
    this.ctx = ctx;
    this.texture = toTexture(canvas);
    const face = new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.7 });
    const board = new THREE.Mesh(new THREE.BoxGeometry(SIGN.width, SIGN.height, SIGN.depth), [BOARD, BOARD, BOARD, BOARD, face, BOARD]);
    board.position.set(0, ROUX_LANDING.sign.y, SIGN.z + SIGN.depth / 2);
    board.castShadow = false;
    this.add(board);
    this.glint = HoverGlint.of(board);
    // Out past the door's own hitbox (to 8 cm off the leaf), so the crosshair finds the sign before the door.
    const hitbox = invisibleHitbox(SIGN.width + 0.04, SIGN.height + 0.04, 0.14, { y: ROUX_LANDING.sign.y, z: 0.07 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
    this.show(rouxPhase());
  }

  /** Up while the flat is for sale or sold; struck SOLD once bought; gone before. */
  show(phase: RouxPhase): void {
    this.phase = phase;
    const up = phase !== 'settled' && phase !== 'thinking';
    this.visible = up;
    this.hitboxes[0]?.scale.setScalar(up ? 1 : 1e-4);
    if (up) this.paint(phase !== 'forSale');
  }

  private paint(sold: boolean): void {
    const { ctx } = this;
    const { width: w, height: h } = ctx.canvas;
    ctx.fillStyle = '#f4f1ea';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#b8282e';
    ctx.fillRect(0, 0, w, 70);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 50px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('FOR SALE', w / 2, 37);
    ctx.fillStyle = '#1d2a3a';
    ctx.font = 'bold 30px Georgia, serif';
    ctx.fillText('Duval & Fils', w / 2, 112);
    ctx.font = '22px Georgia, serif';
    ctx.fillText('estate agents · since 1952', w / 2, 148);
    ctx.font = 'bold 24px Helvetica, Arial, sans-serif';
    ctx.fillText('2 rooms · 31 m² · street side', w / 2, 192);
    ctx.font = '20px Helvetica, Arial, sans-serif';
    ctx.fillText('01 43 57 21 08', w / 2, 228);
    if (sold) {
      // A red band pasted across, slanting.
      ctx.save();
      ctx.translate(w / 2, h / 2 + 10);
      ctx.rotate(-0.32);
      ctx.fillStyle = '#c7262c';
      ctx.fillRect(-w * 0.62, -32, w * 1.24, 64);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 48px Helvetica, Arial, sans-serif';
      ctx.fillText('SOLD', 0, 2);
      ctx.restore();
    }
    this.texture.needsUpdate = true;
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered && this.phase === 'forSale');
  }

  label(): string | null {
    switch (this.phase) {
      case 'forSale':
        return `Mrs Roux’s flat, for sale · ${formatCoins(annexPrice())} · buy`;
      case 'moving':
        return 'SOLD: Mrs Roux moves out today';
      case 'works':
      case 'joined':
        return 'SOLD';
      default:
        return null;
    }
  }

  activate(session: SessionActions): void {
    if (this.phase === 'forSale') session.buyUpgrade(this.buy());
    else if (this.phase === 'moving') session.react('Sold, to you. She leaves tonight; the wall comes down tomorrow.');
  }
}

/** The removal men's cartons, stacked along the landing's east wall south of her door on moving day; nothing collides. */
class RemovalBoxes extends Prop {
  readonly contactShadow = false;

  constructor() {
    super();
    this.name = 'RemovalBoxes';
    const boxes: THREE.BufferGeometry[] = [];
    const tapes: THREE.BufferGeometry[] = [];
    // Three stacks: a big carton under a smaller one, the third on its own; each a little askew.
    const cartons: [x: number, z: number, w: number, h: number, d: number, y: number, yaw: number][] = [
      [0, 0, 0.5, 0.4, 0.34, 0, 0.04],
      [0.01, 0.01, 0.4, 0.32, 0.3, 0.401, -0.08],
      [0, -0.52, 0.42, 0.46, 0.32, 0, -0.05],
    ];
    for (const [x, z, w, h, d, y, yaw] of cartons) {
      const box = new THREE.BoxGeometry(d, h, w).rotateY(yaw).translate(x, y + h / 2, z);
      boxes.push(box);
      const tape = new THREE.BoxGeometry(d + 0.002, 0.002, 0.05).rotateY(yaw).translate(x, y + h + 0.001, z);
      tapes.push(tape);
    }
    for (const [geometries, material] of [[boxes, CARDBOARD], [tapes, TAPE]] as const) {
      const mesh = new THREE.Mesh(mergeGeometries(geometries)!, material);
      for (const g of geometries) g.dispose();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
    }
  }
}

/**
 * Mrs Roux's move as our landing shows it: the agency's sign on her door (for sale, then SOLD) and the removal men's
 * boxes on moving day. Zone-local in the stairwell (`STAIRWELL_PLAN`: her door at `ourNeighbourX` on our landing).
 */
export function placeRouxLanding(zone: Zone, { home }: Pick<BuildContext, 'home'>): void {
  const upgrades = home.upgrades;
  if (!upgrades) return;
  const y = landingY(0);
  const sign = new RouxDoorSign(() => ({
    title: 'Mrs Roux’s flat',
    // Less for a close friend of hers (`social/building/roux`).
    price: annexPrice(),
    detail: `${boughtLine({ id: 'annex' })} She moves out today; the wall comes down tomorrow.`,
    // The day first: the purchase tells everyone at once (`upgrades.add`), and the move must read as begun, not done.
    bought: () => {
      markRouxBought();
      upgrades.add('annex');
    },
  }));
  // On her door's leaf (the doors stand 5 mm off the landing's north wall, facing the landing: yaw π).
  zone.place(sign, new THREE.Vector3(STAIRWELL_PLAN.ourNeighbourX, y, STAIRWELL_PLAN.floorLanding.z1 - 0.005 - WALL.sign.lift), Math.PI); // convention-ok: a solid board off the door
  const boxes = zone.place(new RemovalBoxes(), new THREE.Vector3(ROUX_LANDING.boxes.x, y, ROUX_LANDING.boxes.z), 0);
  const show = (phase: RouxPhase): void => {
    sign.show(phase);
    boxes.visible = phase === 'moving';
  };
  show(rouxPhase());
  zone.onUnload(onRouxPhase(show));
}
