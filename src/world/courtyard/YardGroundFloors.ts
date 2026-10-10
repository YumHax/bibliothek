import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Updatable } from '@/core/Engine';
import type { Furniture } from '../Furniture';
import type { DayNight } from '../props/DayNight';
import { part } from '../props/Prop';
import { INSET, PROUD, SEAM } from '../props/joinery';
import { cylinderMesh } from '../meshUtils';
import { METAL, cloth, paint, timber } from '../materials/palette';
import { GLASS, asGlass } from '../materials/glass';
import { FACADE, WALL, onSurface } from '../surface/layers';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { facadeHeight } from '../street/facadePainter';
import { facadeStyle } from '../city/facadeStyle';
import { FACADES } from '../city/facades';
import { COURTYARD_PLAN } from './courtyardPlan';
import { inHours, type HourSpan } from '@/time/clock';

type Plan = typeof COURTYARD_PLAN.groundFloors;
type WallId = keyof Plan['walls'];
type Wall = Plan['walls'][WallId];

/** How far a stone surround stands out of the wall, how wide its jambs are, how tall its head. */
const DEPTH = 0.11;
const JAMB = 0.13;
const HEAD = 0.17;
/** The plinth's mortar joints between its blocks (m), and how far the bed under them stands back from the blocks' face. */
const JOINT = 0.008;
const BED_BACK = 0.006;
/** A fitting's thickness on a door's leaf (a letter slot, a grille's rod off the glass). */
const FITTING = 0.008;
/** A stone step before a door: its height and how far it comes out. */
const STEP = { height: 0.15, out: 0.36 };
/** Seconds between two looks at the clock (a lamp behind a window). */
const CHECK_EVERY = 1;
/** A lamp behind a window is on after dusk, between its hours: how dark it must be (`daylight` under this). */
const DUSK = 0.3;
const LAMP = 0xffc98a;

const STONE = paint(0xa7a094, 0.85);
const STONE_B = paint(0x9c968a, 0.88);
const MORTAR = paint(0x6e6a62, 0.95);
const IRON = paint(0x232527, 0.5);
const CAST = paint(0x3a3e3c, 0.5);
const ZINC = paint(0x8a9094, 0.55);
const ROOM = 0x14161a;

/** What a lamp lights behind one window or glazed door: the dark of the room and the curtain against the glass. */
interface Lamp {
  hours: HourSpan;
  room: THREE.MeshStandardMaterial;
  curtain: THREE.MeshStandardMaterial | null;
}

/**
 * The ground floors round the walked courtyard, built (`COURTYARD_PLAN.groundFloors`, the street's frame like
 * `Courtyard`, placed at the same offset): where the facades are painted bare (`FacadeSpec.builtGround`), a stone
 * plinth of blocks along each wall's foot, the cellars' vents in it behind their grilles, the bike room's boarded door,
 * the wing's glazed staircase door under its zinc hood, the rear building's panelled one, each in its stone surround
 * with its enamel plate, the ground-floor windows barred in theirs (casements in the facade's colour, café curtains,
 * a lamp on behind some of an evening), a downpipe on the rear building. Seen from a metre off, so nothing here is
 * painted: every part is geometry, the plates' lettering on canvases at a millimetre a pixel. The static parts are
 * merged by material (a few draw calls for the whole yard); the steps collide.
 */
