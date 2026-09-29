---
name: add-games
description: Add games to the built-in collection or add a new platform (console). Use for "add Chrono Trigger", "add the Saturn", box sizes, cover-art names.
---

# Add games or a platform

No engine knowledge needed. Everything is data under `src/catalog/`.

## A game

Append to the platform's array in `src/catalog/<platform>.ts` (`nes`, `snes`, `gb`, `megadrive`, `n64`, `ps1`):

```ts
{
  id: 'snes-chrono-trigger', title: 'Chrono Trigger', platform: 'snes',
  releaseDate: '1995-03-11', developer: 'Square', publisher: 'Square', genre: 'RPG', region: 'USA',
  description: 'One or two sentences, factual.',
  externalIds: { libretroName: 'Chrono Trigger (USA)' },
},
```

- `id` = `<platform>-<kebab-title>`, unique. `SEED_GAMES` (`catalog/index.ts`) replaces it with the canonical
  `gameIdFor(platform, libretroName)`, the id the market and the index use, and keeps the hand-made one in
  `LEGACY_SEED_IDS` so old saves migrate; never compare against the hand-made id. `releaseDate` ISO date or bare year.
  `status` defaults to `'owned'` (`'wishlist'` / `'lent'` change the box's look).
- `libretroName` is the No-Intro name as it appears in the libretro-thumbnails repo for that platform, without extension,
  with the characters `& * / : \` < > ? \ |` replaced by `_`. The front cover, snap and title screen come from it; the back,
  spine, cartridge and disc scans come from LaunchBox (matched by title and platform; generated when it has none).
  Run `npm run bake-art` after adding seed games so their art ships in `public/boxart`. Prefer the USA or Europe release name; check spelling against the repo listing
  (`Named_Boxarts` folder of `PLATFORMS[id].libretroRepo`) when in doubt. A wrong name only means a placeholder cover.
- The `CollectionStore` starts from `SEED_GAMES` and layers the user's localStorage changes on top; seed edits show up
  for users who have not edited that game.

## A platform

1. `src/catalog/types.ts`: extend the `PlatformId` union.
2. `src/catalog/media.ts`: its `CASES` (the real box per region: kind and outer size in mm, measured) and, in
   `mediaOf`, its media (a `MEDIA` shell: size, label rect from a photo, how deep it goes in; add an outline in
   `world/media/outline.ts` for a new shell). Sources in docs/media.md.
3. `src/catalog/platforms.ts`: add the entry: `name`, `shortName`, `boxDimensions: defaultCaseOf(id).dims`, `accentColor`,
   `libretroRepo` (exact GitHub repo name in the libretro-thumbnails organisation).
4. `src/world/props/consoleStyles.ts`: `buildConsole(platform)` draws one console per platform on the TV stand from the
   `SHAPES` map, with its `MediaSlot` (where and how the media goes in); add an entry for the new id or it gets the generic
   grey box, which plays straight on the TV (the stand has a fixed number of slots, a warning is logged when they overflow).
5. `src/catalog/<platform>.ts` with a `<PLATFORM>_GAMES: Game[]` array and spread it into `SEED_GAMES` in `src/catalog/index.ts`.
6. Anything switching on `PlatformId` will fail typecheck until covered: `npm run typecheck` lists the spots.

Shelving sizes itself from the collection and box dimensions; nothing else to touch.
