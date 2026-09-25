import * as THREE from 'three';
import type { Furniture } from '../Furniture';
import { cylinderMesh } from '../meshUtils';
import { part, matte } from './Prop';
import { SlideDrawer } from './SlideDrawer';
import { wood as woodMaterial } from '@/world/materials/finishes';

export interface NightstandOptions {
  /** Cover colours of the books stacked on the open shelf, bottom first. */
  books?: number[];
  /** A pair of reading glasses folded on the top. Default true. */
  glasses?: boolean;
  /** What lies in the drawer, in its spots left to right. Default a paperback and a pair of glasses. */
  drawer?: NightstandItem[];
}

/** Things a bedside drawer holds. */
export type NightstandItem = 'handheld' | 'book' | 'glasses';

const WIDTH = 0.45;
const DEPTH = 0.4;
const HEIGHT = 0.55;
const PANEL = 0.018;
const LEG = 0.12;
const DRAWER_H = 0.14;
/** How far the drawer pulls out: most of its box, not quite off its runners. */
const DRAWER_TRAVEL = 0.24;
/** Where the drawer's things lie, drawer-local [x, z, yaw] (z runs back from the front). */
const DRAWER_SPOTS: [number, number, number][] = [
  [-0.1, -0.12, 0.15],
  [0.08, -0.2, -0.12],
  [0.08, -0.05, 0.45],
];
/** How far the stand stays off the wall (the skirting board is behind it). */
const OFF_WALL = 0.02;

const OAK = woodMaterial(0x9c7a52, 0.55);
const DARK_OAK = woodMaterial(0x7d6141, 0.65);
const BRASS = new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 0.85, roughness: 0.3 });
const PAGES = matte(0xf0e9d8, 0.9);
const GLASSES_FRAME = new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 0.35, metalness: 0.3 });
const PAPERBACK = matte(0x2f5d6e, 0.8);
const HANDHELD_SHELL = matte(0xc4c2bc, 0.5);
const HANDHELD_BEZEL = matte(0x55565e, 0.4);
const HANDHELD_SCREEN = new THREE.MeshStandardMaterial({ color: 0x8b9a5b, roughness: 0.25 });
const HANDHELD_KEYS = matte(0x222226, 0.5);
const HANDHELD_BUTTONS = matte(0x8c2a52, 0.4);

/**
 * A bedside table: an oak box on four legs with one drawer up top (a brass knob) and an open
 * shelf below with a few books lying in it; a folded pair of glasses on the top. The drawer slides
 * out on a click onto what is kept in it (`drawers`, placed by the builder with `placeWith`).
 * Wall-hung with `y: 0`: origin on the floor at the wall, +z into the room. Collides as its box;
 * the lamp that stands on it is placed separately at `lampAnchor`.
 */
