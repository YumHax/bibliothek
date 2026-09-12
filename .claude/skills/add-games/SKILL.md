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

- `id` = `<platform>-<kebab-title>`, unique. `releaseDate` ISO date or bare year. `status` defaults to `'owned'`
  (`'wishlist'` / `'lent'` change the box's look).
- `libretroName` is the No-Intro name as it appears in the libretro-thumbnails repo for that platform, without extension,
  with the characters `& * / : \` < > ? \ |` replaced by `_`. The front cover, snap and title screen come from it; back and
  spine are always generated. Prefer the USA or Europe release name; check spelling against the repo listing
  (`Named_Boxarts` folder of `PLATFORMS[id].libretroRepo`) when in doubt. A wrong name only means a placeholder cover.
- The `CollectionStore` starts from `SEED_GAMES` and layers the user's localStorage changes on top; seed edits show up
  for users who have not edited that game.

## A platform

1. `src/catalog/types.ts`: extend the `PlatformId` union.
2. `src/catalog/platforms.ts`: add the entry: `name`, `shortName`, `boxDimensions` in metres (real box), `accentColor`,
   `libretroRepo` (exact GitHub repo name in the libretro-thumbnails organisation).
3. `src/world/props/consoleStyles.ts`: `buildConsole(platform)` draws one console per platform on the TV stand from the
   `SHAPES` map; add an entry for the new id or it gets the generic grey box (the stand has a fixed number of slots, a
   warning is logged when they overflow).
4. `src/catalog/<platform>.ts` with a `<PLATFORM>_GAMES: Game[]` array and spread it into `SEED_GAMES` in `src/catalog/index.ts`.
5. Anything switching on `PlatformId` will fail typecheck until covered: `npm run typecheck` lists the spots.

Shelving sizes itself from the collection and box dimensions; nothing else to touch.
