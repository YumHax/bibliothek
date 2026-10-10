import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { dampFactor } from '@/math/damp';
import { paint } from '../materials/palette';
import { part } from '../props/Prop';
import { UsableProp, type UseOptions } from '../props/UsableProp';
import { WALL, decal } from '../surface/layers';

/** The album's size (m): a padded cover, a block of thick pages. */
const ALBUM = { w: 0.32, d: 0.25, cover: 0.012, pages: 0.035 };
/** How far the cover swings open (radians about the spine: up and over, resting tilted back) and how fast it gets there. */
const OPEN = { angle: Math.PI * 0.78, rate: 4 } as const;
/** The print on the first page when it is open: a cream border round a brown snapshot (m). */
const PRINT = { w: 0.12, d: 0.09, border: 0.008, at: [0.05, -0.02] as const };

/**
 * Mémé's photo album on the dining table (`albumWiring`): a padded cloth cover over a block of thick pages. A click
 * opens her album (or plays the memory she has ready); the cover swings open on its spine while it is looked at
 * (`setOpen`) and shuts after, a snapshot showing on the first page. Origin on the surface under its middle. Never
 * collides.
 */
export class PhotoAlbum extends UsableProp implements Updatable {
  /** The cover, hinged on the spine: turned about z to open. */
  private readonly hinge = new THREE.Group();
  private readonly print = new THREE.Group();
  private open = 0;
  private goal = 0;

  constructor(use: UseOptions) {
    super(use);
    this.name = 'PhotoAlbum';
    const cloth = paint(0x5a2a2a, 0.9);
    part(this, ALBUM.w, ALBUM.cover, ALBUM.d, cloth, { y: ALBUM.cover / 2 });
    part(this, ALBUM.w - 0.012, ALBUM.pages, ALBUM.d - 0.01, paint(0xefe6d2, 0.95), { y: ALBUM.cover + ALBUM.pages / 2, x: 0.004 }); // convention-ok: the pages set back from the spine, a real step
    // The top cover hangs off the spine's edge, at the pages' top: closed it lies over them, open it stands back.
    const top = ALBUM.cover + ALBUM.pages;
    this.hinge.position.set(-ALBUM.w / 2, top, 0);
    part(this.hinge, ALBUM.w, ALBUM.cover, ALBUM.d, cloth, { x: ALBUM.w / 2, y: ALBUM.cover / 2 });
    this.add(this.hinge);
    // The spine over the pages' edge, proud of the covers on every side (no face shares their planes).
    const thick = ALBUM.pages + ALBUM.cover * 2;
    part(this, 0.02, thick + 0.002, ALBUM.d + 0.004, paint(0x4a2222, 0.85), { x: -ALBUM.w / 2 + 0.008, y: thick / 2 }); // convention-ok: the spine proud of the covers, a real step
    // The first page's snapshot, pasted on the pages' top (hidden under the cover while it is shut).
    const border = decal(PRINT.w + PRINT.border * 2, PRINT.d + PRINT.border * 2, paint(0xf4eee0, 0.9), WALL.paper, 'up');
    const photo = decal(PRINT.w, PRINT.d, paint(0x7a5a3e, 0.7), WALL.print, 'up');
    this.print.add(border, photo);
    this.print.position.set(PRINT.at[0], top, PRINT.at[1]);
    this.print.rotation.y = -0.06;
    this.print.visible = false;
    this.add(this.print);
    this.target(ALBUM.w + 0.06, 0.1, ALBUM.d + 0.06, { y: 0.04 });
  }

  /** Opens the cover (the album looked at, a memory playing) or shuts it. */
  setOpen(open: boolean): void {
    this.goal = open ? 1 : 0;
  }

  update(dt: number): void {
    if (this.open === this.goal) return;
    this.open += (this.goal - this.open) * dampFactor(OPEN.rate, dt);
    if (Math.abs(this.goal - this.open) < 0.002) this.open = this.goal;
    this.hinge.rotation.z = this.open * OPEN.angle;
    this.print.visible = this.open > 0.05;
  }
}
