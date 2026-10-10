import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { NoticeActions } from '@/notices';
import { KEYS, PersistedStore } from '@/persistence';
import { befriend } from '@/building/friendship';
import { Prop } from '../props/Prop';
import type { MailPiece } from '../props/MailDrop';
import type { DoorVisitor } from '../stairwell/DoorVisitor';
import type { StairwellHandle } from '../stairwell/furnishStairwell';
import type { Doorstep } from '../hallway/Doorstep';
import type { Zone } from '../zone/Zone';
import { STAIRWELL_PLAN as stairs } from '../stairwell/stairwellPlan'; // imports-ok: the cat's escapes run down the stairwell it reads
import { landingY } from '@/world/measures/building';
import type { Cat } from './Cat';
import type { OutingEnd, OutingWorld } from './CatOuting';
import { CAT_OUTING as plan, type HideSpot } from './catOutingPlan';
import { random } from '@/random';
import { actionKeyLabel } from '@/ui/keys';

/** Something the cat may bring back in its mouth from an outing (a read card). */
interface CatFind {
  title: string;
  text: string;
  effect?: string;
}

/** Finds of other features (the treasure hunt's clue): asked first, in turn, each time the cat brings something back. */
const finders: (() => CatFind | null)[] = [];

/** `source` may hand the cat something to bring back (null: nothing of its own this time); returns the removal. */
export function addCatFind(source: () => CatFind | null): () => void {
  finders.push(source);
  return () => {
    const i = finders.indexOf(source);
    if (i >= 0) finders.splice(i, 1);
  };
}

interface CatEscapesOptions {
  cat: Cat;
  /** The building the outing goes through (the stairwell's ground, the front door, the player's eye). */
  building: OutingWorld;
  /** The game day. */
  day: () => number;
  /** Whether whoever lives behind a door (its key) is in. */
  isHome: (key: string) => boolean;
  /** The neighbour who brings it back from in their flat (`CAT_OUTING.neighbour`). */
  neighbour: DoorVisitor;
  /** A note under the flat's door. */
  slipNote: (piece: MailPiece) => void;
  notices?: NoticeActions;
}

interface Saved {
  lastDay: number | null;
}

/**
 * When the cat slips out (`CAT_OUTING`): the front door left standing open a few seconds with the
 * cat about and free (`Cat.mayGoOut`) may tempt it, now and then, never two game days running.
 * Where it goes is a weighted pick of the spots (in at Mrs Dubois' only while she is home). Once it
 * is out, a tip says so; at a neighbour's, she brings it back after a while (`DoorVisitor`: a
 * knock, her line, the cat on the mat); found and walked home, it sometimes brings something back in
 * its mouth (`addCatFind` first: the treasure hunt's clues). An empty prop; placed in the stairwell's zone.
 */
class CatEscapes extends Prop implements Updatable {
  readonly contactShadow = false;
  private openFor = 0;
  private tried = false;
  private wasOut = false;
  private keptFor = 0;
  private nth = 0;
  private broughtBack = false;
  private readonly store = new PersistedStore<Saved>({ key: KEYS.catOutings, version: 1, defaults: () => ({ lastDay: null }), read: readSaved });
  private saved: Saved;
  private readonly inside: THREE.Vector3;
  private readonly here = new THREE.Vector3();
  private untip: (() => void) | null = null;

  constructor(private readonly options: CatEscapesOptions) {
    super();
    this.name = 'CatEscapes';
    this.saved = this.store.load();
    this.inside = new THREE.Vector3(stairs.strip.x0 - 0.45, landingY(0), stairs.frontDoor.z).add(options.building.origin);
  }

  update(dt: number): void {
    const { cat, building } = this.options;
    if (building.door.isOpen) this.openFor += dt;
    else {
      this.openFor = 0;
      this.tried = false;
    }
    if (!this.tried && this.openFor >= plan.doorOpenS) {
      this.tried = true;
      this.maybeGo();
    }
    const out = cat.out;
    const isOut = out?.isOut ?? false;
    if (isOut && !this.wasOut) this.told();
    this.wasOut = isOut;
    // At a neighbour's: she brings it back after a while.
    if (out?.isVisiting) {
      this.keptFor -= dt;
      if (this.keptFor <= 0 && !this.options.neighbour.busy) this.bringBack();
    }
  }

  dispose(): void {
    this.untip?.();
  }

