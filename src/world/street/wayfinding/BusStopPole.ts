import * as THREE from 'three';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import { invisibleHitbox } from '../../meshUtils';
import { paint } from '../../materials/palette';
import { snowPaint } from '../snowCover';

export interface BusStopPoleOptions {
  line: string;
  /** Where it goes (the destination board's words), and where the player can ride to. */
  towards: string;
  stops: string;
  fare: number;
  /** Game minutes between two buses by day and at night (`STREET_PLAN.bus`). */
  every: number;
  nightEvery: number;
  /** Real seconds till the next bus stands at the stop (`StreetBus.dueIn`). */
  dueIn: () => number;
  dayNight: DayNight;
}

const POLE = { height: 2.9, radius: 0.04 };
const FLAG = { y: 2.55, radius: 0.24 };
const TABLE = { y: 1.45, width: 0.34, height: 0.48 };

/**
 * The bus stop's pole by the shelter: the round flag (BUS and the line's number) at the top, the
 * timetable in its case at eye height. Clicked, it reads the timetable: where line 38 goes, how
 * often by day and at night, roughly when the next one is due, the fare (paid on the bus while its
 * doors stand open). The pole collides.
 */
export class BusStopPole extends THREE.Group implements Furniture, Interactable {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[];
  readonly hitboxes: THREE.Object3D[];

  constructor(private readonly options: BusStopPoleOptions) {
    super();
    this.name = 'BusStopPole';
    const metal = snowPaint(0x6a6e72, 0.4);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(POLE.radius, POLE.radius, POLE.height, 10).translate(0, POLE.height / 2, 0), metal);
    pole.castShadow = true;
    const flagMap = flagTexture(options.line);
    const flag = new THREE.Mesh(new THREE.CylinderGeometry(FLAG.radius, FLAG.radius, 0.02, 32).rotateX(Math.PI / 2), [paint(0xe8e6e0, 0.5), new THREE.MeshStandardMaterial({ map: flagMap, roughness: 0.4 }), new THREE.MeshStandardMaterial({ map: flagMap, roughness: 0.4 })]);
    flag.position.set(0, FLAG.y, 0);
    flag.rotation.y = Math.PI / 2;
    flag.castShadow = true;
    const table = new THREE.Mesh(new THREE.BoxGeometry(TABLE.width, TABLE.height, 0.04), [metal, metal, metal, metal, new THREE.MeshStandardMaterial({ map: tableTexture(options), roughness: 0.3 }), metal]);
    table.position.set(0, TABLE.y, POLE.radius + 0.02);
    this.add(pole, flag, table);
    this.colliders = [new THREE.Box3(new THREE.Vector3(-0.1, 0, -0.1), new THREE.Vector3(0.1, 2, 0.1))];
    const hitbox = invisibleHitbox(0.5, POLE.height, 0.4, { y: POLE.height / 2 });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(): void {
    // The caption says it.
  }

  label(): string {
    return `Bus stop · line ${this.options.line} timetable`;
  }

  activate(session: SessionActions): void {
    const { line, towards, stops, fare, every, nightEvery, dueIn, dayNight } = this.options;
    // Real seconds to game minutes at the day's length.
    const gameMinutes = (dueIn() / dayNight.dayLength) * 24 * 60;
    const due = gameMinutes < 2 ? 'One is at the stop, or nearly.' : `The next one is due in about ${Math.round(gameMinutes / 5) * 5} minutes.`;
    const text = [
      `Line ${line} to ${towards}, calling at ${stops}.`,
      `A bus about every ${every} minutes by day, every ${nightEvery} at night.`,
      due,
      `Fare: ${fare} coins, paid to the driver while the doors are open.`,
    ].join('\n');
    session.read({ title: `Bus ${line} · timetable`, text, look: 'note' });
  }
}

/** The stop's flag: a white disc with a red ring, BUS and the line's number. */
function flagTexture(line: string): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(128, 128);
  ctx.fillStyle = '#f4f2ea';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#c8201a';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#1a3a7a';
  ctx.fillRect(10, 50, 108, 28);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('BUS', 64, 65);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(line, 64, 100);
  return toTexture(canvas, 'facing');
}

/** The timetable in its case: the line, its stops, how often. */
function tableTexture({ line, towards, stops, every, nightEvery, fare }: BusStopPoleOptions): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(192, 272);
  ctx.fillStyle = '#f6f4ee';
  ctx.fillRect(0, 0, 192, 272);
  ctx.fillStyle = '#1a3a7a';
  ctx.fillRect(0, 0, 192, 44);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${line}`, 12, 30);
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText(towards.toUpperCase(), 52, 28, 132);
  ctx.fillStyle = '#1a1a1a';
  ctx.font = '12px sans-serif';
  const lines = [`via ${stops}`, '', `Day: every ${every} min`, `Night: every ${nightEvery} min`, '', `Fare ${fare} coins`, 'Pay the driver'];
  lines.forEach((text, i) => ctx.fillText(text, 12, 70 + i * 20, 170));
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  for (let y = 210; y < 262; y += 8) {
    ctx.beginPath();
    ctx.moveTo(12, y);
    ctx.lineTo(180, y);
    ctx.stroke();
  }
  return toTexture(canvas, 'facing');
}
