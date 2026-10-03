import * as THREE from 'three';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { PIXEL_FONT } from '../arcade/games/ArcadeGame';
import { SCREEN_HEIGHT, SCREEN_TILT, SCREEN_WIDTH, SCREEN_Y, SCREEN_Z, buildCabinetBody } from '../arcade/cabinetModel';
import { HOME_GAME_IDS, HOME_TITLE } from './HomeArcadeGames';

/** The home cabinet's paint: a restored upright in oxblood, a warm marquee (the flat's light is warm). */
export const HOME_CABINET = { color: 0x6b2a2a, glow: 0xffb36b, wear: 0.25 } as const;

/**
 * The home cabinet as a still model (the TV repair shop's display, its till's thumbnail): the hall's cabinet body in
 * the home paint, its glass showing the 7-in-1 title card, switched on in the shop. No light, no screen to run;
 * origin on the floor at the base's centre, +z the player's side, like `ArcadeCabinet`.
 */
export function homeArcadeModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'HomeArcadeModel';
  buildCabinetBody(g, { ...HOME_CABINET, title: HOME_TITLE, hint: 'Up / down pick a game, fire plays it', twoPlayer: true });
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(SCREEN_WIDTH, SCREEN_HEIGHT), new THREE.MeshBasicMaterial({ map: titleCard(), toneMapped: false }));
  glass.position.set(0, SCREEN_Y, SCREEN_Z);
  glass.rotation.x = -SCREEN_TILT;
  g.add(glass);
  return g;
}

/** The board's title card, as the cabinet shows it idle. */
function titleCard(): THREE.Texture {
  const W = 320;
  const H = 240;
  const [canvas, ctx] = createCanvas(W, H);
  ctx.fillStyle = '#07070c';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff2a8';
  ctx.font = `bold 20px ${PIXEL_FONT}`;
  ctx.fillText(HOME_TITLE, W / 2, 60);
  ctx.fillStyle = '#9ad6ff';
  ctx.font = `bold 8px ${PIXEL_FONT}`;
  ctx.fillText(`${HOME_GAME_IDS.length} GAMES · FREE PLAY`, W / 2, 92);
  ctx.fillStyle = '#ff8a80';
  ctx.font = `bold 12px ${PIXEL_FONT}`;
  ctx.fillText('PRESS FIRE', W / 2, 180);
  return toTexture(canvas, 'facing');
}