  private maybeGo(): void {
    const { cat, day, building } = this.options;
    if (!cat.mayGoOut) return;
    cat.getWorldPosition(this.here);
    if (this.here.distanceTo(this.inside) > plan.reach) return;
    const today = day();
    if (this.saved.lastDay !== null && today - this.saved.lastDay < plan.everyDays) return;
    if (random() >= plan.chance) return;
    const spot = this.pick();
    if (!spot) return;
    if (!cat.goOut(building, spot, (how, found) => this.ended(how, found))) return;
    this.saved = { lastDay: today };
    this.store.save(this.saved);
    this.broughtBack = false;
    this.keptFor = THREE.MathUtils.randFloat(plan.neighbourKeepsS.min, plan.neighbourKeepsS.max);
  }

  /** A weighted pick of the hiding places; a neighbour's only while they are in. */
  private pick(): HideSpot | null {
    const spots = plan.spots.filter((s) => s.kind !== 'neighbour' || (s.door !== undefined && this.options.isHome(s.door)));
    const total = spots.reduce((sum, s) => sum + s.weight, 0);
    let roll = random() * total;
    for (const spot of spots) {
      roll -= spot.weight;
      if (roll <= 0) return spot;
    }
    return spots[spots.length - 1] ?? null;
  }

  /** It is out: the player hears of it once. */
  private told(): void {
    const { cat, notices } = this.options;
    const name = cat.settings.name;
    this.untip?.();
    this.untip = notices?.tip(`${name} is out on the landing: follow the miaows, [${actionKeyLabel('callCat')}] calls.`, { id: 'catOut', head: `Where is ${name}?`, until: () => !cat.out?.isOut }) ?? null;
  }

  /** Mrs Dubois up the stairs with the cat. */
  private bringBack(): void {
    const { cat, neighbour, slipNote, day } = this.options;
    const who = plan.neighbour;
    const spot = cat.out?.spot;
    neighbour.come({
      who: who.name,
      knocks: 3,
      answer: (_session, walker) => {
        walker.speak(who.lines[this.nth++ % who.lines.length]!, who.name);
        walker.gesture('wave');
        this.broughtBack = true;
        cat.out?.returned();
        if (spot?.door) befriend(spot.door, who.friendship, 'cat', day());
        return 5;
      },
      gaveUp: () => {
        this.broughtBack = true;
        cat.out?.returned();
        slipNote(who.note);
      },
    });
  }

  /** Home again: found and walked back by itself, it sometimes has something in its mouth. */
  private ended(how: OutingEnd, found: boolean): void {
    this.untip?.();
    this.untip = null;
    if (how !== 'home' || !found || this.broughtBack || random() >= plan.bringsBack) return;
    let find: CatFind | null = null;
    for (const finder of finders) if ((find = finder())) break;
    find ??= plan.finds[Math.floor(random() * plan.finds.length)]!;
    const name = this.options.cat.settings.name;
    this.options.notices?.read({ title: find.title, text: `${name} drops something at your feet. ${find.text}`, ...(find.effect ? { effect: find.effect } : {}), look: 'note' });
  }
}

function readSaved(data: unknown): Saved | null {
  if (!data || typeof data !== 'object') return null;
  const lastDay = (data as { lastDay?: unknown }).lastDay;
  return { lastDay: typeof lastDay === 'number' && Number.isFinite(lastDay) ? lastDay : null };
}

/** What `placeCatEscapes` wires together (`bootstrap/world.ts`). */
interface CatEscapesWiring {
  cat: Cat;
  /** The stairwell's handle: the ground on the stairs, and its `life` (no doorstep: no outings). */
  stairs: StairwellHandle;
  /** The flat's front door (none: no outings). */
  door: { readonly isOpen: boolean } | null;
  /** The ears and eyes (the camera). */
  eye: THREE.Object3D;
  day: () => number;
  doorstep: Doorstep;
  notices?: NoticeActions;
}

/** Lets the cat slip out of the open front door now and then (`CatEscapes`, placed in the stairwell's zone). */
export function placeCatEscapes(zone: Zone, { cat, stairs, door, eye, day, doorstep, notices }: CatEscapesWiring): void {
  const life = stairs.life;
  if (!life || !door) return;
  const building: OutingWorld = { ground: stairs.ground, origin: life.origin, door, eye: (out) => eye.getWorldPosition(out) };
  zone.place(new CatEscapes({ cat, building, day, isHome: life.isHome, neighbour: life.catReturner, slipNote: (piece) => doorstep.slipNote(piece), ...(notices ? { notices } : {}) }), new THREE.Vector3());
}
