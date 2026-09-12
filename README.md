# Bibliothek

First-person 3D video game collection room built with three.js + Vite + TypeScript.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production bundle in dist/
```

Click the start screen to lock the mouse. Move with WASD / ZQSD (physical keys, so AZERTY works), Shift to sprint, Esc to release the mouse.
Click a game to pick it up (hold right click to rotate it), walk to the TV and click it to watch a longplay, or click the ceiling projector to watch it big on the opposite wall
starting halfway through. Click elsewhere or press E to put the game back.

## Structure

Positions and decoration are data (`src/world/roomPlan.ts`), `src/world/layout.ts` builds the room from them, classes under
`src/world/` draw things, `src/game/Session.ts` holds the rules. The full folder map is in [docs/architecture.md](docs/architecture.md);
the outdoors and the cat have their own notes in `docs/`.

## Adding things

- **Decoration or furniture**: one line in `ROOM_PLAN.decor` (see [docs/props.md](docs/props.md)); a new kind of prop is a class
  plus one line in `src/world/props/decor.ts`.
- **A game**: append to the platform's array in `src/catalog/` with its No-Intro `libretroName`.
- **A platform**: add a `PlatformId`, an entry in `platforms.ts` (box size + libretro repo name) and a console style.
- **A cover source**: implement `CoverArtProvider` and add it to the `CoverArtResolver` chain in `main.ts`.
  Providers are tried in order per face; the first URL wins and generated art fills the gaps.
- **A key or click behaviour**: `src/game/Session.ts` routes every key and click; optional features plug in through `SessionParts.ts`.
- **Another room or the outside**: a zone (`src/world/zone/`, plan in `src/world/worldPlan.ts`); zones load around the player and unload
  behind them, see [docs/zones.md](docs/zones.md).

Working with Claude Code: the recipes above are skills (`add-decor`, `add-games`, `add-interaction`, `add-room`) under `.claude/skills/`.

## Loading strategy

Every `GameBox` is dressed instantly with generated textures (title placeholder, procedural spines and
back) and the real art is swapped in as it arrives. `BoxArtLoader` downloads through a small priority
queue (6 requests in flight, boxes nearest the camera first — feed it with `covers.setPriorityOrigin(camera.position)`
about once a second) and draws generated faces in idle time, so the first frame never waits on the network.
Covers are served by the same-origin proxy `/api/art/...`, which shrinks them to 512 px WebP (via `sharp`,
falling back to the original PNG) and answers with a one-year immutable `Cache-Control` + `ETag`.

## Deployment

The client only ever calls relative `/api/...` URLs, so dev and production behave the same:

| Endpoint | Dev (Vite middleware) | Production (Vercel Node function) |
| --- | --- | --- |
| `GET /api/art/<repo>/<folder>/<file>.png` | `server/artCachePlugin.ts` (disk cache in `.cache/art`) | `api/art/[...path].ts` (memory cache + CDN) |
| `GET /api/youtube/search?q=&title=&platform=` | `server/youtubeSearchPlugin.ts` | `api/youtube/search.ts` |
| `GET /api/libretro/index/<repo>` | `server/libretroIndexPlugin.ts` | `api/libretro/index/[repo].ts` (`/tmp` cache + CDN) |

The core of each endpoint is a pure function (`handleArtRequest`, `handleLongplaySearch`) taking an
`ApiRequest` and returning `{ status, headers, body }` (see `server/http.ts`); the plugins and the
functions are thin adapters around it. Serverless disks do not persist, so the functions keep an
in-memory cache for the life of the instance and rely on long `Cache-Control` / `s-maxage` headers
for the CDN to do the real caching.

### Vercel

```bash
npm i -g vercel
vercel link            # once
vercel dev             # serves the Vite app AND the api/ functions on http://localhost:3000
vercel                 # preview deployment
vercel --prod
```

`vercel.json` sets the Vite build (`npm run build` -> `dist/`), gives the functions 1 GB / 20 s (sharp
needs the memory), declares the `/api/*` routes explicitly and falls the SPA back to `index.html`.
No environment variables are needed: every data source is public and key-less.

Notes:
- `sharp` is a devDependency; Vercel installs devDependencies by default, and the WebP path degrades
  to the original PNG if the native module is missing on the host.
- The YouTube scrape depends on youtube.com's markup and may be rate-limited from data-centre IPs.
  Failures come back as a JSON 502 which the TV shows as an error state; results are cached for an
  hour server-side and in the browser's `localStorage`.
- For a fully static host without functions, pass `proxy: null` to `LibretroCoverProvider` to load
  straight from raw.githubusercontent.com (CORS `*`, but full-size PNGs and no video search).

### Netlify (not wired, but straightforward)

The handlers are framework-agnostic: a Netlify function is `export default async (req: Request) => ...`
that builds an `ApiRequest` from `new URL(req.url)` / `req.headers`, calls `handleArtRequest` or
`handleLongplaySearch`, and returns `new Response(body, { status, headers })`. Add `[[redirects]]`
for `/api/*` -> `/.netlify/functions/:splat` and `/*` -> `/index.html` in `netlify.toml`.
