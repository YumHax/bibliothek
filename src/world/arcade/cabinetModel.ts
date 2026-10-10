import * as THREE from 'three';
import { boxMesh, type MeshPosition } from '../meshUtils';
import { layMesh, WALL } from '../surface/layers';
import { matte } from '../props/Prop';
import { proud } from '../props/joinery';
import { METAL, paint as paintOf } from '../materials/palette';
import { InstructionCard, hintLines } from './InstructionCard';
import { paintBezel, paintCabinetMarquee, paintPanel, paintSideArt } from './cabinetArt';
import { GLASS, asGlass } from '../materials/glass';

/*
 * The upright cabinet's measurements (cabinet-local: origin on the floor at the centre of the
 * base, +z towards the player) and its body: base, control panel, upper body, bezel, marquee.
 */

export const WIDTH = 0.66;
export const DEPTH = 0.78;
export const BASE_H = 0.86;
export const TOTAL_H = 1.92;
export const SCREEN_WIDTH = 0.58;
export const SCREEN_HEIGHT = (SCREEN_WIDTH * 3) / 4;
export const SCREEN_Y = 1.36;
export const SCREEN_TILT = THREE.MathUtils.degToRad(10);
export const BEZEL_BORDER = 0.06;
const BEZEL_THICKNESS = 0.03;
/** The upper body's front face, cabinet-local. */
const UPPER_DEPTH = DEPTH - 0.18;
export const FRONT_Z = -0.11 + UPPER_DEPTH / 2;
/**
 * Where the glass sits: tilted back, its top edge recedes, so it (and the bezel around it) stands
 * far enough forward that nothing of it ends up inside the body; the bezel reads as a monitor hood.
 */
export const SCREEN_Z = FRONT_Z + (SCREEN_HEIGHT / 2 + BEZEL_BORDER) * Math.sin(SCREEN_TILT) + BEZEL_THICKNESS / 2 + 0.004;

const BLACK = paintOf(0x16161a, 0.5);
export const CABINET_CHROME = METAL.satinSteel();

interface CabinetBodySpec {
  color: number;
  glow: number;
  /** Stickers, burns and scuffs, 0..1. */
  wear: number;
  title: string;
  hint: string;
  /** Two sticks on the panel: the instruction card moves to the middle. */
  twoPlayer: boolean;
}

interface CabinetBody {
  /** The body's paint and the two side-art prints; all glow a little when hovered. */
  readonly body: THREE.MeshStandardMaterial[];
  readonly marquee: THREE.MeshBasicMaterial;
  readonly marqueeMesh: THREE.Mesh;
  /** The coin door's two lit coin-return buttons (the cabinet's own material: it blinks them). */
  readonly coinLamps: THREE.MeshStandardMaterial;
  /** The control panel (a hover glints its controls). */
  readonly panel: THREE.Mesh;
}

/** The coin door on the base's front, left of the ticket slot (x 0.2): its size, centre and plate depth. */
const COIN_DOOR = { w: 0.24, h: 0.3, x: -0.08, y: 0.52, depth: 0.008 };
/** How far the door's parts stand out of it: the lit buttons, the slots' chrome bezels, the slits in them, the lock. */
const COIN_PART = { button: 0.008, slot: 0.004, slit: 0.002, lock: 0.006 };
/** The coin lamps' glow: at rest, lit on the INSERT COIN blink, flared as a coin drops. */
export const COIN_LAMP = { idle: 0.25, blink: 1.1, flare: 2.6 };
const CABINET_DOOR = METAL.steel();

/**
 * Builds the body onto `cabinet`: the base with the control panel (its instruction card on it), the
 * upper body set back over it, the bezel the glass sits in, the kick plate, the chrome trim and the
 * marquee on top. The glass, the controls and everything that moves are the cabinet's.
 */
