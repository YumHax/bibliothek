import * as THREE from 'three';
import { createCanvas, seededRandom, toTexture } from '@/graphics/canvas';
import { markShared } from '../props/Prop';
import { SAS } from './airlockPlan';

/*
 * How the sas looks, the same in both twins by construction: every surface seen from inside with
 * the doors shut is unlit (`MeshBasicMaterial`) and carries its light in its vertex colours, baked
 * from the ceiling globe (`bakedLight`). Lamps of the stairwell or sun of the street never reach
 * it, so the two copies cannot differ whatever the zone's lights, the hour or the weather. What
 * faces the zone outside (the street door's street face, the inner door's hall face, the partition
 * seen from the hall) is lit like the rest of its zone. Textures are painted once per page and
 * shared by both twins (`markShared`): one upload, and not a pixel of difference.
 */

const LAMP = new THREE.Vector3(...SAS.lamp);
/** The globe's colour, a warm filament through frosted glass. */
const WARM = new THREE.Color(1.0, 0.86, 0.7);
/** The walls of the inside, for the corners' shade: [normal axis, coordinate]. */
const INSIDE = {
  x0: -SAS.width / 2,
  x1: SAS.width / 2,
  z0: -(SAS.depth - SAS.partition),
  z1: -SAS.wall,
};

const n = new THREE.Vector3();
const l = new THREE.Vector3();

/**
 * The light on a surface at sas-local `p` facing `normal`: the globe (Lambert over a softened inverse
 * square), a glow on the ceiling round it, a warm bounce everywhere, darker into the room's corners.
 */
export function bakedLight(p: THREE.Vector3, normal: THREE.Vector3, out: THREE.Color): THREE.Color {
  n.copy(normal).normalize();
  l.copy(LAMP).sub(p);
  const d = Math.max(l.length(), 0.05);
  const facing = Math.max(0, n.dot(l) / d);
  let light = 0.2 + (1.55 * facing) / (1 + 0.33 * d * d);
  if (n.y < -0.5) light += 0.85 * Math.exp(-((p.x - LAMP.x) ** 2 + (p.z - LAMP.z) ** 2) / 0.3);
  // The corners: each wall the surface does not lie along shades it the closer it gets.
  const across = [Math.abs(n.x) > 0.5, Math.abs(n.y) > 0.5, Math.abs(n.z) > 0.5];
  const distances = [
    across[0] ? Infinity : p.x - INSIDE.x0,
    across[0] ? Infinity : INSIDE.x1 - p.x,
    across[1] ? Infinity : p.y,
    across[1] ? Infinity : SAS.height - p.y,
    across[2] ? Infinity : p.z - INSIDE.z0,
    across[2] ? Infinity : INSIDE.z1 - p.z,
  ];
  for (const distance of distances) if (distance >= 0 && distance < 1) light *= 1 - 0.32 * Math.exp(-distance / 0.16);
  return out.copy(WARM).multiplyScalar(light);
}

/** Fills `geometry`'s vertex colours from `bakedLight`, its vertices taken to the sas by `toSas`. */
export function bake(geometry: THREE.BufferGeometry, toSas: THREE.Matrix4 = new THREE.Matrix4()): THREE.BufferGeometry {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(toSas);
  const colors = new Float32Array(position.count * 3);
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    p.fromBufferAttribute(position, i).applyMatrix4(toSas);
    q.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix);
    bakedLight(p, q, c);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** The baked look for `map` (or a plain `color`): unlit, lit by its vertex colours, no fog. */
function baked(map: THREE.Texture | null, color = 0xffffff): THREE.MeshBasicMaterial {
  return markShared(new THREE.MeshBasicMaterial({ map, color, vertexColors: true, fog: false }));
}

function shared(canvas: HTMLCanvasElement, repeat = false): THREE.CanvasTexture {
  const texture = toTexture(canvas, 4);
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return markShared(texture);
}

export interface SasFinish {
  /** Plaster over a marble dado: a 1 m wide, 3 m tall tile (u along the wall in metres, v = height / 3). */
  wall: THREE.MeshBasicMaterial;
  /** Black-and-white octagon tiles, a metre square. */
  floor: THREE.MeshBasicMaterial;
  ceiling: THREE.MeshBasicMaterial;
  /** Thresholds. */
  stone: THREE.MeshBasicMaterial;
  /** The architraves and the button's surround. */
  trim: THREE.MeshBasicMaterial;
  mat: THREE.MeshBasicMaterial;
  notice: THREE.MeshBasicMaterial;
  plate: THREE.MeshBasicMaterial;
  brass: THREE.MeshBasicMaterial;
  /** The globe itself: brighter than white, for the bloom. */
  globe: THREE.MeshBasicMaterial;
  /** The street door's leaves: the sas face baked, the street face lit. */
  streetLeaf: { baked: THREE.MeshBasicMaterial; lit: THREE.MeshStandardMaterial };
  /** The glazed inner door: the sas face baked, the hall face lit. */
  glazedLeaf: { baked: THREE.MeshBasicMaterial; lit: THREE.MeshStandardMaterial };
  /** What the entrance hall sees of the partition: its plaster and its door's paint. */
  hallPlaster: THREE.MeshStandardMaterial;
  hallTrim: THREE.MeshStandardMaterial;
  litBrass: THREE.MeshStandardMaterial;
}

