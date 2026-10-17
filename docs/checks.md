# The checks

There is no test suite: the checks below are the net. They run in two bands, both from `package.json`:

- `npm run typecheck` (about 15 s), after every change: `tsc` (src, then `api/`), then the scripts that read the tree or
  build it headless: `check-conventions`, `check-contrast`, `check-imports`, `check-docs`, `check-data`, `check-glsl`,
  `social-sim`, `zfight`, `scene-lint`.
- `npm run lint` (about 20 s), before a commit and inside `npm run build`: `eslint`, `cspell`, `knip`.
- `npm run build` = typecheck + lint + `vite build` + `check-bundle`.

Each script says what it enforces and where the right way lives; a failure names the file and the rule. The
`.githooks/pre-commit` hook runs the typecheck before each commit (`git config core.hooksPath .githooks` installs it per
clone; `git commit --no-verify` skips it once).

## Baselines and opt-outs

A check that would fail on what is already there carries a baseline: a count or a list of known cases that may not grow.
A reviewed case is accepted by rewriting the baseline, never by loosening the rule.

| Check | Baseline | Rewrite |
| --- | --- | --- |
| check-conventions, small offsets | `scripts/offset-baseline.json` | `node scripts/check-conventions.mjs --write-baseline` |
| zfight | `scripts/zfight-baseline.json` | `npm run zfight -- --write-baseline` |
| scene-lint | `scripts/scene-baseline.json` | `npm run scene-lint -- --write-baseline` |
| check-bundle | `scripts/bundle-baseline.json` | `node scripts/check-bundle.mjs --write-baseline` |
| check-contrast | `scripts/contrast-baseline.json` | `node scripts/check-contrast.mjs --write-baseline` |

| Opt-out | Where | Means |
| --- | --- | --- |
| `// convention-ok: <why>` | a source line | check-conventions skips the line |
| `// imports-ok: <why>` | an import line | check-imports drops that edge from every rule, cycles included |
| `/* contrast-ok: <why> */` | inside a CSS rule | check-contrast skips the rule (a reading it gets wrong) |
| `/** @public */` | an export's JSDoc | knip does not report it unused (the debug console, a script's import) |
| `scripts/cspell-words.txt` | one word a line | cspell knows the word (a game, a neighbour, a GLSL chunk) |
| `MyThing`, `<kind>` | a doc | check-docs reads the path as a placeholder |

## Conventions (`scripts/check-conventions.mjs`)

Rules as data, one module per concern in `scripts/conventions/` (the script only loads and runs them; a rule may be
`within` some folders, `except` files or folders, and read `.css` instead of `.ts`). `surface.mjs`: no bare render order
or polygon offset (`world/surface/layers`), no in-place edit of a shared geometry, no unshared module-level material, no
light hidden with `visible`, one way to make a canvas texture and to tile it, no anisotropy number, no random lift, plus
the ratchet on hand-picked millimetre offsets (docs/props.md, docs/graphics.md). `random.mjs`: no `Math.random`, generator
or hash constant, sort-shuffle, clock-seeded or day-seeded stream outside `src/random/` and `time/daily`. `maths.mjs`: no
local clamp / lerp / smoothstep / easing / angle helper, `atan2(sin, cos)` wrap or frame-share smoothing outside
`src/math/`. `text.mjs`: no hand-made plural, money string, `toLocaleString`, padded clock, capital or bare title sort
outside `src/text/`. `audio.mjs`: no local burst / ping / bed helper, no second `AudioContext`, no gesture listener in
`src/audio`, no loudness curve written in place outside `audio/hearing`. `ui.mjs`: no `innerHTML`, `escapeHtml`, raw keydown
listener, `title=` tooltip, hand-made status line, press-twice timer or second search debounce in a panel (the kit does
these, docs/ui.md). `time.mjs`: no `setTimeout` / `setInterval` / `performance.now()` in zone or game code (`zone.after`,
a phase fed by `dt`; audio and loading say why), no `location.search` outside `settings/flags`, no hand-made hour window
(`time/clock` `inHours`) or hand-rolled daily marker (`time/OncePerDay`). `css.mjs`: below. A new shared module lands
with its rule module.

