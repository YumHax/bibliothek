import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { RECORDS, type Soundtrack } from '@/vinyl/records';
import { invisibleHitbox } from '../meshUtils';
import { Prop, part, matte } from '../props/Prop';
import { wood } from '../materials/finishes';

/** An LP sleeve (m). */
const SLEEVE = 0.315;
const SLEEVE_T = 0.005;
/** The crate, outside (m). */
const CRATE = { w: 0.38, h: 0.26, d: 0.42, wall: 0.014 };

interface RecordCrateOptions {
  /** Hover caption (price, the next record, or why not). */
  label: () => string | null;
  onActivate: (session: SessionActions) => void;
}

/**
 * A wooden crate of soundtrack LPs on the flea market's floor, by the household stall (`record` in
 * `economy/homeGoods`: the turntable's records, `world/vinyl/RecordPlayer`): the sleeves stand in a row, leaning back,
 * the front one the next for sale (`show`), its cover painted. Clicked, it buys that one (`onActivate`). Origin on
 * the floor at the crate's centre, +z to the buyer.
 */
export class RecordCrate extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly front: THREE.MeshStandardMaterial;
  private readonly glowing: THREE.MeshStandardMaterial[] = [];

  constructor(private readonly options: RecordCrateOptions) {
    super();
    this.name = 'RecordCrate';
    buildCrate(this, this.glowing);
    // The sleeves, back to front, leaning back; only the front one shows its cover.
    const count = 9;
    const spine = matte(0x2a2622, 0.8);
    this.front = new THREE.MeshStandardMaterial({ map: paintSleeve(RECORDS[0]!), roughness: 0.75 });
    this.glowing.push(spine, this.front);
    for (let i = 0; i < count; i++) {
      const record = RECORDS[i % RECORDS.length]!;
      const edge = matte(record.sleeve.ground, 0.85);
      this.glowing.push(edge);
      const face = i === count - 1 ? this.front : edge;
      // BoxGeometry material order: +x, -x, +y, -y, +z (the cover, to the buyer), -z.
      const sleeve = new THREE.Mesh(new THREE.BoxGeometry(SLEEVE, SLEEVE, SLEEVE_T), [spine, spine, edge, edge, face, edge]);
      const z = -CRATE.d / 2 + 0.06 + i * 0.033;
      sleeve.position.set((i % 3) * 0.004 - 0.004, CRATE.wall + SLEEVE / 2 - 0.01, z);
      sleeve.rotation.x = -0.22;
      sleeve.castShadow = i === count - 1;
      sleeve.receiveShadow = true;
      this.add(sleeve);
    }
    const hitbox = invisibleHitbox(CRATE.w + 0.04, SLEEVE + 0.02, CRATE.d + 0.04, { y: (SLEEVE + 0.02) / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  /** The record now first in the crate (the next one for sale), or null when the crate has nothing new for the player. */
  show(record: Soundtrack | null): void {
    this.front.map?.dispose();
    this.front.map = paintSleeve(record ?? RECORDS[0]!);
    this.front.needsUpdate = true;
  }

  setHovered(hovered: boolean): void {
    for (const m of this.glowing) m.emissive.setHex(hovered ? 0x1a1612 : 0x000000);
  }

  label(): string | null {
    return this.options.label();
  }

  activate(session: SessionActions): void {
    this.options.onActivate(session);
  }
}

/** The crate on its own, still (the thumbnail studio's model of a soundtrack LP). */
export function recordCrateModel(): THREE.Group {
  const g = new THREE.Group();
  buildCrate(g, []);
  const record = RECORDS[0]!;
  const edge = matte(record.sleeve.ground, 0.85);
  const face = new THREE.MeshStandardMaterial({ map: paintSleeve(record), roughness: 0.75 });
  const sleeve = new THREE.Mesh(new THREE.BoxGeometry(SLEEVE, SLEEVE, SLEEVE_T), [edge, edge, edge, edge, face, edge]);
  sleeve.position.set(0, CRATE.wall + SLEEVE / 2 - 0.01, 0.05);
  sleeve.rotation.x = -0.22;
  g.add(sleeve);
  return g;
}

/** Four slatted sides and a floor, open on top. */
function buildCrate(g: THREE.Group, glowing: THREE.MeshStandardMaterial[]): void {
  const timber = wood(0xa8804f, 0.8);
  glowing.push(timber);
  const { w, h, d, wall } = CRATE;
  part(g, w, wall, d, timber, { y: wall / 2 });
  for (const sx of [-1, 1]) part(g, wall, h, d, timber, { x: (sx * (w - wall)) / 2, y: h / 2 });
  for (const sz of [-1, 1]) {
    // Front and back: two slats with a gap, between the sides.
    for (const y of [h * 0.25, h * 0.75]) part(g, w - 2 * wall, h * 0.42, wall, timber, { y, z: (sz * (d - wall)) / 2 });
  }
}

/** A sleeve's cover: its ground, a band of console-era pixels, the title and the composer. */
function paintSleeve(record: Soundtrack): THREE.Texture {
  const S = 256;
  const [canvas, ctx] = createCanvas(S, S);
  const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;
  ctx.fillStyle = hex(record.sleeve.ground);
  ctx.fillRect(0, 0, S, S);
  // A band of big pixels across the middle, in the sleeve's ink and label colours.
  let seed = [...record.id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const px = 16;
  for (let y = 96; y < 176; y += px) for (let x = 0; x < S; x += px) {
    const r = rand();
    if (r < 0.35) continue;
    ctx.fillStyle = r < 0.7 ? hex(record.sleeve.ink) : hex(record.sleeve.label);
    ctx.fillRect(x, y, px - 1, px - 1);
  }
  ctx.fillStyle = hex(record.sleeve.ink);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 26px "Arial Narrow", sans-serif';
  ctx.fillText(record.title.toUpperCase(), S / 2, 48, S - 24);
  ctx.font = '15px sans-serif';
  ctx.fillText(`Original soundtrack · ${record.artist}`, S / 2, 210, S - 24);
  ctx.font = '11px sans-serif';
  ctx.fillText(`${record.label} · ${record.year}`, S / 2, 234, S - 24);
  return toTexture(canvas, 'facing');
}
