import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import { ShutDoor } from '../props/ShutDoor';
import { placeAirlock } from '../airlock';
import { Prop } from '../props/Prop';
import { invisibleHitbox } from '../meshUtils';
import { Staircase } from './Staircase';
import { Lift } from './Lift';
import { StairLights } from './StairLights';
import { STAIRWELL_PLAN as plan, STOREYS, landingY } from './stairwellPlan';
import { Neighbours } from './Neighbours';
import { Postman } from './Postman';
import { doorKey, type BuildingServices } from './building';
import type { TradeOffer } from '@/economy/NeighbourTrades';
import type { MailPiece } from '../props/MailDrop';
import { playKnock } from '@/audio/doorbell';

/** What the stairwell tells the rest: how lit it is, what the feet walk on, and the floor's height anywhere (world). */
export interface StairwellHandle extends ZoneHandle {
  ground: (x: number, z: number, feet: number) => number;
}

const NEIGHBOUR_LINES = ['A TV behind the door, loud.', 'A dog barks once, then thinks better of it.', 'Someone is practising the piano. Badly.', 'Nobody answers.', 'It smells of onions frying.', 'You hear laughter, and a game show.'];

/**
 * Builds the stairwell into its zone from `STAIRWELL_PLAN`: the staircase (walls, landings, ten
 * flights, the balustrade, our landing's strip, the entrance hall), the lift in the well with its
 * buttons, the lights (globes on every landing, two real lights following the player, the
 * skylight), the neighbours' doors and the floors' names on every landing, the residents met on the
 * stairs and the postman (with `building`: the mail orders, the swaps at the doors), the mailboxes and the
 * sas at the street door (one twin of `world/airlock`: the street is not under the flat, its twin
 * behind our door on Front Street is, to the eye), and the portal back to the hallway. Returns the ground height function the
 * player walks the stairs on (`FirstPersonController.setGround`), the light level and the stone
 * under the feet.
 */
export function furnishStairwell(zone: Zone, { sky, listener, acoustics, building }: BuildContext): StairwellHandle {
  const origin = new THREE.Vector3();
  const stairs = zone.place(new Staircase(), origin);
  const lift = zone.place(new Lift({ collisions: zone.collisions, listener }), origin);
  for (const button of lift.buttons) zone.place(button, button.position.clone(), button.rotation.y);
  const lights = zone.place(new StairLights(sky.dayNight, { viewer: listener }), origin);

  // The landings: the floor's name by the stairs, the neighbours' doors on the north wall (on ours, one: the other is the flat's).
  const { shaft, floorLanding, frontDoor, strip } = plan;
  for (let k = 0; k <= STOREYS; k++) {
    const y = landingY(k);
    zone.place(new FloorName(plan.floorNames[k]!), new THREE.Vector3(shaft.x0 + 0.01, y + 1.55, (floorLanding.z0 + floorLanding.z1) / 2), Math.PI / 2);
    if (k === STOREYS) {
      zone.place(new NeighbourDoor('The cellars', 'Locked. It always is.', 'panelled'), new THREE.Vector3(plan.doorX[0], y, floorLanding.z1 - 0.005), Math.PI);
      continue;
    }
    const names = k === 0 ? [plan.ourNeighbour] : plan.neighbours[k - 1]!;
    names.forEach((name, i) => {
      const x = k === 0 ? plan.ourNeighbourX : plan.doorX[i]!;
      const door = new NeighbourDoor(`${name} · ${plan.floorNames[k]}`, NEIGHBOUR_LINES[(k * 2 + i) % NEIGHBOUR_LINES.length]!, 'panelled', { key: doorKey(k, i), building });
      zone.place(door, new THREE.Vector3(x, y, floorLanding.z1 - 0.005), Math.PI);
    });
  }

  // The people on the stairs: the residents going out and coming home, the postman with the mail orders (see `building`).
  const walkOn = (x: number, z: number, feet: number) => stairs.floorAt(x, z, feet);
  const neighbours = zone.place(new Neighbours({ viewer: listener, hours: () => sky.dayNight.state.hours, ground: walkOn, trades: building?.trades }), origin);
  for (const walker of neighbours.walkers) zone.place(walker, walker.position.clone());
  if (building?.post) {
    const bell = zone.toWorld(new THREE.Vector3(strip.x0 - 0.6, landingY(0) + 1.6, frontDoor.z));
    const postman = zone.place(new Postman({ viewer: listener, post: building.post, doorstep: building.doorstep, ground: walkOn, acoustics, bell }), origin);
    zone.place(postman.walker, postman.walker.position.clone());
  }
  // A neighbour's swap comes as a note under the flat's door.
  const trades = building?.trades;
  if (trades) zone.onUnload(trades.onOffer((offer) => building.doorstep.slipNote(tradeNote(offer))));

  // The entrance hall: the mailboxes, and the sas at the street door: its twin stands behind our door on Front Street,
  // and going through it is walked, not travelled (`world/airlock`).
  const { streetDoor, mailboxes } = plan;
  zone.place(new Mailboxes(), new THREE.Vector3(mailboxes.x, 1.05, mailboxes.z), Math.PI / 2);
  placeAirlock(zone, new THREE.Vector3(streetDoor.at[0], 0, streetDoor.at[1]), 0, { twin: 'hall', collisions: zone.collisions, viewer: listener });

  // The portal back into the flat through its front door (the hallway hangs the door; seen through, it is always drawn).
  const top0 = landingY(0);
  const doorway = new THREE.Box3(
    new THREE.Vector3(strip.x0 - 0.15, top0, frontDoor.z - frontDoor.width / 2),
    new THREE.Vector3(strip.x0 + 0.15, top0 + frontDoor.height, frontDoor.z + frontDoor.width / 2),
  ).applyMatrix4(zone.group.matrixWorld);
  zone.addPortal({ to: 'hallway', bounds: doorway });

  const at = new THREE.Vector3();
  const local = new THREE.Vector3();
  const floorY = zone.group.position.y;
  return {
    lightLevel: () => lights.lightLevel(),
    surfaceAt: () => 'tiles',
    ground: (x, z, feet) => {
      local.copy(at.set(x, feet, z));
      zone.group.worldToLocal(local);
      const inCar = lift.floorAt(local.x, local.z, local.y);
      const onStairs = inCar ?? stairs.floorAt(local.x, local.z, local.y);
      // Nowhere on the stairs (the flat, the street, anywhere else): the feet stay where they are.
      return onStairs === null ? feet : onStairs + floorY;
    },
  };
}

