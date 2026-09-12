import * as THREE from 'three';
import { parquetMaterial } from '../Parquet';
import { cylinderMesh } from '../meshUtils';
import { PictureFrame } from './PictureFrame';
import { Plant } from './Plant';
import { part, matte } from './Prop';

/** The doorway the hallway is seen through, with the face width of its architrave on our side. */
export interface HallwayOpening {
  width: number;
  height: number;
  trim: number;
}

/** How far the hallway starts behind the wall plane; a face flush with the wall would z-fight with it. */
export const HALLWAY_SETBACK = 0.06;
/** Across the corridor, from the middle of our door: it runs further towards the flat's entrance on the right. */
const LEFT = 1.5;
const RIGHT = 2.5;
const DEPTH = 1.3;
const HEIGHT = 2.6;
const WALL_T = 0.05;
const SKIRTING = 0.1;
const LIGHT_INTENSITY = 2.2;
const HANDLE_Y = 1.03;
/** Across the corridor: the console against the far wall, the coat hooks and shoe rack on ours, both by the entrance. */
const CONSOLE_X = 1.9;
const ENTRANCE_X = 1.75;
/** How far the coat corner (hooks, coats, shoe rack) and the console stand off their walls: what is left between them is the way to the front door. */
const COAT_DEPTH = 0.25;
const CONSOLE_DEPTH = 0.26;
/** Thickness of the wall colliders, laid behind each wall face. */
const WALL_COLLIDER = 0.3;
/** Every door of the flat is the same standard leaf. */
const LEAF = { width: 0.83, height: 2.04, thickness: 0.016, trim: 0.07, trimDepth: 0.022 };

const WALL = matte(0xded4c2, 0.95);
const CEILING = matte(0xf2eee6, 1);
const TRIM = matte(0xf6f3ee, 0.7);
const LEAF_PAINT = matte(0xf1ede6, 0.6);
const STEEL = new THREE.MeshStandardMaterial({ color: 0xb9bcc0, metalness: 0.6, roughness: 0.35 });
const BRASS = new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 0.85, roughness: 0.3 });
const WALNUT = matte(0x5e412b, 0.5);
const GLASS = new THREE.MeshStandardMaterial({ color: 0xb8c4cc, roughness: 0.08, metalness: 0.2 });
const FROSTED = new THREE.MeshStandardMaterial({ color: 0xeef2ec, roughness: 0.6, transparent: true, opacity: 0.6, emissive: 0xfff1d6, emissiveIntensity: 0.35 });

type DoorStyle = 'panelled' | 'glazed' | 'entrance';

/**
 * The flat's hallway behind the game room's door: a narrow corridor with the same oak floor,
 * warm painted walls and white skirting. Across it the bedroom and bathroom doors, the glazed
 * kitchen door at the left end, the flat's front door with its mat at the right end; a console
 * with a mirror and the mail, coat hooks and a shoe rack by the entrance, a runner down the
 * middle and a flush ceiling light. The player may walk in: `colliders` are its walls, the console
 * and the coat corner. Nothing here is clickable; only its light is driven, by how far the door is
 * open (it has no shadows, so it must not leak through the closed leaf).
 * Local frame as `Door`: origin on the floor at the middle of our opening, +z into the room; the
 * corridor lies at negative z, starting `HALLWAY_SETBACK` behind the wall plane.
 */
export class Hallway extends THREE.Group {
  readonly light: THREE.PointLight;
  private readonly lamp: THREE.MeshStandardMaterial;