## Stylesheets (`scripts/conventions/css.mjs`)

The look is layered: `ui/design/tokens.css` holds every colour, size, radius, shadow, duration and stacking level as a
token; `base.css` the page, `kbd` and the one focus ring; `components.css` the building blocks (`.ui-btn`, `.ui-card`,
`.ui-modal`, `.ui-field`, `.ui-tabs`, `.ui-row`, `.ui-chip`, `.ui-badge`, `.ui-coin`, `.ui-status`, `.ui-paper`); each
panel's sheet comes last, in `@layer panels`, and only lays them out. A sheet writes no raw colour, `z-index`, font family
or duration: it names a token, or sets a slot variable in its theme block (`--pz-hot` on the prize counter, `--shop-ink`
per shop, `--focus` for a theme's ring) and reads it with `var()`. A time TypeScript waits for is a slot beside the rule
(`--search-fade: 140ms`). `!important` is for the few overrides that say why (`/* convention-ok: <why> */`): `[hidden]`,
the renderer's inline style, the reduce-motion clamp, pad-mode cursor, the photo dim. A legacy class listed beside a
`.ui-*` selector in components.css goes when its template says `.ui-*`.

## Contrast and text size (`scripts/check-contrast.mjs`)

The social UI must read without effort (docs/social.md "Clarity"). Every rule that sets a text colour in
`src/ui/social/` (every sheet under it) and in the social part of `src/notices/notices.css` (the speech bubbles, the
subtitles, the reward banner: selectors naming social, people, reward, speech, subtitle, bubble) is read against the
background it sits on and must reach the WCAG 4.5:1, or 3:1 for large text (24 px, or 18.66 px bold); and no rule there
sets a font size under 14 px. Tokens resolve through `ui/design/tokens.css` and the sheet's own custom properties;
sizes are read at the 16 px root (`rem`, `em`, `max()` / `min()` / `clamp()` / `calc()`; a `%` or a `vw` is skipped);
`color-mix()` and translucent colours are laid over what is under them. The tier colour the code sets (`--tier`) is
tried for every tier of `socialPlan.TIERS`, the worst one decides and is named. The background is the rule's own over
the nearest class of its selector that another rule of the sheet paints (its own compound, its ancestors right to
left, then the BEM blocks they belong to: `.speech__name` sits in a `.speech`), else the sheet's ground (`GROUNDS`: the
card's for `social.css`, the page's for the book; a frame such as the book's leather is not a ground, `FRAMES`). It is a
reading, not a browser: a rule it reads wrong takes `/* contrast-ok: <why> */`. Findings are keyed by sheet, selector
and kind (`contrast|ui/social/social.css|.social-talk__level`), compared with the baseline; `--list` prints them all
with their numbers.

## Import rules (`scripts/check-imports.mjs`)

The layer order of CLAUDE.md read off the import graph of `src/`: `main.ts` imports values only from `bootstrap/`;
nothing but `main.ts` imports `bootstrap/` (types included); the engine (`core`, `player`, `input`, `interaction`)
imports values only from the engine folders, `graphics`, `settings` and `persistence`, anything else is handed in by the
wiring (an option, a callback, an element: `TouchControls` takes its `badgeHome`); plan files (`worldPlan.ts`,
`roomPlan.ts`, `**/*Plan.ts`) import no values from three.js, the engine, `game/`, `ui/`, `world/zone/`, `layout.ts` or
a `furnish*.ts`; `world/**` imports no values from `game/`; furniture knows no other plan (below); and no runtime import
cycle (value, static edges: type-only imports are erased, a dynamic import runs after both modules exist). A relative or
`@/` import that resolves to nothing fails too. The script checks itself on a small synthetic tree before the real one.
No baseline: the tree passes clean. `node scripts/check-imports.mjs --verbose` adds the edge counts and the tallies.

**The measures.** What a plan lays out and what a class builds often agree on one number: the height of a storey, where
the kerb is, how wide the street door's hole is. Those numbers live in `world/measures/`, one small file per family, and
both sides import them; a plan never exports a dimension for a class to read. A class reads its own zone's plan as its
data, never another zone's and never the world plan ("furniture knows no other plan"); what one zone needs of another
comes as an option from its builder, or, where the feature is the crossing itself (the cat's outing, the party's
residents, the painted view), on an import line that says so with `// imports-ok: <why>`.

## Docs paths (`scripts/check-docs.mjs`)

Every backticked path in CLAUDE.md, README.md, docs/ and the skills (and the folder map's first column) must exist. A
path resolves as written, under `src/` or `src/world/`, by its tail, by its bare name anywhere in the tree, or as a
folder and the name of something a file of that folder exports (`city/SKYLINE`). Placeholders (`MyThing`, `<kind>`) and gitignored places
(`.cache/`, `dist/`) are not checked; `docs/consistency-audit.md` is skipped (a proposal). `node scripts/check-docs.mjs
--list` shows what each reference resolved to.

## Data (`scripts/check-data.mjs`)

Bundles the game headless (`scripts/headless.mjs`) and checks what is data: the seed catalogue and bootlegs (unique
canonical ids, known platforms, well-formed dates, a case and a cartridge per copy), the media tables (every platform and
region, labels inside their shells), the platforms, `public/boxart/index.json` against the files on disk and the seed
games, the save `KEYS` (unique, under the root prefix), `WORLD_PLAN` (neighbours that exist, arrivals inside their zone,
the collection room's doorways onto neighbours), a `PAYOUT` rate for every cabinet game, and every pricing table finite
with prices never negative and odds in 0..1. `--list` adds what is only worth knowing (seed games without baked art,
neighbours not kept both ways).

## Shaders (`scripts/check-glsl.mjs`)

A shader program lives in a `.glsl` file beside the module that compiles it (`Foo.vert.glsl`, `Foo.frag.glsl`) and is
imported as its text (`import frag from './Foo.frag.glsl?raw'`; `src/vite-env.d.ts` types it, `scripts/headless.mjs`
loads it in Node). What the file cannot hold statically comes in through `assemble()` (`graphics/glslAssemble`): a
TypeScript value as a `#define TS_NAME` (the GLSL may then declare `const float NAME = TS_NAME;`), a shared or generated
chunk as an `#include <name>` it replaces; three.js's own `#include` lines pass through. Fragments spliced into three.js's
chunks and the chunk constants themselves (`graphics/glslNoise`, the sky and vehicle chunks) stay template literals: no
backtick in them. The check parses every `.glsl` as GLSL ES and fails on one no module imports.

## Z-fighting (`scripts/zfight.mjs`)

Every decor kind and shop prop on its own and every room as its plan lays it out, built headless at high quality and run
through the browser's own detector (`world/surface/zfight`); a pair of faces in one plane that is not in the baseline
fails. Front Street is two subjects: `street:base` (ground, park, facades and what stands on them) and `street:fixtures`
(on the ground: lamps, trees, parked cars, furniture, the works and drains, cabinets and signs, the put-out bins, the
shops' spill, signals, wayfinding, the post and phone boxes, terraces, December's bulbs, the snowman). Its baseline holds
three pairs inside the cars' and the trees' instanced parts that only fight past 120 m. The parked cars' shapes and gaps
are the day's draw (`dailyRandom`), so a pair may come and go with the date. docs/props.md "Check" has the recipe; `npm run zfight -- --only <subject>` builds one.

## Scene lint (`scripts/scene-lint.mjs`)

Builds the z-fight catalogue's subjects headless and checks what only shows in play otherwise, one concern per file in
`src/world/lint/`: lights (a shadow-casting point or spot light keeps `shadow.camera.far` under 30 m and `autoUpdate`
false, i.e. owned by `lighting/shadowRefresh`; a point or spot light has a `distance`; a prop owns no shadow and no
HemisphereLight; per room: shadow maps within `QUALITY.lights` and 16 texture units, one hemisphere), placement per room
(nothing sunk more than 15 mm, floating more than 2 cm with no support, wall or ceiling, past a wall plane by more than
12 cm, or two things' parts sharing over half the smaller part's volume; flat things and things hung by their plan line or
saying `contactShadow = false` are exempt), reach (a clickable thing whose hitboxes all hang above 2.2 m), disposal
(`dispose()` then `disposeTree` must free nothing `markShared` and leave nothing of the prop's own; a resource two builds
hold, every prop being built twice, must be marked shared), and outdoors, for a subject that gives its `ground` (the
street's fixtures, `groundHeight`), ground (`world/lint/ground`: every mesh split into connected pieces, an instance a
piece, touching pieces joined into things; a thing whose lowest piece is over the ground under it by more than 3 cm, or
into it by more than 15 cm, is found; the ground itself, `userData.ground`, and what hangs, `contactShadow = false`, are
left out). A cache counted by its users (`Buildings`' painted atlases) frees its GPU copy after the unload that let the
last one go, never inside a `dispose()`. Findings are keyed by subject, rule and names (`plant#2`,
`FloorLamp > PointLight`), never coordinates, and compared with `scripts/scene-baseline.json`; a new one fails with a hint
per rule, `--list` shows them all, `--write-baseline` accepts what is there after a look, `--only room:` narrows,
`--verbose` prints each room's light counts. The props' randomness is seeded for the run. Lights that a `furnish*.ts`
builds (shelf lamps, the suns, the stair lights) are outside the catalogue, so a room's shadow budget is judged on its
shell and plan decor; the browser's `[lights]` monitor (`lighting/lightBudget`) covers the rest.

## Social sim (`scripts/social-sim.mjs`, `npm run social`)

Part of the typecheck (about 8 s). Bundles `src/headless/social.ts` afresh for each run (the standing is a
module-level store) and plays the cast through the real rules (`conversation.choicesFor` / `say` / `endConversation`,
gifts, the drift, the favours drawn as `life/favours` draws them (in a fresh order each day), said yes to and kept or
broken as promises, the co-owners' meeting's vote promises (one camp of each resolution, asked when the resident is met
while the ballot is open), beating the rival to a copy now and then, a deal now and then with a light person as the
trades move them). It prints each person's warmth, trust, tier and perks in force, and fails when:

- a perk is out of reach of two diligent players (120 game days: everyone daily, the best-looking choice every time,
  gifts, every favour said yes to and kept; a perk counts as reachable when either gets it, the two being asked other
  favours);
- the typical player (60 game days: a few people a day, the best-looking choice three times in four, a gift now and
  then, most promises kept) has a share of the deep people at Friendly or more outside 40-60 % by more than 10 points,
  the mean of three such players (Friendly rests on one promise kept, one event a person: one run is too few people to
  say it; a note inside the tolerance), or more than 25 % of everyone at 95 warmth or more (20 % wanted);
- a careless clicker (30 choices in a row with each deep person on day 1, anything offered but a long press, a new
  conversation whenever one ends) gains more than one conversation at its best (12.5 warmth: `TALK`'s three exchanges
  of a loved topic in a good mood, and the good talk), or ends the day more than 3 warmth down (a disliked choice
  costs a little, its face showed it; a dip on the way is a note);
- the coverage: a deep person with fewer than four topics or none obvious, a topic without an answer or words, a
  topic teaching or opening on a fact the card does not have, a choice the engine offers that gets no answer or a number
  asked that is not given (each choice said from every warm tier), a place entry with no words.

`--days`, `--seed`. Each person draws from their own stream (the seed and their id), so a newcomer to the cast leaves
everyone else's results as they were.

## Bundle size (`scripts/check-bundle.mjs`)

The last step of `npm run build`: every chunk in `dist/assets` weighed (raw and gzip) against `scripts/bundle-baseline.json`.
A chunk may grow 5 % (and 2 kB), the total 3 %; new chunks are allowed, a split is the point. New weight that belongs to
one zone goes behind that zone's dynamic import; `--list` prints the table.

## Lint (`npm run lint`)

- **ESLint** (`eslint.config.mjs`, type-aware, about 13 s) covers only what tsc cannot see: a `switch` over a union names
  every member or has a `default`; `map` / `filter` callbacks return on every path; no promise is dropped (`void` says it
  is meant) or handed to a plain callback; `===` except against null; no comparison that is always true. No style rules:
  the style is in docs/ and the skills, the layout rules in check-conventions. Alone: `npx eslint src server api`.
- **knip** (`knip.json`, about 4 s) reports unused files, exports, types and dependencies. A headless script imports the
  game through a module in `src/headless/` (an entry knip and tsc both read), never through a string in the script. An
  export kept on purpose carries `/** @public */` and is not reported. The tree is kept at zero: an export nobody imports is
  removed, not kept for later.
- **cspell** (`cspell.json`, British English with American allowed, about 5 s) reads strings, comments and docs. A real
  misspelling is fixed where it is; a name (a game, a neighbour, a GLSL chunk) goes into `scripts/cspell-words.txt`, one
  a line, any case; an identifier with a typo inside goes there too with a `# typo:` note until it is renamed.

## Stricter TypeScript

`tsconfig.json` has `noImplicitReturns`, `noImplicitOverride` and `noUncheckedIndexedAccess` on besides `strict` and the
unused checks: an index into an array or a record is `T | undefined` until checked (`?? fallback`, an `if`, or a `!` where
the index was just produced by the same code, with the reason in a comment), and a method that overrides says `override`.

## Debug mode (`?debug`)

Not a check but the way to reach every feature at once, on a save of its own (`persistence/keys`: every key under
`bibliothek.debug.`, the player's real save never read or written). It starts with the seed collection and the homebrew
carts, the editor's add pane, no first day and no opening, and every progression done: `src/cheats/progress/progressions.ts`
lists them (the furnished flat, the concierge and the cellar key, the attic's code, cabinet and chest, the aerial's
channels, the treasure hunt, everyone met as a close friend with their number, facts and traits (quietly: no banner or journal line each), the grey cart, Félix's
notebook, the market's top reputation and best-customer standing at every stall, gold on every arcade machine, every
prize), each with `on` / `unlock` / `lock`. `bootstrap/services` unlocks whatever does not hold yet at each start-up
(`debugProgress.unlockDebugProgress`), before the trail reads its cart.

The debug panel (`ui/debug/DebugPanel`, the key left of 1 or F8, `bibliothek.debugPanel()`): *Progress* switches each
progression (a switch turned off is undone and stays off in the debug save, `KEYS.debugProgress`; "Apply and reload"),
*Votes* sets the co-owners' decisions outright (`coproState.decideResolution`), *Now* makes things happen (power cut, an
endless night, the neighbours' party today, the estate sale today, a bulky-waste day in the courtyard, 5000 coins, 500 tickets), *Go to* travels to any
stop, those only their own door reaches included (`Travel.everyStop`). In the console besides: `bibliothek.coins(n)`,
`blackout()`, `endlessStairs()`, `party()`, `estateSale()`, `bulkyDay()`, `social.table()` / `social.set(id, warmth, trust)`,
`zfight()`; typing 5 0 0 0 still gives 5000 coins. A new progression is one entry in `PROGRESSIONS`.

*Social lab* (`cheats/socialLab`; `?debug&social-lab` opens the panel on it at boot) acts on one person: the one being
talked to, else the last talked to, else the one picked with its Previous / Next buttons. It sets their tier outright
(quietly), marks their mood for the day with a cause, opens the conversation each way (`OpeningKind`) and plays each
outcome in it (loved, liked, polite, disliked, "they'll remember that", a fact to the book, a promise ticket, a tier up in
the card, having to go), stages their tier's scene, and toggles the largest text and reduced motion. The conversation
panel and the tier scenes register what they can play (`registerLabConversation`, `registerLabScenes`); a button whose
side is not registered says so.