export function buildCabinetBody(cabinet: THREE.Group, spec: CabinetBodySpec): CabinetBody {
  const { color, glow, wear } = spec;
  const paint = matte(color, 0.55);
  const baseArt = new THREE.MeshStandardMaterial({ map: paintSideArt(color, glow, 'base', wear), roughness: 0.55 });
  const upperArt = new THREE.MeshStandardMaterial({ map: paintSideArt(color, glow, 'upper', wear), roughness: 0.55 });
  // Base with the control panel, the upper body set back over it, the marquee on top. The side
  // art goes on the two side faces (BoxGeometry material order: +x, -x, +y, -y, +z, -z).
  cabinet.add(bodyBox(WIDTH, BASE_H, DEPTH, baseArt, paint, { y: BASE_H / 2, z: -0.02 }));
  const panelMaterial = new THREE.MeshStandardMaterial({ map: paintPanel(color ^ glow, wear), roughness: 0.6 });
  // A hair narrower than the body: its tilted sides dip into the base and the upper body, and flush they would z-fight with the side art.
  const panel = boxMesh(WIDTH - 0.004, 0.08, 0.3, panelMaterial, { y: BASE_H + 0.04, z: DEPTH / 2 - 0.12 });
  panel.rotation.x = -0.25;
  cabinet.add(panel);
  // The instruction card lies on the panel, where the hands do not go.
  const card = new InstructionCard({ title: spec.title, lines: hintLines(spec.hint), accent: glow, width: 0.12, height: 0.075 });
  card.rotation.x = -Math.PI / 2;
  card.position.set(spec.twoPlayer ? 0.02 : 0.235, 0.041, 0.03);
  panel.add(card);
  cabinet.add(bodyBox(WIDTH, TOTAL_H - BASE_H, UPPER_DEPTH, upperArt, paint, { y: (BASE_H + TOTAL_H) / 2, z: -0.11 }));
  // Bezel: a slab the screen is set into, tilted back like the glass, standing proud of the body; its
  // printed front (the game's colour round the tube, 1 PLAYER · 2 PLAYERS) on the +z face only.
  const bezelArt = new THREE.MeshStandardMaterial({ map: paintBezel(spec.title, color, glow, spec.twoPlayer), roughness: 0.4 });
  const bezelW = WIDTH - 0.02;
  const bezelH = SCREEN_HEIGHT + BEZEL_BORDER * 2;
  const bezel = new THREE.Mesh(new THREE.BoxGeometry(bezelW, bezelH, BEZEL_THICKNESS), [BLACK, BLACK, BLACK, BLACK, bezelArt, BLACK]);
  bezel.position.set(0, SCREEN_Y, SCREEN_Z - BEZEL_THICKNESS / 2 - 0.002);
  bezel.rotation.x = -SCREEN_TILT;
  bezel.castShadow = true;
  bezel.receiveShadow = true;
  cabinet.add(bezel);
  // The glass over the tube: a clear pane a few millimetres in front of the picture, catching the hall's
  // neon (the environment's reflection) so the screen reads as a lit tube behind glass, not a sticker.
  const glass = asGlass(new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_WIDTH + 0.01, SCREEN_HEIGHT + 0.01), GLASS.clear));
  // Between the picture and the out-of-order note (6 mm out, taped on the glass).
  glass.position.set(0, SCREEN_Y, SCREEN_Z + 0.003); // convention-ok: a real 3 mm gap between the picture and the glass, the note taped on further out
  glass.rotation.x = -SCREEN_TILT;
  cabinet.add(glass);
  // Kick plate (standing 2 mm proud of the base, whose faces it would otherwise share) and a chrome trim on the panel.
  cabinet.add(boxMesh(proud(WIDTH), 0.06, proud(DEPTH), BLACK, { y: 0.03, z: -0.02 }));
  cabinet.add(boxMesh(WIDTH, 0.015, 0.015, CABINET_CHROME, { y: BASE_H + 0.085, z: DEPTH / 2 + 0.02 }));
  // The coin door on the base's front: a steel plate, two coin slots, two coin-return buttons lit red
  // (the cabinet blinks them with INSERT COIN and flares them when a coin drops).
  const baseFront = -0.02 + DEPTH / 2;
  const door = boxMesh(COIN_DOOR.w, COIN_DOOR.h, COIN_DOOR.depth, CABINET_DOOR, { x: COIN_DOOR.x, y: COIN_DOOR.y, z: baseFront + COIN_DOOR.depth / 2 });
  cabinet.add(door);
  const coinLamps = new THREE.MeshStandardMaterial({ color: 0x5a0d08, emissive: 0xff2a1a, emissiveIntensity: COIN_LAMP.idle, roughness: 0.35 });
  for (const side of [-1, 1]) {
    const x = COIN_DOOR.x + side * COIN_DOOR.w * 0.24;
    const face = baseFront + COIN_DOOR.depth;
    cabinet.add(boxMesh(0.038, 0.05, COIN_PART.button, coinLamps, { x, y: COIN_DOOR.y + 0.055, z: face + COIN_PART.button / 2 }));
    // The slot under each button: a black bar on a chrome bezel.
    cabinet.add(boxMesh(0.034, 0.012, COIN_PART.slot, CABINET_CHROME, { x, y: COIN_DOOR.y - 0.035, z: face + COIN_PART.slot / 2 }));
    cabinet.add(boxMesh(0.022, 0.004, COIN_PART.slit, BLACK, { x, y: COIN_DOOR.y - 0.035, z: face + COIN_PART.slot + COIN_PART.slit / 2 }));
  }
  // The lock between the two.
  cabinet.add(boxMesh(0.016, 0.016, COIN_PART.lock, CABINET_CHROME, { x: COIN_DOOR.x, y: COIN_DOOR.y - 0.1, z: baseFront + COIN_DOOR.depth + COIN_PART.lock / 2 }));

  // Marquee: the title on a glowing strip; brighter when hovered.
  const marquee = new THREE.MeshBasicMaterial({ map: paintCabinetMarquee(spec.title, color, glow), toneMapped: false, color: 0xcccccc });
  const marqueeMesh = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH - 0.04, 0.16), marquee);
  marqueeMesh.position.set(0, TOTAL_H - 0.1, -0.11 + UPPER_DEPTH / 2 + WALL.notice.lift);
  layMesh(marqueeMesh, WALL.notice);
  cabinet.add(marqueeMesh);
  return { body: [paint, baseArt, upperArt], marquee, marqueeMesh, coinLamps, panel };
}

/** A shadowed box with `sides` on its two side faces and `paint` everywhere else. */
function bodyBox(width: number, height: number, depth: number, sides: THREE.Material, paint: THREE.Material, position: MeshPosition): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), [sides, sides, paint, paint, paint, paint]);
  mesh.position.set(position.x ?? 0, position.y ?? 0, position.z ?? 0);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