export class Nightstand extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;
  /** Height of the top surface: where things stand. */
  readonly topHeight = HEIGHT;
  /** Local point on the top, towards the wall, where a bedside lamp goes. */
  readonly lampAnchor = new THREE.Vector3(0, HEIGHT, OFF_WALL + DEPTH * 0.4);
  /** The drawer, posed in the stand's space; the builder places it (`placeWith`). */
  readonly drawers: SlideDrawer[];

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

    // The drawer just under the top, its knob in the middle: it slides out on a click (placed by the builder).
    const drawerY = HEIGHT - PANEL - DRAWER_H / 2 - 0.01;
    const drawer = new SlideDrawer({ width: WIDTH - 2 * PANEL - 0.006, height: DRAWER_H, travel: DRAWER_TRAVEL });
    drawer.position.set(0, drawerY - DRAWER_H / 2, OFF_WALL + DEPTH - PANEL);
    this.buildDrawer(drawer, options.drawer ?? ['book', 'glasses']);
    this.drawers = [drawer];
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

    if (options.glasses ?? true) {
      const glasses = foldedGlasses();
      glasses.position.set(0.1, HEIGHT, OFF_WALL + DEPTH - 0.11);
      glasses.rotation.y = 0.5;
      this.add(glasses);
    }

    this.footprint = new THREE.Box3(new THREE.Vector3(-WIDTH / 2, 0, 0), new THREE.Vector3(WIDTH / 2, HEIGHT, OFF_WALL + DEPTH));
  }

  /**
   * The drawer's front and knob, and behind it an open box (drawn only while it is out) with a few
   * things lying on its bottom, each in its own spot: a handheld console, a paperback, glasses.
   */
  private buildDrawer(drawer: SlideDrawer, contents: readonly NightstandItem[]): void {
    const w = WIDTH - 2 * PANEL - 0.006;
    part(drawer.front, w, DRAWER_H, PANEL, OAK, { y: DRAWER_H / 2, z: PANEL / 2 });
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), BRASS);
    knob.position.set(0, DRAWER_H / 2, PANEL + 0.01);
    knob.castShadow = false;
    drawer.front.add(knob);

    // The box: a bottom, two sides and a back, a little narrower and lower than the front. The
    // bottom stops a hair inside the sides so its end grain does not fight their outer faces.
    const { inside } = drawer;
    const boxW = w - 0.02;
    const boxD = DEPTH - PANEL - 0.04;
    const sideH = DRAWER_H - 0.04;
    part(inside, boxW - 0.004, 0.008, boxD, DARK_OAK, { y: 0.016, z: -boxD / 2 });
    for (const dx of [-boxW / 2 + 0.005, boxW / 2 - 0.005]) part(inside, 0.01, sideH, boxD, OAK, { x: dx, y: 0.012 + sideH / 2, z: -boxD / 2 });
    part(inside, boxW, sideH, 0.01, OAK, { y: 0.012 + sideH / 2, z: -boxD + 0.005 });
    const floor = 0.02;

    contents.slice(0, DRAWER_SPOTS.length).forEach((item, i) => {
      const [x, z, yaw] = DRAWER_SPOTS[i]!;
      const thing = item === 'handheld' ? handheld() : item === 'book' ? paperback() : foldedGlasses();
      thing.position.set(x, floor, z);
      thing.rotation.y = yaw;
      inside.add(thing);
    });
    inside.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) obj.castShadow = false;
    });
  }
}

/** Reading glasses folded, lying flat (origin under them): two rims and the arms folded across them. */
function foldedGlasses(): THREE.Group {
  const glasses = new THREE.Group();
  for (const dx of [-0.026, 0.026]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.0018, 6, 20), GLASSES_FRAME);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(dx, 0.004, 0);
    rim.castShadow = false;
    glasses.add(rim);
  }
  const bridge = part(glasses, 0.012, 0.003, 0.003, GLASSES_FRAME, { y: 0.004 });
  const arms = part(glasses, 0.09, 0.003, 0.003, GLASSES_FRAME, { y: 0.008, z: 0.018 });
  bridge.castShadow = false;
  arms.castShadow = false;
  return glasses;
}

/** A pocket handheld lying face up, its top towards -z: a grey shell, the green screen in its bezel, a D-pad and two buttons. */
function handheld(): THREE.Group {
  const g = new THREE.Group();
  part(g, 0.09, 0.02, 0.148, HANDHELD_SHELL, { y: 0.01 });
  part(g, 0.07, 0.002, 0.06, HANDHELD_BEZEL, { y: 0.021, z: -0.035 });
  part(g, 0.046, 0.002, 0.042, HANDHELD_SCREEN, { y: 0.0225, z: -0.035 });
  part(g, 0.026, 0.004, 0.008, HANDHELD_KEYS, { x: -0.022, y: 0.022, z: 0.03 });
  part(g, 0.008, 0.004, 0.026, HANDHELD_KEYS, { x: -0.022, y: 0.022, z: 0.03 });
  for (const [dx, dz] of [
    [0.02, 0.034],
    [0.033, 0.024],
  ] as const) g.add(cylinderMesh(0.0055, 0.004, HANDHELD_BUTTONS, { x: dx, y: 0.022, z: dz }, { segments: 12 }));
  return g;
}

/** A dog-eared paperback lying flat: pages all round, a cover on top and the spine on its -x side. */
function paperback(): THREE.Group {
  const g = new THREE.Group();
  // BoxGeometry material order: +x, -x (spine), +y (front cover), -y, +z, -z.
  const book = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.02, 0.175), [PAGES, PAPERBACK, PAPERBACK, PAPERBACK, PAGES, PAGES]);
  book.position.y = 0.01;
  g.add(book);
  return g;
}
