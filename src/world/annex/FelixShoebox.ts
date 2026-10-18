import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { playPaperRustle } from '@/audio/householdSounds';
import { KEYS, PersistedStore } from '@/persistence';
import { boxMesh, invisibleHitbox } from '../meshUtils';
import { paint } from '../materials/palette';
import { Prop } from '../props/Prop';

/** A shoebox: its size (m). */
const BOX = { width: 0.33, height: 0.12, depth: 0.2, lid: 0.018 };
const CARD = paint(0xb48a5a, 0.9);

/** What a click on it does: her note read, the game set out beside it (`open` returns false when there is none to set out). */
interface ShoeboxNote {
  title: string;
  text: string;
  from: string;
}

const store = new PersistedStore<{ opened: boolean; taken: boolean }>({
  key: KEYS.felixShoebox,
  version: 1,
  defaults: () => ({ opened: false, taken: false }),
  read: (d) => (typeof d === 'object' && d !== null ? { opened: (d as { opened?: unknown }).opened === true, taken: (d as { taken?: unknown }).taken === true } : null),
});

/** Whether the shoebox's game was taken (it is not set out again). */
function shoeboxTaken(): boolean {
  return store.load().taken;
}

/** The shoebox's game was taken. */
export function markShoeboxTaken(): void {
  store.save({ ...store.load(), taken: true });
}

/**
 * Félix's shoebox, left on Mrs Roux's hearth for the player when she moved (docs/story.md, Act 3 "The building"): he
 * gave it her to keep the winter before he went into hospital. A cardboard box with FÉLIX on its lid in her hand; a
 * click reads her note (every time) and, the first time, sets out what was in it (`onOpen`, the builder's: one of his
 * own copies). Origin on its bottom's middle, +z its front.
 */
export class FelixShoebox extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  /** Called the first click of each visit while its game is still in it: sets the game out beside it. */
  onOpen: ((session: SessionActions) => void) | null = null;
  private setOut = false;

  constructor(private readonly note: ShoeboxNote) {
    super();
    this.name = 'FelixShoebox';
    this.add(boxMesh(BOX.width, BOX.height, BOX.depth, CARD, { y: BOX.height / 2 }));
    const lid = new THREE.MeshStandardMaterial({ map: lidTexture(), roughness: 0.85 });
    // BoxGeometry's [+x, -x, +y (the lid's top, written on), -y, +z, -z].
    const top = new THREE.Mesh(new THREE.BoxGeometry(BOX.width + 0.008, BOX.lid, BOX.depth + 0.008), [CARD, CARD, lid, CARD, CARD, CARD]); // convention-ok: a lid is wider than its box
    top.position.y = BOX.height + BOX.lid / 2 - 0.006; // convention-ok: the lid sits down over the box's rim, no face shared
    top.rotation.y = 0.04;
    top.castShadow = true;
    this.add(top);
    const hit = invisibleHitbox(BOX.width + 0.06, BOX.height + 0.08, BOX.depth + 0.06, { y: (BOX.height + 0.08) / 2 });
    this.add(hit);
    this.hitboxes = [hit];
  }

  setHovered(): void {}

  label(): string {
    return store.load().opened ? 'Félix’s shoebox · read her note again' : 'A shoebox marked FÉLIX · open';
  }

  activate(session: SessionActions): void {
    playPaperRustle(0.12);
    const first = !store.load().opened;
    if (first) store.save({ ...store.load(), opened: true });
    session.read({ title: this.note.title, text: this.note.text, from: this.note.from, look: 'letter' });
    if (!shoeboxTaken() && !this.setOut) {
      this.setOut = true;
      this.onOpen?.(session);
    }
  }
}

/** The lid: FÉLIX in her round hand, underlined. */
function lidTexture(): THREE.Texture {
  const [canvas, ctx] = createCanvas(256, 160);
  ctx.fillStyle = '#c29a68';
  ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = '#2a2a4a';
  ctx.font = 'italic 52px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Félix', 128, 76);
  ctx.fillRect(70, 108, 116, 3);
  return toTexture(canvas, 'facing');
}
