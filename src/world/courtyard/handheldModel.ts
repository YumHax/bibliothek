import * as THREE from 'three';
import type { HandheldKind } from '@/building/kids/kidsPlan';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { paint } from '../materials/palette';
import { cylinderMesh } from '../meshUtils';
import { markShared, part } from '../props/Prop';
import { WALL, decal } from '../surface/layers';

/*
 * The kids' handhelds (`YardKids`): a grey pocket one, a purple see-through one with a colour screen, a black Sega one
 * held sideways. Each is a body with its screen set in it (`WALL.framed`), a D-pad and two buttons, at its middle, its
 * screen facing +z and its top up. The screens show a little game going (`HandheldScreens`, one canvas per kind,
 * drawn a few times a second while someone is near), glowing a little (no light).
 */

/** How each kind is built: its size (m), its plastic, the screen's bezel and glass, and where the screen sits. */
const KINDS: Record<HandheldKind, { width: number; height: number; depth: number; shell: number; bezel: number; screen: [number, number]; screenY: number; landscape: boolean }> = {
  pocket: { width: 0.09, height: 0.148, depth: 0.032, shell: 0xc9c6bd, bezel: 0x4a4a58, screen: [0.047, 0.043], screenY: 0.032, landscape: false },
  colour: { width: 0.078, height: 0.133, depth: 0.027, shell: 0x6a4a9a, bezel: 0x1e1e24, screen: [0.044, 0.04], screenY: 0.03, landscape: false },
  sega: { width: 0.21, height: 0.113, depth: 0.038, shell: 0x26262a, bezel: 0x101012, screen: [0.075, 0.066], screenY: 0, landscape: true },
};

/** How far the bezel and the keys stand out of the face (m): real relief, half sunk in the shell. */
const RAISED = 1e-3;
/** The keys' depth: half in the shell, half proud. */
const KEY_DEPTH = 2 * RAISED + 2e-3;

/** A handheld built for a kid: the object, where its two grips are (its own frame) and its screen's middle. */
export interface HandheldModel {
  object: THREE.Group;
  grips: readonly [THREE.Vector3, THREE.Vector3];
  screen: THREE.Vector3;
  /** Frees what is its own (the glass's quad; the rest is the palette's and the cache's). */
  dispose(): void;
}

/** Builds a `kind` of handheld showing `screen` (the kind's canvas, from `HandheldScreens`). */
export function handheldModel(kind: HandheldKind, screen: THREE.Material): HandheldModel {
  const k = KINDS[kind];
  const g = new THREE.Group();
  g.name = `Handheld:${kind}`;
  const shell = paint(k.shell, kind === 'colour' ? 0.35 : 0.5);
  part(g, k.width, k.height, k.depth, shell);
  const front = k.depth / 2;
  // The bezel round the glass, then the glass itself set in it.
  const [sw, sh] = k.screen;
  part(g, sw + 0.014, sh + 0.012, RAISED * 2, paint(k.bezel, 0.4), { y: k.screenY, z: front });
  const glass = decal(sw, sh, screen, WALL.framed);
  glass.position.set(0, k.screenY, front + RAISED + WALL.framed.lift);
  glass.receiveShadow = false;
  g.add(glass);
  // The D-pad and the two buttons, below the screen (beside it on the Sega).
  const dark = paint(0x1c1c20, 0.5);
  const pad = k.landscape ? { x: -k.width * 0.36, y: 0 } : { x: -k.width * 0.25, y: -k.height * 0.2 };
  const buttons = k.landscape ? { x: k.width * 0.34, y: 0 } : { x: k.width * 0.22, y: -k.height * 0.17 };
  const arm = Math.min(k.width, 0.1) * 0.08;
  part(g, 3 * arm, arm, KEY_DEPTH, dark, { x: pad.x, y: pad.y, z: front + RAISED });
  part(g, arm, 3 * arm, KEY_DEPTH, dark, { x: pad.x, y: pad.y, z: front + RAISED });
  const red = paint(kind === 'pocket' ? 0x8a1f4a : 0x2a2a30, 0.4);
  // A and B, on a slant: A up and right.
  for (const side of [1, -1]) {
    const button = cylinderMesh(arm * 0.7, KEY_DEPTH, red, { x: buttons.x + side * arm * 1.25, y: buttons.y + side * arm * 0.7, z: front + RAISED }, { segments: 10 });
    button.rotation.x = Math.PI / 2;
    g.add(button);
  }
  // Where the hands hold it: the sides of a sideways one, the lower corners (round the back) of an upright one.
  const grip = k.landscape ? new THREE.Vector3(k.width * 0.42, 0, 0) : new THREE.Vector3(k.width * 0.42, -k.height * 0.18, -k.depth * 0.15);
  return { object: g, grips: [grip.clone().setX(-grip.x), grip], screen: new THREE.Vector3(0, k.screenY, front), dispose: () => glass.geometry.dispose() };
}

