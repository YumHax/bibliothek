import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { invisibleHitbox } from '../../meshUtils';
import { paint } from '../../materials/palette';
import { snowCovered } from '../snowCover';
import { nightnessOf } from '../streetAir';
import { clockTime } from '../shops/shopHours';

/** The clock's head: a drum this wide and deep over the post, its dials' radius. */
const HEAD = { radius: 0.36, depth: 0.2 };
const DIAL = 0.3;
/** Unlit, the dials glow this much at night (they are lit from inside: no light of their own). */
const DIAL_GLOW = 1.4;

/**
 * A pillar clock on the pavement, the kind a town puts at a corner: a fluted green post, a drum
 * at the top with a dial on either face (turned along the street, local ±z), black hands that
 * keep the game's time, the dials lit from inside at night. Clicked, it says the time and what is
 * about to open or shut (`closingSoon`). Its post collides.
 */
export class StreetClock extends THREE.Group implements Furniture, Interactable, Updatable {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[];
  readonly hitboxes: THREE.Object3D[];
  private readonly hands: { hour: THREE.Object3D; minute: THREE.Object3D }[] = [];
  private readonly dial: THREE.MeshStandardMaterial;

  constructor(private readonly dayNight: DayNight, height: number, private readonly closingSoon: (hours: number) => string | null) {
    super();
    this.name = 'StreetClock';
    const green = snowCovered(paint(0x24392e, 0.45));
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, height - HEAD.radius, 10).translate(0, (height - HEAD.radius) / 2, 0), green);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.4, 10).translate(0, 0.2, 0), green);
    const y = height;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(HEAD.radius, HEAD.radius, HEAD.depth, 28).rotateX(Math.PI / 2).translate(0, y, 0), green);
    const finial = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6).translate(0, y + HEAD.radius + 0.05, 0), paint(0xc8a040, 0.4));
    for (const m of [post, base, drum]) m.castShadow = true;
    this.add(post, base, drum, finial);

    const map = dialTexture();
    this.dial = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.4 });
    const handMaterial = paint(0x111111, 0.5);
    for (const side of [1, -1]) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(DIAL, 40), this.dial);
      face.position.set(0, y, side * (HEAD.depth / 2 + 0.002));
      if (side < 0) face.rotation.y = Math.PI;
      this.add(face);
      const hand = (length: number, width: number, lift: number): THREE.Object3D => {
        const pivot = new THREE.Group();
        const bar = new THREE.Mesh(new THREE.BoxGeometry(width, length, 0.006).translate(0, length / 2 - 0.03, 0), handMaterial);
        pivot.add(bar);
        pivot.position.set(0, y, side * (HEAD.depth / 2 + lift));
        if (side < 0) pivot.rotation.y = Math.PI;
        this.add(pivot);
        return pivot;
      };
      this.hands.push({ hour: hand(DIAL * 0.55, 0.022, 0.008), minute: hand(DIAL * 0.85, 0.014, 0.014) });
    }
    this.colliders = [new THREE.Box3(new THREE.Vector3(-0.2, 0, -0.2), new THREE.Vector3(0.2, 2, 0.2))];
    const hitbox = invisibleHitbox(0.5, height + 0.4, 0.5, { y: (height + 0.4) / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(): void {
    const s = this.dayNight.state;
    const hours = s.hours % 12;
    const minutes = (s.hours % 1) * 60;
    // Clockwise seen from the face: a hand turns about the face's normal, negatively.
    for (const { hour, minute } of this.hands) {
      hour.rotation.z = -(hours / 12) * Math.PI * 2;
      minute.rotation.z = -(minutes / 60) * Math.PI * 2;
    }
    this.dial.emissiveIntensity = DIAL_GLOW * THREE.MathUtils.smoothstep(nightnessOf(s), 0.2, 0.6);
  }

  setHovered(): void {
    // The caption says it.
  }

  label(): string {
    return 'Street clock · the time';
  }

  activate(session: SessionActions): void {
    const hours = this.dayNight.state.hours;
    const soon = this.closingSoon(hours);
    session.react(`It is ${clockTime(hours)}.${soon ? ` ${soon}` : ''}`);
  }
}

/** A white dial: twelve numerals round a ring of minute marks. */
function dialTexture(): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = createCanvas(size, size);
  const c = size / 2;
  ctx.fillStyle = '#f4f0e4';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(c, c, c - 6, 0, Math.PI * 2);
  ctx.stroke();
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2;
    const r0 = i % 5 ? c - 18 : c - 26;
    ctx.lineWidth = i % 5 ? 2 : 5;
    ctx.beginPath();
    ctx.moveTo(c + Math.sin(a) * r0, c - Math.cos(a) * r0);
    ctx.lineTo(c + Math.sin(a) * (c - 12), c - Math.cos(a) * (c - 12));
    ctx.stroke();
  }
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 26px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 1; i <= 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.fillText(String(i), c + Math.sin(a) * (c - 48), c - Math.cos(a) * (c - 48));
  }
  return toTexture(canvas, 4);
}
