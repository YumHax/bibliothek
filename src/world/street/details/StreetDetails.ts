import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../../Furniture';
import { snowCovered } from '../snowCover';
import { FRONT, KERB_HEIGHT, PARK_STREET, STREET_PLAN, type Vec2 } from '../streetPlan';
import { groundHeight } from '../relief/ground';
import { TriBuilder } from '../relief/TriBuilder';

/*
 * Where the little things stand (zone-local): purely visual placements, kept clear of the
 * passers-by's routes (z about ±10.1..10.6 on the pavements), the crossings and the signal posts.
 */
const MANHOLES: Vec2[] = [[-10, -4.5], [6.8, 3.2], [22, -2.8], [33, 4.4], [52, -3], [80, 2.8], [-28, -22], [-28, -58], [-7.6, -9.1], [14.2, 9.2], [29.2, -9.4], [-33, 9.3]];
const HYDRANTS: Vec2[] = [[-15.4, -8.5], [24.6, 8.5], [35.6, -8.5], [-36.6, -24]];
const BOLLARDS: Vec2[] = [
  [-0.6, -8.35], [-1.3, -8.35], [5.6, -8.35], [6.3, -8.35],
  [-0.6, 8.35], [0.3, 8.35], [6.6, 8.35], [7.3, 8.35],
  [-19.7, -9.3], [-19.7, -10.3], [-19.7, -11.3],
  [-34.5, 8.35], [-32.5, 8.35], [-30.5, 8.35], [-22.5, 8.35],
];
/** The Morris column: at the mouth of Park Street on the far pavement, clear of the route along the shops. */
const COLUMN: Vec2 = [-24.5, 9.05];
const COLUMN_SIZE = { radius: 0.6, height: 3.1 };
/** Gutter drains along the kerbs every so many metres. */
const DRAIN_EVERY = 13;

/**
 * The street's small print, merged per material: cast-iron manhole covers on the road and the
 * pavements, gutter drains along the kerbs, red fire hydrants, dark bollards either side of the
 * crossing and at Park Street's corners, a Morris column with its posters at the mouth of Park
 * Street, and the roadworks that close the walkable stretch (`STREET_PLAN.roadworks`): a plywood
 * hoarding across each pavement with TRAVAUX / PASSAGE INTERDIT, red and white water-filled
 * barriers across the parking lanes, a few cones. Everything the player can bump into within the
 * walkable street collides; the snow settles on it.
 */
export class StreetDetails extends THREE.Group implements Furniture {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[] = [];

