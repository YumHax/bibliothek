import { KEYS, ROOT_PREFIX, onCorruptSave, onOtherTab, onWriteFailure } from '@/persistence';
import { capitalise } from '@/text/strings';

/** A repeated warning (every save fails once storage is full) is shown at most this often. */
const REPEAT_MS = 60_000;
const SHOW_MS = 9000;

/**
 * What each save is, in the player's words, by its `KEYS` name: every key has one (a key added without a name fails
 * the typecheck), grouped as the player thinks of them.
 */
const SAVE_NAMES: Readonly<Record<keyof typeof KEYS, string>> = {
  // Preferences.
  settings: 'your settings', quality: 'the graphics level', cat: 'the cat’s name and coat', marketRadio: 'the market radio’s station',
  // The collection and the flat.
  collection: 'your collection', deliveries: 'the parcels on their way', home: 'your flat’s furniture', furniture: 'where you moved the furniture',
  shelves: 'your shelves’ order', showcases: 'your display cases', shelfLabels: 'your shelf labels', household: 'the flat’s household',
  strayLaid: 'the boxes left out on tables', turntable: 'the record on the turntable', moodLamp: 'the mood lamp', vase: 'the flowers in the vase',
  position: 'where you stood', workshop: 'the consoles on your repair bench', homeArcade: 'your home arcade’s scores',
  longplayPlaces: 'where each longplay was left off', nesBattery: 'your NES carts’ saved games', catOutings: 'the cat’s outings',
  // Money and prizes.
  wallet: 'your wallet', prizes: 'your prizes', prizeGoal: 'the prize you are saving for', prizeSets: 'the prize sets you completed',
  valueHistory: 'your collection’s value history', milestones: 'your milestones', honours: 'the sets and consoles you completed',
  // The flea market and its people.
  market: 'the flea market', standing: 'your name at the market', notices: 'the market’s notice board', calendar: 'the market calendar',
  finds: 'your finds', giveaway: 'the giveaway box', garageSale: 'the garage sale', trader: 'the travelling trader',
  marketCredit: 'what a stallholder lent you', rival: 'the rival collector', rivalWager: 'your wager with Victor',
  auction: 'the saleroom', consignments: 'your copies entered at the saleroom', sealedLots: 'your sealed lots',
  classifieds: 'the small ads', lindenDepot: 'the dépôt-vente on Linden Avenue',
  // The arcade.
  arcadeScores: 'your arcade scores', arcadeScoresLegacy: 'your old arcade scores', arcadeDaily: 'the arcade’s daily challenge',
  arcadeMedals: 'your arcade medals', arcadeLeague: 'the arcade league', arcadeJackpot: 'the arcade jackpot',
  arcadeTournament: 'the arcade tournament', arcadeReplays: 'your arcade replays', arcadeHabits: 'the arcade’s tips and the claw’s luck',
  arcadeVisits: 'your arcade visits', payoutStats: 'the arcade’s payout figures', scratch: 'your scratch cards', scratchCard: 'your scratch card',
  // Front Street.
  busker: 'the busker', buskerRequests: 'your requests to the busker', streetShops: 'Front Street’s shops', pocket: 'what is in your pockets',
  strayCat: 'the stray cat', streetMarks: 'Front Street’s moments', streetLeads: 'the passers-by’s tips', plushGiven: 'the plush toys you gave',
  mansionBells: 'Park Corner Mansions’ doorbells', gameDayFinds: 'the coins found on Front Street', parkVisits: 'your visits to the park',
  fairRaffle: 'the fair’s raffle', trickOrTreat: 'Halloween’s doors', giftWrap: 'your wrapped presents', postCards: 'the cards you posted',
  // The building.
  neighbourTrades: 'the neighbours’ swaps', neighbourFriendship: 'how you stand with the neighbours', neighbourVisits: 'your visits to the neighbours',
  estateSale: 'the estate sale', neighboursParty: 'the neighbours’ party', bulkyWaste: 'bulky-waste day', yardKids: 'the courtyard’s kids',
  yardCinema: 'the film nights', buildingKeys: 'the building’s keys', blackout: 'the power cuts', cellar: 'the cellar',
  copro: 'the co-owners’ votes', concierge: 'the concierge', rouxMove: 'Mrs Roux’s move', attic: 'the attic', endlessDoor: 'the stairs’ strange door',
  felixShoebox: 'Félix’s shoebox', aerial: 'the roof’s aerial', buildingHunt: 'the treasure hunt', buildingPerks: 'the neighbours’ gifts',
  // Friends and people.
  visitors: 'your friends’ visits', gatherings: 'your games nights and open houses', social: 'how you stand with everyone',
  socialLife: 'favours and birthdays', socialSellers: 'the sellers you met', socialDigest: 'the People book’s week',
  socialNoticed: 'what people offered you', socialMood: 'people’s moods', socialNews: 'your news', socialKeepsakes: 'the keepsakes on your fridge',
  socialConflicts: 'the building’s quarrels', phoneCalls: 'your phone calls and messages', peopleBookSeen: 'what the People book showed last',
  friendsLife: 'your friends’ loans and postcards',
  // The story and Mémé.
  journal: 'your journal', journalRead: 'where you stopped reading the journal', firstDay: 'the first day’s to-do list',
  firstWelcome: 'the first day’s welcome', intro: 'the opening', post: 'your mail', daily: 'what was done today',
  prototypeStory: 'the lost prototype’s trail', felixNotebook: 'Félix’s notebook', familyStory: 'the family’s story', grandma: 'your visits to Mémé',
  grandmaRituals: 'Mémé’s lunches and favours', keepsakes: 'Mémé’s keepsakes', grandmaHints: 'Mémé’s hints', grandmaPresence: 'what Mémé remembers of you',
  playerInitials: 'your initials', albumFinds: 'Mémé’s album', albumPrints: 'your photos in Mémé’s album', memoryStills: 'the album’s memory photos',
  photoRoll: 'your last photos', grandmaPastimes: 'your afternoons with Mémé', grandmaBread: 'Mémé’s bread', sharedRide: 'your bus rides with Mémé',
  // Notices.
  tipsSeen: 'the tips you have seen', saidLog: 'what was said', debugProgress: 'the debug switches', debugStart: 'the debug start point',
  // Caches (not progress, named all the same).
  longplayCache: 'the longplay search', fameCache: 'the games’ fame', scanCache: 'the box scans found', artMisses: 'the missing box art',
  reviewsCache: 'the press reviews', loadTimesCache: 'the loading times', travelCardsCache: 'the travel cards’ photos',
};

