# The checks

There is no test suite: the checks below are the net. They run in two bands, both from `package.json`:

- `npm run typecheck` (about 12 s), after every change: `tsc` (src, then `api/`), then the scripts that read the tree or
  build it headless: `check-conventions`, `check-imports`, `check-docs`, `check-data`, `check-glsl`, `zfight`, `scene-lint`.
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

| Opt-out | Where | Means |
| --- | --- | --- |
| `// convention-ok: <why>` | a source line | check-conventions skips the line |
| `// imports-ok: <why>` | an import line | check-imports drops that edge from every rule, cycles included |
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
fails. docs/props.md "Check" has the recipe; `npm run zfight -- --only <subject>` builds one.

## Scene lint (`scripts/scene-lint.mjs`)

Builds the z-fight catalogue's subjects headless and checks what only shows in play otherwise, one concern per file in
`src/world/lint/`: lights (a shadow-casting point or spot light keeps `shadow.camera.far` under 30 m and `autoUpdate`
false, i.e. owned by `lighting/shadowRefresh`; a point or spot light has a `distance`; a prop owns no shadow and no
HemisphereLight; per room: shadow maps within `QUALITY.lights` and 16 texture units, one hemisphere), placement per room
(nothing sunk more than 15 mm, floating more than 2 cm with no support, wall or ceiling, past a wall plane by more than
12 cm, or two things' parts sharing over half the smaller part's volume; flat things and things hung by their plan line or
saying `contactShadow = false` are exempt), reach (a clickable thing whose hitboxes all hang above 2.2 m), disposal
(`dispose()` then `disposeTree` must free nothing `markShared` and leave nothing of the prop's own; a resource two builds
hold, every prop being built twice, must be marked shared). Findings are keyed by subject, rule and names (`plant#2`,
`FloorLamp > PointLight`), never coordinates, and compared with `scripts/scene-baseline.json`; a new one fails with a hint
per rule, `--list` shows them all, `--write-baseline` accepts what is there after a look, `--only room:` narrows,
`--verbose` prints each room's light counts. The props' randomness is seeded for the run. Lights that a `furnish*.ts`
builds (shelf lamps, the suns, the stair lights) are outside the catalogue, so a room's shadow budget is judged on its
shell and plan decor; the browser's `[lights]` monitor (`lighting/lightBudget`) covers the rest.

## Social sim (`scripts/social-sim.mjs`, `npm run social`)

Not part of the typecheck: run it after touching `social/socialPlan.ts`, a card's effects or the talk rules. Bundles
`src/headless/social.ts` (a fresh copy per run: the standing is a module-level store) and plays the cast through the
real rules: a typical player (a few meetings a day) for 60 game days, a diligent one (everyone daily, gifts, favours)
for 120. It prints each person's warmth, trust, tier and perks in force, notes when casual play saturates warmth, and
fails when a perk is out of the diligent player's reach or one day's spam (30 interactions with one stranger) gains
more than 20 warmth. `--days`, `--seed`.

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
