import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import { createCanvas, toTexture } from '@/covers/generated/canvasUtils';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { ChoicePanel } from '@/ui/street/ChoicePanel';
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
import { rideBy } from '../../travel/rideVia';

/** Where a taxi may take the player: as `STREET_PLAN.busRide.destinations` reads (read at each click, never copied). */
interface Destination {
  readonly to: ZoneId;
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
}

const POLE = { height: 2.7, radius: 0.04 } as const;
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
      return open.length === 1 ? `Taxi · get in to ${open[0]!.label} (${formatCoins(fare)})` : `Taxi · get in (${formatCoins(fare)})`;
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
    if (cars.taxiComing) return;
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
    session.pay({
      price: this.options.fare,
      paid: () => {
        this.options.cars.boardHailed();
        rideBy('taxi');
        session.travel(where.to);
        return `You get in the back and give the driver the address: ${where.label}.`;
      },
    });
  }

  /** The places open now (a taxi takes the player at any hour they are). */
  private open(): Destination[] {
    const hours = this.options.dayNight.state.hours;
    return this.options.destinations().filter((d) => !d.hours || inHours(hours, d.hours));
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
