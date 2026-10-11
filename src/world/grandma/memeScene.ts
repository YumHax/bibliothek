import type * as THREE from 'three';
import type { BuildContext } from '../buildContext';
import type { Zone } from '../zone/Zone';
import type { Walker } from '../people/Walker';
import type { TalkExtra } from '@/social/talk';
import type { SessionActions } from '@/game/SessionActions';
import type { GrandmaTalk } from '@/grandma/GrandmaTalk';
import type { GrandmaVisits } from '@/grandma/GrandmaVisits';
import type { Seat } from '../Seat';
import type { GrandmaDressing } from './furnishGrandmaDecor';

/**
 * Her things a feature may use: the set (`setOn`, `isOn`), the kettle (`whistle`), the cloth on the dining table
 * (`topHeight`), the window's curtains, the tea tray; and the visitor's armchair (the player sits in it).
 */
export type MemeThings = Pick<GrandmaDressing, 'tv' | 'kettle' | 'table' | 'window' | 'tray'> & { visitorChair: Seat };

/*
 * MÉMÉ'S VISIT AS ITS FEATURES SEE IT (docs/grandma.md "The scene"): what `placeMeme` hands every feature of a visit
 * (tea, a game of cards, the quiz, her stories, Gaspard on the phone…), so each lives in a file of its own and none
 * drives her body while another has her (`claim`).
 */

/** What the door brought, as the features hear it once her hello is over. */
export interface MemeArrival {
  /** The first visit ever. */
  first: boolean;
  /** Coins in the Sunday envelope (0: not a Sunday, or given already today). */
  envelope: number;
  /** Seconds from now until her hello's last line is out (schedule after it). */
  helloEnds: number;
}

/** Her visit, for a feature. */
export interface MemeScene {
  readonly zone: Zone;
  /** Mémé's body (a `Walker`: `walk`, `sit`, `stand`, `gesture`, `feel`, `speak`, `hold`). */
  readonly meme: Walker;
  readonly ctx: BuildContext;
  /** Her set, her kettle, the dining table's cloth. */
  readonly things: MemeThings;
  readonly visits: GrandmaVisits;
  readonly talk: GrandmaTalk;
  /** The game hour and game day now. */
  hour(): number;
  day(): number;
  /** A zone-local point in world space (the plans are zone-local). */
  world(x: number, y: number, z: number): THREE.Vector3;
  /** Sits her back in her spot for the hour (armchair or table), as she was before a feature took her. */
  reseat(): void;
  /**
   * Her seat for the hour: the zone-local floor point she sits at, her yaw there, and the way out of it (zone-local
   * floor points, the seat's side first). `visit/herWay.ts` walks her from it and back.
   */
  home(): { at: readonly [number, number]; yaw: number; way: readonly (readonly [number, number])[] };
  /** Her lines said one after another (her speech gap apart); `then` after the last. */
  say(lines: readonly string[], then?: () => void): void;
  /** Takes her for a while (a walk to the kettle, a game of cards): false if another feature has her. */
  claim(owner: string): boolean;
  /** Gives her back (`owner` must be the one holding her); she is not reseated: call `reseat` first if wanted. */
  release(owner: string): void;
  /** Which feature has her now, or null. */
  readonly busyWith: string | null;
  /** The player in her flat now. */
  readonly playerIn: boolean;
  /** The player in conversation with her now. */
  readonly talking: boolean;
}

/** A feature of the visit, started once per build of her flat. */
export interface MemeFeature {
  id: string;
  start(scene: MemeScene): MemeFeatureLive;
}

/** A started feature: each part optional. */
export interface MemeFeatureLive {
  /** Entries of her conversation (asked each time it opens; `session` for an entry that opens a panel, `opensPanel`). */
  extras?(session: SessionActions): TalkExtra[];
  /** On the way in, once her hello is out (not when coming back from a memory filmed elsewhere). */
  arrived?(arrival: MemeArrival): void;
  /** The player has left her flat. */
  left?(): void;
  /** Every frame her flat is loaded. */
  update?(dt: number): void;
}
