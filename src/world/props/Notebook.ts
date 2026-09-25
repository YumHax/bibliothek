import type * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { ModalLike } from '@/game/SessionParts';
import { invisibleHitbox } from '../meshUtils';
import { Prop, part, matte } from './Prop';

export interface NotebookOptions {
  /** The panel it opens, asked at click time (it may be made after the room is built); none: the pages are blank. */
  panel: () => ModalLike | undefined;
  /** Cover colour. Default a worn oxblood. */
  color?: number;
}

const WIDTH = 0.12;
const DEPTH = 0.17;
const THICK = 0.016;

const PAGES = matte(0xf2ecdc, 0.9);
const BAND = matte(0x1c1c20, 0.7);

/**
 * THE JOURNAL's notebook: a hardback lying closed on a surface (the hall console), an elastic band
 * round it and a pencil alongside. Clicking it opens the journal (`JournalPanel`). Lies flat,
 * origin at the centre of its underside. Decoration: it never blocks the player.
 */
export class Notebook extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly cover: THREE.MeshStandardMaterial;

  constructor(private readonly options: NotebookOptions) {
    super();
    this.name = 'Notebook';
    this.cover = matte(options.color ?? 0x6e2a26, 0.75);
    part(this, WIDTH, THICK * 0.18, DEPTH, this.cover, { y: THICK * 0.09 });
    part(this, WIDTH - 0.006, THICK * 0.64, DEPTH - 0.008, PAGES, { x: 0.002, y: THICK / 2 }).castShadow = false;
    part(this, WIDTH, THICK * 0.18, DEPTH, this.cover, { y: THICK * 0.91 });
    // The spine on the left, the elastic band across the right.
    part(this, 0.006, THICK, DEPTH, this.cover, { x: -WIDTH / 2 + 0.003, y: THICK / 2 });
    part(this, 0.006, THICK + 0.002, DEPTH + 0.002, BAND, { x: WIDTH / 2 - 0.018, y: THICK / 2 }).castShadow = false;
    // A pencil beside it.
    const pencil = part(this, 0.007, 0.007, 0.15, matte(0xe0b33a, 0.5), { x: WIDTH / 2 + 0.012, y: 0.0035 });
    pencil.castShadow = false;
    const hitbox = invisibleHitbox(WIDTH + 0.04, 0.06, DEPTH + 0.03, { y: 0.02 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  setHovered(hovered: boolean): void {
    this.cover.emissive.setHex(hovered ? 0x2a1210 : 0x000000);
  }

  label(): string {
    return 'Your journal: click to read your days';
  }

  activate(session: SessionActions): void {
    const panel = this.options.panel();
    if (panel) session.openPanel(panel);
    else session.hint('The pages are still blank.');
  }
}
