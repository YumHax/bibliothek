import * as THREE from 'three';
import { canvasTexture, createCanvas } from '@/graphics/canvas';
import { between, pick, seededRng, unit01, type Rng } from '@/random';
import { clamp } from '@/math/scalar';
import { cylinderMesh } from '../meshUtils';
import { paint, standard } from '../materials/palette';
import { markShared, sharedCanvasTexture } from '../materials/sharedResources';

/**
 * What turns up behind the flat's doors and in its drawers, as things to see and pick up (`FindPickup`,
 * `build/rummage`): a few coins, a fan-folded strip of arcade tickets, the lost booklet of a game, the last tenant's
 * note. Each model lies on its bottom face at its origin, its top towards -z (away from whoever opens the door), and
 * is drawn from `seed` so a find looks the same every time the door opens.
 */

const COIN_THICKNESS = 0.0022;
/** A two-tone coin's centre stands this little proud of its ring, both faces. */
const INSET_PROUD = 0.0003;
const BRASS = standard({ color: 0xc9a24a, metalness: 1, roughness: 0.32 });
const NICKEL = standard({ color: 0xc6c9cd, metalness: 1, roughness: 0.3 });
const COPPER = standard({ color: 0xb5704a, metalness: 1, roughness: 0.4 });

/** Real coins, by size: a two-tone big one (nickel ring, brass heart), its reverse, a brass one, a small brass and a copper. */
const COINS: readonly { radius: number; ring: THREE.Material; heart?: THREE.Material }[] = [
  { radius: 0.0129, ring: NICKEL, heart: BRASS },
  { radius: 0.0116, ring: BRASS, heart: NICKEL },
  { radius: 0.0121, ring: BRASS },
  { radius: 0.0099, ring: BRASS },
  { radius: 0.0106, ring: COPPER },
];

/** Clear between two coins lying side by side (m). */
const COIN_CLEARANCE = 0.001;
/** How far from the middle the coins of a handful lie apart, at most, where nothing is in the way. */
const SCATTER = 0.03;

/**
 * `count` coins lying where they were dropped: apart where there is room (within `room` of the middle, edge to edge),
 * a few stacked, never one through another.
 */
export function coinScatter(count: number, seed: string, room = SCATTER + 0.013): THREE.Group {
  const random = seededRng(`find.coins:${seed}`);
  const group = new THREE.Group();
  group.name = 'Coins';
  const laid: { x: number; z: number; radius: number; top: number }[] = [];
  for (let i = 0; i < count; i++) {
    const kind = pick(random, COINS);
    const spot = freeSpot(random, laid, kind.radius, Math.max(0, room - kind.radius)) ?? onTopOf(random, laid);
    const coin = oneCoin(kind);
    coin.position.set(spot.x, spot.y, spot.z);
    group.add(coin);
    laid.push({ x: spot.x, z: spot.z, radius: kind.radius, top: spot.y + COIN_THICKNESS });
  }
  return group;
}

function oneCoin(kind: (typeof COINS)[number]): THREE.Group {
  const coin = new THREE.Group();
  const ring = cylinderMesh(kind.radius, COIN_THICKNESS, kind.ring, { y: COIN_THICKNESS / 2 }, { segments: 20 });
  ring.castShadow = false;
  coin.add(ring);
  if (kind.heart) {
    const heart = cylinderMesh(kind.radius * 0.72, COIN_THICKNESS + 2 * INSET_PROUD, kind.heart, { y: COIN_THICKNESS / 2 }, { segments: 16 });
    heart.castShadow = false;
    coin.add(heart);
  }
  return coin;
}

/** A spot on the surface clear of every coin laid so far, its middle within `reach`, or null when a few tries find none. */
function freeSpot(random: Rng, laid: readonly { x: number; z: number; radius: number }[], radius: number, reach: number): THREE.Vector3 | null {
  for (let attempt = 0; attempt < 12; attempt++) {
    const angle = between(random, 0, Math.PI * 2);
    const distance = laid.length ? between(random, 0.3, 1) * Math.min(SCATTER, reach) : 0;
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;
    if (laid.every((c) => Math.hypot(c.x - x, c.z - z) > c.radius + radius + COIN_CLEARANCE)) return new THREE.Vector3(x, 0, z);
  }
  return null;
}

