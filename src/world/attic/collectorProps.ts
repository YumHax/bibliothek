import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Updatable } from '@/core/Engine';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import { playWoodKnock } from '@/audio/furnitureSounds';
import { boxMesh, invisibleHitbox } from '../meshUtils';
import { cloth, paint, timber } from '../materials/palette';
import { Prop } from '../props/Prop';
import { additive } from '@/world/materials/blend';

/** The dust sheets: an old linen gone grey. */
const SHEET = cloth(0xcfc8ba, 1);

/**
 * An armchair or a sofa under a dust sheet: the rounded shape of the seat, the back and the arms
 * under one cloth falling to the floor in a skirt. Lifting a corner says what is under it. Origin
 * on the floor under its middle, +z its front.
 */
export class SheetedFurniture extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly size: THREE.Vector3;

  constructor(private readonly kind: 'armchair' | 'sofa') {
    super();
    this.name = `Sheeted:${kind}`;
    const width = kind === 'sofa' ? 1.8 : 0.85;
    const depth = 0.85;
    this.size = new THREE.Vector3(width, 0.95, depth);
    const add = (w: number, h: number, d: number, x: number, y: number, z: number, r = 0.08): void => {
      const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, r), SHEET);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.add(mesh);
    };
    add(width, 0.46, depth, 0, 0.23, 0, 0.1);
    add(width, 0.5, 0.22, 0, 0.7, -depth / 2 + 0.11);
    for (const x of [-width / 2 + 0.1, width / 2 - 0.1]) add(0.2, 0.22, depth, x, 0.56, 0);
    // The sheet's skirt, a little wider than what it covers, crumpled on the floor.
    add(width + 0.08, 0.06, depth + 0.08, 0, 0.03, 0.02, 0.03);
    const hitbox = invisibleHitbox(width, 0.95, depth, { y: 0.475 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-this.size.x / 2, 0, -this.size.z / 2), new THREE.Vector3(this.size.x / 2, this.size.y, this.size.z / 2));
  }

  setHovered(): void {}

  label(): string {
    return `A ${this.kind} under a dust sheet · lift a corner`;
  }

  activate(session: SessionActions): void {
    session.react(this.kind === 'sofa' ? 'Green velvet, the colour of a billiard table. A cloud of dust, and a Game Boy cartridge down the side: blank label.' : 'A leather armchair, cracked, moulded to whoever sat in it for years facing that cabinet.');
  }
}

/** A games magazine's cover, framed: invented titles, bright 80s lettering, the issue's date. */
export class MagazineCover extends Prop {
  readonly contactShadow = false;

  constructor(seed: number) {
    super();
    this.name = 'MagazineCover';
    const w = 0.3;
    const h = 0.4;
    const frame = timber(0x2a1f17, 0.5);
    for (const [fw, fh, x, y] of [[w + 0.04, 0.02, 0, h / 2 + 0.01], [w + 0.04, 0.02, 0, -h / 2 - 0.01], [0.02, h, -w / 2 - 0.01, 0], [0.02, h, w / 2 + 0.01, 0]] as const) {
      const bar = boxMesh(fw, fh, 0.02, frame, { x, y, z: 0.01 });
      bar.castShadow = false;
      this.add(bar);
    }
    const cover = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: coverTexture(seed), roughness: 0.4 }));
    cover.position.z = 0.012;
    this.add(cover);
  }
}

const MASTHEADS = ['GAME ZONE', 'JOYSTICK!', 'PIXEL', 'HI-SCORE'];
const HEADLINES = ['THE 16-BIT WARS', 'SECRETS OF THE WARP ZONE', 'WE PLAY THE PROTOTYPES', 'TOP 100 CHEATS'];

