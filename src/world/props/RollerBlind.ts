import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import { cylinderMesh } from '../meshUtils';
import { part, matte } from './Prop';
import { fabric } from '@/world/materials/finishes';

export interface RollerBlindOptions {
  /** Size of the opening it covers, in metres. */
  width: number;
  height: number;
  /** Thickness of the frame rails around the opening; the roller sits on the head rail. Default 0.05. */
  frame?: number;
  /** How far the fabric hangs off the wall (m): in front of the frame, behind whatever stands below it (a tap). Default 0.064. */
  standoff?: number;
  /** Fabric colour. Default a pale linen. */
  color?: number;
}

/** Radius of the rolled-up fabric on its tube, and the width of the brackets at its ends. */
const ROLL_RADIUS = 0.022;
const BRACKET = 0.02;
/** Raise and lower speed, "fraction of the remaining travel per second". */
const SPEED = 3.5;

/**
 * A roller blind over a window, rolled up on a tube against the head rail. Lowered, the fabric
 * hangs flat in front of the glass down to the bottom of the opening, a slim weighted bar at its
 * hem and a pull cord in the middle; it never reaches past the opening, so nothing below it (a
 * sink, a tap) is in its way. Same frame as `RoomWindow` (origin at the middle of the opening, +z
 * into the room) and the same interface as `Curtains`: `currentOpenness` (1 up, 0 down),
 * `isDrawn`, `toggle()`, `update(dt)` returning whether it moved.
 */
export class RollerBlind extends THREE.Group {
  /** Where the blind is heading: 1 up, 0 down. */
  target = 1;
  private openness = 1;
  private readonly sheet: THREE.Mesh;
  private readonly hem = new THREE.Group();
  private readonly rollY: number;
  private readonly drop: number;
  private readonly texture: THREE.Texture;

  constructor({ width, height, frame = 0.05, standoff = 0.064, color = 0xe9e0cc }: RollerBlindOptions) {
    super();
    this.name = 'RollerBlind';
    // The roll sits just under the head rail, a hair wider than the glass; the brackets hold it to the frame.
    this.rollY = height / 2 - ROLL_RADIUS + frame * 0.6;
    const rollZ = standoff + ROLL_RADIUS;
    const rollW = width + 0.04;
    const metal = matte(0xd9d6cf, 0.4);
    const roll = cylinderMesh(ROLL_RADIUS, rollW, matte(color, 0.9), { y: this.rollY, z: rollZ }, { segments: 16 });
    roll.rotation.z = Math.PI / 2;
    this.add(roll);
    for (const side of [-1, 1]) part(this, BRACKET, ROLL_RADIUS * 2.4, rollZ + ROLL_RADIUS, metal, { x: side * (rollW / 2 + BRACKET / 2), y: this.rollY, z: (rollZ + ROLL_RADIUS) / 2 });

    // The fabric: a unit-high sheet scaled to how far it is down, hanging from the front of the roll.
    this.drop = this.rollY - -height / 2;
    this.texture = weave(color);
    const material = fabric({ map: this.texture, roughness: 1, sheenTint: 0xbdb6a6, side: THREE.DoubleSide });
    this.sheet = new THREE.Mesh(new THREE.PlaneGeometry(width, 1).translate(0, -0.5, 0), material);
    this.sheet.position.set(0, this.rollY, standoff);
    this.sheet.castShadow = true;
    this.add(this.sheet);
    // The hem bar, flat so it passes in front of the frame without standing out, and a short pull
    // tab off to one side (a tap often stands in the middle, right under the glass).
    part(this.hem, width, 0.012, 0.006, metal, { y: -0.006 });
    part(this.hem, 0.03, 0.03, 0.003, metal, { x: width / 2 - 0.12, y: -0.025 }).castShadow = false;
    this.hem.position.set(0, this.rollY, standoff);
    this.add(this.hem);
    this.setOpenness(1);
  }

  /** 1 = rolled up, 0 = down over the glass. */
  get currentOpenness(): number {
    return this.openness;
  }

  get isDrawn(): boolean {
    return this.target < 0.5;
  }

  setDrawn(drawn: boolean): void {
    this.target = drawn ? 0 : 1;
  }

  toggle(): void {
    this.setDrawn(!this.isDrawn);
  }

  /** Eases the blind towards `target`; returns true when it moved this frame. */
  update(dt: number): boolean {
    const gap = this.target - this.openness;
    if (Math.abs(gap) < 0.002) {
      if (this.openness === this.target) return false;
      this.setOpenness(this.target);
      return true;
    }
    this.setOpenness(this.openness + gap * (1 - Math.exp(-SPEED * dt)));
    return true;
  }

  private setOpenness(value: number): void {
    this.openness = THREE.MathUtils.clamp(value, 0, 1);
    // A few centimetres always hang below the roll, as on a real blind.
    const down = 0.03 + (this.drop - 0.03) * (1 - this.openness);
    this.sheet.scale.y = down;
    this.hem.position.y = this.rollY - down;
    this.texture.repeat.set(1, down / this.drop);
    this.texture.offset.set(0, 1 - down / this.drop);
  }
}

/** A plain linen weave with faint horizontal slubs, painted once (colour map). */
function weave(color: number): THREE.CanvasTexture {
  const W = 128;
  const H = 256;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = `#${new THREE.Color(color).getHexString()}`;
  ctx.fillRect(0, 0, W, H);
  for (let y = 0; y < H; y += 2) {
    ctx.fillStyle = `rgba(0,0,0,${0.02 + 0.03 * Math.abs(Math.sin(y * 0.37))})`;
    ctx.fillRect(0, y, W, 1);
  }
  for (let x = 0; x < W; x += 3) {
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    ctx.fillRect(x, 0, 1, H);
  }
  return toTexture(canvas);
}