/** On one of the coins already there, a little off its middle: a small stack. */
function onTopOf(random: Rng, laid: readonly { x: number; z: number; radius: number; top: number }[]): THREE.Vector3 {
  const under = pick(random, laid);
  return new THREE.Vector3(under.x + between(random, -0.2, 0.2) * under.radius, under.top, under.z + between(random, -0.2, 0.2) * under.radius);
}

/** One fold of the strip: two tickets end to end, across x, along z. */
const FOLD = { width: 0.036, length: 0.046, thickness: 0.0005 };
/** How far a fold of the pile sits off the one under it (m). */
const FOLD_JITTER = 0.002;
const FOLD_GEOMETRY = markShared(new THREE.BoxGeometry(FOLD.width, FOLD.thickness, FOLD.length));
const TICKET_EDGE = paint(0xf08a22, 0.85);

/** Two arcade tickets, orange card with ADMIT ONE and the perforation between them: both faces of a fold. */
function ticketFace(): THREE.MeshStandardMaterial {
  const art = sharedCanvasTexture(
    'find|tickets',
    () => {
      const [canvas, ctx] = createCanvas(64, 82);
      for (let i = 0; i < 2; i++) {
        const y = i * 41;
        ctx.fillStyle = '#f39226';
        ctx.fillRect(0, y, 64, 41);
        ctx.fillStyle = '#ffd59a';
        ctx.fillRect(4, y + 4, 56, 33);
        ctx.fillStyle = '#8a3a10';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText('TICKET', 32, y + 16);
        ctx.font = 'bold 7px sans-serif';
        ctx.fillText('ADMIT ONE', 32, y + 28);
      }
      ctx.fillStyle = 'rgba(80,30,0,0.75)';
      for (let x = 1; x < 64; x += 4) ctx.fillRect(x, 40, 2, 2);
      return canvas;
    },
    { anisotropy: 'facing' },
  );
  return standard({ map: art, roughness: 0.8 });
}

/**
 * A strip of `tickets` arcade tickets folded zigzag in a loose pile, as a machine's strip is when someone stuffs it
 * in a pocket: a fold for every few tickets, each a little askew, the top one lifted off the pile.
 */
export function ticketFold(tickets: number, seed: string): THREE.Group {
  const random = seededRng(`find.tickets:${seed}`);
  const face = ticketFace();
  const materials = [TICKET_EDGE, TICKET_EDGE, face, face, TICKET_EDGE, TICKET_EDGE];
  const group = new THREE.Group();
  group.name = 'Tickets';
  const folds = clamp(Math.round(tickets / 5), 2, 6);
  // The pile, one fold on another, each nudged and turned a little.
  for (let i = 0; i < folds - 1; i++) {
    const fold = new THREE.Mesh(FOLD_GEOMETRY, materials);
    fold.position.set(between(random, -FOLD_JITTER, FOLD_JITTER), FOLD.thickness * (i + 0.5) * 1.15, between(random, -FOLD_JITTER, FOLD_JITTER));
    fold.rotation.y = between(random, -0.07, 0.07);
    fold.castShadow = false;
    group.add(fold);
  }
  // The top fold, hinged on the pile's near edge and lifted off it.
  const hinge = new THREE.Group();
  hinge.position.set(0, FOLD.thickness * (folds - 1) * 1.15, FOLD.length / 2);
  hinge.rotation.x = between(random, 0.25, 0.5);
  const top = new THREE.Mesh(FOLD_GEOMETRY, materials);
  top.position.set(0, FOLD.thickness / 2, -FOLD.length / 2);
  top.castShadow = false;
  hinge.add(top);
  group.add(hinge);
  return group;
}

const BOOKLET = { width: 0.118, thickness: 0.0035, length: 0.164 };
const PAGES = paint(0xf1ebdc, 0.9);
/** Cover colours a booklet may have, picked by its title. */
const COVERS = ['#b8322c', '#1f4f8f', '#2f7a4a', '#d9a521', '#3a3a44', '#7a3e8f'];

