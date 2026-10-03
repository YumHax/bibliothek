import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Classifieds } from '@/classifieds/Classifieds';
import { SELLERS_BUILDING, clockOf } from '@/classifieds/ads';
import { createCanvas, toTexture, FONT } from '@/covers/generated/canvasUtils';
import { playIntercomLine } from '@/audio/furnitureSounds';
import { playDoorbell } from '@/audio/doorbell';
import { invisibleHitbox } from '../meshUtils';
import { METAL } from '../materials/palette';
import { snowPaint } from './snowCover';
import { Prop, part } from '../props/Prop';
import { HoverGlint } from '../props/hoverGlint';

/** The plate (m) and its name card's canvas (px); the bells in two columns of `ROWS`. */
const PLATE = { w: 0.2, h: 0.36, d: 0.012 };
const ROWS = 6;
const CARD_PX: [number, number] = [256, 448];
/** Who lives in the block, flat by flat, as the cards say. */
const RESIDENTS = ['HALL', 'WARD', 'NOWAK', 'OKAFOR', 'PATEL', 'BELL', 'LINDQVIST', 'RUSSO', 'KOVAČ', 'MOREAU', 'DUBOIS', 'GREEN'];
/** Seconds between the bell's ring and the door's buzz letting the player in (then the travel's curtain). */
const BUZZ_AFTER = 0.9;

/**
 * The bells at Park Corner Mansions' street door (docs/economy.md "Small ads and the seller's flat"): a brass plate by
 * the painted entrance, two columns of bell pushes with their names. While a visit agreed on the phone is due
 * (`Classifieds.door`), a ring is answered, the door buzzes and the player goes up to the seller's flat (`travel`); too
 * early, a word to come back at the hour; otherwise nobody is expecting them. Wall-hung on the facade: origin at the
 * plate's middle on the wall, +z towards the street. Never collides.
 */
export class MansionBell extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly glint: HoverGlint;
  private readonly card: THREE.MeshStandardMaterial;
  /** Rung and buzzed in: a second click while the door buzzes does nothing. */
  private buzzing = false;

  constructor(private readonly book: Classifieds) {
    super();
    this.name = 'MansionBell';
    const brass = METAL.agedBrass();
    part(this, PLATE.w, PLATE.h, PLATE.d, brass, { z: PLATE.d / 2 });
    // The name card behind its strip of glass, the bell pushes down its edges, the speaker grille under them.
    const [canvas, ctx] = createCanvas(...CARD_PX);
    paintCard(ctx);
    this.card = new THREE.MeshStandardMaterial({ map: toTexture(canvas), roughness: 0.4 });
    const face = new THREE.Mesh(new THREE.PlaneGeometry(PLATE.w * 0.62, PLATE.h * 0.72), this.card);
    face.position.set(0, PLATE.h * 0.06, PLATE.d + 0.0015);
    this.add(face);
    const pushes: THREE.Mesh[] = [];
    for (let i = 0; i < ROWS * 2; i++) {
      const col = i < ROWS ? -1 : 1;
      const row = i % ROWS;
      const y = PLATE.h * 0.06 + (PLATE.h * 0.72) * (0.5 - (row + 0.5) / ROWS);
      pushes.push(part(this, 0.014, 0.014, 0.008, METAL.brass(), { x: col * PLATE.w * 0.4, y, z: PLATE.d + 0.003 }));
    }
    const dark = snowPaint(0x2a2622, 0.7);
    for (let i = 0; i < 4; i++) part(this, PLATE.w * 0.5, 0.004, 0.002, dark, { y: -PLATE.h * 0.4 + i * 0.012, z: PLATE.d + 0.0005 });
    this.glint = HoverGlint.of(...pushes);
    const hitbox = invisibleHitbox(PLATE.w + 0.06, PLATE.h + 0.06, 0.08, { z: 0.04 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string | null {
    const door = this.book.door();
    if (door.kind === 'open') return `${SELLERS_BUILDING} · ring ${door.ad.name} (${door.ad.flat})`;
    return `${SELLERS_BUILDING} · the bells`;
  }

  activate(session: SessionActions): void {
    const door = this.book.door();
    if (door.kind === 'open') {
      if (this.buzzing) return;
      this.buzzing = true;
      playDoorbell(0.12);
      this.book.arrive(door.ad);
      window.setTimeout(() => {
        this.buzzing = false;
        playIntercomLine(0.8, 0.1);
        session.travel('sellerFlat');
      }, BUZZ_AFTER * 1000);
      return;
    }
    if (door.kind === 'early') {
      playDoorbell(0.12);
      session.react(`No answer from ${door.ad.flat}. ${door.ad.name} said from ${clockOf(door.from)}.`);
      return;
    }
    session.react(`${SELLERS_BUILDING}: twelve bells, and nobody expecting you.`);
    session.tip('The Gaming Weekly’s small ads have people round here selling games: read one at the newsstand, then ring them from the phone at home.', { id: 'small-ads' });
  }

  dispose(): void {
    this.card.map?.dispose();
    this.card.dispose();
  }
}

/** The residents' names, two columns of six, in a typed hand on cream card. */
function paintCard(ctx: CanvasRenderingContext2D): void {
  const [w, h] = CARD_PX;
  ctx.fillStyle = '#ece4cf';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#2a2622';
  ctx.textBaseline = 'middle';
  ctx.font = `bold 22px ${FONT}`;
  for (let i = 0; i < ROWS * 2; i++) {
    const left = i < ROWS;
    const row = i % ROWS;
    const y = (row + 0.5) * (h / ROWS);
    ctx.textAlign = left ? 'left' : 'right';
    ctx.fillText(`${i + 1} ${RESIDENTS[i]}`, left ? 12 : w - 12, y);
    ctx.fillStyle = 'rgba(42,38,34,0.25)';
    ctx.fillRect(8, y + h / ROWS / 2 - 1, w - 16, 2);
    ctx.fillStyle = '#2a2622';
  }
}