let finish: SasFinish | null = null;

/** The sas's materials, painted on first use and kept for the page. */
export function sasFinish(): SasFinish {
  if (finish) return finish;
  const streetLeaf = shared(paintStreetLeaf());
  const glazedLeaf = shared(paintGlazedLeaf());
  finish = {
    wall: baked(shared(paintWall(), true)),
    floor: baked(shared(paintFloor(), true)),
    ceiling: baked(shared(paintPlaster(512, 0xefe8da, 7), true)),
    stone: baked(shared(paintPlaster(256, 0xd8d2c6, 11), true)),
    trim: baked(null, 0xf2ece0),
    mat: baked(shared(paintMat())),
    notice: baked(shared(paintNotice())),
    plate: baked(shared(paintPlate())),
    brass: baked(null, 0xd8b56a),
    globe: markShared(new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.1, 1.7), fog: false })),
    streetLeaf: { baked: baked(streetLeaf), lit: markShared(new THREE.MeshStandardMaterial({ map: streetLeaf, roughness: 0.55 })) },
    glazedLeaf: { baked: baked(glazedLeaf), lit: markShared(new THREE.MeshStandardMaterial({ map: glazedLeaf, roughness: 0.45 })) },
    hallPlaster: markShared(new THREE.MeshStandardMaterial({ color: 0xe6dcc6, roughness: 0.95 })),
    hallTrim: markShared(new THREE.MeshStandardMaterial({ color: 0xf2ece0, roughness: 0.6 })),
    litBrass: markShared(new THREE.MeshStandardMaterial({ color: 0xc9a75b, metalness: 0.85, roughness: 0.3 })),
  };
  return finish;
}

// --- Painting --------------------------------------------------------------------------------------

