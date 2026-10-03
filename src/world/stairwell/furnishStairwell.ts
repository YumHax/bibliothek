import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Zone } from '../zone/Zone';
import type { BuildContext, ZoneHandle } from '../buildContext';
import { ShutDoor } from '../props/ShutDoor';
import { placeAirlock } from '../airlock';
import { Prop } from '../props/Prop';
import { HoverGlint } from '../props/hoverGlint';
import { METAL, paint } from '../materials/palette';
import { invisibleHitbox } from '../meshUtils';
import { Staircase } from './Staircase';
import { placeHallLife } from './hall/hallLife';
import { coproChoice } from '@/building/coproState';
import { Lift } from './Lift';
import { StairLights } from './StairLights';
import { STAIRWELL_PLAN as plan, STOREYS, landingY } from './stairwellPlan';
import { Neighbours } from './Neighbours';
import { Postman } from './Postman';
import { doorKey, type BuildingServices } from './building';
import type { TradeOffer } from '@/economy/NeighbourTrades';
import type { MailPiece } from '../props/MailDrop';
import { playKnock } from '@/audio/doorbell';
import { playHingeCreak } from '@/audio/furnitureSounds';
import type { Updatable } from '@/core/Engine';
import type { AmbientVoice } from '@/audio/ambient';
import { proximityVolume } from '@/video/proximityVolume';
import { pointSound } from '../build/hearing';
import { StairWindows } from './StairWindows';
import { OurMailbox } from './hall/OurMailbox';
import { mailFor } from '../hallway/mail';
import { wakefulnessAt } from '@/time/wakefulness';
import { DoorDog, DoorPiano, DoorTelevision, HallTone, StreetBehindDoor, playNeighbourDoor, whileHome } from './stairSounds';
import { placeRouxLanding } from '../annex/RouxLanding';
import { movedOut, movingLine, rouxPhase } from '@/building/rouxMove';
import { RemovalLift, removalHours } from './RemovalLift';
import { huntSays } from '@/building/hunt/huntSays';
import { doorVisit, type DoorVisit } from '../neighbourFlat/visits';
import { placeEstateSale } from '../estateSale/placeEstateSale';
import { placeNoiseAndCatWays, type StairLife } from './noiseAndCat';
import { befriend } from '@/building/friendship';
import { buildingWindowLife, followRival } from '@/building/rearWindows';
import { placeCourtyardDoor } from '../courtyard/courtyardDoor';
import { placeDownAndDark, type DownAndDark } from './downAndDark';
import { cellarDoor } from '../cellar/CellarDoor';

/** A chat with a resident on the stairs counts this much for the friendship (once a game day). */
const STAIR_CHAT_FRIENDSHIP = 10;

/** What the stairwell tells the rest: how lit it is, what the feet walk on, and the floor's height anywhere (world). */
export interface StairwellHandle extends ZoneHandle {
  ground: (x: number, z: number, feet: number) => number;
  /** What the cat's outings need of the stairs (`noiseAndCat`); null without the building's doorstep. */
  life: StairLife | null;
  /** How the endless stairs move the player up a storey (`downAndDark`, wired in `bootstrap/world.ts`). */
  connectPlayer: DownAndDark['connectPlayer'];
}

type DoorLife = (typeof plan.doors)[number][number];

/** What is heard behind a door while its neighbour is home (`STAIRWELL_PLAN.doors`' `sound`). */
function voiceOf(sound: NonNullable<DoorLife['sound']>): AmbientVoice {
  switch (sound.voice) {
    case 'tv':
      return new DoorTelevision();
    case 'dog':
      return new DoorDog();
    case 'piano':
      return new DoorPiano();
  }
}

