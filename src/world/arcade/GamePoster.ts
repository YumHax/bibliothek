import * as THREE from 'three';
import { boxMesh } from '../meshUtils';
import { Prop } from '../props/Prop';
import { paint } from '../materials/palette';
import { layMesh, WALL } from '../surface/layers';
import { type PosterSpec, paintArcadePoster } from './posterArt';
import { CRAB, SQUID } from './games/Invaders';
import { FROG_SPRITE } from './games/LeapFrog';
import { ROCK_BIG, STAR } from './games/Comets';

/** The hall's own games on its walls: one one-sheet each, the hero blown up from the game's sprite. */
const POSTERS = {
  invaders: {
    title: ['STAR', 'RAID'],
    tagline: 'THEY COME IN WAVES',
    small: 'FIFTEEN SECONDS · HOLD FIRE · CHAIN THE KILLS',
    sky: ['#05081a', '#1a2a6a', '#63b3ff'],
    sun: ['#9ad6ff', '#ff5f5f'],
    hero: { sprite: SQUID, inks: { x: '#ff5f5f' }, scale: 9 },
    swarm: { sprite: CRAB, inks: { x: '#ff7ad9' }, scale: 3, count: 7 },
  },
  frog: {
    title: ['LEAP', 'FROG'],
    tagline: 'MIND THE TRAFFIC',
    small: 'HOP · RIDE THE LOGS · GET HOME',
    sky: ['#06140c', '#14462e', '#7ee787'],
    sun: ['#ffe066', '#39ff9e'],
    hero: { sprite: FROG_SPRITE, inks: { x: '#39ff9e', d: '#1f6f5a', w: '#ffffff', k: '#060a12' }, scale: 10, frame: 1 },
  },
  comets: {
    title: ['COMET', 'DASH'],
    tagline: 'CATCH THE STARS',
    small: 'DODGE THE ROCKS · FIFTEEN SECONDS',
    sky: ['#070512', '#2a1a4a', '#ff8a3a'],
    sun: ['#ffe066', '#ff8a3a'],
    hero: { sprite: ROCK_BIG, inks: { x: '#8a6a5a', o: '#5a4238' }, scale: 8 },
    swarm: { sprite: STAR, inks: { x: '#ffe066', o: '#ffffff' }, scale: 3, count: 6 },
  },
} satisfies Record<string, PosterSpec>;

/** The black frame's depth off the wall. */
const FRAME_T = 0.018;

export interface GamePosterOptions {
  /** Which game's one-sheet. */
  game?: keyof typeof POSTERS;
  width?: number;
  height?: number;
}

/**
 * A framed one-sheet for one of the hall's own games (STAR RAID, LEAP FROG, COMET DASH), on the
 * arcade's walls: the same printing as the prize poster (`arcade/posterArt`), in a black frame.
 * Wall-hung: origin at its centre on the wall, +z into the room. Decoration: never collides.
 */
export class GamePoster extends Prop {
  constructor(options: GamePosterOptions = {}) {
    super();
    const game = options.game ?? 'invaders';
    this.name = `GamePoster:${game}`;
    const width = options.width ?? 0.42;
    const height = options.height ?? 0.6;
    this.add(boxMesh(width + 0.03, height + 0.03, FRAME_T, paint(0x111114, 0.4), { z: FRAME_T / 2 }));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshStandardMaterial({ map: paintArcadePoster(POSTERS[game]), roughness: 0.35 }));
    face.position.z = FRAME_T + WALL.framed.lift;
    layMesh(face, WALL.framed);
    this.add(face);
  }
}
