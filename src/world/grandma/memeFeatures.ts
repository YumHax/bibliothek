import type { MemeFeature } from './memeScene';
import { hintsAtHers } from './visit/hints';
import { pastimesAtHers } from './visit/pastimes';
import { albumGifts } from './visit/albumGifts';
import { gaspardAtTable } from './visit/gaspardSunday';
import { gameBoyReturn } from './visit/gameBoyReturn';
import { keepsakesAtHers } from './visit/keepsakes';
import { breadAtHers } from './visit/bread';
import { remembers } from './visit/remembers';
import { tellHer } from './visit/tellHer';
import { tea } from './visit/tea';
import { sitWithHer } from './visit/sitWithHer';
import { herChores } from './visit/herChores';
import { gaspardCall } from './visit/gaspardCall';
import { ritualsAtHers } from './visit/rituals';

/**
 * The features of a visit to Mémé's (docs/grandma.md "The scene"), started in this order when her flat is built: a
 * new one is a file under `world/grandma/visit/` exporting a `MemeFeature`, added here.
 */
export const MEME_FEATURES: readonly MemeFeature[] = [hintsAtHers, pastimesAtHers, albumGifts, gaspardAtTable, gameBoyReturn, keepsakesAtHers, remembers, tellHer, tea, sitWithHer, herChores, gaspardCall, breadAtHers, ritualsAtHers];