/**
 * Builds the stairwell into its zone from `STAIRWELL_PLAN`: the staircase (walls, landings, ten
 * flights, the balustrade, our landing's strip, the entrance hall), the lift in the well with its
 * buttons, the lights (a timer globe on every landing, two real lights following the lit ones
 * nearest the player, the skylight), the courtyard windows of the half landings, the neighbours'
 * doors and the floors' names on every landing, what is heard (the hall's air, the neighbours who are
 * in behind their doors, the street behind its door), the residents met on the stairs, riding the
 * lift when it is free, and the postman (with `building`: the mail orders, the swaps at the doors), the mailboxes and the
 * sas at the street door (one twin of `world/airlock`: the street is not under the flat, its twin
 * behind our door on Front Street is, to the eye), and the portal back to the hallway. Returns the ground height function the
 * player walks the stairs on (`FirstPersonController.setGround`), the light level and the stone
 * under the feet.
 */
export function furnishStairwell(zone: Zone, { sky, listener, acoustics, building, home, today, covers, money, collection, market, arcade, story }: BuildContext): StairwellHandle {
  const ctxHearing = { listener, acoustics };
  const origin = new THREE.Vector3();
  const stairs = zone.place(new Staircase(coproChoice('paint')), origin);
  const lift = zone.place(new Lift({ collisions: zone.collisions, listener }), origin);
  for (const button of lift.buttons) zone.place(button, button.position.clone(), button.rotation.y);
  const lights = zone.place(new StairLights(sky.dayNight, { viewer: listener }), origin);
  // Through the courtyard windows, the building's lit windows follow its residents and the lives across the yard (`building/rearWindows`).
  const windowLife = buildingWindowLife({ day: () => today.gameDay, hours: () => sky.dayNight.state.hours });
  // The trader's window across the courtyard follows what he really took (`economy/rivalCollector`, read only).
  const rival = market.lots?.rival;
  if (rival) followRival(() => rival.view().took);
  zone.place(new StairWindows({ dayNight: sky.dayNight, outdoors: sky.outdoors, viewer: listener as THREE.Camera, windowLife }), origin);
  // Mrs Roux's move: the agency's sign on her door, the removal men's boxes on our landing (`world/annex`).
  placeRouxLanding(zone, { today, home, building });
  // Her removal men take the lift down and up on her moving day, in their hours: it is busy now and then.
  zone.place(new RemovalLift({ lift, atWork: () => rouxPhase(today.gameDay) === 'moving' && removalHours(sky.dayNight.state.hours) }), origin);

  // The landings: the floor's name by the stairs, the neighbours' doors on the north wall (on ours, one: the other is the flat's).
  const { shaft, floorLanding, frontDoor, strip } = plan;
  const hours = () => sky.dayNight.state.hours;
  // Who is in, once the residents are made (below); until then everyone is.
  let isHome = (_key: string): boolean => true;
  const behindDoors: { key: string; k: number; x: number; life: DoorLife }[] = [];
  for (let k = 0; k <= STOREYS; k++) {
    const y = landingY(k);
    const name = new FloorName(plan.floorNames[k]!);
    if (k === 0) zone.place(name, new THREE.Vector3(plan.ourFloorNameX, y + plan.floorNameY, shaft.z1 - 0.01), Math.PI);
    else zone.place(name, new THREE.Vector3(shaft.x0 + 0.01, y + plan.floorNameY, (floorLanding.z0 + floorLanding.z1) / 2), Math.PI / 2);
    if (k === STOREYS) {
      // The cellars: locked until the concierge gives the key (`building/keys`), then the way down (`world/cellar`).
      const cellar = cellarDoor({ label: plan.cellar.label, locked: 'Locked. The concierge keeps the key.' });
      zone.place(cellar, new THREE.Vector3(plan.doorX[0], y, floorLanding.z1 - 0.005), Math.PI);
      continue;
    }
    const names = k === 0 ? [plan.ourNeighbour] : plan.neighbours[k - 1]!;
    names.forEach((name, i) => {
      const x = k === 0 ? plan.ourNeighbourX : plan.doorX[i]!;
      const key = doorKey(k, i);
      const life = plan.doors[k]![i]!;
      // Home, the knock gets their line (or footsteps, out of their sound's hours); out, nobody answers.
      const answer = (): string => {
        if (!isHome(key)) return plan.knock.nobody;
        const { sound } = life;
        return sound && !(hours() >= sound.from && hours() < sound.to) ? plan.knock.quiet : life.line;
      };
      // A neighbour who knows the player well enough asks them in (`neighbourFlat/visits`).
      const visit = doorVisit(k, i, { isHome: () => isHome(key), hours, day: () => today.gameDay });
      const door = new NeighbourDoor({ caption: `${name}, ${plan.floorNames[k]} floor · knock`, answer, look: { color: life.color, mat: life.mat, plate: name }, resident: { key, building }, visit });
      zone.place(door, new THREE.Vector3(x, y, floorLanding.z1 - 0.005), Math.PI);
      behindDoors.push({ key, k, x, life });
    });
  }

  // The people on the stairs: the residents going out and coming home, the postman with the mail orders (see `building`).
  // The residents' feet land on the treads, like the player's (`StairWalker` eases them up and down each riser).
  const walkOn = (x: number, z: number, feet: number) => stairs.floorAt(x, z, feet, true);
  const ear = new THREE.Vector3();
  const doorAt = (k: number, i: number): THREE.Vector3 => new THREE.Vector3(k === 0 ? plan.ourNeighbourX : plan.doorX[i]!, landingY(k) + 1.1, floorLanding.z1);
  // A resident through their door: its latch and the leaf shutting, ringing down the stone.
  const doorSound = (k: number, i: number): void => {
    const at = zone.toWorld(doorAt(k, i));
    listener.getWorldPosition(ear);
    playNeighbourDoor((0.3 * proximityVolume(ear.distanceTo(at), { referenceDistance: 1.5, rolloff: 1, maxDistance: 16 })) / 100);
  };
  // The power cut's part of the stairs (placed below, once the residents are): whoever it strands in the lift is not home.
  let dark: DownAndDark | null = null;
  const neighbours = zone.place(new Neighbours({ viewer: listener, hours, ground: walkOn, trades: building?.trades, lift, door: doorSound, catHome: () => home.upgrades?.has('cat') ?? true, gone: (key) => movedOut(key) || key === dark?.strandedDoor(), says: (key) => huntSays(key) ?? movingLine(key), onChat: (key) => void befriend(key, STAIR_CHAT_FRIENDSHIP, 'chat', today.gameDay) }), origin);
  for (const walker of neighbours.walkers) zone.place(walker, walker.position.clone());
  // The flat and the stairs hearing each other, the neighbours through the floor, the noise after ten, who brings the cat back.
  const life = placeNoiseAndCatWays(zone, { sky, listener, acoustics, building, home, today }, { ground: walkOn, isHome: (key) => neighbours.isHome(key) });
  isHome = (key) => neighbours.isHome(key);
  // Behind their doors, faint through the wood and the wall, the neighbours who are in: a TV, a piano, a dog.
  const { behindDoor, hallTone, streetBehind } = plan;
  for (const { key, k, x, life } of behindDoors) {
    const { sound } = life;
    if (!sound) continue;
    const heard = whileHome(voiceOf(sound), () => neighbours.isHome(key) && hours() >= sound.from && hours() < sound.to);
    zone.place(pointSound(ctxHearing, heard, { referenceDistance: 0.6, rolloff: 1.4, maxDistance: 6 }), new THREE.Vector3(x, landingY(k) + behindDoor.y, floorLanding.z1 + behindDoor.z));
  }
  // The stairwell's own air, heard all the way up, and the street behind the street door.
  const toneRange = { referenceDistance: 3, rolloff: 0.5, maxDistance: 9 };
  for (const k of hallTone.landings) zone.place(pointSound(ctxHearing, new HallTone(), toneRange), new THREE.Vector3(hallTone.x, landingY(k) + hallTone.offset, hallTone.z));
  zone.place(pointSound(ctxHearing, new HallTone(), toneRange), new THREE.Vector3(...hallTone.hall));
  zone.place(pointSound(ctxHearing, new StreetBehindDoor(() => ({ wakefulness: wakefulnessAt(hours()), rain: sky.dayNight.state.rain })), { referenceDistance: 1.5, rolloff: 0.8, maxDistance: 9 }), new THREE.Vector3(plan.streetDoor.at[0], streetBehind.y, plan.streetDoor.at[1] + streetBehind.inset));
  const walkers = [...neighbours.walkers];
  if (building?.post) {
    const bell = zone.toWorld(new THREE.Vector3(strip.x0 - 0.6, landingY(0) + 1.6, frontDoor.z));
    const postman = zone.place(new Postman({ viewer: listener, post: building.post, doorstep: building.doorstep, ground: walkOn, acoustics, bell, lift }), origin);
    zone.place(postman.walker, postman.walker.position.clone());
    walkers.push(postman.walker);
  }
  // The hall's life: the notice board, the co-owners' meeting, the concierge, the timer buttons (`hallLife`).
  walkers.push(...placeHallLife(zone, { listener, today, sky, building, money }, { stairs, lights, ground: walkOn }));
  // The landings' sensors see the residents and the postman go by too, not only the player.
  lights.watch(walkers);
  // The power cut of a storm's evening, the meters cupboard, the endless stairs of some nights.
  dark = placeDownAndDark(zone, { sky, listener, today, home }, { stairs, lift, lights, walkers });
  // The step that creaks.
  zone.place(new CreakingStep(stairs, listener), origin);
  // A neighbour's swap comes as a note under the flat's door.
  const trades = building?.trades;
  if (trades) zone.onUnload(trades.onOffer((offer) => building.doorstep.slipNote(tradeNote(offer))));

  // The entrance hall: the mailboxes, and the sas at the street door: its twin stands behind our door on Front Street,
  // and going through it is walked, not travelled (`world/airlock`).
  const { streetDoor, mailboxes } = plan;
  zone.place(new Mailboxes(), new THREE.Vector3(mailboxes.x, mailboxes.y, mailboxes.z), Math.PI / 2);
  // Our flap, first of the top row: the day's post, taken on the way past (or found on the mat at home: whichever first).
  const box = mailboxGrid();
  const flap = new THREE.Vector3(-box.width / 2 + box.flap.width / 2, box.height / 2 - box.flap.height / 2, box.depth + 0.002);
  zone.place(
    new OurMailbox({
      day: () => today.gameDay,
      post: (day) => mailFor(day, { arcadeDaily: arcade.daily, market: market.stock, marketDay: market.day, story }),
      width: box.flap.width * 0.9,
      height: box.flap.height * 0.9,
    }),
    new THREE.Vector3(mailboxes.x + flap.z, mailboxes.y + flap.y, mailboxes.z - flap.x),
    Math.PI / 2,
  );
  // The late Mr Lambert's estate sale, on its days, along the wall in front of them (`world/estateSale`).
  placeEstateSale(zone, { covers, money, collection, market, listener, today, sky });
  placeAirlock(zone, new THREE.Vector3(streetDoor.at[0], 0, streetDoor.at[1]), 0, { twin: 'hall', collisions: zone.collisions, viewer: listener });
  // The door out to the courtyard at the foot of the stairs (`world/courtyard`), and the party's poster on the board.
  placeCourtyardDoor(zone, today);

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
    life,
    connectPlayer: dark.connectPlayer,
    lightLevel: () => lights.lightLevel(),
    // Tiles in the entrance hall (and the sas, which says so itself: its twin's floor), hard stone on the landings and flights.
    surfaceAt: (at) => (at.y < plan.hall.height && inHall(at.x, at.z) ? 'tiles' : 'concrete'),
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

/** Whether (x, z), local, is on the entrance hall's tiles (they run on under the last flight's foot, in the shaft). */
function inHall(x: number, z: number): boolean {
  const { hall, shaft, floorLanding } = plan;
  return (x >= hall.x0 && x <= hall.x1 && z >= hall.z0 && z <= hall.z1) || (x >= shaft.x0 && x <= shaft.x1 && z >= floorLanding.z0 && z <= shaft.z1);
}

interface NeighbourDoorOptions {
  /** The hover caption: whose door, and the verb. */
  caption: string;
  /** What a knock gets (depends on who is in). */
  answer: () => string;
  /** A resident's door: its paint, its doormat (null: none), the name on its brass plate. The cellar's is plain. */
  look?: { color: number; mat: number | null; plate: string };
  /** Whose door it is to the swaps (`doorKey`), and the building's services the swap goes through. */
  resident?: { key: string; building?: BuildingServices };
  /** The neighbour behind it asks the player in, once they know them (`neighbourFlat/visits`). */
  visit?: DoorVisit;
}

/** The name plate's size on the leaf, and its height (under the peephole). */
const PLATE = { width: 0.15, height: 0.04, y: 1.36 };

/**
 * A neighbour's door on a landing: an entrance door in its resident's colour (peephole, lock, doormat, their name on
 * a brass plate), knocked on (a knock always heard) for a line: what is heard behind it while they are in, nobody
 * answering while they are out. The cellar's is a plain panelled door. Its handle glints on hover.
 */
class NeighbourDoor extends ShutDoor implements Interactable {
  readonly hitboxes: THREE.Object3D[];
  private readonly glint: HoverGlint;

  constructor(private readonly options: NeighbourDoorOptions) {
    const { look } = options;
    super(look ? { style: 'entrance', leafColor: look.color, mat: look.mat !== null, matColor: look.mat ?? undefined } : { style: 'panelled', mat: false });
    this.name = 'NeighbourDoor';
    const hitbox = invisibleHitbox(0.95, 2.1, 0.1, { y: 1.05, z: 0.03 });
    this.hitboxes = [hitbox];
    this.add(hitbox);
    if (look) this.leafFace.add(namePlate(look.plate));
    this.glint = HoverGlint.fittings(this.leafFace);
  }

  setHovered(hovered: boolean): void {
    this.glint.set(hovered);
  }

  label(): string {
    return this.offer() ? `${this.options.caption} (the swap)` : (this.options.visit?.label() ?? this.options.caption);
  }

  activate(session: SessionActions): void {
    playKnock(3, 0.35);
    const offer = this.offer();
    // No swap to see to: a friend lets the player in (else the door answers as it always did).
    if (!offer && this.options.visit?.knock(session)) return;
    const panel = this.options.resident?.building?.tradePanel;
    if (!offer) {
      session.react(this.options.answer());
      return;
    }
    if (!panel) {
      session.say(`I'd swap my ${offer.gives.title} for your ${offer.wants.title}, if you like.`, offer.who);
      return;
    }
    panel.prepare(offer);
    session.openPanel(panel);
  }

  private offer(): TradeOffer | null {
    const key = this.options.resident?.key;
    return key ? (this.options.resident?.building?.trades?.offerAt(key) ?? null) : null;
  }
}

/** A brass plate with `name` engraved, screwed on a door's face under the peephole (door-local). */
function namePlate(name: string): THREE.Mesh {
  const [canvas, ctx] = createCanvas(300, 80);
  ctx.fillStyle = '#c9a75b';
  ctx.fillRect(0, 0, 300, 80);
  ctx.strokeStyle = 'rgba(90, 64, 24, 0.7)';
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 288, 68);
  ctx.fillStyle = '#3a2812';
  ctx.font = 'bold 40px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 150, 42, 270);
  const brass = METAL.brass();
  const material = new THREE.MeshStandardMaterial({ map: toTexture(canvas, 4), metalness: brass.metalness, roughness: brass.roughness });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(PLATE.width, PLATE.height, 0.004), [brass, brass, brass, brass, material, brass]);
  // On the leaf's face (16 mm), clear of the raised panels' 2 mm.
  plate.position.set(0, PLATE.y, 0.016 + 0.004 + 0.002);
  plate.castShadow = false;
  return plate;
}

