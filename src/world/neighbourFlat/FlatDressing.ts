import * as THREE from 'three';
import type { Game } from '@/catalog/types';
import type { SessionActions } from '@/game/SessionActions';
import { befriend } from '@/building/friendship';
import { drawGames } from '@/building/pricedCopy';
import type { Zone } from '../zone/Zone';
import type { BuildContext } from '../buildContext';
import type { Furniture } from '../Furniture';
import type { Room } from '../Room';
import type { Seat } from '../Seat';
import type { Updatable } from '@/core/Engine';
import { resolvePlacement } from '../Placement';
import { buildDecor } from '../props/decor';
import { buildPiece } from '../shop/displayPieces';
import { Birdcage } from '../shop/Birdcage';
import { Walker, type WalkerOptions } from '../people/Walker';
import { randomLook } from '../people/looks';
import { disposeTree } from '../materials/sharedResources';
import { GameShelf } from './GameShelf';
import { FavouriteGame } from './FavouriteGame';
import { DogBasket, Piano, Vectrex, paintedPoster } from './flatProps';
import type { Vestibule } from './Vestibule';
import { FRIENDSHIP_NUDGES, currentHost, hostKey, onHostChange } from './visits';
import { NEIGHBOUR_FLAT_PLAN as plan, type Dressing, type NeighbourHost } from './neighbourFlatPlan';
import { pick, random } from '@/random';
import { personAtDoor } from '@/social/people';
import { rememberLook } from '@/social/lookBook';
import type { TalkExtra, TalkSession } from '@/social/talk';
import type { PersonId } from '@/social/types';
import { bodyOf, talkHook } from '../people/socialHook';

/** Seconds a host keeps their eyes on the TV once a longplay they put on starts. */
const WATCH_GAZE_S = 25;

/** One host's things, built the first time the flat is dressed for them and kept for the next visits. */
interface Dressed {
  host: NeighbourHost;
  items: Furniture[];
  shelf: GameShelf;
  walker: HostWalker;
  /** Their favourite game (null until the index answered), never for sale. */
  favourite: Game | null;
}

/** What the dressing dresses round: the shell's parts that stay (the room, the vestibule, the favourite game's spot, the TV). */
interface FlatDressingParts {
  room: Room;
  vestibule: Vestibule;
  favourite: FavouriteGame;
  /** Where the TV's picture is (zone-local), for the host's eyes while it plays. */
  tvAt: THREE.Vector3;
  /** The host's armchair: theirs while they live here (the player sits in the other). */
  hostSeat: Seat;
}

/**
 * Dresses the neighbours' flat for whoever the player visits (`visits.currentHost`): the walls in their paint, their
 * furniture (`NeighbourHost.dressing`: a shop's model of a flat's piece or a decor entry, lights taken out, so the
 * zone's lights never change; their own birdcage, piano, Vectrex, dog basket, posters), their shelf of their own
 * games (never for sale), their favourite game by the TV, and themselves (`HostWalker`), in their armchair or standing where they
 * like to. A host's things are built on their first visit and kept: dressed for someone else, they are taken out
 * of the zone, and put back on their next visit. Redresses on a change of host (`onHostChange`), whenever it comes.
 */
export class FlatDressing extends THREE.Group implements Furniture, Updatable {
  readonly contactShadow = false;
  readonly footprint = new THREE.Box3();
  private readonly dressed = new Map<string, Dressed>();
  private current: Dressed | null = null;
  private watchClock = 0;

  constructor(private readonly zone: Zone, private readonly ctx: Pick<BuildContext, 'building' | 'collection' | 'covers' | 'listener' | 'acoustics' | 'market' | 'social' | 'today'>, private readonly parts: FlatDressingParts) {
    super();
    this.name = 'FlatDressing';
    this.dress(currentHost());
    zone.onUnload(onHostChange((host) => this.dress(host)));
    // What is not in the zone when it unloads is not freed by it: the other hosts' things.
    zone.onUnload(() => {
      for (const d of this.dressed.values()) {
        if (d === this.current) continue;
        for (const item of [...d.items, d.shelf, d.walker]) {
          (item as Partial<Furniture>).dispose?.();
          disposeTree(item);
        }
      }
      this.dressed.clear();
    });
  }

  /** The host in the flat now. */
  get host(): NeighbourHost {
    return this.current?.host ?? currentHost();
  }

  /** A frame: the host's eyes come back to the player a while after a longplay started. */
  update(dt: number): void {
    if (this.watchClock <= 0) return;
    this.watchClock -= dt;
    if (this.watchClock <= 0) this.current?.walker.setFocus('viewer');
  }

