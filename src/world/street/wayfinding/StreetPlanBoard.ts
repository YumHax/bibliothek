import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../../Furniture';
import { invisibleHitbox } from '../../meshUtils';
import { snowPaint } from '../snowCover';
import { HoverGlint } from '../../props/hoverGlint';
import { WALL, onSurface } from '../../surface/layers';
import { SHOP_HOURS, clockTime } from '../shops/shopHours';
import { FACADES, FRONT, PARK_STREET, PARK_WALK, WALKABLE_AREAS, type ShopKind, type Vec2 } from '../streetPlan';

/** A place on the plan: its name, where its door is (zone-local), and its kind of shop for the hours. */
export interface PlanPlace {
  text: string;
  to: Vec2;
  kind?: ShopKind;
}

export interface StreetPlanBoardOptions {
  /** Where the board hangs (zone-local, on the wall): the plan's "you are here". */
  at: Vec2;
  width: number;
  height: number;
  places: readonly PlanPlace[];
  /** Whether the stretch past the first roadworks is open (drawn walkable, not hatched). */
  far: () => boolean;
}

/** The plan's frame (zone-local x and z it shows) and its canvas. */
const VIEW = { x0: -44, x1: 42, z0: -50, z1: 15 };
const CANVAS = { w: 640, h: 484 };
/** The key (zone-local x where it starts): over the blocks behind our row, where the plan has nothing to show. */
const KEY_AT = 6;
/** The plaque's case: how deep it stands off the wall, its frame round the plan. */
const CASE = { depth: 0.05, frame: 0.035 };

/**
 * The "you are here" plan on our building's wall by the residents' door: Front Street, Park Street
 * and the park's gardens drawn from the plan itself (`FACADES`, `WALKABLE_AREAS`), the places one
 * looks for marked and named, a red dot where the player stands reading it, north (here: the way
 * the reader faces) up. Clicked, it reads out the directions with each shop's hours (`SHOP_HOURS`).
 * A case on the wall (`WALL.sign`), its glass the board's face.
 */
