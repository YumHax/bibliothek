import * as THREE from 'three';
import { FONT } from '@/covers/generated/canvasUtils';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { boxMesh } from '../../meshUtils';
import { paint } from '../../materials/palette';
import { Prop } from '../../props/Prop';
import type { NightPhoto } from './GatheringBook';
import { dayLcg } from '@/time/daily';

/** The string's length, how far it stands off the wall (its two pins), and how far the photos hang below it (m). */
const STRING = { length: 0.62, off: 0.012, sag: 0.025 };
/** A polaroid's size (m) and its picture in pixels. */
const PHOTO = { w: 0.075, h: 0.09, pxW: 150, pxH: 180 };
const CORD = paint(0xe8dcc4, 0.9);
const PEG = paint(0xb8895a, 0.7);
const PIN = paint(0x2a2a2e, 0.4);

/**
 * The games nights' photos, pegged along a string on the hallway wall (`HALLWAY_PLAN.nightPhotos`): one polaroid per
 * evening that had a match (the TV's glow, the heads of whoever came round, the date and the score in pen under it).
 * Wall-hung: origin at the string's middle on the wall, +z into the room; the photos hang 1.4 cm off the wall, clear
 * of it. Decoration: never collides, casts no shadow, no light.
 */
export class NightPhotos extends Prop {
  private readonly photos = new THREE.Group();
  private shown = '';

  constructor() {
    super();
    this.name = 'NightPhotos';
    // The cord in two straight halves sagging to the middle, a pin at each end.
    const half = STRING.length / 2;
    const angle = Math.atan2(STRING.sag, half);
    const reach = Math.hypot(half, STRING.sag);
    for (const side of [-1, 1]) {
      const cord = boxMesh(reach, 0.0025, 0.0025, CORD, { x: (side * half) / 2, y: -STRING.sag / 2, z: STRING.off });
      cord.rotation.z = side * angle;
      this.add(cord);
      this.add(boxMesh(0.008, 0.008, STRING.off, PIN, { x: side * half, z: STRING.off / 2 }));
    }
    this.add(this.photos);
    this.traverse((o) => (o.castShadow = false));
  }

  /** Shows `photos` (oldest first), spread along the string. */
  show(photos: readonly NightPhoto[]): void {
    const key = photos.map((p) => `${p.day}:${p.score}`).join('|');
    if (key === this.shown) return;
    this.shown = key;
    for (const child of [...this.photos.children]) {
      // The cards are the photos' own; the pegs are `boxMesh`'s shared geometry and the palette's material.
      if (child.userData.card) {
        const mesh = child as THREE.Mesh;
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.map?.dispose();
        material.dispose();
        mesh.geometry.dispose();
      }
      this.photos.remove(child);
    }
    const n = photos.length;
    photos.forEach((photo, i) => {
      const t = n === 1 ? 0.5 : (i + 0.5) / n;
      const x = (t - 0.5) * (STRING.length - PHOTO.w);
      // Lower towards the middle, as the cord sags.
      const y = -STRING.sag * (1 - Math.abs(t - 0.5) * 2) - PHOTO.h / 2 - 0.004;
      const random = dayLcg(photo.day * 977 + 13);
      const material = new THREE.MeshStandardMaterial({ map: paintPhoto(photo, random), roughness: 0.55 });
      const card = new THREE.Mesh(new THREE.PlaneGeometry(PHOTO.w, PHOTO.h), material);
      card.position.set(x, y, STRING.off + 0.002);
      card.rotation.z = (random() - 0.5) * 0.14;
      card.receiveShadow = true;
      card.userData.card = true;
      this.photos.add(card);
      const peg = boxMesh(0.007, 0.018, 0.005, PEG, { x, y: y + PHOTO.h / 2 - 0.002, z: STRING.off + 0.004 });
      peg.castShadow = false;
      this.photos.add(peg);
    });
  }
}

/** A polaroid of the evening: the white frame, a dark room lit by the TV, the friends' heads, the caption in pen. */
function paintPhoto(photo: NightPhoto, random: () => number): THREE.Texture {
  const { pxW: W, pxH: H } = PHOTO;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#f4f1ea';
  ctx.fillRect(0, 0, W, H);
  const m = 9;
  const ph = W - 2 * m;
  // The room in the dark, the screen's glow.
  const glow = ctx.createRadialGradient(W / 2, m + ph * 0.35, 4, W / 2, m + ph * 0.4, ph * 0.8);
  glow.addColorStop(0, '#9fc4ff');
  glow.addColorStop(0.35, '#3b4f7a');
  glow.addColorStop(1, '#14161f');
  ctx.fillStyle = glow;
  ctx.fillRect(m, m, ph, ph);
  ctx.fillStyle = '#dfefff';
  ctx.fillRect(W / 2 - ph * 0.16, m + ph * 0.24, ph * 0.32, ph * 0.22);
  // The heads and shoulders of whoever came, against the glow.
  const people = Math.max(2, photo.names.length + 1);
  for (let i = 0; i < people; i++) {
    const cx = m + ((i + 0.5) / people) * ph + (random() - 0.5) * 6;
    const cy = m + ph * (0.72 + random() * 0.06);
    const r = ph * (0.085 + random() * 0.02);
    ctx.fillStyle = `hsl(${Math.floor(random() * 360)}, 25%, ${12 + Math.floor(random() * 10)}%)`;
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 2.1, r * 1.9, r * 1.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1b1a1f';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // The flash's sheen, a little faded.
  ctx.fillStyle = 'rgba(255, 236, 200, 0.12)';
  ctx.fillRect(m, m, ph, ph);
  // The caption in pen.
  ctx.fillStyle = '#2a3a8a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `italic 13px ${FONT}`;
  ctx.fillText(`Games night ${photo.score}`.trim(), W / 2, m + ph + 14, W - 8);
  ctx.font = `italic 11px ${FONT}`;
  ctx.fillText(photo.names.join(', '), W / 2, m + ph + 30, W - 8);
  return toTexture(canvas);
}