  private dress(host: NeighbourHost): void {
    if (this.current?.host === host) return;
    const { zone, parts } = this;
    if (this.current) {
      for (const item of this.current.items) zone.remove(item);
      zone.remove(this.current.shelf);
      this.current.shelf.setShown(false);
      zone.remove(this.current.walker);
    }
    parts.room.paintWalls(host.walls);
    // Their armchair while they sit in it; a host who stands leaves both to the player.
    parts.hostSeat.guest = 'seat' in host.rest ? host.who : null;
    parts.vestibule.paint(host.walls);
    const key = hostKey(host);
    let d = this.dressed.get(key);
    const first = !d;
    if (!d) {
      d = this.build(host);
      this.dressed.set(key, d);
    }
    for (const item of d.items) zone.place(item, item.position.clone(), item.rotation.y);
    zone.place(d.shelf, d.shelf.position.clone(), d.shelf.rotation.y);
    d.shelf.setShown(true);
    this.settle(d);
    zone.place(d.walker, d.walker.position.clone(), d.walker.rotation.y);
    this.current = d;
    parts.favourite.setGame(d.favourite);
    if (first) void this.stock(d);
  }

  /** Builds `host`'s things where their plan says, not yet placed (`dress` places them). */
  private build(host: NeighbourHost): Dressed {
    const items: Furniture[] = [];
    for (const entry of host.dressing) {
      const item = makeDressing(entry);
      if (!item) continue;
      const { position, rotationY } = resolvePlacement(plan.room, entry.kind === 'decor' ? entry.entry.at : entry.at);
      item.position.copy(position);
      item.rotation.y = rotationY;
      items.push(item);
    }
    const { covers } = this.ctx;
    const key = hostKey(host);
    let walker: HostWalker;
    let talked = 0;
    let toldFirst = false;
    const shelf = new GameShelf({
      host: this.zone,
      covers,
      who: host.who,
      offered: (id) => this.ctx.building?.trades?.offerAt(key)?.gives.id === id,
      onLook: (game, first) => {
        const talk = plan.shelfTalk;
        let line: string;
        if (this.ctx.building?.trades?.offerAt(key)?.gives.id === game.id) line = talk.swap;
        else if (first && !toldFirst) {
          toldFirst = true;
          line = talk.firstPrint;
        } else line = talk.lines[talked++ % talk.lines.length]!;
        walker.speak(line.replace('{title}', game.title));
      },
    });
    const at = resolvePlacement(plan.room, plan.shelf.at);
    shelf.position.copy(at.position);
    shelf.rotation.y = at.rotationY;
    const look = randomLook(host.seed + 900, 'shopper');
    const person = personAtDoor(key);
    if (person) rememberLook(person, look);
    walker = new HostWalker(host, this.ctx, {
      viewer: this.ctx.listener,
      seed: host.seed,
      look,
      label: `${host.who} · chat`,
      speaker: host.who,
      yields: false,
      social: person ? talkHook(this.ctx.social, person, (session) => this.hostTalk(host, person, walker, session)) : undefined,
    });
    return { host, items, shelf, walker, favourite: null };
  }

  /** Where they settle: in their armchair, or standing at their spot; eyes on the player. */
  private settle(d: Dressed): void {
    const { rest } = d.host;
    const { walker } = d;
    if ('seat' in rest) {
      const seat = resolvePlacement(plan.room, plan.seats.host);
      walker.position.copy(seat.position);
      walker.rotation.y = seat.rotationY;
      walker.sit(seat.rotationY, plan.seatHeight, 'lap', 'viewer');
    } else {
      walker.position.set(rest.at[0], 0, rest.at[1]);
      walker.rotation.y = rest.yaw;
      walker.stand(rest.yaw, 'stand', 'viewer');
    }
  }

  /** Their games, drawn once from the index: the favourite (kept by the TV) and the others on their shelf. */
  private async stock(d: Dressed): Promise<void> {
    const { host } = d;
    const pool = this.ctx.market.stock;
    const owns = (id: string) => this.ctx.collection.owns(id);
    const [favourite] = await drawGames(pool, `neighbourFavourite:${hostKey(host)}`, [host.favourite], 1);
    const games = await drawGames(pool, `neighbourShelf:${hostKey(host)}`, host.platforms, host.shelf, (id) => owns(id) || id === favourite?.id);
    d.favourite = favourite ?? null;
    if (this.current === d) this.parts.favourite.setGame(d.favourite);
    await d.shelf.fill(games, 1);
  }