/** Pixels of a screen's canvas: the pocket one's four greens, the others' colours. */
const SCREEN_W = 80;
const SCREEN_H = 72;
/** Times a second the screens are redrawn while someone is near. */
const FRAMES = 6;
const GREENS = ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'];
const COLOURS = ['#101830', '#2a5ad8', '#e8c040', '#f8f8f0'];

/**
 * The little game the handhelds' screens show: a runner hopping over blocks on scrolling ground, drawn on one canvas
 * per palette (the pocket one's greens, the others' colours), a few frames a second while `tick` is asked to.
 * The materials glow a little in the evening (unlit). `dispose` frees the canvases.
 */
export class HandheldScreens {
  private readonly screens: { ctx: CanvasRenderingContext2D; texture: THREE.CanvasTexture; material: THREE.MeshBasicMaterial; palette: readonly string[] }[];
  private clock = 0;
  private frame = 0;

  constructor() {
    this.screens = [GREENS, COLOURS].map((palette) => {
      const [canvas, ctx] = createCanvas(SCREEN_W, SCREEN_H);
      const texture = toTexture(canvas, 'facing');
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      // Two kids' handhelds share a palette's screen, and a kid going up frees their tree: `dispose` frees these.
      markShared(texture);
      return { ctx, texture, material: markShared(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })), palette };
    });
    this.draw();
  }

  /** The screen material for `kind`. */
  material(kind: HandheldKind): THREE.Material {
    return this.screens[kind === 'pocket' ? 0 : 1]!.material;
  }

  /** Moves the little games on by `dt` (call only while a player is near: the canvases are uploaded at each frame). */
  tick(dt: number): void {
    this.clock += dt;
    if (this.clock < 1 / FRAMES) return;
    this.clock = 0;
    this.frame++;
    this.draw();
  }

  dispose(): void {
    for (const s of this.screens) {
      s.texture.dispose();
      s.material.dispose();
    }
  }

  private draw(): void {
    const f = this.frame;
    for (const { ctx, texture, palette } of this.screens) {
      const [ink, dark, mid, light] = palette as [string, string, string, string];
      ctx.fillStyle = light;
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
      // Far hills going by slowly, the ground fast, blocks on it.
      ctx.fillStyle = mid;
      for (let x = -((f * 2) % 40); x < SCREEN_W; x += 40) ctx.fillRect(x, 40, 22, 14);
      ctx.fillStyle = dark;
      ctx.fillRect(0, 54, SCREEN_W, 18);
      ctx.fillStyle = ink;
      for (let x = -((f * 5) % 34) + 30; x < SCREEN_W; x += 34) ctx.fillRect(x, 46, 7, 8);
      // The runner: hops over each block as it comes.
      const hop = Math.abs(Math.sin((f * Math.PI) / 7)) * 14;
      ctx.fillRect(14, 44 - hop, 8, 10);
      // The score, counting up.
      ctx.fillStyle = ink;
      for (let i = 0; i < 4; i++) if (((f >> i) & 1) === 1) ctx.fillRect(56 + i * 5, 4, 3, 5);
      texture.needsUpdate = true;
    }
  }
}
