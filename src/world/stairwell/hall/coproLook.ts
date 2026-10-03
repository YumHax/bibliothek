import * as THREE from 'three';
import { coproChoice, onCoproChange } from '@/building/coproState';
import type { Zone } from '../../zone/Zone';
import { Plant, type PlantKind } from '../../props/Plant';
import { Doormat } from '../../props/Doormat';
import { Prop, part } from '../../props/Prop';
import { METAL, paint, standard } from '../../materials/palette';
import { createCanvas, toTexture } from '@/graphics/canvas';
import type { Staircase } from '../Staircase';
import { StairRunner } from '../StairRunner';
import { Bicycle } from './Bicycle';
import { STAIRWELL_PLAN as plan, STOREY, STOREYS, landingY } from '../stairwellPlan';

const PLANTS: readonly PlantKind[] = ['fig', 'monstera', 'yucca', 'small', 'fig'];
const BIKE_COLOURS = [0x2f5a8a, 0x8a2f2a];

/**
 * The stairwell as the co-owners voted it (`building/coproState`): the walls' paint and the runner on the flights, a
 * plant on every half landing, bicycles along the hall's wall, a gilt mirror, a doormat at the sas, the fibre's
 * junction box, the lift's overhaul plate. Everything is built once and shown or hidden (no light in any of it), and it
 * follows each meeting's outcome the moment it is tallied. Returns the unsubscribe.
 */
export function placeCoproLook(zone: Zone, stairs: Staircase): () => void {
  const runner = zone.place(new StairRunner(coproChoice('runner')), new THREE.Vector3());
  const { hall, coproLook: look, shaft } = plan;
  const plants = PLANTS.slice(0, STOREYS).map((kind, k) =>
    zone.place(new Plant({ kind, seed: 40 + k, collides: false, scale: kind === 'small' ? 1.6 : 0.85 }), new THREE.Vector3(look.plant.x, landingY(k) - STOREY / 2, look.plant.z), k * 1.3),
  );
  const bikes = look.bikes.map(([x, z], i) => zone.place(new Bicycle(BIKE_COLOURS[i % BIKE_COLOURS.length]!, -0.12), new THREE.Vector3(x, 0, z), 0));
  const mirror = zone.place(new HallMirror(look.mirror.width, look.mirror.height), new THREE.Vector3(hall.x0 + 0.004, look.mirror.y, look.mirror.z), Math.PI / 2);
  const mat = zone.place(new Doormat({ width: 0.95, depth: 0.55, text: 'WELCOME', wear: 0.35, seed: 9 }), new THREE.Vector3(plan.streetDoor.at[0], 0, look.doormat.z), 0);
  const fibre = zone.place(new FibreBox(), new THREE.Vector3(hall.x0 + 0.004, look.fibre.y, look.fibre.z), Math.PI / 2);
  const plaque = zone.place(new Plaque('LIFT OVERHAULED', 'by vote of the co-owners'), new THREE.Vector3(look.liftPlaque.x, landingY(STOREYS) + look.liftPlaque.y, shaft.z1 - 0.004), Math.PI);
  const apply = (): void => {
    stairs.setPaint(coproChoice('paint'));
    const style = coproChoice('runner');
    runner.setStyle(style);
    stairs.setRunner(style !== 'none');
    for (const p of plants) p.visible = coproChoice('plants') === 'yes';
    for (const b of bikes) b.visible = coproChoice('bikes') === 'yes';
    mirror.visible = coproChoice('mirror') === 'yes';
    mat.visible = coproChoice('doormat') === 'yes';
    fibre.visible = coproChoice('fibre') === 'yes';
    plaque.visible = coproChoice('lift') === 'overhaul';
  };
  apply();
  return onCoproChange(apply);
}

/** A tall mirror in a gilt frame (it shows the scene's environment, no reflection pass). Wall-hung, origin at its middle, +z out. */
class HallMirror extends Prop {
  readonly contactShadow = false;

  constructor(width: number, height: number) {
    super();
    this.name = 'HallMirror';
    const gilt = METAL.agedBrass();
    const f = 0.06;
    part(this, width + 2 * f, f, 0.04, gilt, { y: height / 2 + f / 2, z: 0.02 });
    part(this, width + 2 * f, f, 0.04, gilt, { y: -height / 2 - f / 2, z: 0.02 });
    part(this, f, height, 0.04, gilt, { x: -width / 2 - f / 2, z: 0.02 });
    part(this, f, height, 0.04, gilt, { x: width / 2 + f / 2, z: 0.02 });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(width, height), standard({ color: 0xd6dde2, metalness: 1, roughness: 0.05 }));
    glass.position.z = 0.012;
    this.add(glass);
    this.traverse((o) => (o.castShadow = false));
  }
}

/** The fibre's junction box on the hall's wall, its cable running up the corner to the shaft. Wall-hung, origin at its middle. */
class FibreBox extends Prop {
  readonly contactShadow = false;

  constructor() {
    super();
    this.name = 'FibreBox';
    const grey = paint(0xd8d8d2, 0.5);
    part(this, 0.3, 0.38, 0.09, grey, { z: 0.045 });
    part(this, 0.016, 0.85, 0.016, paint(0xeeeeea, 0.5), { x: 0.1, y: 0.19 + 0.425, z: 0.012 });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.05), new THREE.MeshBasicMaterial({ map: textTexture('FIBRE', '#2a7a3a', '#ffffff') }));
    label.position.set(0, 0.1, 0.091);
    this.add(label);
    this.traverse((o) => (o.castShadow = false));
  }
}

/** A small engraved plate on the wall. Wall-hung, origin at its middle, +z out. */
class Plaque extends Prop {
  readonly contactShadow = false;

  constructor(line: string, under: string) {
    super();
    this.name = 'Plaque';
    const [canvas, ctx] = createCanvas(320, 120);
    ctx.fillStyle = '#c9a75b';
    ctx.fillRect(0, 0, 320, 120);
    ctx.strokeStyle = 'rgba(60,40,16,0.6)';
    ctx.lineWidth = 4;
    ctx.strokeRect(6, 6, 308, 108);
    ctx.fillStyle = '#3a2812';
    ctx.textAlign = 'center';
    ctx.font = 'bold 32px Georgia, serif';
    ctx.fillText(line, 160, 56, 290);
    ctx.font = 'italic 22px Georgia, serif';
    ctx.fillText(under, 160, 92, 290);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.09), new THREE.MeshStandardMaterial({ map: toTexture(canvas, 'facing'), metalness: 0.6, roughness: 0.35 }));
    this.add(plate);
  }
}

/** Bold white `text` on a coloured label. */
function textTexture(text: string, ground: string, ink: string): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(160, 50);
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, 160, 50);
  ctx.fillStyle = ink;
  ctx.font = 'bold 32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 80, 27, 150);
  return toTexture(canvas, 'facing');
}