/** A neighbour's door on a landing: a shut door with a name to it, and a line when knocked on. */
class NeighbourDoor extends ShutDoor implements Interactable {
  readonly hitboxes: THREE.Object3D[];

  constructor(
    private readonly who: string,
    private readonly line: string,
    style: 'panelled' | 'glazed',
    /** Whose door it is to the swaps (`doorKey`), and the building's services the swap goes through. */
    private readonly resident: { key: string; building?: BuildingServices } | null = null,
  ) {
    super({ style, mat: false });
    this.name = 'NeighbourDoor';
    const hitbox = invisibleHitbox(0.95, 2.1, 0.1, { y: 1.05, z: 0.03 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
  }

  setHovered(): void {
    // The caption says whose it is.
  }

  label(): string {
    return this.offer() ? `${this.who}: click to knock (the swap)` : this.who;
  }

  activate(session: SessionActions): void {
    const offer = this.offer();
    const panel = this.resident?.building?.tradePanel;
    if (!offer) {
      session.hint(this.line);
      return;
    }
    playKnock(3, 0.35);
    if (!panel) {
      session.hint(`"I'd swap my ${offer.gives.title} for your ${offer.wants.title}, if you like." (${offer.who})`);
      return;
    }
    panel.prepare(offer);
    session.openPanel(panel);
  }

  private offer(): TradeOffer | null {
    const key = this.resident?.key;
    return key ? (this.resident?.building?.trades?.offerAt(key) ?? null) : null;
  }
}

/** The note a neighbour slips under the flat's door about their swap. */
function tradeNote(offer: TradeOffer): MailPiece {
  return {
    title: `${offer.who.toUpperCase()}, ${offer.floor}`,
    lines: [`Looking for ${offer.wants.title}`, `I'd swap my ${offer.gives.title} for it`, `Knock on my door on the ${offer.floor}`],
    accent: 0x3f6b4a,
  };
}

/** The floor's name painted on the wall by the stairs: 5e, 4e … RDC. */
class FloorName extends Prop {
  readonly contactShadow = false;

  constructor(name: string) {
    super();
    const [canvas, ctx] = createCanvas(128, 96);
    ctx.fillStyle = '#e6dcc6';
    ctx.fillRect(0, 0, 128, 96);
    ctx.fillStyle = '#6a2a22';
    ctx.font = 'bold 58px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, 64, 52);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.24), new THREE.MeshStandardMaterial({ map: toTexture(canvas, 2), roughness: 0.9 }));
    this.add(plate);
  }
}

/** The residents' mailboxes in the hall: a wooden cabinet of brass-framed flaps with names. */
class Mailboxes extends Prop {
  readonly contactShadow = false;

  constructor() {
    super();
    this.name = 'Mailboxes';
    const { rows, columns } = plan.mailboxes;
    const w = columns * 0.22;
    const h = rows * 0.24;
    const [canvas, ctx] = createCanvas(columns * 64, rows * 70);
    ctx.fillStyle = '#4a2c1c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const names = ['ROUX', 'MOREAU', 'LECLERC', 'NGUYEN', 'GIRARD', 'HADDAD', 'DUBOIS', 'MARTIN', 'ROSSI', '', 'CONCIERGE', ''];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const x = c * 64 + 5;
        const y = r * 70 + 5;
        ctx.fillStyle = '#c9a75b';
        ctx.fillRect(x, y, 54, 60);
        ctx.fillStyle = '#3a2216';
        ctx.fillRect(x + 4, y + 4, 46, 52);
        ctx.fillStyle = '#1a1210';
        ctx.fillRect(x + 8, y + 10, 38, 5);
        ctx.fillStyle = '#efe6d0';
        ctx.fillRect(x + 8, y + 38, 38, 12);
        ctx.fillStyle = '#2a2018';
        ctx.font = 'bold 9px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText(names[(r * columns + c) % names.length]!, x + 27, y + 48);
      }
    }
    const face = new THREE.MeshStandardMaterial({ map: toTexture(canvas, 4), roughness: 0.6 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a2c1c, roughness: 0.6 });
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), [wood, wood, wood, wood, face, wood]);
    cabinet.position.z = 0.06;
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    this.add(cabinet);
  }
}