/** A game's instruction booklet lying closed: its cover printed with the title, pages round the edges, a little askew. */
export function booklet(title: string, seed: string): THREE.Group {
  const random = seededRng(`find.booklet:${seed}`);
  const cover = new THREE.MeshStandardMaterial({ map: coverArt(title), roughness: 0.55 });
  const back = paint(0xe8e2d2, 0.7);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(BOOKLET.width, BOOKLET.thickness, BOOKLET.length), [PAGES, PAGES, cover, back, PAGES, PAGES]);
  mesh.position.y = BOOKLET.thickness / 2;
  mesh.castShadow = false;
  const group = new THREE.Group();
  group.name = 'Booklet';
  group.add(mesh);
  group.rotation.y = between(random, -0.25, 0.25);
  return group;
}

/** The booklet's cover: a coloured band with INSTRUCTION BOOKLET, the title big under it, a box for the picture. */
function coverArt(title: string): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(128, 178);
  const colour = COVERS[Math.floor(unit01(title) * COVERS.length)]!;
  ctx.fillStyle = '#f4efe2';
  ctx.fillRect(0, 0, 128, 178);
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 128, 30);
  ctx.fillRect(0, 168, 128, 10);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText('INSTRUCTION BOOKLET', 64, 15);
  ctx.fillStyle = '#1d1d1f';
  ctx.font = 'bold 15px sans-serif';
  wrap(title, 112).slice(0, 3).forEach((line, i) => ctx.fillText(line, 64, 52 + i * 17));
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3;
  ctx.strokeRect(22, 104, 84, 56);
  return canvasTexture(canvas, { anisotropy: 'facing' });

  function wrap(text: string, width: number): string[] {
    const lines: string[] = [];
    let line = '';
    for (const word of text.toUpperCase().split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }
}

const NOTE = { width: 0.074, thickness: 0.0006, length: 0.054 };
const NOTE_GEOMETRY = markShared(new THREE.BoxGeometry(NOTE.width, NOTE.thickness, NOTE.length));

/** The last tenant's note: a page torn from a pad, folded once, a few lines in blue ink showing. */
function noteFace(): THREE.MeshStandardMaterial {
  const art = sharedCanvasTexture(
    'find|note',
    () => {
      const [canvas, ctx] = createCanvas(128, 94);
      ctx.fillStyle = '#f6f1e0';
      ctx.fillRect(0, 0, 128, 94);
      ctx.strokeStyle = 'rgba(120,150,190,0.45)';
      ctx.lineWidth = 1;
      for (let y = 18; y < 94; y += 11) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(128, y);
        ctx.stroke();
      }
      ctx.fillStyle = '#23408f';
      ctx.font = 'italic 11px serif';
      ctx.fillText('To whoever has', 8, 15);
      ctx.fillText('the flat next:', 8, 26);
      // The rest is a scrawl, too small to read from here.
      ctx.strokeStyle = '#2b4796';
      ctx.lineWidth = 1.2;
      const random = seededRng('find.note.scrawl');
      for (let row = 0; row < 5; row++) {
        const y = 37 + row * 11;
        let x = 8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        const end = row === 4 ? 70 : 118;
        while (x < end) {
          x += between(random, 3, 6);
          ctx.lineTo(x, y - between(random, 0, 4));
        }
        ctx.stroke();
      }
      ctx.fillText('— Paul', 78, 88);
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(63, 0, 2, 94);
      return canvas;
    },
    { anisotropy: 'facing' },
  );
  return standard({ map: art, roughness: 0.9 });
}

const NOTE_EDGE = paint(0xece5d0, 0.9);

/** `find` with the last tenant's note under it: the note lies flat, what was found on it. */
export function withNote(find: THREE.Object3D, seed: string): THREE.Group {
  const random = seededRng(`find.note:${seed}`);
  const face = noteFace();
  const note = new THREE.Mesh(NOTE_GEOMETRY, [NOTE_EDGE, NOTE_EDGE, face, NOTE_EDGE, NOTE_EDGE, NOTE_EDGE]);
  note.position.y = NOTE.thickness / 2;
  note.rotation.y = between(random, -0.3, 0.3);
  note.castShadow = false;
  const group = new THREE.Group();
  group.name = 'WithNote';
  group.add(note);
  find.position.set(between(random, -0.01, 0.01), NOTE.thickness, between(random, -0.01, 0.01));
  group.add(find);
  return group;
}