export class StreetPlanBoard extends THREE.Group implements Furniture, Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly glint: HoverGlint;

  constructor(private readonly options: StreetPlanBoardOptions, anisotropy: number) {
    super();
    this.name = 'StreetPlanBoard';
    const { width, height } = options;
    const frame = snowPaint(0x1f3a2c, 0.5);
    const box = new THREE.Mesh(new THREE.BoxGeometry(width + 2 * CASE.frame, height + 2 * CASE.frame, CASE.depth), frame);
    box.position.z = CASE.depth / 2;
    box.castShadow = true;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), onSurface(new THREE.MeshStandardMaterial({ map: toTexture(drawPlan(options), anisotropy), roughness: 0.35 }), WALL.sign));
    face.position.z = CASE.depth + 0.001;
    this.add(box, face);
    this.glint = HoverGlint.of(box);
    const hitbox = invisibleHitbox(width + 0.1, height + 0.1, 0.2, { z: 0.1 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string {
    return 'Street plan · read';
  }

  activate(session: SessionActions): void {
    session.read({ title: 'Front Street · where to find it', text: directions(this.options), look: 'plaque' });
  }
}

/** Where a place is from the board, in words: which side of the road, how far, which way. */
function whereIs(from: Vec2, [x, z]: Vec2): string {
  const metres = Math.round(Math.hypot(x - from[0], z - from[1]) / 5) * 5;
  const far = Math.max(5, metres);
  if (x < PARK_STREET.line + 0.5 && z < FRONT.ourLine) return `round the corner, down Park Street (${far} m)`;
  if (x < PARK_STREET.hedge + 1 && z < FRONT.ourLine) return `the park's gate on Park Street (${far} m)`;
  const side = z < 0 ? 'this side' : 'across the road';
  const way = Math.abs(x - from[0]) < 3 ? 'right here' : x > from[0] ? 'to the right' : 'to the left, towards the park';
  return `${side}, ${way} (${far} m)`;
}

/** The directions read off the plan: each place, where, and its hours when it keeps some. */
function directions({ at, places, far }: StreetPlanBoardOptions): string {
  const lines = places.map((place) => {
    const hours = place.kind ? SHOP_HOURS[place.kind] : null;
    const open = place.kind === 'arcade' ? ' · never shuts' : hours ? ` · ${clockTime(hours.open)} to ${clockTime(hours.close % 24)}` : '';
    return `${place.text}: ${whereIs(at, place.to)}${open}`;
  });
  lines.push(far() ? 'Front Street is open again as far as the side street: the works moved on.' : 'Past the arcade the street is up for the gas main: back the way you came.');
  return lines.join('\n');
}

/** The plan, painted: the park, the roads, the pavements, the buildings, the places and you. */
function drawPlan({ at, places, far }: StreetPlanBoardOptions): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(CANVAS.w, CANVAS.h);
  const sx = (x: number): number => ((x - VIEW.x0) / (VIEW.x1 - VIEW.x0)) * CANVAS.w;
  const sy = (z: number): number => ((z - VIEW.z0) / (VIEW.z1 - VIEW.z0)) * CANVAS.h;
  ctx.fillStyle = '#efe8d6';
  ctx.fillRect(0, 0, CANVAS.w, CANVAS.h);
  // The park.
  ctx.fillStyle = '#b8d0a0';
  ctx.fillRect(0, 0, sx(PARK_STREET.hedge), CANVAS.h);
  ctx.fillStyle = '#9cbc84';
  ctx.fillRect(sx(PARK_WALK.minX), sy(PARK_WALK.minZ), sx(PARK_WALK.maxX) - sx(PARK_WALK.minX), sy(PARK_WALK.maxZ) - sy(PARK_WALK.minZ));
  // The roads.
  ctx.fillStyle = '#9a9c9e';
  ctx.fillRect(sx(PARK_STREET.farKerb), 0, sx(PARK_STREET.nearKerb) - sx(PARK_STREET.farKerb), sy(FRONT.farKerb));
  ctx.fillRect(sx(PARK_STREET.farKerb), sy(-FRONT.farKerb), CANVAS.w, sy(FRONT.farKerb) - sy(-FRONT.farKerb));
  // The pavements one walks.
  ctx.fillStyle = '#d8d2c2';
  for (const a of WALKABLE_AREAS) {
    if (a === PARK_WALK) continue;
    for (const [z0, z1] of [[a.minZ, Math.min(a.maxZ, -FRONT.farKerb)], [Math.max(a.minZ, FRONT.farKerb), a.maxZ]] as const) {
      if (z1 > z0) ctx.fillRect(sx(a.minX), sy(z0), sx(a.maxX) - sx(a.minX), sy(z1) - sy(z0));
    }
    if (a.minZ < -FRONT.farKerb - 2) ctx.fillRect(sx(PARK_STREET.nearKerb), sy(a.minZ), sx(a.maxX) - sx(PARK_STREET.nearKerb), sy(a.maxZ) - sy(a.minZ));
  }
  // The works (hatched) unless they moved on.
  if (!far()) {
    ctx.strokeStyle = '#c8281e';
    ctx.lineWidth = 2;
    for (let x = sx(38.4); x < CANVAS.w; x += 9) {
      ctx.beginPath();
      ctx.moveTo(x, sy(-FRONT.farLine));
      ctx.lineTo(x + 12, sy(FRONT.farLine));
      ctx.stroke();
    }
  }
  // The buildings: each face thickened back into its block.
  ctx.fillStyle = '#b89a7a';
  for (const facade of FACADES) {
    const [ax, az] = facade.from;
    const [bx, bz] = facade.to;
    const len = Math.hypot(bx - ax, bz - az);
    const nx = -(bz - az) / len;
    const nz = (bx - ax) / len;
    const back = 3;
    ctx.beginPath();
    ctx.moveTo(sx(ax), sy(az));
    ctx.lineTo(sx(bx), sy(bz));
    ctx.lineTo(sx(bx - nx * back), sy(bz - nz * back));
    ctx.lineTo(sx(ax - nx * back), sy(az - nz * back));
    ctx.closePath();
    ctx.fill();
  }
  // The places: a numbered dot each, the key down the side.
  ctx.font = 'bold 13px sans-serif';
  ctx.textBaseline = 'middle';
  places.forEach((place, i) => {
    const [x, z] = place.to;
    ctx.fillStyle = '#1f3a2c';
    ctx.beginPath();
    ctx.arc(sx(x), sy(z), 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2ecd8';
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), sx(x), sy(z) + 1);
    ctx.fillStyle = '#1a1a1a';
    ctx.textAlign = 'left';
    ctx.fillText(`${i + 1}  ${place.text}`, sx(KEY_AT), 22 + i * 19, CANVAS.w - sx(KEY_AT) - 10);
  });
  // You are here.
  ctx.fillStyle = '#d82020';
  ctx.beginPath();
  ctx.arc(sx(at[0]), sy(at[1] + 0.8), 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('YOU ARE HERE', sx(at[0]), sy(at[1] + 0.8) - 18);
  ctx.fillStyle = '#1f3a2c';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.fillText('FRONT STREET', CANVAS.w * 0.62, CANVAS.h - 22);
  return canvas;
}