/** 1 m x 3 m of wall: plaster above, a marble dado to 1 m with a moulded capping, a dark skirting. */
function paintWall(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(256, 768);
  const random = seededRandom(3);
  const px = 256; // per metre
  ctx.fillStyle = '#ece4d2';
  ctx.fillRect(0, 0, 256, 768);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${random() < 0.5 ? '120,100,80' : '255,255,255'},${0.02 + random() * 0.03})`;
    ctx.fillRect(random() * 256, random() * 768, 2 + random() * 6, 2 + random() * 6);
  }
  const dadoTop = 768 - SAS.dado * px;
  ctx.fillStyle = '#d9d3c8';
  ctx.fillRect(0, dadoTop, 256, 768 - dadoTop);
  ctx.strokeStyle = 'rgba(110,105,100,0.35)';
  for (let i = 0; i < 7; i++) {
    ctx.lineWidth = 0.5 + random() * 1.5;
    ctx.beginPath();
    let x = random() * 256;
    let y = dadoTop + random() * (768 - dadoTop);
    ctx.moveTo(x, y);
    for (let s = 0; s < 6; s++) ctx.lineTo((x += (random() - 0.3) * 60), (y += (random() - 0.5) * 40));
    ctx.stroke();
  }
  // Joints between the marble slabs, every 0.5 m.
  ctx.fillStyle = 'rgba(90,85,80,0.4)';
  ctx.fillRect(0, dadoTop, 2, 768 - dadoTop);
  ctx.fillRect(128, dadoTop, 2, 768 - dadoTop);
  ctx.fillStyle = '#c9c1b2';
  ctx.fillRect(0, dadoTop - 10, 256, 12);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(0, dadoTop + 2, 256, 3);
  ctx.fillStyle = '#3a342e';
  ctx.fillRect(0, 768 - 26, 256, 26);
  return canvas;
}

/** A metre of the hall's floor: white octagons, small black cabochons between them, fine grout. */
function paintFloor(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(512, 512);
  ctx.fillStyle = '#8a857c';
  ctx.fillRect(0, 0, 512, 512);
  const cell = 128;
  const cut = cell * 0.3;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const x = i * cell;
      const y = j * cell;
      ctx.fillStyle = (i + j) % 3 === 0 ? '#efece4' : '#f4f1ea';
      ctx.beginPath();
      ctx.moveTo(x + cut, y + 2);
      ctx.lineTo(x + cell - cut, y + 2);
      ctx.lineTo(x + cell - 2, y + cut);
      ctx.lineTo(x + cell - 2, y + cell - cut);
      ctx.lineTo(x + cell - cut, y + cell - 2);
      ctx.lineTo(x + cut, y + cell - 2);
      ctx.lineTo(x + 2, y + cell - cut);
      ctx.lineTo(x + 2, y + cut);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.fillStyle = '#1c1a18';
  for (let i = 0; i <= 4; i++) {
    for (let j = 0; j <= 4; j++) {
      ctx.save();
      ctx.translate(i * cell, j * cell);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-cut / 1.5, -cut / 1.5, (cut * 2) / 1.5, (cut * 2) / 1.5);
      ctx.restore();
    }
  }
  return canvas;
}

function paintPlaster(size: number, color: number, seed: number): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(size, size);
  const random = seededRandom(seed);
  ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < size * 2; i++) {
    ctx.fillStyle = `rgba(${random() < 0.5 ? '110,95,80' : '255,255,255'},${0.02 + random() * 0.03})`;
    ctx.fillRect(random() * size, random() * size, 2 + random() * 5, 2 + random() * 5);
  }
  return canvas;
}

/** A coir doormat with a dark border. */
function paintMat(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(256, 128);
  const random = seededRandom(5);
  ctx.fillStyle = '#3a2c20';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#8a6a44';
  ctx.fillRect(12, 12, 232, 104);
  for (let i = 0; i < 2500; i++) {
    ctx.fillStyle = `rgba(${random() < 0.5 ? '60,40,20' : '170,140,95'},0.35)`;
    ctx.fillRect(12 + random() * 230, 12 + random() * 102, 1, 3);
  }
  return canvas;
}

/** The syndic's notice: please shut the door behind you. */
function paintNotice(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(256, 340);
  ctx.fillStyle = '#f6f1e2';
  ctx.fillRect(0, 0, 256, 340);
  ctx.fillStyle = '#20242c';
  ctx.textAlign = 'center';
  ctx.font = 'bold 26px Georgia, serif';
  ctx.fillText('AVIS', 128, 52);
  ctx.font = '19px Georgia, serif';
  ['Merci de bien', 'refermer la porte', 'derrière vous.', '', 'Please shut the', 'door behind you.'].forEach((line, i) => ctx.fillText(line, 128, 104 + i * 30));
  ctx.font = 'italic 16px Georgia, serif';
  ctx.fillText('— Le syndic', 150, 310);
  ctx.fillStyle = '#b8a47a';
  for (const [x, y] of [[14, 14], [242, 14], [14, 326], [242, 326]] as const) ctx.fillRect(x - 4, y - 4, 8, 8);
  return canvas;
}

/** The door release: a brass plate, a round button glowing orange, PORTE engraved over it. */
function paintPlate(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(128, 192);
  ctx.fillStyle = '#c9a75b';
  ctx.fillRect(0, 0, 128, 192);
  ctx.strokeStyle = '#8a6f38';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 116, 180);
  ctx.fillStyle = '#4a3a1c';
  ctx.font = 'bold 22px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.fillText('PORTE', 64, 52);
  const glow = ctx.createRadialGradient(64, 118, 4, 64, 118, 36);
  glow.addColorStop(0, '#ffd28a');
  glow.addColorStop(0.55, '#ff9a2a');
  glow.addColorStop(1, '#6a3a10');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(64, 118, 32, 0, Math.PI * 2);
  ctx.fill();
  return canvas;
}

/** One leaf of the street door, as painted on the facade (`facadePainter.paintEntrance`): dark wood, two sunk panels. */
function paintStreetLeaf(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(128, 512);
  const random = seededRandom(9);
  ctx.fillStyle = '#4a2e22';
  ctx.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(${random() < 0.5 ? '30,18,12' : '110,70,48'},0.25)`;
    ctx.fillRect(random() * 128, random() * 512, 1, 20 + random() * 60);
  }
  // Panels at the painted door's heights: 0.3 .. 1.2 and 1.4 .. 2.5 m of 2.7.
  const y = (m: number): number => 512 - (m / SAS.outerDoor.height) * 512;
  for (const [a, b] of [[0.3, 1.2], [1.4, 2.5]] as const) {
    ctx.fillStyle = '#3e271c';
    ctx.fillRect(18, y(b), 92, y(a) - y(b));
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, y(b), 92, y(a) - y(b));
    ctx.strokeStyle = 'rgba(160,110,80,0.35)';
    ctx.strokeRect(24, y(b) + 6, 80, y(a) - y(b) - 12);
  }
  return canvas;
}

/** The inner door: cream stiles and rails round a tall frosted pane, a kick plate. */
function paintGlazedLeaf(): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(128, 320);
  ctx.fillStyle = '#efe9dc';
  ctx.fillRect(0, 0, 128, 320);
  const glass = ctx.createLinearGradient(0, 30, 0, 250);
  glass.addColorStop(0, '#dfe7e4');
  glass.addColorStop(1, '#cdd8d6');
  ctx.fillStyle = glass;
  ctx.fillRect(18, 22, 92, 210);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 22, 92, 210);
  ctx.fillStyle = '#b8995a';
  ctx.fillRect(10, 286, 108, 26);
  return canvas;
}
