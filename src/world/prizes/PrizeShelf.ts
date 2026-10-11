import * as THREE from 'three';
import { getPrize, onTrophyRow, type OwnedPrize, type Prize } from '@/economy/Prizes';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { boxMesh } from '../meshUtils';
import { Prop } from '../props/Prop';
import { paint, standard, timber } from '../materials/palette';
import { isShared } from '../materials/sharedResources';
import { WALL, decal } from '../surface/layers';
import { PROUD } from '../props/joinery';
import { prizeModel } from './prizeModel';

interface PrizeShelfOptions {
  /** The prizes taken home, and a way to hear about new ones. */
  prizes: { readonly owned: readonly OwnedPrize[]; subscribe(cb: () => void): () => void };
  /** Shelf length, metres. Default 0.8. */
  width?: number;
  /** Boards, bottom first; each is `gap` above the last. Default 2. */
  tiers?: number;
  gap?: number;
}

const DEPTH = 0.16;
const BOARD = 0.022;
/** Room each prize takes along a board. */
const SLOT = 0.1;
const WOOD = timber(0x6a4a30, 0.55);
const BRACKET = paint(0x2a2a30, 0.5);
const GOLD = standard({ color: 0xd4a52a, metalness: 1, roughness: 0.3 });
/** The lava lamp's own slot, at the bottom board's right end (`LavaLampPrize`, placed with the shelf by the bedroom). */
const LAVA_SLOT = { slots: 1 } as const;
/** The pennants on the wall over the top board: their size, the gap above the board, how many a row. */
const PENNANT = { width: 0.2, height: 0.12, above: 0.2, perRow: 4 };
/** One brass stud under a prize per time it was won past the first, up to this many. */
const MAX_STUDS = 6;

/**
 * The prize shelf at home, the trophy row: two wall-hung boards where what the player won at the arcade stands, one of
 * each (a cup won five times stands once, five brass studs under it): the counter's trophy, the Saturday cups, the mini
 * cabinet, the back room's limited editions, with the lava lamp lighting them from the bottom board's right end
 * (`LavaLampPrize`); the league's pennants pinned flat on the wall above, one per kind. The rest of the prizes live
 * where they are used (the bed, the bath, the floor, under the shelf). Follows the prize store live. Wall-hung: origin
 * at the wall, at the bottom board's top, +z into the room. Decoration: never collides.
 */
export class PrizeShelf extends Prop {
  private readonly options: Required<PrizeShelfOptions>;
  private readonly shown = new THREE.Group();
  private readonly unsubscribe: () => void;

  constructor(options: PrizeShelfOptions) {
    super();
    this.name = 'PrizeShelf';
    this.options = { width: 0.8, tiers: 2, gap: 0.32, ...options };
    const { width, tiers, gap } = this.options;
    for (let t = 0; t < tiers; t++) {
      const y = t * gap;
      this.add(boxMesh(width, BOARD, DEPTH, WOOD, { y: y - BOARD / 2, z: DEPTH / 2 }));
      for (const sx of [-1, 1]) this.add(boxMesh(0.015, 0.08, DEPTH * 0.8, BRACKET, { x: sx * (width / 2 - 0.08), y: y - BOARD - 0.04, z: DEPTH * 0.4 }));
    }
    this.add(this.shown);
    this.rebuild();
    this.unsubscribe = options.prizes.subscribe(() => this.rebuild());
  }

  /** Shelf-local spot of the lava lamp: on the bottom board, at its right end. */
  get lavaSpot(): THREE.Vector3 {
    return new THREE.Vector3(this.options.width / 2 - 0.02 - SLOT / 2, 0, DEPTH * 0.5);
  }

  /** Shelf-local points under the bottom board where the yo-yo (left) and the keyring (right) hang. */
  get hangingSpots(): { yoyo: THREE.Vector3; keyring: THREE.Vector3 } {
    const { width } = this.options;
    return { yoyo: new THREE.Vector3(-width / 2 + 0.16, -BOARD, DEPTH * 0.7), keyring: new THREE.Vector3(width / 2 - 0.16, -BOARD, DEPTH * 0.7) };
  }

  dispose(): void {
    this.unsubscribe();
  }

