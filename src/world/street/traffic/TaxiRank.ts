import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { ChoicePanel } from '@/ui/street/ChoicePanel';
import { CABBIE } from '@/ui/taxiRide/TaxiRide';
import type { Furniture } from '../../Furniture';
import type { DayNight } from '../../props/DayNight';
import type { ZoneId } from '../../zoneIds';
import { invisibleHitbox } from '../../meshUtils';
import { nightnessOf } from '../streetAir';
import { snowCovered } from '../snowCover';
import type { Vec2 } from '../streetPlan';
import type { StreetCars } from '../StreetCars';
import { inHours } from '@/time/clock';
import { formatCoins } from '@/text/money';
import { pick, random } from '@/random';
import type { Pastimes } from '@/household/pastime';
import { rideBy } from '../../travel/rideVia';

/** Where a taxi may take the player: as `STREET_PLAN.busRide.destinations` reads (read at each click, never copied). */
interface Destination {
  /** A place line 38 goes, or `DRIVE`: a turn round town at night and back to the rank. */
  readonly to: ZoneId | typeof DRIVE;
  readonly label: string;
  readonly hours?: readonly [number, number];
  readonly shut?: string;
}

interface TaxiRankOptions {
  cars: StreetCars;
  dayNight: DayNight;
  /** Which of the cars' taxi stands is the rank's. */
  stop: number;
  /** Its sign's foot (zone-local) and the way it faces. */
  at: Vec2;
  yaw: number;
  /** The fare, coins, wherever it goes. */
  fare: number;
  /** Where to: the bus's places (`busRide.destinations`), read when asked. */
  destinations: () => readonly Destination[];
  /** The pick of where to, when more than one place is open (none: the first open). */
  choice?: ChoicePanel;
  /**
   * The night's drive, a ride the bus never gives: along the river and round by the lit bridges, back at the rank
   * (`label`, in its `hours`): told in a beat (`pastimes`, the clock wound on by `minutes`), the back seat over the
   * dark (`backSeat`, `ui/taxiRide`).
   */
  drive?: { label: string; hours: readonly [number, number]; minutes: number; pastimes: Pastimes; backSeat: (ride: { to: string; fare: number; chat: string; night: boolean }) => Promise<void> };
}

/** The night drive's id among the destinations. */
const DRIVE = 'drive' as const;

const POLE = { height: 2.7, radius: 0.04 } as const;
/** Waving again while the taxi is on its way: a word back. */
const COMING = ['Down the street a taxi flashes its lights: on its way.', 'A horn toots twice from the crossing. Coming, coming.'];
/** What the driver says on the night drive. */
const DRIVE_CHAT = [
  'The bridges are lit till one. I take this way home myself, some nights.',
  'Quiet, isn’t it. The town’s nicer when it’s asleep.',
  'See the barges? My father worked those. Never once took me on one.',
];
/** What the drive leaves, back at the rank. */
const DRIVEN = ['The meter clicks off at the rank. The town still glitters behind your eyes.', 'Back where you started, the long way round. Worth every coin.'];
/** What the driver says as the meter starts. */
const DRIVER_CHAT = [
  'Busy round here today. That market of yours, is it?',
  'Thirty years I’ve driven this town. The bus is quicker on Sundays, don’t tell anyone.',
  'Mind the box on the seat, my grandson’s console. Fixing it for him.',
  'You’re the one with all the games upstairs? The concierge mentioned you.',
  'Radio on or off? Off. Good. Me too.',
];
const SIGN = { width: 0.62, height: 0.24, depth: 0.08 } as const;

/**
 * The taxi rank by the first stand (`STREET_PLAN.taxi.rank`): a pole with a lit TAXI sign. Clicked, the player hails
 * a taxi (`StreetCars.hail`): one comes, pulls in at the stand with its hazards on and waits for them a while. Clicked
 * then (the sign or the taxi itself), the player gets in for the fare (`pay`), picks where to if more than one place
 * is open (`ChoicePanel`), and is off (`travel`, by taxi: no bus ride shown, `travel/rideVia`). It goes wherever the
 * bus goes, at any hour the place is open, without the wait.
 */
export class TaxiRank extends THREE.Group implements Furniture, Updatable, Interactable {
  readonly contactShadow = false;
  readonly colliders: THREE.Box3[] = [];
  readonly hitboxes: THREE.Object3D[];
  private readonly signMaterial: THREE.MeshBasicMaterial;
  /** Follows the hailed taxi while it waits (raycast only then). */
  private readonly cab: THREE.Mesh;
  private waved = 0;

