// Time: the game's clock, not the wall's (`src/time/`, docs/checks.md "Conventions"). A delay in zone or game code
// runs on the zone's time (`zone.after`, `core/Timers`), an animation's phase accumulates `dt`, an hour window is an
// `inHours` span, a "done today" marker lives in `time/OncePerDay`, and the URL's switches are read in
// `settings/flags`. Loaded by ../check-conventions.mjs; see there for a rule's shape.

/** Zone and game files that genuinely need the wall clock, each with its reason. */
const REAL_TIME = [
  // Loading and streaming run on real time: a video's buffering, a compile budget in milliseconds, a network wait.
  'world/screen/VideoSurface.ts',
  'world/outlook/OutlookView.ts',
  'world/airlock/AirlockLink.ts',
  'world/airlock/StreetAhead.ts',
  'world/World.ts',
  // DOM transitions and reading times are paced in real milliseconds (a fade, a card the player reads).
  'game/Sleep.ts',
  'game/Seating.ts',
  // Input windows (a double tap, a press twice, a hover relabel) are the player's time, not the room's.
  'game/Session.ts',
  'game/Browse.ts',
  'game/MarketCounter.ts',
  'game/ArcadePlay.ts',
  'game/ProgramPlay.ts',
  'game/CopyOpening.ts',
  'game/Purchases.ts',
  'game/NoticeDismiss.ts',
  'world/market/CartonCorner.ts',
  'world/props/WallClock.ts',
  // Audio nodes are freed when their sound has played out: AudioContext time, not the zone's.
  'world/street/audio/RoadworksSound.ts',
  'world/saleroom/Saleroom.ts',
];

/** Files whose hour checks belong to another wave's fork or session (2026-10-04): converted there, not here. */
const OTHER_HANDS = ['world/saleroom/Saleroom.ts', 'world/bedroom/furnishBedroom.ts', 'social/mood.ts'];

/**
 * Stores still keeping a "last day done" field of their own, with more than the marker in them (the household's
 * seven, the visits' book, the cat's outings): the next pass adopts them into `time/OncePerDay` (2026-10-04).
 */
const PENDING_MARKERS = ['household/Household.ts', 'world/visitors/VisitBook.ts', 'world/cat/escapes.ts'];

export const rules = [
  {
    name: 'wall-clock delay',
    // A `setTimeout` in a zone fires while the zone is dormant and after it unloads; `zone.after` / a `Timers` does not.
    // A sound node's `disconnect()` once it has played out is AudioContext time and stays.
    test: (line) => /\b(window\.)?set(Timeout|Interval)\(/.test(line) && !/\.disconnect\(\)/.test(line),
    within: ['world/', 'game/'],
    except: REAL_TIME,
    hint: 'use zone.after(seconds, fn) in a builder or a core/Timers ticked from update(dt) in a prop (a sound node freed after it played takes `// convention-ok: audio`)',
  },
  {
    name: 'wall-clock animation',
    // `performance.now()` in a prop's update: the animation runs on while the game is paused and jumps after a tab switch.
    test: (line) => /performance\.now\(\)/.test(line),
    within: ['world/', 'game/'],
    except: REAL_TIME,
    hint: 'accumulate dt into a phase field in update(dt) (Aerial.wind, ArcadeCabinet.pulse), or a core/Timers',
  },
  {
    name: 'url switch',
    // One place parses `?debug`, `?stats`, `?quality=`...: a switch is named there and the headless runs see none.
    test: (line) => /location\.search/.test(line),
    // bootstrap/services.ts takes `?debug` from `flag('debug')` but still parses the URL for `?season=` / `?weather=` /
    // `?lat=` and hands `params` to the other steps: those move to `flagValue` in a later pass.
    except: ['settings/flags.ts', 'bootstrap/services.ts'],
    hint: "use flag('debug') / flagValue('quality') from settings/flags",
  },
  {
    name: 'hand-made hour window',
    // `hours >= from && hours < to` had three wrap rules in the tree; `inHours(hours, span)` has one.
    test: (line) => /\b[\w.]*hours? >= [\w.]+ && [\w.]*hours? < [\w.]+/.test(line) || /\b[\w.]*hours? < [\w.]+ \|\| [\w.]*hours? >= [\w.]+/.test(line),
    except: ['time/clock.ts', ...OTHER_HANDS],
    hint: 'use inHours(hours, [from, to]) or inHours(hours, { from, to }) from time/clock (a span past midnight included)',
  },
  {
    name: 'hand-made once-a-day marker',
    // A store's own "last day done" field, with its own empty value: `time/OncePerDay` keeps them all, by name.
    test: (line) => /\b\w*(Day|On)\s*:\s*(-1|-99|null|'')\s*[,}]/.test(line) && /\b(last|done|collected|tipped|fed|played|visited|shown|told|picked|cut|treat|dream|radio|invite|firstSale|lastDay)\w*\s*:/.test(line),
    except: ['time/OncePerDay.ts', ...PENDING_MARKERS],
    hint: 'use oncePerDay.done(id, day) / mark(id, day) from time/OncePerDay (adopt the old field once: oncePerDay.adopt)',
  },
];