  private rebuild(): void {
    for (const child of [...this.shown.children]) {
      this.shown.remove(child);
      child.traverse((obj) => {
        const geometry = (obj as THREE.Mesh).geometry;
        if (geometry && !isShared(geometry)) geometry.dispose(); // the models' boxes and cylinders are shared (`boxMesh`)
        // A card's or a pennant's material and its painted texture are its own (the models' are the palette's, shared).
        if (obj.userData.ownMaterial) {
          const material = (obj as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material;
          material.map?.dispose();
          material.dispose();
        }
      });
    }
    const counts = new Map<string, number>();
    for (const { id } of this.options.prizes.owned) counts.set(id, (counts.get(id) ?? 0) + 1);
    const won = [...counts.keys()].map((id) => getPrize(id)).filter((p): p is Prize => !!p && onTrophyRow(p));
    // Cups first, then the rest in the order they came; the lava lamp has its own slot, the pennants the wall.
    const row = won.filter((p) => p.kind !== 'pennant' && p.kind !== 'lavaLamp').sort((a, b) => Number(b.kind === 'trophy') - Number(a.kind === 'trophy'));
    const pennants = won.filter((p) => p.kind === 'pennant');
    const { width, tiers, gap } = this.options;
    const perTier = Math.floor((width - 0.04) / SLOT);
    // Top board first (the cups at eye height), then the bottom one short of the lamp's slot.
    const slots: { tier: number; slot: number }[] = [];
    for (let t = tiers - 1; t >= 0; t--) for (let i = 0; i < perTier - (t === 0 ? LAVA_SLOT.slots : 0); i++) slots.push({ tier: t, slot: i });
    row.slice(0, slots.length).forEach((prize, i) => {
      const { tier, slot } = slots[i]!;
      const model = prizeModel(prize.kind, prize.color);
      // Turned a little each, the way things end up on a shelf.
      model.rotation.y = ((i * 37) % 7 - 3) * 0.06;
      const x = -width / 2 + 0.02 + SLOT * (slot + 0.5);
      model.position.set(x, tier * gap + PROUD, DEPTH * 0.45);
      this.shown.add(model);
      this.studs(x, tier * gap, (counts.get(prize.id) ?? 1) - 1);
    });
    pennants.forEach((prize, i) => this.shown.add(this.pennant(prize, i, (counts.get(prize.id) ?? 1) - 1)));
    if (!row.length && !pennants.length && !counts.has('lavaLamp')) this.shown.add(this.emptyCard());
  }

  /** `n` brass studs along the board's front edge under a prize: the times it was won again. */
  private studs(x: number, y: number, n: number): void {
    const shown = Math.min(MAX_STUDS, n);
    for (let i = 0; i < shown; i++) {
      const stud = boxMesh(0.006, 0.006, 0.002, GOLD, { x: x + (i - (shown - 1) / 2) * 0.011, y: y - BOARD / 2, z: DEPTH + PROUD }); // proud of the board's edge
      this.shown.add(stud);
    }
  }

  /** A felt pennant pinned flat on the wall above the top board, its colour and its word; studs under it for the times won again. */
  private pennant(prize: Prize, i: number, again: number): THREE.Object3D {
    const { width, tiers, gap } = this.options;
    const col = i % PENNANT.perRow;
    const row = Math.floor(i / PENNANT.perRow);
    const span = width / PENNANT.perRow;
    const [canvas, ctx] = createCanvas(200, 120);
    ctx.fillStyle = `#${prize.color.toString(16).padStart(6, '0')}`;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(200, 60);
    ctx.lineTo(0, 120);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 14, 120);
    ctx.font = 'bold 22px sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(prize.name.split(' ')[0]!.toUpperCase(), 22, 60);
    for (let s = 0; s < Math.min(MAX_STUDS, again); s++) ctx.fillRect(24 + s * 14, 84, 8, 8);
    const material = new THREE.MeshStandardMaterial({ map: toTexture(canvas, 'facing'), transparent: true, alphaTest: 0.5, roughness: 0.95 });
    const felt = decal(PENNANT.width, PENNANT.height, material, WALL.framed);
    felt.position.x = -width / 2 + span * (col + 0.5);
    felt.position.y = (tiers - 1) * gap + PENNANT.above + PENNANT.height / 2 + row * (PENNANT.height + 0.04);
    felt.rotation.z = ((i * 13) % 5 - 2) * 0.03;
    felt.userData.ownMaterial = true;
    return felt;
  }

  /** On an empty shelf: what it is for. */
  private emptyCard(): THREE.Mesh {
    const [canvas, ctx] = createCanvas(160, 90);
    ctx.fillStyle = '#f4eedc';
    ctx.fillRect(0, 0, 160, 90);
    ctx.fillStyle = '#3a2a1a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('Trophies', 80, 34);
    ctx.font = '16px sans-serif';
    ctx.fillText('win some!', 80, 62);
    const texture = toTexture(canvas, 'facing');
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.056), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8 }));
    const { width, tiers, gap } = this.options;
    card.position.set(width / 2 - 0.08, (tiers - 1) * gap + 0.03, DEPTH * 0.6);
    card.rotation.x = -0.25;
    card.userData.ownMaterial = true;
    return card;
  }
}