  constructor(private readonly options: TaxiRankOptions) {
    super();
    this.name = 'TaxiRank';
    const [x, z] = options.at;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(POLE.radius, POLE.radius * 1.15, POLE.height, 10), snowCovered(new THREE.MeshStandardMaterial({ color: 0x2a2e30, roughness: 0.5 })));
    pole.position.set(x, POLE.height / 2, z);
    pole.castShadow = true;
    this.signMaterial = new THREE.MeshBasicMaterial({ map: signTexture(), color: 0xcccccc });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(SIGN.width, SIGN.height, SIGN.depth), this.signMaterial);
    sign.position.set(x, POLE.height - SIGN.height / 2 - 0.05, z);
    sign.rotation.y = options.yaw;
    this.add(pole, sign);
    this.colliders.push(new THREE.Box3(new THREE.Vector3(x - 0.1, 0, z - 0.1), new THREE.Vector3(x + 0.1, 2, z + 0.1)));

    const board = invisibleHitbox(0.5, POLE.height, 0.5);
    board.position.set(x, POLE.height / 2, z);
    this.cab = invisibleHitbox(1, 1, 1);
    // The taxi's box is only there for the crosshair while one waits (a taxi driving by never swallows a click).
    this.cab.raycast = (raycaster, hits) => {
      if (this.options.cars.hailedTaxi) THREE.Mesh.prototype.raycast.call(this.cab, raycaster, hits);
    };
    this.add(board, this.cab);
    this.hitboxes = [board, this.cab];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  update(): void {
    const night = THREE.MathUtils.smoothstep(nightnessOf(this.options.dayNight.state), 0.2, 0.6);
    this.signMaterial.color.setScalar(0.8 + 1.4 * night);
    const taxi = this.options.cars.hailedTaxi;
    if (!taxi) return;
    // Round the waiting taxi, where it stands (the rank and the cars share the zone's origin).
    this.cab.position.set(taxi.position.x, 0.8, taxi.position.z);
    this.cab.rotation.y = taxi.yaw;
    this.cab.scale.set(taxi.length, 1.6, taxi.width);
  }

  setHovered(): void {
    // A sign does not glow; the caption says it.
  }

  label(): string | null {
    const { cars, fare } = this.options;
    const open = this.open();
    if (cars.hailedTaxi) {
      if (!open.length) return 'Taxi · nowhere to go at this hour';
      const only = open.length === 1 ? open[0]! : null;
      if (only?.to === DRIVE) return `Taxi · ${only.label.toLowerCase()} (${formatCoins(fare)})`;
      return only ? `Taxi · get in to ${only.label} (${formatCoins(fare)})` : `Taxi · get in (${formatCoins(fare)})`;
    }
    if (cars.taxiComing) return 'Taxi rank · a taxi is on its way';
    if (!open.length) return `Taxi rank · ${this.shutWord()}`;
    return 'Taxi rank · hail a taxi';
  }

  activate(session: SessionActions): void {
    const { cars, stop } = this.options;
    const open = this.open();
    if (cars.hailedTaxi) {
      if (!open.length) {
        session.refuse(`“${this.shutWord()}, love. Where to, then?”`);
        return;
      }
      this.getIn(session, open);
      return;
    }
    if (cars.taxiComing) {
      session.react(COMING[this.waved++ % COMING.length]!);
      return;
    }
    if (!open.length) {
      session.refuse(this.shutWord());
      return;
    }
    if (cars.hail(stop)) session.react('You raise an arm at the rank. A taxi will be along.');
  }

  /** Where to (a pick when more than one place is open), the fare, and off. */
  private getIn(session: SessionActions, open: readonly Destination[]): void {
    const choice = this.options.choice;
    if (open.length > 1 && choice) {
      choice.show({
        title: 'Where to?',
        intro: `The meter says ${formatCoins(this.options.fare)}, wherever you go.`,
        look: { kind: 'taxi', fare: this.options.fare },
        who: { ...CABBIE, line: 'Hop in. Where to, then?' },
        choices: open.map((d) => ({ id: d.to, label: d.label })),
        pick: (id) => {
          const where = open.find((d) => d.to === id);
          if (where) this.ride(session, where);
        },
      });
      session.openPanel(choice);
      return;
    }
    this.ride(session, open[0]!);
  }

  private ride(session: SessionActions, where: Destination): void {
    // The taxi gave up on them while they made up their mind (the choice open): no fare, no ride.
    if (!this.options.cars.hailedTaxi) {
      session.refuse('The taxi has gone. Hail another at the rank.');
      return;
    }
    const { fare, drive } = this.options;
    const to = where.to;
    if (to === DRIVE) {
      if (!drive) return;
      // Something else already told in a beat: no fare taken for a drive that would not happen.
      if (drive.pastimes.isBusy) return;
      session.pay({
        price: fare,
        title: 'The taxi fare',
        paid: () => {
          this.options.cars.boardHailed();
          const chat = pick(random, DRIVE_CHAT);
          // The drive told in a beat: out, the back seat over the dark, the clock on, back at the rank.
          let rode: Promise<void> = Promise.resolve();
          const backSeat = (): void => {
            rode = drive.backSeat({ to: drive.label, fare, chat, night: true });
          };
          void drive.pastimes.run({ minutes: drive.minutes, outMs: 700, darkMs: 4800, inMs: 900, dark: backSeat }, () => undefined).then(async (done) => {
            await rode;
            if (done !== null) session.react(pick(random, DRIVEN));
          });
          return `You get in the back: ${drive.label.toLowerCase()}, no hurry.`;
        },
      });
      return;
    }
    session.pay({
      price: fare,
      title: 'The taxi fare',
      paid: () => {
        this.options.cars.boardHailed();
        rideBy({ by: 'taxi', to: where.label, fare, chat: pick(random, DRIVER_CHAT) });
        session.travel(to);
        return `You get in the back and give the driver the address: ${where.label}.`;
      },
    });
  }

  /** The places open now (a taxi takes the player at any hour they are). */
  private open(): Destination[] {
    const hours = this.options.dayNight.state.hours;
    const drive = this.options.drive;
    const places: Destination[] = [...this.options.destinations(), ...(drive ? [{ to: DRIVE, label: drive.label, hours: drive.hours }] : [])];
    return places.filter((d) => !d.hours || inHours(hours, d.hours));
  }

  /** Why nowhere is open: the first place's word for it. */
  private shutWord(): string {
    return this.options.destinations()[0]?.shut ?? 'Nowhere to go at this hour';
  }
}

/** The rank's sign: TAXI in black on a yellow lit box. */
function signTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(128, 48);
  ctx.fillStyle = '#f2c52a';
  ctx.fillRect(0, 0, 128, 48);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TAXI', 64, 26);
  return toTexture(canvas);
}
