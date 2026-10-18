import * as THREE from 'three';
import type { Interactable } from '@/interaction/Interactable';
import type { SessionActions } from '@/game/SessionActions';
import type { PersonId } from '@/social/types';
import { nudge } from '@/social/standing';
import { playCoins } from '@/audio/coins';
import type { Furniture } from '../Furniture';
import { invisibleHitbox } from '../meshUtils';

/*
 * What a walk-in shop's own props answer when touched (docs/shops.md "Props by name"): the pet shop's rescue tin takes
 * a coin (Nadia is glad of it, once a day), its cat can be stroked, the tanks tapped, the hamster and the tortoise
 * watched a while. Each is a click box laid over the prop as it stands (`ShopTouch`), placed by the shop's builder
 * after the props; the prop itself stays decoration.
 */

/** What a touch draws on: the coins, the game day, the shop's clerk (for the warmth of a coin in the tin). */
export interface TouchDeps {
  purse?: { readonly coins: number; spend(coins: number): boolean };
  day: () => number;
  clerk: PersonId | null;
}

interface Touch {
  /** The caption: the prop's name and its verb. */
  label: string;
  activate(session: SessionActions, prop: THREE.Object3D, deps: TouchDeps): void;
}

/** Lines said one after another, carried across visits this page. */
function turns(lines: readonly string[]): () => string {
  let n = 0;
  return () => lines[n++ % lines.length]!;
}

const catLines = turns([
  'She opens one eye, decides you are acceptable, and closes it again. A purr like a far-off moped.',
  'You stroke the shop cat. She stretches one paw out of the bed, spreads her toes, and goes back to sleep.',
  'Warm, and heavier than she looks. The purr starts before your hand touches her.',
]);
const tankLines = turns([
  'You tap the glass. Every fish turns to look at you, then decides you are not food.',
  'A sign on the tank, in the clerk’s hand: PLEASE DON’T TAP THE GLASS. THEY KNOW YOU’RE THERE.',
  'A little catfish is cleaning the glass from the inside, very seriously, right where your finger is.',
]);
const hamsterLines = turns([
  'The hamster runs in the wheel, stops, looks at you, and runs the other way.',
  'Cheeks stuffed full, the hamster carries its whole dinner to a corner and buries it.',
  'Asleep in a toilet roll, one foot sticking out.',
]);
const tortoiseLines = turns([
  'The tortoise is eating a lettuce leaf at the speed of a loading screen.',
  'Under the heat lamp, the tortoise has its eyes shut and its neck stretched right out. It looks very happy.',
  'A card on the tank: “BARNABY, 41. NOT FOR SALE. HAS SEEN THINGS.”',
]);

/** The touches, by the prop's name in the shop's plan (`fixtures`). */
const TOUCHES: Readonly<Record<string, Touch>> = {
  donationTin: {
    label: 'Rescue tin · drop a coin in',
    activate: (session, _prop, { purse, day, clerk }) => {
      if (!purse?.spend(1)) {
        session.refuse('Not a coin in your pockets for the tin.');
        return;
      }
      playCoins(1, 0.1);
      // The clerk glad of it, once a day whatever is dropped in.
      if (clerk) nudge(clerk, { warmth: 2, day: day(), reason: 'rescueTin', why: 'saw you put a coin in the rescue tin', memory: 'you put a coin in the rescue tin' });
      session.react('Clink. A coin in the rescue tin. “Every one feeds a stray,” says the band round it.');
    },
  },
  shopCat: {
    label: 'The shop’s cat · stroke her',
    activate: (session, prop) => {
      (prop as { stir?: () => void }).stir?.();
      session.react(catLines());
    },
  },
  aquariumWall: { label: 'The tanks · tap the glass', activate: (session) => session.react(tankLines()) },
  hamsterCage: { label: 'The hamster · watch a while', activate: (session) => session.react(hamsterLines()) },
  terrarium: { label: 'The tortoise · watch a while', activate: (session) => session.react(tortoiseLines()) },
};

/** Whether the prop named `name` answers a touch. */
export function touchable(name: string): boolean {
  return name in TOUCHES;
}

/**
 * A click box over a shop prop that answers a touch (`TOUCHES` by its name): laid over the prop's bounds as it stands
 * (zone-local; it never collides). Placed at the zone's origin by the shop's builder.
 */
export class ShopTouch extends THREE.Group implements Furniture, Interactable {
  readonly contactShadow = false;
  readonly hitboxes: THREE.Object3D[];
  private readonly touch: Touch;

  constructor(name: string, private readonly prop: THREE.Object3D, bounds: THREE.Box3, private readonly deps: TouchDeps) {
    super();
    this.name = `ShopTouch:${name}`;
    this.touch = TOUCHES[name]!;
    const size = bounds.getSize(new THREE.Vector3());
    const mid = bounds.getCenter(new THREE.Vector3());
    const hitbox = invisibleHitbox(Math.max(size.x, 0.12), Math.max(size.y, 0.12), Math.max(size.z, 0.12), { x: mid.x, y: mid.y, z: mid.z });
    this.add(hitbox);
    this.hitboxes = [hitbox];
  }

  get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setHovered(): void {
    // The prop gives no glow; the caption says it.
  }

  label(): string {
    return this.touch.label;
  }

  activate(session: SessionActions): void {
    this.touch.activate(session, this.prop, this.deps);
  }
}