export class YardGroundFloors extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  readonly colliders: THREE.Box3[] = [];
  private readonly lamps: Lamp[] = [];
  private readonly owned: { dispose(): void }[] = [];
  private clock = CHECK_EVERY;

  constructor(private readonly dayNight: DayNight) {
    super();
    this.name = 'YardGroundFloors';
    const plan = COURTYARD_PLAN.groundFloors;
    for (const id of Object.keys(plan.walls) as WallId[]) this.plinth(id);
    for (const vent of plan.vents) this.vent(plan.walls[vent.wall], vent.at);
    for (const door of plan.doors) this.door(door);
    for (const window of plan.windows) this.window(window);
    for (const pipe of plan.downpipes) this.downpipe(plan.walls[pipe.wall], pipe.at);
    this.bake();
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock < CHECK_EVERY) return;
    this.clock = 0;
    const { hours, daylight } = this.dayNight.state;
    for (const lamp of this.lamps) {
      const on = daylight < DUSK && inHours(hours, lamp.hours);
      lamp.room.emissiveIntensity = on ? 0.55 : 0;
      if (lamp.curtain) lamp.curtain.emissiveIntensity = on ? 0.35 : 0;
    }
  }

  dispose(): void {
    for (const thing of this.owned) thing.dispose();
  }

  /** The plinth along a wall's foot: a bed of mortar and the blocks on it, stopped at the doors and where the plan says. */
  private plinth(id: WallId): void {
    const plan = COURTYARD_PLAN.groundFloors;
    const wall = plan.walls[id];
    const { height, proud, block } = plan.plinth;
    // Our back and the rear building run into the wing and the workshop; those two stop short of the plinths they meet.
    const along = wall.runs === 'x';
    let from = along ? wall.from - INSET : wall.from + proud + SEAM;
    let to = along ? wall.to + INSET : wall.to - proud - SEAM;
    if (from > to) [from, to] = [to, from];
    const cuts: [number, number][] = [
      ...plan.gaps.filter((g) => g.wall === id).map((g): [number, number] => [g.from, g.to]),
      ...plan.doors.filter((d) => d.wall === id).map((d): [number, number] => [d.at - d.width / 2 - JAMB - (d.step ? 0.05 : 0) - SEAM, d.at + d.width / 2 + JAMB + (d.step ? 0.05 : 0) + SEAM]),
    ].sort((a, b) => a[0] - b[0]);
    const runs: [number, number][] = [];
    let s = from;
    for (const [a, b] of cuts) {
      if (a > s) runs.push([s, Math.min(a, to)]);
      s = Math.max(s, b);
    }
    if (s < to) runs.push([s, to]);
    let n = 0;
    for (const [a, b] of runs) {
      if (b - a < 0.05) continue;
      // Sunk a hair into the setts and the wall, the bed a hair deeper than its blocks and short of their ends (no two faces in one plane).
      this.box(wall, a + JOINT / 2, b - JOINT / 2, -2 * INSET, height - 0.01, -2 * INSET, proud - BED_BACK, MORTAR);
      const count = Math.max(1, Math.round((b - a) / block));
      const each = (b - a) / count;
      for (let i = 0; i < count; i++) {
        const s0 = a + i * each + (i === 0 ? 0 : JOINT / 2);
        const s1 = a + (i + 1) * each - (i === count - 1 ? 0 : JOINT / 2);
        this.box(wall, s0, s1, -INSET, height, -INSET, proud, n++ % 3 === 1 ? STONE_B : STONE);
      }
    }
  }

  /** A cellar's vent low in the plinth: the dark behind it, an iron frame, its bars. */
  private vent(wall: Wall, at: number): void {
    const { proud } = COURTYARD_PLAN.groundFloors.plinth;
    const w = 0.46;
    const y0 = 0.1;
    const y1 = 0.3;
    const frame = 0.025;
    const face = proud + 0.02;
    const dark = this.plane(wall, at - w / 2, at + w / 2, y0, y1, proud + WALL.sign.lift, onSurface(this.own(new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 1 })), WALL.sign));
    dark.castShadow = false;
    this.box(wall, at - w / 2 - frame, at - w / 2, y0 - frame, y1 + frame, proud - INSET, face, IRON);
    this.box(wall, at + w / 2, at + w / 2 + frame, y0 - frame, y1 + frame, proud - INSET, face, IRON);
    this.box(wall, at - w / 2 - INSET, at + w / 2 + INSET, y0 - frame, y0, proud - INSET, face - PROUD, IRON);
    this.box(wall, at - w / 2 - INSET, at + w / 2 + INSET, y1, y1 + frame, proud - INSET, face - PROUD, IRON);
    for (let i = 1; i < 6; i++) this.rod(wall, at - w / 2 + (i * w) / 6, proud + 0.01, y0 - INSET, y1 + INSET, 0.007, IRON);
  }

  /** A door in its stone surround: the leaf as the plan has it, a step, a zinc hood, the enamel plate on its head. */
  private door(door: Plan['doors'][number]): void {
    const wall = COURTYARD_PLAN.groundFloors.walls[door.wall];
    const { at, width: w, height: h } = door;
    const s0 = at - w / 2;
    const s1 = at + w / 2;
    const floor = door.step ? STEP.height : 0;
    // The surround: two jambs into the head, the head a little proud of them.
    this.box(wall, s0 - JAMB, s0, floor - INSET, h + INSET, -INSET, DEPTH, STONE);
    this.box(wall, s1, s1 + JAMB, floor - INSET, h + INSET, -INSET, DEPTH, STONE);
    const headFace = DEPTH + 0.015;
    this.box(wall, s0 - JAMB - 0.03, s1 + JAMB + 0.03, h, h + HEAD, -INSET, headFace, STONE);
    if (door.step) {
      this.box(wall, s0 - JAMB - 0.05, s1 + JAMB + 0.05, -INSET, STEP.height, -2 * INSET, STEP.out, STONE_B);
      this.collide(wall, s0 - JAMB - 0.05, s1 + JAMB + 0.05, STEP.out, STEP.height);
    }
    const leaf = paint(door.color, 0.55);
    const back = 0.02;
    const face = 0.06;
    const bottom = floor + 0.01;
    if (door.look === 'boarded') {
      // Boards on two ledges, strap hinges, a ring to pull it by.
      const boards = 6;
      const boardW = w / boards;
      for (let i = 0; i < boards; i++) {
        this.box(wall, s0 + i * boardW + (i === 0 ? -INSET : SEAM), s0 + (i + 1) * boardW - (i === boards - 1 ? -INSET : SEAM), bottom, h + INSET, back, face, timber(door.color, 0.7));
      }
      for (const y of [bottom + 0.3, h - 0.3]) {
        this.box(wall, s0 + 0.05, s1 - 0.05, y - 0.06, y + 0.06, face - INSET, face + 0.02, timber(door.color, 0.7));
        this.box(wall, s0 + 0.02, s0 + 0.42, y - 0.022, y + 0.022, face + 0.02 - INSET, face + 0.026, IRON);
      }
      this.box(wall, s1 - 0.13, s1 - 0.07, 1.0, 1.06, face - INSET, face + 0.012, IRON);
      this.rod(wall, s1 - 0.1, face + 0.03, 0.93, 1.0, 0.006, IRON);
    } else {
      // A glazed door: the hall's dark behind the glass of its upper half, a wrought-iron grille over it.
      const glazed = door.look === 'glazed';
      const glassFrom = glazed ? floor + h * 0.48 : h;
      const stile = 0.11;
      this.box(wall, s0 - INSET, s1 + INSET, bottom, glassFrom + (glazed ? 0 : INSET), back, face, leaf);
      if (glazed) {
        this.box(wall, s0 - INSET, s0 + stile, glassFrom - INSET, h + INSET, back, face, leaf);
        this.box(wall, s1 - stile, s1 + INSET, glassFrom - INSET, h + INSET, back, face, leaf);
        this.box(wall, s0 + stile - INSET, s1 - stile + INSET, h - 0.12, h + INSET, back, face - PROUD, leaf);
        const g0 = s0 + stile;
        const g1 = s1 - stile;
        const top = h - 0.12;
        this.lamp({ from: 17, to: 24 }, wall, g0, g1, glassFrom, top, null);
        this.glass(wall, g0, g1, glassFrom, top, (back + face) / 2);
        for (let i = 1; i < 4; i++) this.rod(wall, g0 + (i * (g1 - g0)) / 4, face - FITTING, glassFrom - INSET, top + INSET, 0.007, IRON);
        this.box(wall, g0 - INSET, g1 + INSET, (glassFrom + top) / 2 - 0.01, (glassFrom + top) / 2 + 0.01, face - 2 * FITTING, face - PROUD, IRON);
      }
      // Two raised panels on the solid part, a brass lever and a letter slot.
      const raised = paint(new THREE.Color(door.color).multiplyScalar(0.9).getHex(), 0.5);
      const panelTop = glazed ? glassFrom - 0.12 : h - 0.16;
      const mid = glazed ? panelTop : bottom + (panelTop - bottom) * 0.42;
      this.box(wall, s0 + stile, s1 - stile, bottom + 0.16, mid - (glazed ? 0 : 0.07), face - INSET, face + 0.012, raised);
      if (!glazed) this.box(wall, s0 + stile, s1 - stile, mid + 0.07, panelTop, face - INSET, face + 0.012, raised);
      const brass = METAL.brass();
      const handle = s1 - 0.08;
      this.rod(wall, handle, face + 0.01, 1.02, 1.08, 0.012, brass);
      this.box(wall, handle - 0.11, handle, 1.04, 1.06, face + 0.012, face + 0.03, brass);
      if (!glazed) this.box(wall, at - 0.13, at + 0.13, 1.25, 1.29, face - INSET, face + FITTING, brass);
    }
    if (door.canopy) {
      const y = h + HEAD + 0.22;
      this.box(wall, s0 - JAMB - 0.2, s1 + JAMB + 0.2, y, y + 0.04, -INSET, 0.78, ZINC);
      for (const s of [s0 - JAMB - 0.05, s1 + JAMB + 0.05]) {
        this.box(wall, s - 0.012, s + 0.012, y - 0.03, y + INSET, -INSET, 0.7, IRON);
        this.box(wall, s - 0.012, s + 0.012, y - 0.42, y - 0.03 + INSET, -INSET, 0.03, IRON);
      }
    }
    this.plate(wall, at, h + HEAD / 2, headFace, door.plate);
  }

  /** A barred ground-floor window in its stone surround: sill, casements in the facade's colour, the room behind, a curtain. */
  private window(window: Plan['windows'][number]): void {
    const wall = COURTYARD_PLAN.groundFloors.walls[window.wall];
    const { at, width: w, sill: y0, height: h } = window;
    const y1 = y0 + h;
    const s0 = at - w / 2;
    const s1 = at + w / 2;
    this.box(wall, s0 - JAMB - 0.04, s1 + JAMB + 0.04, y0 - 0.07, y0, -INSET, DEPTH + 0.05, STONE);
    this.box(wall, s0 - JAMB, s0, y0 - INSET, y1 + INSET, -INSET, DEPTH, STONE);
    this.box(wall, s1, s1 + JAMB, y0 - INSET, y1 + INSET, -INSET, DEPTH, STONE);
    this.box(wall, s0 - JAMB - 0.02, s1 + JAMB + 0.02, y1, y1 + HEAD, -INSET, DEPTH + 0.01, STONE);

    // The room behind, a curtain against the glass.
    const curtain = window.curtain === 'cafe' ? [[s0 + 0.04, s1 - 0.04, y0 + 0.06, y0 + 0.06 + h * 0.45]] : window.curtain === 'pair' ? [[s0 + 0.04, s0 + w * 0.32, y0 + 0.06, y1 - 0.06], [s1 - w * 0.32, s1 - 0.04, y0 + 0.06, y1 - 0.06]] : [];
    // Lit from behind of an evening, the curtain glows a little with the lamp: its own material then.
    const glowing = curtain.length > 0 && window.lit ? this.own(new THREE.MeshStandardMaterial({ color: 0xece6d8, roughness: 1, side: THREE.DoubleSide, emissive: LAMP, emissiveIntensity: 0 })) : null;
    const lace = glowing ?? cloth(0xe6e0d2);
    for (const [a, b, c, d] of curtain) this.plane(wall, a!, b!, c!, d!, 0.03, lace).castShadow = false;
    if (window.lit) this.lamp(window.lit, wall, s0, s1, y0, y1, glowing);
    else this.plane(wall, s0, s1, y0, y1, FACADE.pane.lift, onSurface(this.own(new THREE.MeshStandardMaterial({ color: ROOM, roughness: 1 })), FACADE.pane)).castShadow = false;

    // The casements: stiles proud of the rails, a mullion where the two leaves meet, a transom under the fanlight.
    const facade = FACADES.find((f) => f.id === wall.facade);
    const frame = paint(facade ? facadeStyle(facade.seed).frame : '#e6e1d8', 0.5);
    const bar = 0.05;
    const back = 0.035;
    const face = 0.075;
    this.box(wall, s0 - INSET, s0 + bar, y0, y1, back, face, frame);
    this.box(wall, s1 - bar, s1 + INSET, y0, y1, back, face, frame);
    this.box(wall, s0 + bar - INSET, s1 - bar + INSET, y0 + PROUD, y0 + 0.06, back, face - PROUD, frame);
    this.box(wall, s0 + bar - INSET, s1 - bar + INSET, y1 - 0.05, y1 - PROUD, back, face - PROUD, frame);
    const transom = y1 - Math.min(0.38, h * 0.3);
    this.box(wall, s0 + bar - INSET, s1 - bar + INSET, transom - 0.025, transom + 0.025, back, face - PROUD, frame);
    this.box(wall, at - 0.03, at + 0.03, y0 + 0.06 - INSET, transom - 0.025 + INSET, back, face, frame);
    this.glass(wall, s0 + bar, s1 - bar, y0 + 0.06, y1 - 0.05, 0.055);

    // The bars, run into the sill and the head, two flats across them.
    const bars = Math.max(3, Math.round(w / 0.13));
    for (let i = 1; i < bars; i++) this.rod(wall, s0 + (i * w) / bars, DEPTH - 0.025, y0 - 0.02, y1 + 0.02, 0.009, IRON);
    for (const y of [y0 + 0.25, y1 - 0.25]) this.box(wall, s0 - INSET, s1 + INSET, y - 0.012, y + 0.012, DEPTH - 0.035, DEPTH - 0.015, IRON);
  }

  /** A cast-iron downpipe from the gutter to the setts: hopper head, brackets into the wall, a shoe at its foot. */
  private downpipe(wall: Wall, at: number): void {
    const facade = FACADES.find((f) => f.id === wall.facade);
    const top = facadeHeight(facade?.storeys ?? 6) - 0.5;
    const out = 0.1;
    this.rod(wall, at, out, 0.22, top, 0.045, CAST);
    this.box(wall, at - 0.1, at + 0.1, top, top + 0.22, out - 0.08, out + 0.08, CAST);
    for (let y = 1.2; y < top; y += 2.2) this.box(wall, at - 0.065, at + 0.065, y - 0.015, y + 0.015, -INSET, out + 0.01, IRON);
    this.box(wall, at - 0.05, at + 0.05, 0, 0.22 + INSET, out - 0.05, out + 0.12, CAST);
  }

  /** The enamel plate on a door's head: white on blue, a white rim; lettering on its own canvas. */
  private plate(wall: Wall, at: number, y: number, on: number, text: string): void {
    const w = Math.max(0.26, text.length * 0.04 + 0.08);
    const h = 0.1;
    const thick = 0.006;
    this.box(wall, at - w / 2, at + w / 2, y - h / 2, y + h / 2, on - INSET, on + thick, paint(0xf2f2ee, 0.25));
    const px = 512;
    const [canvas, ctx] = createCanvas(px, Math.round((px * h) / w));
    const ch = canvas.height;
    ctx.fillStyle = '#f2f2ee';
    ctx.fillRect(0, 0, px, ch);
    ctx.fillStyle = '#1f3f7a';
    ctx.fillRect(ch * 0.07, ch * 0.07, px - ch * 0.14, ch * 0.86);
    ctx.strokeStyle = '#f2f2ee';
    ctx.lineWidth = ch * 0.04;
    ctx.strokeRect(ch * 0.16, ch * 0.16, px - ch * 0.32, ch * 0.68);
    ctx.fillStyle = '#f2f2ee';
    ctx.font = `bold ${Math.round(ch * 0.46)}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, px / 2, ch * 0.53, px - ch * 0.5);
    const texture = this.own(toTexture(canvas));
    const material = onSurface(this.own(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.25 })), WALL.sign);
    this.plane(wall, at - w / 2, at + w / 2, y - h / 2, y + h / 2, on + thick + WALL.sign.lift, material).castShadow = false;
  }

  /** The room behind a pane, dark by day and lit of an evening between `hours` (with its curtain, if any). */
  private lamp(hours: HourSpan, wall: Wall, s0: number, s1: number, y0: number, y1: number, curtain: THREE.MeshStandardMaterial | null): void {
    const room = this.own(new THREE.MeshStandardMaterial({ color: ROOM, roughness: 1, emissive: LAMP, emissiveIntensity: 0 }));
    this.plane(wall, s0, s1, y0, y1, FACADE.pane.lift, onSurface(room, FACADE.pane)).castShadow = false;
    this.lamps.push({ hours, room, curtain });
  }

  private glass(wall: Wall, s0: number, s1: number, y0: number, y1: number, d: number): void {
    asGlass(this.plane(wall, s0, s1, y0, y1, d, GLASS.pane));
  }

  private own<T extends { dispose(): void }>(thing: T): T {
    this.owned.push(thing);
    return thing;
  }

  /** A box between `s0..s1` along the wall, `y0..y1` up, `d0..d1` out of its face into the yard. */
  private box(wall: Wall, s0: number, s1: number, y0: number, y1: number, d0: number, d1: number, material: THREE.Material): THREE.Mesh {
    const along = Math.abs(s1 - s0);
    const out = d1 - d0;
    const mesh = wall.runs === 'x' ? part(this, along, y1 - y0, out, material, {}) : part(this, out, y1 - y0, along, material, {});
    mesh.position.copy(this.spot(wall, (s0 + s1) / 2, (y0 + y1) / 2, (d0 + d1) / 2));
    return mesh;
  }

  /** An upright rod at `s` along the wall, `d` out of it, from `y0` to `y1`. */
  private rod(wall: Wall, s: number, d: number, y0: number, y1: number, radius: number, material: THREE.Material): void {
    const mesh = cylinderMesh(radius, y1 - y0, material, {}, { segments: 10 });
    mesh.position.copy(this.spot(wall, s, (y0 + y1) / 2, d));
    this.add(mesh);
  }

  /** A flat rectangle facing into the yard, `d` out of the wall. */
  private plane(wall: Wall, s0: number, s1: number, y0: number, y1: number, d: number, material: THREE.Material): THREE.Mesh {
    const mesh = new THREE.Mesh(this.own(new THREE.PlaneGeometry(Math.abs(s1 - s0), y1 - y0)), material);
    mesh.position.copy(this.spot(wall, (s0 + s1) / 2, (y0 + y1) / 2, d));
    mesh.rotation.y = wall.runs === 'x' ? (wall.out > 0 ? 0 : Math.PI) : (wall.out * Math.PI) / 2;
    mesh.receiveShadow = true;
    this.add(mesh);
    return mesh;
  }

  private spot(wall: Wall, s: number, y: number, d: number): THREE.Vector3 {
    return wall.runs === 'x' ? new THREE.Vector3(s, y, wall.line + wall.out * d) : new THREE.Vector3(wall.line + wall.out * d, y, s);
  }

  private collide(wall: Wall, s0: number, s1: number, out: number, high: number): void {
    const a = this.spot(wall, s0, 0, 0);
    const b = this.spot(wall, s1, high, out);
    this.colliders.push(new THREE.Box3(a.clone().min(b), a.max(b)));
  }

  /**
   * The parts merged by material, one mesh each (a few draw calls for the whole yard); a material with a single
   * part keeps its mesh. Solid parts cast shadows; what lies on a face (the polygon-offset layers) and the glass do not.
   */
  private bake(): void {
    const byMaterial = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of this.children) {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || mesh.renderOrder !== 0) continue;
      const material = mesh.material as THREE.Material;
      byMaterial.set(material, [...(byMaterial.get(material) ?? []), mesh]);
    }
    for (const [material, meshes] of byMaterial) {
      if (meshes.length < 2) continue;
      const parts = meshes.map((mesh) => {
        mesh.updateMatrix();
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        geometry.clearGroups();
        return geometry.applyMatrix4(mesh.matrix);
      });
      const geometry = mergeGeometries(parts, false);
      for (const g of parts) g.dispose();
      if (!geometry) continue;
      const baked = new THREE.Mesh(this.own(geometry), material);
      baked.castShadow = meshes[0]!.castShadow;
      baked.receiveShadow = true;
      for (const mesh of meshes) mesh.removeFromParent();
      this.add(baked);
    }
    this.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.receiveShadow = true;
      if ((mesh.material as THREE.Material).polygonOffset || mesh.renderOrder !== 0) mesh.castShadow = false;
    });
  }
}