/**
 * The step that creaks: the one the plan names (`STAIRWELL_PLAN.creak`, "mind the third step"), a groan of old wood under
 * the terrazzo each time the player steps onto it, up or down.
 */
class CreakingStep extends THREE.Group implements Updatable {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  private readonly eye = new THREE.Vector3();
  private on = false;

  constructor(private readonly stairs: Staircase, private readonly viewer: THREE.Object3D) {
    super();
    this.name = 'CreakingStep';
  }

  update(): void {
    this.viewer.getWorldPosition(this.eye);
    this.worldToLocal(this.eye);
    const { k, flight, tread } = plan.creak;
    const step = this.stairs.treadAt(this.eye.x, this.eye.z, this.eye.y - EYE_HEIGHT);
    const on = step !== null && step.k === k && step.flight === flight && step.tread === tread;
    if (on && !this.on) playHingeCreak(0.05);
    this.on = on;
  }
}

/**
 * The eye over the feet for finding the tread: between a crouch (1.15) and standing (1.7), so a crouching player on
 * the tread is still found; `treadAt`'s step-up allowance absorbs the standing overestimate (a flight is 1.6 m apart).
 */
const EYE_HEIGHT = 1.2;

/** The note a neighbour slips under the flat's door about their swap. */
function tradeNote(offer: TradeOffer): MailPiece {
  return {
    title: `${offer.who.toUpperCase()}, ${offer.floor}`,
    lines: [`Looking for ${offer.wants.title}`, `I'd swap my ${offer.gives.title} for it`, `Knock on my door on the ${offer.floor}`],
    accent: 0x3f6b4a,
  };
}