  constructor(anisotropy: number) {
    super();
    this.name = 'StreetDetails';
    const random = seededRandom(2718);
    const painted = new TriBuilder();

    // Manholes and drains: flat discs and grates a hair over the ground, one textured mesh.
    const iron = ironTexture(anisotropy);
    const covers: THREE.BufferGeometry[] = [];
    for (const [x, z] of MANHOLES) {
      const g = new THREE.CircleGeometry(0.34, 20).rotateX(-Math.PI / 2).translate(x, groundHeight(x, z) + 0.005, z);
      // The cover is the texture's left half.
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5);
      covers.push(g);
    }
    const grate = (x: number, z: number, yaw: number): void => {
      const g = new THREE.PlaneGeometry(0.55, 0.3).rotateX(-Math.PI / 2).rotateY(yaw).translate(x, groundHeight(x, z) + 0.005, z);
      // The grate is the texture's right half.
      const uv = g.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, 0.5 + uv.getX(i) * 0.5);
      covers.push(g);
    };
    for (const side of [-1, 1]) {
      for (let x = PARK_STREET.farKerb + 4; x < 100; x += DRAIN_EVERY) {
        if (STREET_PLAN.crossings.some((c) => x > c.from - 1 && x < c.to + 1)) continue;
        grate(x, side * (FRONT.farKerb - 0.2), 0);
      }
    }
    for (let z = -20; z > -90; z -= DRAIN_EVERY) {
      grate(PARK_STREET.nearKerb - 0.2, z, Math.PI / 2);
      grate(PARK_STREET.farKerb + 0.2, z - 6, Math.PI / 2);
    }
    this.addMesh(merge(covers), new THREE.MeshStandardMaterial({ map: iron, roughness: 0.55, metalness: 0.6 }), false);

    // Hydrants: a red post with a cap and two nozzles.
    for (const [x, z] of HYDRANTS) {
      const m = new THREE.Matrix4().makeTranslation(x, 0, z);
      painted.box(m, 0, 0.32, 0, 0.2, 0.64, 0.2, '#b8261e');
      painted.box(m, 0, 0.7, 0, 0.16, 0.12, 0.16, '#c9302a');
      painted.box(m, 0, 0.36, 0, 0.36, 0.08, 0.08, '#9a1e18');
      painted.box(m, 0, 0.02, 0, 0.3, 0.04, 0.3, '#5a5c5e');
      this.collide(x, z, 0.22, 0.8);
    }
    // Bollards: dark green posts with a pale band near the top.
    for (const [x, z] of BOLLARDS) {
      const m = new THREE.Matrix4().makeTranslation(x, 0, z);
      painted.box(m, 0, 0.45, 0, 0.11, 0.9, 0.11, '#1f2a24');
      painted.box(m, 0, 0.78, 0, 0.12, 0.05, 0.12, '#d8d4c8');
      painted.box(m, 0, 0.93, 0, 0.14, 0.05, 0.14, '#1f2a24');
      this.collide(x, z, 0.1, 0.95);
    }
    this.buildColumn(anisotropy);
    this.buildRoadworks(painted, random, anisotropy);
    this.addMesh(painted.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 }), true);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  private addMesh(geometry: THREE.BufferGeometry, material: THREE.MeshStandardMaterial, casts: boolean): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, snowCovered(material));
    mesh.castShadow = casts;
    mesh.receiveShadow = true;
    this.add(mesh);
    return mesh;
  }

  /** A box collider `half` either side of (x, z), `height` tall. */
  private collide(x: number, z: number, half: number, height: number): void {
    this.colliders.push(new THREE.Box3(new THREE.Vector3(x - half, 0, z - half), new THREE.Vector3(x + half, height, z + half)));
  }

  /** The Morris column: a plinth, the drum pasted with posters, a fluted collar and a little dome. */
  private buildColumn(anisotropy: number): void {
    const [x, z] = COLUMN;
    const { radius, height } = COLUMN_SIZE;
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height - 0.9, 28, 1, true).translate(x, 0.35 + (height - 0.9) / 2, z), snowCovered(new THREE.MeshStandardMaterial({ map: postersTexture(anisotropy), roughness: 0.85 })));
    const green = new THREE.MeshStandardMaterial({ color: 0x24392e, roughness: 0.55, metalness: 0.3 });
    const trim = new THREE.Mesh(
      merge([
        new THREE.CylinderGeometry(radius + 0.05, radius + 0.1, 0.35, 28).translate(x, 0.175, z),
        new THREE.CylinderGeometry(radius + 0.12, radius + 0.04, 0.22, 28).translate(x, height - 0.44, z),
        new THREE.SphereGeometry(radius + 0.05, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(x, height - 0.33, z),
        new THREE.SphereGeometry(0.08, 10, 6).translate(x, height - 0.33 + (radius + 0.05) * 0.6 + 0.05, z),
      ]),
      snowCovered(green),
    );
    for (const mesh of [drum, trim]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
    }
    this.collide(x, z, radius + 0.08, 2);
  }

  /**
   * The roadworks at the walkable street's east end: a hoarding across each pavement (its panels
   * the texture), red and white barriers across both parking lanes, cones along them.
   */
  private buildRoadworks(painted: TriBuilder, random: () => number, anisotropy: number): void {
    const { x, depth, height } = STREET_PLAN.roadworks;
    const panels: THREE.BufferGeometry[] = [];
    for (const [z0, z1] of [[FRONT.ourLine, FRONT.nearKerb], [FRONT.farKerb, FRONT.farLine]] as const) {
      const w = z1 - z0;
      panels.push(new THREE.BoxGeometry(depth, height, w).translate(x, height / 2, (z0 + z1) / 2));
      // Feet: two concrete blocks.
      for (const f of [0.2, 0.8]) painted.box(new THREE.Matrix4(), x, 0.08, z0 + w * f, 0.6, 0.16, 0.35, '#8a8a86');
    }
    const hoarding = new THREE.Mesh(merge(panels), snowCovered(new THREE.MeshStandardMaterial({ map: hoardingTexture(anisotropy), roughness: 0.8 })));
    hoarding.castShadow = true;
    hoarding.receiveShadow = true;
    this.add(hoarding);
    // Barriers across the parking lanes, alternately red and white.
    const road = -KERB_HEIGHT;
    for (const [z0, z1] of [[FRONT.nearKerb, -STREET_PLAN.parkingLine], [STREET_PLAN.parkingLine, FRONT.farKerb]] as const) {
      const n = 2;
      const w = (z1 - z0) / n;
      for (let i = 0; i < n; i++) {
        const m = new THREE.Matrix4().makeTranslation(x + 0.2, road, z0 + w * (i + 0.5));
        painted.box(m, 0, 0.4, 0, 0.45, 0.8, w - 0.04, i % 2 ? '#e8e6e0' : '#c8281e');
        painted.box(m, 0, 0.84, 0, 0.3, 0.08, w - 0.2, i % 2 ? '#d8d6d0' : '#b8241c');
      }
    }
    // Cones along the lane lines beyond, orange with a white band.
    for (const side of [-1, 1]) {
      for (let cx = x + 1.2; cx < x + 12; cx += 2.2) {
        const m = new THREE.Matrix4().makeTranslation(cx + (random() - 0.5) * 0.2, road, side * (STREET_PLAN.parkingLine + 0.05));
        painted.box(m, 0, 0.02, 0, 0.36, 0.04, 0.36, '#1a1a1a');
        painted.box(m, 0, 0.2, 0, 0.2, 0.34, 0.2, '#f06a1a');
        painted.box(m, 0, 0.26, 0, 0.21, 0.07, 0.21, '#f4f4f0');
        painted.box(m, 0, 0.42, 0, 0.1, 0.12, 0.1, '#f06a1a');
      }
    }
  }
}

