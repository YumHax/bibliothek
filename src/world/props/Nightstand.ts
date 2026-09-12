import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { part, matte } from './Prop';

export interface NightstandOptions {
  /** Cover colours of the books stacked on the open shelf, bottom first. */
  books?: number[];
  /** A pair of reading glasses folded on the top. Default true. */
  glasses?: boolean;
}

const WIDTH = 0.45;
const DEPTH = 0.4;
const HEIGHT = 0.55;
const PANEL = 0.018;
const LEG = 0.12;
const DRAWER_H = 0.14;
/** How far the stand stays off the wall (the skirting board is behind it). */
const OFF_WALL = 0.02;

const OAK = matte(0x9c7a52, 0.55);
const DARK_OAK = matte(0x7d6141, 0.65);
const BRASS = new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 0.85, roughness: 0.3 });
const PAGES = matte(0xf0e9d8, 0.9);

/**
 * A bedside table: an oak box on four legs with one drawer up top (a brass knob) and an open
 * shelf below with a few books lying in it; a folded pair of glasses on the top. Wall-hung with
 * `y: 0`: origin on the floor at the wall, +z into the room. Collides as its box; the lamp that
 * stands on it is placed separately at `lampAnchor`.
 */
export class Nightstand extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;
  /** Height of the top surface: where things stand. */
  readonly topHeight = HEIGHT;
  /** Local point on the top, towards the wall, where a bedside lamp goes. */
  readonly lampAnchor = new THREE.Vector3(0, HEIGHT, OFF_WALL + DEPTH * 0.4);

  constructor(options: NightstandOptions = {}) {
    super();
    this.name = 'Nightstand';
    const z = OFF_WALL + DEPTH / 2;
    const books = options.books ?? [0x4a5a6e, 0xa8563f, 0xd9c8a0];

    // Carcass: top, two sides, a back and a shelf, all standing on the legs.
    part(this, WIDTH, PANEL, DEPTH, OAK, { y: HEIGHT - PANEL / 2, z });
    for (const dx of [-WIDTH / 2 + PANEL / 2, WIDTH / 2 - PANEL / 2]) part(this, PANEL, HEIGHT - LEG - PANEL, DEPTH, OAK, { x: dx, y: LEG + (HEIGHT - LEG - PANEL) / 2, z });
    part(this, WIDTH - 2 * PANEL, HEIGHT - LEG - PANEL, PANEL, DARK_OAK, { y: LEG + (HEIGHT - LEG - PANEL) / 2, z: OFF_WALL + PANEL / 2 });
    const shelfY = LEG + PANEL / 2;
    part(this, WIDTH - 2 * PANEL, PANEL, DEPTH - PANEL, OAK, { y: shelfY, z: z + PANEL / 2 });
    for (const dx of [-WIDTH / 2 + 0.03, WIDTH / 2 - 0.03]) for (const dz of [OFF_WALL + 0.03, OFF_WALL + DEPTH - 0.03]) part(this, 0.03, LEG, 0.03, DARK_OAK, { x: dx, y: LEG / 2, z: dz });

    // The drawer front just under the top, its knob in the middle.
    const drawerY = HEIGHT - PANEL - DRAWER_H / 2 - 0.01;
    part(this, WIDTH - 2 * PANEL - 0.006, DRAWER_H, PANEL, OAK, { y: drawerY, z: OFF_WALL + DEPTH - PANEL / 2 });
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), BRASS);
    knob.position.set(0, drawerY, OFF_WALL + DEPTH + 0.01);
    knob.castShadow = false;
    this.add(knob);
    // The rail the drawer front closes against, so the open shelf reads as a separate bay.
    part(this, WIDTH - 2 * PANEL, 0.02, PANEL, OAK, { y: drawerY - DRAWER_H / 2 - 0.012, z: OFF_WALL + DEPTH - PANEL / 2 });

    // Books lying flat in the open shelf, spines out, each a little askew.
    let y = LEG + PANEL;
    books.slice(0, 3).forEach((colour, i) => {
      const cover = matte(colour, 0.75);
      const h = 0.028 - i * 0.004;
      const w = 0.2 - i * 0.015;
      const d = 0.15 - i * 0.008;
      // BoxGeometry material order: +x, -x, +y, -y, +z (spine, facing the room), -z.
      const book = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [PAGES, PAGES, cover, cover, cover, PAGES]);
      book.position.set(-0.02 + i * 0.015, y + h / 2, z + 0.02);
      book.rotation.y = (i % 2 ? -1 : 1) * 0.08 * (i + 1);
      book.castShadow = true;
      book.receiveShadow = true;
      this.add(book);
      y += h;
    });

    if (options.glasses ?? true) this.buildGlasses(0.1, OFF_WALL + DEPTH - 0.11);

    this.footprint = new THREE.Box3(new THREE.Vector3(-WIDTH / 2, 0, 0), new THREE.Vector3(WIDTH / 2, HEIGHT, OFF_WALL + DEPTH));
  }

  /** Reading glasses folded on the top at (x, z): two rims lying flat and the arms folded across them. */
  private buildGlasses(x: number, z: number): void {
    const frame = new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.35, metalness: 0.3 });
    const glasses = new THREE.Group();
    glasses.position.set(x, HEIGHT, z);
    glasses.rotation.y = 0.5;
    for (const dx of [-0.026, 0.026]) {
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0018, 6, 20), frame);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(dx, 0.004, 0);
      rim.castShadow = false;
      glasses.add(rim);
    }
    const bridge = part(glasses, 0.012, 0.003, 0.003, frame, { y: 0.004 });
    const arms = part(glasses, 0.09, 0.003, 0.003, frame, { y: 0.008, z: 0.018 });
    bridge.castShadow = false;
    arms.castShadow = false;
    this.add(glasses);
  }
}