/** The floor's name painted on the wall by the stairs: 5th, 4th … G. */
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
    ctx.fillText(name, 64, 52, 116);
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
    const { width: w, height: h } = mailboxGrid();
    // Painted at two pixels a millimetre-ish (128 x 140 a flap), so the names read from the hall.
    const cw = 128;
    const ch = 140;
    const [canvas, ctx] = createCanvas(columns * cw, rows * ch);
    ctx.fillStyle = '#4a2c1c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const names = mailboxNames(rows * columns);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const x = c * cw + 10;
        const y = r * ch + 10;
        ctx.fillStyle = '#c9a75b';
        ctx.fillRect(x, y, 108, 120);
        ctx.fillStyle = '#3a2216';
        ctx.fillRect(x + 8, y + 8, 92, 104);
        ctx.fillStyle = '#1a1210';
        ctx.fillRect(x + 16, y + 20, 76, 10);
        ctx.fillStyle = '#efe6d0';
        ctx.fillRect(x + 12, y + 72, 84, 26);
        const name = names[r * columns + c]!;
        if (!name) continue;
        ctx.fillStyle = '#2a2018';
        ctx.font = 'bold 17px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, x + 54, y + 86, 78);
      }
    }
    const face = new THREE.MeshStandardMaterial({ map: toTexture(canvas, 4), roughness: 0.6 });
    const wood = paint(0x4a2c1c, 0.6);
    const cabinet = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), [wood, wood, wood, wood, face, wood]);
    cabinet.position.z = 0.06;
    cabinet.castShadow = true;
    cabinet.receiveShadow = true;
    this.add(cabinet);
  }
}

/** The mailboxes' cabinet: its size (m), the depth of its face off the wall, one flap's size. */
function mailboxGrid(): { width: number; height: number; depth: number; flap: { width: number; height: number } } {
  const { rows, columns } = plan.mailboxes;
  return { width: columns * 0.22, height: rows * 0.24, depth: 0.12, flap: { width: 0.22, height: 0.24 } };
}

/**
 * The names on the flaps, `count` of them: ours first, then the residents' surnames floor by floor from ours down, the
 * concierge's, blanks for the rest (the flats nobody on the stairs lives in).
 */
function mailboxNames(count: number): string[] {
  const { mailboxes, ourNeighbour, neighbours } = plan;
  const surname = (who: string): string => {
    const last = who.split(/\s+/).at(-1) ?? who;
    // "The Nguyens": the family's name on the box.
    return (who.startsWith('The ') && last.endsWith('s') ? last.slice(0, -1) : last).toUpperCase();
  };
  // The late Mr Lambert's box keeps his name (`world/estateSale`).
  const names = [mailboxes.ours, surname(ourNeighbour), ...neighbours.flat().map(surname), plan.estateSale.mailbox, mailboxes.concierge];
  return Array.from({ length: count }, (_, i) => names[i] ?? '');
}