function coverTexture(seed: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(300, 400);
  const random = seededRandom(seed * 97 + 13);
  const hue = Math.floor(random() * 360);
  const g = ctx.createLinearGradient(0, 0, 0, 400);
  g.addColorStop(0, `hsl(${hue}, 70%, 45%)`);
  g.addColorStop(1, `hsl(${(hue + 60) % 360}, 70%, 20%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 300, 400);
  // A star field and a big planet behind a hero's silhouette.
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(random() * 300, 80 + random() * 260, 2, 2);
  }
  ctx.fillStyle = `hsl(${(hue + 180) % 360}, 60%, 55%)`;
  ctx.beginPath();
  ctx.arc(200, 230, 80, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.moveTo(90, 360);
  ctx.lineTo(120, 220);
  ctx.lineTo(150, 200);
  ctx.lineTo(170, 240);
  ctx.lineTo(160, 360);
  ctx.fill();
  ctx.fillStyle = '#ffe14a';
  ctx.font = 'bold italic 54px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(MASTHEADS[seed % MASTHEADS.length]!, 150, 62, 280);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px "Arial Black", sans-serif';
  ctx.fillText(HEADLINES[(seed + 1) % HEADLINES.length]!, 150, 110, 280);
  ctx.font = 'bold 16px monospace';
  ctx.fillText(`No ${12 + seed * 7} · ${['MAR', 'JUN', 'NOV'][seed % 3]} ${1988 + seed}`, 150, 388);
  // Thirty years of sun through the roof window.
  ctx.fillStyle = 'rgba(240, 220, 170, 0.25)';
  ctx.fillRect(0, 0, 300, 400);
  return toTexture(canvas, 'facing');
}

/**
 * The collector's writing desk under the roof windows: an old oak table, a lamp that does not work,
 * his notebook open on the blotter (clicked: read). Origin on the floor under the desk's middle, +z
 * the chair's side.
 */
export class CollectorDesk extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];

  constructor(private readonly lines: readonly string[]) {
    super();
    this.name = 'CollectorDesk';
    const oak = timber(0x5a3e26, 0.55);
    this.add(boxMesh(1.1, 0.04, 0.6, oak, { y: 0.74 }));
    for (const x of [-0.5, 0.5]) for (const z of [-0.25, 0.25]) this.add(boxMesh(0.05, 0.72, 0.05, oak, { x, y: 0.36, z }));
    this.add(boxMesh(0.5, 0.005, 0.36, paint(0x2f4a3a, 0.9), { y: 0.7625, z: 0.04 }));
    const page = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.24), new THREE.MeshStandardMaterial({ map: notebookTexture(), roughness: 0.9 }));
    page.rotation.x = -Math.PI / 2;
    page.position.set(0.02, 0.768, 0.06);
    page.rotation.z = 0.08;
    this.add(page);
    // The dead lamp, a green banker's shade.
    this.add(boxMesh(0.03, 0.3, 0.03, paint(0x8a6a2a, 0.3), { x: -0.38, y: 0.91, z: -0.15 }));
    this.add(boxMesh(0.28, 0.07, 0.12, paint(0x1f5a3a, 0.35), { x: -0.38, y: 1.07, z: -0.12 }));
    const hitbox = invisibleHitbox(1.1, 0.8, 0.6, { y: 0.4 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-0.55, 0, -0.3), new THREE.Vector3(0.55, 0.78, 0.3));
  }

  setHovered(): void {}

  label(): string {
    return 'A notebook open on the desk · read';
  }

  activate(session: SessionActions): void {
    session.read({ title: 'The collector’s notebook', text: this.lines.join('\n') });
  }
}

function notebookTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(340, 240);
  ctx.fillStyle = '#efe6cf';
  ctx.fillRect(0, 0, 340, 240);
  ctx.fillStyle = 'rgba(90, 120, 170, 0.35)';
  for (let y = 24; y < 240; y += 14) ctx.fillRect(0, y, 340, 1);
  ctx.fillStyle = 'rgba(40, 40, 70, 0.75)';
  ctx.font = 'italic 12px Georgia, serif';
  const random = seededRandom(31);
  for (let y = 36; y < 230; y += 14) ctx.fillRect(14, y - 6, 120 + random() * 190, 1.5);
  ctx.fillText('A. Vasseur', 14, 18);
  return toTexture(canvas, 'facing');
}

/**
 * A shelf of boxed games under thirty years of dust, the collector's: rows of boxes in their colours
 * (one `InstancedMesh`), grey on top. Knocked, the dust comes off. Origin on the floor under its middle, +z its front.
 */
export class DustyShelf extends Prop implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly width: number;

  constructor(width: number, rows: number) {
    super();
    this.name = 'DustyShelf';
    this.width = width;
    const pine = timber(0x6a4c30, 0.7);
    const height = rows * 0.36 + 0.1;
    for (const x of [-width / 2, width / 2]) this.add(boxMesh(0.025, height, 0.3, pine, { x, y: height / 2 }));
    for (let r = 0; r <= rows; r++) this.add(boxMesh(width, 0.025, 0.3, pine, { y: 0.05 + r * 0.36 }));
    const random = seededRandom(1989);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const perRow = Math.floor((width - 0.06) / 0.03);
    const instances = new THREE.InstancedMesh(box, material, rows * perRow);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let n = 0;
    for (let r = 0; r < rows; r++) {
      let x = -width / 2 + 0.03;
      while (x < width / 2 - 0.05 && n < rows * perRow) {
        const t = 0.025 + random() * 0.02;
        const h = 0.18 + random() * 0.1;
        m.makeScale(t, h, 0.2);
        m.setPosition(x + t / 2, 0.0625 + r * 0.36 + h / 2, 0);
        instances.setMatrixAt(n, m);
        c.setHSL(random(), 0.35, 0.3 + random() * 0.2).lerp(new THREE.Color(0x9a948a), 0.45);
        instances.setColorAt(n, c);
        x += t + 0.002;
        n++;
      }
    }
    instances.count = n;
    instances.castShadow = true;
    instances.receiveShadow = true;
    this.add(instances);
    const hitbox = invisibleHitbox(width, height, 0.3, { y: height / 2 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3(new THREE.Vector3(-this.width / 2, 0, -0.15), new THREE.Vector3(this.width / 2, 1.6, 0.15));
  }

  setHovered(): void {}

  label(): string {
    return 'The collector’s shelf · look';
  }

  activate(session: SessionActions): void {
    playWoodKnock(0.08);
    session.react('Boxes, hundreds, every spine faded to the same grey. Empty: he kept the games somewhere safer.');
  }
}

/**
 * Dust hanging in the light of the roof windows: a few hundred motes drifting slowly in a column
 * under the glass (points, additive on the colour only, the canvas's alpha kept).
 */
export class DustMotes extends THREE.Points implements Updatable {
  readonly footprint = new THREE.Box3();
  readonly contactShadow = false;
  private readonly speeds: Float32Array;
  private readonly height: number;
  private clock = 0;

  constructor(width: number, depth: number, height: number, count = 260) {
    const random = seededRandom(7);
    const positions = new Float32Array(count * 3);
    const speeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (random() - 0.5) * width;
      positions[i * 3 + 1] = random() * height;
      positions[i * 3 + 2] = (random() - 0.5) * depth;
      speeds[i] = 0.01 + random() * 0.03;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({ color: 0xfff0d0, size: 0.012, transparent: true, opacity: 0.55, depthWrite: false });
    additive(material);
    super(geometry, material);
    this.name = 'DustMotes';
    this.speeds = speeds;
    this.height = height;
    this.frustumCulled = false;
  }

  update(dt: number): void {
    this.clock += dt;
    const position = this.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.speeds.length; i++) {
      let y = position.getY(i) - this.speeds[i]! * dt;
      if (y < 0) y += this.height;
      position.setY(i, y);
      position.setX(i, position.getX(i) + Math.sin(this.clock * 0.3 + i) * 0.0008);
    }
    position.needsUpdate = true;
  }
}
