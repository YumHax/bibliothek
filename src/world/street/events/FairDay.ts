import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, seededRandom, toTexture } from '@/covers/generated/canvasUtils';
import type { Furniture } from '../../Furniture';
import { Walker } from '../../people/Walker';
import { randomLook } from '../../people/looks';
import { paint } from '../../materials/palette';
import { TriBuilder } from '../relief/TriBuilder';
import { distanceFade } from '../life/fade';
import { snowCovered } from '../snowCover';
import { FAIR_DAY, FRONT, type Vec2 } from '../streetPlan';

export interface FairDayOptions {
  /** The camera: the waiting people face and fade by it. */
  viewer: THREE.Object3D;
  /** Places a walker in the zone (ticked, clickable, seen by the pigeons), zone-local. */
  place: (walker: Walker, at: THREE.Vector3) => void;
  /** What the people waiting say when clicked (the street's talk). */
  talk: () => string;
  drawDistance: number;
  fade: number;
}

/** The bunting's flags: how far apart, their size, their colours. */
const FLAGS = { every: 0.42, width: 0.3, drop: 0.36, colours: ['#d8323a', '#f2c83a', '#2a7ac8', '#f4f0e8', '#3aa85a', '#e8702a'] };
/** What the waiting say first, before the street's talk: the Fair. */
const FAIR_LINES = ['Fair day! The good stuff goes in the first hour.', 'They say there are four extra crates at the back today.', 'Queued since eight. Worth it, every month.'];

/**
 * The Grand Flea Fair's day in the street (`FAIR_DAY`, placed only on `isBrocante` days): strings
 * of bunting slung across Front Street from building line to building line by RETRO GAMES, a cloth
 * banner over its fascia, an A-board on the pavement pointing in, and a few people waiting about
 * its door (they fade with distance like the crowd, and talk about the Fair). The bunting and the
 * banner are one painted mesh and one textured plane; nothing collides but the board.
 */
export class FairDay extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[] = [];
  private readonly people: Walker[] = [];
  private readonly eye = new THREE.Vector3();
  private readonly spot = new THREE.Vector3();

  constructor(private readonly options: FairDayOptions) {
    super();
    this.name = 'FairDay';
    const random = seededRandom(1313);
    const painted = new TriBuilder();
    const identity = new THREE.Matrix4();
    // The bunting: a sagging line across the street, a triangle flag hanging from it every so often.
    const { xs, height, sag } = FAIR_DAY.bunting;
    for (const x of xs) {
      const z0 = FRONT.ourLine + 0.05;
      const z1 = FRONT.farLine - 0.05;
      const yAt = (t: number): number => height - sag * 4 * t * (1 - t);
      for (let z = z0, i = 0; z < z1 - FLAGS.width; z += FLAGS.every, i++) {
        const t0 = (z - z0) / (z1 - z0);
        const t1 = (z + FLAGS.width - z0) / (z1 - z0);
        const tm = (t0 + t1) / 2;
        const colour = FLAGS.colours[(i + Math.floor(random() * 2)) % FLAGS.colours.length]!;
        painted.quad(identity, [x, yAt(t0), z], [x, yAt(t1), z + FLAGS.width], [x, yAt(tm) - FLAGS.drop, z + FLAGS.width / 2], [x, yAt(tm) - FLAGS.drop, z + FLAGS.width / 2], colour, true);
      }
      // The line itself.
      const steps = 24;
      for (let k = 0; k < steps; k++) {
        const za = z0 + ((z1 - z0) * k) / steps;
        const zb = z0 + ((z1 - z0) * (k + 1)) / steps;
        const ya = yAt(k / steps);
        const yb = yAt((k + 1) / steps);
        painted.quad(identity, [x, ya + 0.008, za], [x, yb + 0.008, zb], [x, yb - 0.008, zb], [x, ya - 0.008, za], '#e8e4d8', true);
      }
    }
    const bunting = new THREE.Mesh(painted.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
    bunting.castShadow = false;
    this.add(bunting);

    // The banner over RETRO GAMES' fascia.
    const { banner, board } = FAIR_DAY;
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(banner.width, banner.height), new THREE.MeshStandardMaterial({ map: bannerTexture(), roughness: 0.9 }));
    cloth.position.set(...banner.at);
    cloth.rotation.y = banner.yaw;
    this.add(cloth);

    // The A-board: two painted leaves leaning together.
    const face = new THREE.MeshStandardMaterial({ map: boardTexture(), roughness: 0.7 });
    const frame = paint(0x3a2a1e, 0.7);
    const aBoard = new THREE.Group();
    for (const side of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.85, 0.025), [frame, frame, frame, frame, face, face]);
      leaf.position.set(0, 0.42, side * 0.14);
      leaf.rotation.x = side * 0.17;
      leaf.castShadow = true;
      aBoard.add(leaf);
    }
    aBoard.position.set(board.at[0], 0, board.at[1]);
    aBoard.rotation.y = board.yaw;
    this.add(aBoard);
    this.colliders.push(new THREE.Box3(new THREE.Vector3(board.at[0] - 0.35, 0, board.at[1] - 0.35), new THREE.Vector3(board.at[0] + 0.35, 1, board.at[1] + 0.35)));
    snowCovered(face);

    // People waiting about the door.
    let line = 0;
    FAIR_DAY.waiting.forEach((spot, i) => {
      const person = new Walker({ viewer: options.viewer, seed: 1401 + i * 17, look: randomLook(1401 + i * 17), talk: () => (line < FAIR_LINES.length ? FAIR_LINES[line++]! : options.talk()), label: 'Waiting for the Fair', fade: true, labelWithin: 4 });
      options.place(person, at(spot.at));
      person.stand(spot.yaw, i % 2 ? 'crossed' : 'pockets', 'viewer');
      this.people.push(person);
    });
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(): void {
    this.options.viewer.getWorldPosition(this.eye);
    for (const person of this.people) {
      person.getWorldPosition(this.spot);
      person.setFade(distanceFade(this.eye.distanceTo(this.spot), this.options.drawDistance, this.options.fade));
    }
  }
}

function at([x, z]: Vec2): THREE.Vector3 {
  return new THREE.Vector3(x, 0, z);
}

/** The banner: GRAND FLEA FAIR TODAY on red cloth, a gold edge. */
function bannerTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(1024, 84);
  ctx.fillStyle = '#b8201e';
  ctx.fillRect(0, 0, 1024, 84);
  ctx.strokeStyle = '#f0c94a';
  ctx.lineWidth = 6;
  ctx.strokeRect(5, 5, 1014, 74);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 50px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('GRAND FLEA FAIR TODAY', 512, 44, 980);
  return toTexture(canvas, 'facing');
}

/** The A-board's face: the Fair, through RETRO GAMES to the hall. */
function boardTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(192, 272);
  ctx.fillStyle = '#20262a';
  ctx.fillRect(0, 0, 192, 272);
  ctx.fillStyle = '#f2ecd8';
  ctx.textAlign = 'center';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillText('GRAND', 96, 52);
  ctx.fillText('FLEA FAIR', 96, 84, 180);
  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = '#f0c94a';
  ctx.fillText('TODAY', 96, 130);
  ctx.fillStyle = '#f2ecd8';
  ctx.font = '18px sans-serif';
  ctx.fillText('through', 96, 176);
  ctx.fillText('RETRO GAMES', 96, 200, 180);
  ctx.font = 'bold 34px sans-serif';
  ctx.fillText('→', 96, 246);
  return toTexture(canvas, 'facing');
}