/** Each key's storage name, with no save's prefix: `bibliothek.debug.wallet.v1` and `bibliothek.wallet.v1` are both `wallet.v1`. */
const bare = (key: string): string => key.replace(ROOT_PREFIX, '').replace(/^debug\./, '');
const NAME_BY_KEY = new Map(Object.entries(KEYS).map(([id, key]) => [bare(key), SAVE_NAMES[id as keyof typeof KEYS]]));

/** `bibliothek.wallet.v1` → "your wallet" (the debug save's keys too); an unknown key is "part of your progress". */
function saveName(key: string): string {
  return NAME_BY_KEY.get(bare(key)) ?? 'part of your progress';
}

interface Notifier {
  alert(text: string, ms?: number): void;
}

/**
 * Tells the player when their progress is at risk, in the alert bar: a save that did not reach
 * storage, a damaged save set aside or one saved by a newer version (those found while loading, before
 * the UI existed, included), named in the player's words ("your wallet"),
 * another tab playing on the same save. Each kind of warning is repeated once a minute at most.
 * Called once by the `Notices`; returns the unsubscribe.
 */
export function announceSaveProblems(notices: Notifier): () => void {
  const last = new Map<string, number>();
  const say = (kind: string, text: string) => {
    const now = performance.now();
    if (now - (last.get(kind) ?? -Infinity) < REPEAT_MS) return;
    last.set(kind, now);
    notices.alert(text, SHOW_MS);
  };
  const stops = [
    onWriteFailure(() => say('write', 'Could not save: the browser’s storage is full or blocked.\nWhat you do now will not survive a reload.')),
    onCorruptSave((e) => {
      const what = saveName(e.key);
      const What = capitalise(what);
      say(
        `corrupt:${e.key}`,
        e.newer
          ? `${What} was saved by a newer version of the game. This older version plays on from what it understands, so what you do now will not carry back to the newer one${e.backup ? ' (a copy of the newer save is kept)' : ''}.`
          : `${What} could not be read, so it starts afresh (a copy of the damaged save is kept).`,
      );
    }),
    onOtherTab((signal) => say(
      `tab:${signal}`,
      signal === 'open'
        ? 'The game is open in another tab: play in one only, or each will save over the other.'
        : 'Another tab just saved over this game’s progress.',
    )),
  ];
  return () => stops.forEach((stop) => stop());
}