  /**
   * Talking with the host at home (docs/social.md): their body answers; their news (their lines), their swap, and
   * their favourite game on their TV, watched together.
   */
  private hostTalk(host: NeighbourHost, person: PersonId, walker: HostWalker, session: SessionActions): TalkSession {
    const key = hostKey(host);
    const favourite = this.parts.favourite;
    const extras: TalkExtra[] = [
      { id: 'news', group: 'talk', label: 'What’s new?', run: () => ({ line: walker.newsLine() }) },
      {
        id: 'watch',
        group: 'invite',
        label: 'Watch their favourite together',
        opensPanel: true,
        disabled: () => (this.current?.favourite ? null : 'They are looking for it'),
        run: () => favourite.activate(session),
      },
    ];
    const offer = this.ctx.building?.trades?.offerAt(key);
    const panel = this.ctx.building?.tradePanel;
    if (offer && panel) {
      extras.push({
        id: 'swap',
        group: 'trade',
        label: `Swap: their ${offer.gives.title} for your ${offer.wants.title}`,
        opensPanel: true,
        run: () => {
          panel.prepare(offer);
          session.openPanel(panel);
        },
      });
    }
    return { person, place: 'theirFlat', body: bodyOf(walker), extras };
  }

  /** The longplay of their favourite went on: they say something, look at the screen a while, it counts for the friendship. */
  watching(): void {
    const d = this.current;
    if (!d) return;
    d.walker.speak(pick(random, d.host.watching));
    d.walker.setFocus(this.zone.toWorld(this.parts.tvAt.clone()));
    this.watchClock = WATCH_GAZE_S;
    befriend(hostKey(d.host), FRIENDSHIP_NUDGES.watch, 'watch', this.ctx.today.gameDay);
  }
}

/**
 * The host in their flat: chats in turn (their `lines`); with a swap of theirs standing (`NeighbourTrades`), a click
 * opens it, as their door does. Each chat counts once a day for the friendship (with the stairs' `chat`).
 */
class HostWalker extends Walker {
  private next = 0;

  private readonly hasSocial: boolean;

  constructor(private readonly host: NeighbourHost, private readonly ctx: Pick<BuildContext, 'building' | 'collection' | 'covers' | 'listener' | 'acoustics' | 'market' | 'social' | 'today'>, options: WalkerOptions) {
    super({ ...options, talk: () => this.line() });
    this.next = host.seed % host.lines.length;
    this.hasSocial = !!options.social;
  }

  /** Their next line, in turn (the conversation's "What's new?"). */
  newsLine(): string {
    return this.line();
  }

  override activate(session: SessionActions): void {
    // Someone to talk to (docs/social.md): the conversation has the swap, the news and the game among its entries.
    if (this.hasSocial) {
      super.activate(session);
      return;
    }
    const key = hostKey(this.host);
    befriend(key, FRIENDSHIP_NUDGES.visit, 'chat', this.ctx.today.gameDay);
    const offer = this.ctx.building?.trades?.offerAt(key);
    const panel = this.ctx.building?.tradePanel;
    if (offer && panel) {
      this.speak(`About my note: my ${offer.gives.title} for your ${offer.wants.title}. What do you say?`);
      panel.prepare(offer);
      session.openPanel(panel);
      return;
    }
    super.activate(session);
  }

  private line(): string {
    const { lines } = this.host;
    return lines[this.next++ % lines.length]!;
  }
}

/** A thing of a host's flat (`Dressing`), not yet placed; null when there is no model for it. */
function makeDressing(entry: Dressing): Furniture | null {
  switch (entry.kind) {
    case 'piece': {
      const piece = buildPiece(entry.id, entry.variant ?? 0);
      return piece ? new StaticPiece(piece.object) : null;
    }
    case 'decor':
      return new StaticPiece(stripped(buildDecor(entry.entry)));
    case 'birdcage':
      return new Birdcage();
    case 'dogBasket':
      return new DogBasket(entry.color);
    case 'poster':
      return paintedPoster(entry.title, entry.sub, entry.colors, entry.width, entry.height);
    case 'vectrex':
      return new Vectrex();
    case 'piano':
      return new Piano(entry.color);
  }
}

/** Takes every light out of a decor piece (the zone's lights never change with the host). */
function stripped(root: THREE.Object3D): THREE.Object3D {
  const lights: THREE.Light[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Light).isLight) lights.push(obj as THREE.Light);
  });
  for (const light of lights) light.parent?.remove(light);
  return root;
}

/**
 * A model standing in a host's flat, static (never ticked or clicked: its armchair is not sat in, its lamp not
 * switched): its own footprint and colliders when it is furniture, none otherwise.
 */
class StaticPiece extends THREE.Group implements Furniture {
  readonly footprint: THREE.Box3;
  readonly colliders?: readonly THREE.Box3[];

  constructor(object: THREE.Object3D) {
    super();
    this.name = `Static:${object.name}`;
    this.add(object);
    const furniture = object as Partial<Furniture>;
    this.footprint = furniture.footprint?.clone() ?? new THREE.Box3();
    if (furniture.colliders) this.colliders = furniture.colliders.map((box) => box.clone());
  }
}

