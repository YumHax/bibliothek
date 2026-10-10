import * as THREE from 'three';
import type { SessionActions } from '@/game/SessionActions';
import type { GrandmaVisits } from '@/grandma/GrandmaVisits';
import { MEMORIES, type Memory } from '@/grandma/memories';
import type { MemoryProjector } from '@/memories/MemoryFilm';
import type { MemoryReel } from '@/memories/memoryReel';
import type { AlbumSlot } from '@/ui/memories/AlbumPanel';
import type { Zone } from '../zone/Zone';
import type { Walker } from '../people/Walker';
import { placeWith } from '../zone/attach';
import { PhotoAlbum } from './PhotoAlbum';
import { christmasReel } from './christmasMemory';
import { arcadeReel } from './arcadeMemory';
import { saleReel } from './saleMemory';
import { wednesdaysReel } from './wednesdaysMemory';
import { leavingReel } from './leavingMemory';
import { rowReel } from './rowMemory';
import { keysReel } from './keysMemory';

/** What of the room as it is today a memory puts aside while it plays, and picks up after (Mémé). */
export interface Present {
  /** Mémé today: out of the picture while her younger self is in it. */
  meme: Walker;
  /** Back in the room: sits her down again where she is at this hour. */
  reseat(): void;
  /** What she says then (`GrandmaVisits.afterLine`: a first time, or again). */
  afterLine: string;
}

/**
 * The memories filmed (docs/story.md "Adding a memory"): a reel builder per `MEMORIES` id. A memory without one is
 * never offered (`GrandmaVisits.setFilmed`).
 */
const REELS: Readonly<Record<string, (present: Present) => MemoryReel>> = {
  christmas95: christmasReel,
  arcade: arcadeReel,
  sale: saleReel,
  wednesdays: wednesdaysReel,
  leaving: leavingReel,
  row: rowReel,
  keys: keysReel,
};

/** Where the album lies: on a host's top (`topHeight`), at host-local [x, z], turned by `yaw`. */
interface AlbumSpot {
  host: THREE.Object3D & { readonly topHeight: number };
  at: readonly [x: number, z: number];
  yaw: number;
}

/**
 * MÉMÉ'S ALBUM on her dining table (docs/story.md "Mémé"): clicked, it plays the memory she has ready when it is the
 * first, else opens her album (`MemoryProjector.album`: the prints of the memories seen, the one just found slipping
 * out, empty corners for the rest) and a print clicked plays its memory. The cover opens while it is looked at or a
 * memory plays. Returns the album (out of the picture while a memory is filmed in her flat: it is of today).
 */
export function placeAlbum(zone: Zone, spot: AlbumSpot, deps: { memories: MemoryProjector; visits: GrandmaVisits; meme: Walker; reseat(): void }): PhotoAlbum {
  const { memories, visits, meme, reseat } = deps;
  visits.setFilmed((id) => id in REELS);
  let filming = false;

  /** Plays `memory` (the album panel, if up, gives way to it). */
  const play = (session: SessionActions, memory: Memory): void => {
    const make = REELS[memory.id];
    if (!make) return;
    const film = memories.film(make({ meme, reseat, afterLine: visits.afterLine(memory) }), () => visits.markSeen(memory.id));
    film.addOpenListener?.((open) => {
      filming = open;
      if (!open) album.setOpen(false);
    });
    album.setOpen(true);
    session.openPanel(film);
  };

  /** The pages: every memory in order, a print if seen, the one she has ready slipping out, corners for the rest. */
  const pages = (): AlbumSlot[] => {
    const seen = new Set(visits.seen.map((memory) => memory.id));
    const due = visits.due?.id;
    return MEMORIES.map((memory) => ({
      id: memory.id,
      title: memory.title,
      state: seen.has(memory.id) ? 'seen' : memory.id === due ? 'new' : 'empty',
      still: memories.still(memory.id),
    }));
  };

  const album = new PhotoAlbum({
    label: () => (visits.due ? 'Mémé’s photo album · look' : visits.seen.length ? 'Mémé’s photo album · look again' : null),
    use: (session) => {
      const due = visits.due;
      // The very first: straight to the film (an album of one new print says nothing more).
      if (due && !visits.seen.length) {
        play(session, due);
        return;
      }
      if (!due && !visits.seen.length) return;
      const panel = memories.album;
      panel.setPages(pages(), (id) => {
        const memory = MEMORIES.find((m) => m.id === id);
        if (memory) play(session, memory);
      });
      album.setOpen(true);
      session.openPanel(panel);
    },
  });
  // The panel is the projector's (one for every build of the flat): its closing shuts this album unless a memory took over.
  zone.onUnload(memories.album.addOpenListener((open) => {
    if (!open && !filming) album.setOpen(false);
  }));
  album.rotation.y = spot.yaw;
  placeWith(zone, spot.host, album, new THREE.Vector3(spot.at[0], spot.host.topHeight, spot.at[1]));
  memories.markModern(zone, [album]);
  return album;
}
