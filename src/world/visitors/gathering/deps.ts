import type * as THREE from 'three';
import type { Game } from '@/catalog/types';
import type { ProgramRunner } from '@/onscreen';
import type { VideoScreen } from '../../screen';
import type { GatheringBook } from './GatheringBook';
import type { VisitHost } from './host';

/** What the gatherings need besides the visitors' director (`host`): the book, the TV for a match, the stores. */
export interface GatheringDeps {
  host: VisitHost;
  book: GatheringBook;
  /** The living room's TV, for a games night's match (a `VideoScreen` that can show a program), and where it stands. */
  tv?: VideoScreen & THREE.Object3D;
  /** The runner of programs on the flat's screens (made with the Session: null until then). */
  programs?: () => ProgramRunner | null;
  /** The market's standing: an open house counts as a deed there. */
  standing?: { record(deed: 'openHouse'): void };
  /** Whether a copy is worth a guest's gasp (famous, a first print, a grail). */
  isRare?: (game: Game) => boolean;
  /** The most valuable copy on the shelves, for the paper. */
  showpiece?: () => Game | null;
  /**
   * The displays with something in them (`world/showcase/Showcases.stops`): where to stand (world floor point), facing,
   * what to look at, what is in them. An open house's guests stop at them.
   */
  showcases?: () => readonly { at: THREE.Vector3; yaw: number; look: THREE.Vector3; name: string; games: readonly Game[] }[];
  /** Where an honour's neon hangs (world), for the club's visitor to look up at. */
  honourAt?: (id: string) => THREE.Vector3 | null;
}
