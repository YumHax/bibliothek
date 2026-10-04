import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { SessionActions } from '@/game/SessionActions';
import type { Furniture } from '../Furniture';
import { Vendor } from '../people/Vendor';
import { randomLook } from '../people/looks';
import type { StringLights } from './StringLights';
import { PARTY_TALK, partyGuests, type partyStage } from '@/building/neighboursParty';
import { STAIRWELL_PLAN } from '../stairwell/stairwellPlan'; // imports-ok: the residents who come down to the party are the stairwell's
import { doorKey } from '../stairwell/building';
import { personAtDoor } from '@/social/people';
import type { SocialServices } from '@/social/talk';
import { talkHook, vendorBody } from '../people/socialHook';

/** What the party places and takes away again: the zone. */
interface PartyHost {
  place<F extends Furniture>(item: F, position: THREE.Vector3, rotationY?: number): F;
  remove(item: Furniture): void;
}

interface NeighboursPartyOptions {
  host: PartyHost;
  /** The camera: the guests look at it. */
  viewer: THREE.Object3D;
  /** The party's stage now (`building/neighboursParty.partyStage`, read from the game day and hour). */
  stage: () => ReturnType<typeof partyStage>;
  /** Where each guest stands (zone-local) and faces, in `STAIRWELL_PLAN.residents`' order. */
  spots: readonly { at: THREE.Vector3; yaw: number }[];
  /** The bulbs strung across the yard (lit with the party). */
  strings: StringLights;
  /** The party's one real light over the tables (zone-local), its candela, reach and colour. */
  lamp: { at: THREE.Vector3; intensity: number; distance: number; color: number };
  /** The player chatted with guest `i` (in `partyGuests`' order). */
  onChat?: (guest: number) => void;
  /** The people the player talks to (docs/social.md): each guest talks, the party's chat an entry of theirs. */
  social?: SocialServices;
}

/** Seconds between two looks at the clock. */
const CHECK_EVERY = 1;
/** Seconds the lights take to come up and go down. */
const FADE = 2.5;
/** The guests' extra lines, by the resident's index (the buyer, the cabinet's fan). */
const ROLE_LINES: Record<number, string> = {
  3: 'At the red table: if you are selling, we are buying. Fair prices, cash from the tin.',
  4: 'Three goes each on the cabinet. Beat our best and the kitty is yours!',
};

/**
 * The neighbours' party as it happens in the courtyard (the tables, the sale and the cabinet are set out by the
 * builder on the day): the residents come down at five (`PARTY.from`) and stand about the tables, at the sale table and
 * by the cabinet, each with their own look (the stairwell's) and their lines and the party's; they go back up at
 * midnight. The bulbs light up with them and the one lamp over the tables (shadowless: the party's only real light,
 * dimmed to nothing the rest of the time). Origin: the zone's; the guests are placed and removed through the host.
 */
export class NeighboursParty extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  private readonly lamp: THREE.PointLight;
  private guests: Vendor[] = [];
  private clock = CHECK_EVERY;
  private level = 0;
  private on = false;

  constructor(private readonly options: NeighboursPartyOptions) {
    super();
    this.name = 'NeighboursParty';
    const { lamp } = options;
    this.lamp = new THREE.PointLight(lamp.color, 0, lamp.distance, 2);
    this.lamp.castShadow = false;
    this.lamp.position.copy(lamp.at);
    this.add(this.lamp);
  }

  /** Whether the residents are down in the yard now. */
  get isOn(): boolean {
    return this.on;
  }

  update(dt: number): void {
    this.clock += dt;
    if (this.clock >= CHECK_EVERY) {
      this.clock = 0;
      const on = this.options.stage() === 'on';
      if (on !== this.on) {
        this.on = on;
        if (on) this.comeDown();
        else this.goUp();
      }
    }
    this.level = THREE.MathUtils.clamp(this.level + (this.on ? dt : -dt) / FADE, 0, 1);
    this.lamp.intensity = this.options.lamp.intensity * this.level;
    this.options.strings.setLit(this.level);
  }

  dispose(): void {
    this.goUp();
  }

  private comeDown(): void {
    const { host, viewer, spots } = this.options;
    const residents = STAIRWELL_PLAN.residents;
    this.guests = partyGuests().map((guest, i) => {
      const spot = spots[i % spots.length]!;
      const own = residents[i]?.lines.filter((line): line is string => typeof line === 'string') ?? [];
      const role = ROLE_LINES[i];
      const lines = [...(role ? [role] : []), ...PARTY_TALK.slice(i % PARTY_TALK.length), ...own];
      const person = personAtDoor(doorKey(guest.k, guest.i));
      const chatted = (): void => this.options.onChat?.(i);
      let next = 0;
      const social = person
        ? talkHook(this.options.social, person, () => ({
            person,
            place: 'courtyard',
            body: vendorBody(vendor),
            // The party's own talk, and the party's friendship once a party.
            extras: [{ id: 'party', group: 'talk', label: 'Some party!', run: () => {
              chatted();
              return { line: lines[next++ % lines.length]! };
            } }],
          }))
        : undefined;
      const vendor: PartyGuest = new PartyGuest(social ? () => {} : chatted, { viewer, lines, seed: guest.seed, look: randomLook(guest.seed + 900, 'shopper'), label: `${guest.name} · chat`, speaker: guest.name, focus: [0, 1.0, 1.2], social });
      return host.place(vendor, spot.at.clone(), spot.yaw);
    });
  }

  private goUp(): void {
    for (const guest of this.guests) this.options.host.remove(guest);
    this.guests = [];
  }
}

/** A guest: a `Vendor` standing about (their lines, their glances) whose every chat the party hears of. */
class PartyGuest extends Vendor {
  constructor(
    private readonly chatted: () => void,
    options: ConstructorParameters<typeof Vendor>[0],
  ) {
    super(options);
  }

  override activate(session: SessionActions): void {
    super.activate(session);
    this.chatted();
  }
}