/** Merges plain geometries (position, normal, uv), indexed or not, into one non-indexed geometry. */
function merge(geometries: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = geometries.map((g) => {
    const out = g.index ? g.toNonIndexed() : g;
    if (out !== g) g.dispose();
    return out;
  });
  const count = flat.reduce((n, g) => n + g.getAttribute('position').count, 0);
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let offset = 0;
  for (const g of flat) {
    const n = g.getAttribute('position').count;
    position.set(g.getAttribute('position').array as Float32Array, offset * 3);
    normal.set(g.getAttribute('normal').array as Float32Array, offset * 3);
    const u = g.getAttribute('uv');
    if (u) uv.set(u.array as Float32Array, offset * 2);
    offset += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

/** Cast iron: a manhole cover's rings and studs (left half), a drain's grate (right half). */
function ironTexture(anisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 128);
  const random = seededRandom(31);
  ctx.fillStyle = '#3a3b3d';
  ctx.fillRect(0, 0, 256, 128);
  // Cover: concentric rings, a studded field, the maker's band.
  ctx.strokeStyle = '#26272a';
  ctx.lineWidth = 3;
  for (const r of [60, 44, 30]) {
    ctx.beginPath();
    ctx.arc(64, 64, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = '#4a4b4e';
  for (let y = 10; y < 118; y += 8) for (let x = 10; x < 118; x += 8) if (Math.hypot(x - 64, y - 64) < 28) ctx.fillRect(x, y, 3, 3);
  ctx.fillStyle = '#2a2b2e';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('VILLE', 64, 56);
  ctx.fillText('EU', 64, 78);
  // Grate: slots.
  ctx.fillStyle = '#4a4b4d';
  ctx.fillRect(128, 0, 128, 128);
  ctx.fillStyle = '#0e0f10';
  for (let x = 138; x < 250; x += 12) ctx.fillRect(x, 12, 6, 104);
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = random() < 0.5 ? 'rgba(120,90,60,0.2)' : 'rgba(0,0,0,0.2)';
    ctx.fillRect(random() * 256, random() * 128, 2, 2);
  }
  return toTexture(canvas, anisotropy);
}

/** The Morris column's drum: posters pasted all round (a play, a concert, a games fair, a circus), a little torn and weathered. */
function postersTexture(anisotropy: number): THREE.CanvasTexture {
  const w = 1024;
  const h = 512;
  const [canvas, ctx] = createCanvas(w, h);
  const random = seededRandom(1872);
  ctx.fillStyle = '#e8dcc0';
  ctx.fillRect(0, 0, w, h);
  const bills = [
    { bg: '#1a2a4a', fg: '#f0c94a', title: 'CONCERT', sub: 'Salle Pleyel · 21 h' },
    { bg: '#f0e8d0', fg: '#8a2a2a', title: 'THÉÂTRE', sub: 'Les Fourberies' },
    { bg: '#2a1f4a', fg: '#5fe6ff', title: 'GAME FAIR', sub: 'Rétro · Consoles · Cartouches' },
    { bg: '#c8281e', fg: '#f4f0e0', title: 'CIRQUE', sub: 'Sous le chapiteau' },
    { bg: '#3f6b4f', fg: '#f0e8c8', title: 'EXPO', sub: 'Pixel Art 1985-1995' },
    { bg: '#f6d23a', fg: '#1a1a22', title: 'CINÉMA', sub: 'Nuit du film culte' },
  ];
  const pw = w / bills.length;
  bills.forEach((b, i) => {
    const x = i * pw + 6;
    ctx.fillStyle = b.bg;
    ctx.fillRect(x, 20, pw - 12, h - 40);
    ctx.fillStyle = b.fg;
    ctx.textAlign = 'center';
    ctx.font = 'bold 36px Georgia, serif';
    ctx.fillText(b.title, x + (pw - 12) / 2, 110);
    ctx.font = '18px sans-serif';
    ctx.fillText(b.sub, x + (pw - 12) / 2, 150);
    for (let l = 0; l < 6; l++) ctx.fillRect(x + 20, 200 + l * 32, (pw - 52) * (0.5 + random() * 0.5), 6);
    // Torn strips.
    ctx.fillStyle = 'rgba(232,220,192,0.9)';
    if (random() < 0.6) ctx.fillRect(x + random() * (pw - 60), h - 60 - random() * 80, 40 + random() * 40, 30);
  });
  ctx.fillStyle = 'rgba(60,50,40,0.12)';
  for (let i = 0; i < 600; i++) ctx.fillRect(random() * w, random() * h, 3, 3);
  return toTexture(canvas, anisotropy);
}

/** Roadworks hoarding: white plywood panels, a red and white band, TRAVAUX and PASSAGE INTERDIT, the contractor's board. */
function hoardingTexture(anisotropy: number): THREE.CanvasTexture {
  const w = 512;
  const h = 288;
  const [canvas, ctx] = createCanvas(w, h);
  ctx.fillStyle = '#e8e6e0';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let x = 0; x < w; x += 128) ctx.fillRect(x, 0, 2, h);
  for (let x = 0; x < w; x += 32) {
    ctx.fillStyle = (x / 32) % 2 ? '#e8e6e0' : '#c8281e';
    ctx.beginPath();
    ctx.moveTo(x, h - 40);
    ctx.lineTo(x + 32, h - 40);
    ctx.lineTo(x + 16, h);
    ctx.lineTo(x - 16, h);
    ctx.fill();
  }
  ctx.fillStyle = '#f0c020';
  ctx.fillRect(40, 30, 190, 120);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TRAVAUX', 135, 105);
  // A no-entry sign.
  ctx.fillStyle = '#c8281e';
  ctx.beginPath();
  ctx.arc(360, 90, 56, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4f4f0';
  ctx.fillRect(318, 80, 84, 20);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('PASSAGE INTERDIT', 360, 180);
  ctx.font = '16px sans-serif';
  ctx.fillText('Piétons : merci de rebrousser chemin', 256, 215);
  return toTexture(canvas, anisotropy);
}