  constructor(opening: HallwayOpening) {
    super();
    this.name = 'Hallway';
    this.position.z = -HALLWAY_SETBACK;

    this.buildShell(opening);
    this.buildDoors();
    this.buildFurniture();
    this.lamp = new THREE.MeshStandardMaterial({ color: 0xfff6e6, emissive: 0xffe3b4, emissiveIntensity: 0, roughness: 0.4 });
    this.light = this.buildCeilingLight();

    // Nothing in here casts: the room's lights never reach it, and its own light has no shadows.
    this.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) obj.castShadow = false;
    });
  }

  /** What nobody walks through, in the hallway's own frame: the far and end walls, the console, the coat corner. */
  get colliders(): THREE.Box3[] {
    const slab = (x0: number, z0: number, x1: number, z1: number): THREE.Box3 => new THREE.Box3(new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, HEIGHT, z1));
    const t = WALL_COLLIDER;
    return [
      slab(-LEFT - t, -DEPTH - t, RIGHT + t, -DEPTH),
      slab(-LEFT - t, -DEPTH, -LEFT, 0),
      slab(RIGHT, -DEPTH, RIGHT + t, 0),
      slab(CONSOLE_X - 0.45, -DEPTH, CONSOLE_X + 0.45, -DEPTH + CONSOLE_DEPTH),
      slab(ENTRANCE_X - 0.35, -COAT_DEPTH, ENTRANCE_X + 0.35, 0),
    ];
  }

  /** `openness` 0 (door shut) to 1: switches the corridor light and its fixture's glow. */
  setOpenness(openness: number): void {
    this.light.intensity = LIGHT_INTENSITY * openness;
    this.lamp.emissiveIntensity = 1.4 * openness;
  }

  // --- Shell --------------------------------------------------------------------------------

  private slab(sx: number, sy: number, sz: number, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh {
    return part(this, sx, sy, sz, material, { x, y, z });
  }

  /** Floor, ceiling, the three walls, our own wall repainted around the opening, skirting all round. */
  private buildShell(opening: HallwayOpening): void {
    const w = LEFT + RIGHT;
    const xc = (RIGHT - LEFT) / 2;
    const t = WALL_T;
    const floor = this.slab(w, t, DEPTH, parquetMaterial(w, DEPTH), xc, -t / 2, -DEPTH / 2);
    floor.receiveShadow = true;
    this.slab(w, t, DEPTH, CEILING, xc, HEIGHT + t / 2, -DEPTH / 2);
    this.slab(w, HEIGHT, t, WALL, xc, HEIGHT / 2, -DEPTH - t / 2);
    this.slab(t, HEIGHT, DEPTH, WALL, -LEFT - t / 2, HEIGHT / 2, -DEPTH / 2);
    this.slab(t, HEIGHT, DEPTH, WALL, RIGHT + t / 2, HEIGHT / 2, -DEPTH / 2);

    // Our own wall seen from the corridor: the room's wall plane is double-sided and paints it in
    // the room's colour, so the hallway's paint is laid over it around the doorway.
    const { width, height, trim } = opening;
    const paintZ = -0.002;
    const edgeL = -width / 2 - trim;
    const edgeR = width / 2 + trim;
    this.slab(w, HEIGHT - height - trim, 0.004, WALL, xc, (HEIGHT + height + trim) / 2, paintZ);
    this.slab(edgeL + LEFT, height + trim, 0.004, WALL, (edgeL - LEFT) / 2, (height + trim) / 2, paintZ);
    this.slab(RIGHT - edgeR, height + trim, 0.004, WALL, (edgeR + RIGHT) / 2, (height + trim) / 2, paintZ);

    // Skirting: full length along the far and end walls (it runs into the architraves, which are
    // deeper and hide it), in two pieces on our wall either side of the opening.
    const s = 0.012;
    this.slab(w, SKIRTING, s, TRIM, xc, SKIRTING / 2, -DEPTH + s / 2);
    this.slab(s, SKIRTING, DEPTH, TRIM, -LEFT + s / 2, SKIRTING / 2, -DEPTH / 2);
    this.slab(s, SKIRTING, DEPTH, TRIM, RIGHT - s / 2, SKIRTING / 2, -DEPTH / 2);
    this.slab(edgeL + LEFT, SKIRTING, s, TRIM, (edgeL - LEFT) / 2, SKIRTING / 2, s / 2);
    this.slab(RIGHT - edgeR, SKIRTING, s, TRIM, (edgeR + RIGHT) / 2, SKIRTING / 2, s / 2);

    // A runner down the middle of the corridor: a dark red border round a faded field.
    // (Kept under the open leaf's underside, 8 mm up.)
    this.slab(3.0, 0.005, 0.7, matte(0x6b2f2a, 1), 0.4, 0.0025, -DEPTH / 2);
    this.slab(2.86, 0.006, 0.56, matte(0x9c6a5a, 1), 0.4, 0.003, -DEPTH / 2);
  }

  // --- Doors --------------------------------------------------------------------------------

  /** Bedroom and bathroom across the corridor, the kitchen at the left end, the flat's front door at the right end. */
  private buildDoors(): void {
    const far = -DEPTH + 0.001;
    this.hungDoor('panelled').position.set(-0.85, 0, far);
    this.hungDoor('panelled').position.set(0.75, 0, far);
    const kitchen = this.hungDoor('glazed');
    kitchen.position.set(-LEFT + 0.001, 0, -DEPTH / 2);
    kitchen.rotation.y = Math.PI / 2;
    const entrance = this.hungDoor('entrance');
    entrance.position.set(RIGHT - 0.001, 0, -DEPTH / 2);
    entrance.rotation.y = -Math.PI / 2;
  }

  /**
   * A shut door lying on a wall face: architrave and a leaf filling it, a lever handle on the
   * right. Origin on the floor at the middle of the leaf, +z into the corridor. The leaf sits
   * within the architrave's depth so the wall behind needs no hole.
   */
  private hungDoor(style: DoorStyle): THREE.Group {
    const group = new THREE.Group();
    this.add(group);
    const { width, height, thickness, trim, trimDepth } = LEAF;
    part(group, trim, height + trim, trimDepth, TRIM, { x: -width / 2 - trim / 2, y: (height + trim) / 2, z: trimDepth / 2 });
    part(group, trim, height + trim, trimDepth, TRIM, { x: width / 2 + trim / 2, y: (height + trim) / 2, z: trimDepth / 2 });
    part(group, width + 2 * trim, trim, trimDepth, TRIM, { y: height + trim / 2, z: trimDepth / 2 });

    const face = thickness;
    const handleMetal = style === 'entrance' ? BRASS : STEEL;
    if (style === 'glazed') {
      // Stiles and rails framing three frosted panes: the kitchen's daylight shows through.
      const stile = 0.1;
      const rail = 0.12;
      part(group, stile, height, thickness, LEAF_PAINT, { x: -width / 2 + stile / 2, y: height / 2, z: face / 2 });
      part(group, stile, height, thickness, LEAF_PAINT, { x: width / 2 - stile / 2, y: height / 2, z: face / 2 });
      const paneW = width - 2 * stile;
      const bottomRail = 0.3;
      part(group, paneW, bottomRail, thickness, LEAF_PAINT, { y: bottomRail / 2, z: face / 2 });
      part(group, paneW, rail, thickness, LEAF_PAINT, { y: height - rail / 2, z: face / 2 });
      const panes = 3;
      const paneH = (height - bottomRail - rail - (panes - 1) * rail) / panes;
      for (let i = 0; i < panes; i++) {
        const y0 = bottomRail + i * (paneH + rail);
        part(group, paneW, paneH, 0.006, FROSTED, { y: y0 + paneH / 2, z: face / 2 });
        if (i < panes - 1) part(group, paneW, rail, thickness, LEAF_PAINT, { y: y0 + paneH + rail / 2, z: face / 2 });
      }
    } else {
      const paint = style === 'entrance' ? matte(0x3a2e28, 0.5) : LEAF_PAINT;
      part(group, width, height, thickness, paint, { y: height / 2, z: face / 2 });
      // Two raised panels, a lock rail between them.
      const raised = matte(new THREE.Color(paint.color).multiplyScalar(0.92).getHex(), 0.5);
      const panelW = width - 0.22;
      const panels = [
        { y: 0.16, h: height * 0.36 },
        { y: 0.16 + height * 0.36 + 0.14, h: height - 0.16 - height * 0.36 - 0.14 - 0.16 },
      ];
      for (const { y, h } of panels) part(group, panelW, h, 0.004, raised, { y: y + h / 2, z: face + 0.002 });
      if (style === 'entrance') {
        // Peephole, a security lock under the handle, and the mat everyone wipes their feet on.
        const peephole = cylinderMesh(0.012, 0.01, BRASS, { y: 1.5, z: face + 0.005 }, { segments: 12 });
        peephole.rotation.x = Math.PI / 2;
        group.add(peephole);
        part(group, 0.04, 0.1, 0.006, BRASS, { x: width / 2 - 0.09, y: HANDLE_Y - 0.13, z: face + 0.003 });
        part(group, 0.65, 0.012, 0.4, matte(0x5a4a3a, 1), { y: 0.006, z: 0.26 });
      }
    }

    // Lever handle near the free edge (the hinge is on the left, out of habit).
    const handleX = width / 2 - 0.07;
    const rose = cylinderMesh(0.024, 0.008, handleMetal, { x: handleX, y: HANDLE_Y, z: face + 0.004 }, { segments: 16 });
    rose.rotation.x = Math.PI / 2;
    const stem = cylinderMesh(0.008, 0.03, handleMetal, { x: handleX, y: HANDLE_Y, z: face + 0.02 }, { segments: 10 });
    stem.rotation.x = Math.PI / 2;
    group.add(rose, stem);
    part(group, 0.12, 0.014, 0.014, handleMetal, { x: handleX - 0.05, y: HANDLE_Y, z: face + 0.035 });
    return group;
  }

  // --- Furniture ----------------------------------------------------------------------------

  private buildFurniture(): void {
    this.buildConsole(CONSOLE_X);
    this.buildCoatHooks(ENTRANCE_X);
    this.buildShoeRack(ENTRANCE_X);

    // A framed picture on our wall, left of the door, and the light switch to its right.
    const picture = new PictureFrame({ motif: 'abstract', seed: 4, width: 0.42, height: 0.32 });
    picture.position.set(-0.95, 1.5, 0);
    picture.rotation.y = Math.PI;
    this.add(picture);
    part(this, 0.08, 0.08, 0.008, TRIM, { x: 0.62, y: 1.1, z: -0.004 });
    part(this, 0.04, 0.045, 0.006, TRIM, { x: 0.62, y: 1.1, z: -0.011 });
  }

  /** A narrow walnut console against the far wall: the mail, a bowl for the keys, a small plant; a mirror above. */
  private buildConsole(x: number): void {
    const z = -DEPTH + 0.13;
    const topY = 0.82;
    part(this, 0.9, 0.03, 0.24, WALNUT, { x, y: topY - 0.015, z });
    for (const dx of [-0.4, 0.4])
      for (const dz of [-0.08, 0.08]) this.add(cylinderMesh(0.014, topY - 0.03, WALNUT, { x: x + dx, y: (topY - 0.03) / 2, z: z + dz }, { radiusBottom: 0.01, segments: 8 }));
    // A bowl with the keys in it, a small pile of letters, a plant at the end.
    const bowl = cylinderMesh(0.09, 0.05, matte(0x2f3a44, 0.4), { x: x - 0.2, y: topY + 0.025, z }, { radiusBottom: 0.055, segments: 18 });
    this.add(bowl);
    part(this, 0.03, 0.008, 0.06, BRASS, { x: x - 0.22, y: topY + 0.054, z: z + 0.01 });
    part(this, 0.22, 0.012, 0.11, matte(0xf4f1ea, 0.8), { x: x + 0.08, y: topY + 0.006, z: z + 0.04 });
    part(this, 0.2, 0.004, 0.1, matte(0xe6dfd0, 0.8), { x: x + 0.09, y: topY + 0.014, z: z + 0.035 });
    const plant = new Plant({ kind: 'small', pot: 'ceramic', seed: 23, collides: false, scale: 0.8 });
    plant.position.set(x + 0.34, topY, z);
    this.add(plant);
    // The mirror over the console.
    const my = 1.55;
    part(this, 0.55, 0.75, 0.02, WALNUT, { x, y: my, z: -DEPTH + 0.01 });
    part(this, 0.49, 0.69, 0.008, GLASS, { x, y: my, z: -DEPTH + 0.012 });
  }

  /** A hook board on our wall by the entrance: two coats and a tote bag. */
  private buildCoatHooks(x: number): void {
    const boardY = 1.7;
    part(this, 0.7, 0.1, 0.02, WALNUT, { x, y: boardY, z: -0.01 });
    for (const dx of [-0.24, 0, 0.24]) {
      const hook = cylinderMesh(0.006, 0.06, BRASS, { x: x + dx, y: boardY - 0.01, z: -0.05 }, { segments: 8 });
      hook.rotation.x = Math.PI / 2;
      this.add(hook);
      part(this, 0.014, 0.03, 0.014, BRASS, { x: x + dx, y: boardY + 0.005, z: -0.075 });
    }
    // Coats hang from the outer hooks: a body and a collar, in navy and camel.
    for (const [dx, colour] of [
      [-0.24, 0x2b3350],
      [0.24, 0x9a7a52],
    ] as const) {
      const cloth = matte(colour, 0.95);
      part(this, 0.36, 0.82, 0.09, cloth, { x: x + dx, y: boardY - 0.05 - 0.41, z: -0.085 });
      part(this, 0.2, 0.08, 0.1, cloth, { x: x + dx, y: boardY - 0.03, z: -0.09 });
    }
    // The tote bag on the middle hook.
    const canvas = matte(0xd9cdb4, 0.95);
    part(this, 0.3, 0.34, 0.05, canvas, { x, y: boardY - 0.33, z: -0.065 });
    for (const dx of [-0.1, 0.1]) part(this, 0.02, 0.18, 0.015, canvas, { x: x + dx, y: boardY - 0.08, z: -0.06 });
  }

  /** Two wire shelves of shoes under the coats. */
  private buildShoeRack(x: number): void {
    const depth = 0.22;
    const z = -(depth / 2 + 0.02);
    for (const y of [0.12, 0.3]) part(this, 0.7, 0.012, depth, STEEL, { x, y, z });
    for (const dx of [-0.33, 0.33]) for (const dz of [-0.09, 0.09]) this.add(cylinderMesh(0.006, 0.31, STEEL, { x: x + dx, y: 0.155, z: z + dz }, { segments: 6 }));
    // Pairs: white trainers and black shoes below, brown boots on top.
    const shoe = (sx: number, sy: number, colour: number, h: number, dx: number): void => {
      const material = matte(colour, 0.7);
      for (const side of [-0.06, 0.06]) part(this, 0.1, h, 0.22, material, { x: sx + dx + side, y: sy + h / 2, z });
    };
    shoe(x, 0.126, 0xf0eee8, 0.08, -0.2);
    shoe(x, 0.126, 0x2a2a2a, 0.07, 0.18);
    shoe(x, 0.306, 0x6a4326, 0.16, -0.05);
  }

  /** A flush fixture in the corridor ceiling and the light it stands for. */
  private buildCeilingLight(): THREE.PointLight {
    const x = 0.5;
    const z = -DEPTH / 2;
    this.add(cylinderMesh(0.17, 0.03, TRIM, { x, y: HEIGHT - 0.015, z }, { segments: 24 }));
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), this.lamp);
    dome.position.set(x, HEIGHT - 0.03, z);
    this.add(dome);
    const light = new THREE.PointLight(0xffe2bb, 0, 5, 2);
    light.position.set(x, HEIGHT - 0.25, z);
    this.add(light);
    return light;
  }
}
