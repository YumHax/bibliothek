import { RENDER_TUNING } from '@/graphics/renderTuning';
import { useLegacyLooks } from '@/graphics/grade';
import * as THREE from 'three';
import type { Engine } from '@/core/Engine';
import { startPerfLog } from '@/core/PerfLog';
import type { Graphics } from '@/graphics';
import type { Zone } from '@/world/zone';
import type { FirstPersonController } from '@/player/FirstPersonController';
import type { PayoutStats } from '@/economy';
import { PayoutOverlay } from '@/ui/PayoutOverlay';
import { findZFighting, zfightRoots, type ZFightOptions } from '@/world/surface/zfight';
import { forceBlackout } from '@/building/blackout';
import { forceEndlessStairs } from '@/world/stairwell/downAndDark';
import { everyone, findPerson, shortName } from '@/social/people';
import { setStanding, standing } from '@/social/standing';
import { tierOf } from '@/social/tiers';
import { formatCount } from '@/text/count';
import type { Input } from '@/core/Input';
import type { DebugSubjects } from '@/cheats/progress/progressions';
import { forcePartyOn } from '@/building/neighboursParty';
import { forceEstateSale } from '@/building/estateSale';
import { forceBulkyDay } from '@/building/bulkyWaste';
import { forceKidsOut } from '@/building/kids/yardKids';
import { forceFilmNight } from '@/building/yardCinema';
import { DebugPanel, type DebugEntry, type DebugEvent } from '@/ui/debug/DebugPanel';
import { CHOICES } from '@/cheats/progress/progressions';
import { buildDials } from '@/cheats/dials/dials';
import { START_POINTS } from '@/cheats/start/startPoints';
import { debugStart, startFrom, takePendingStart } from '@/cheats/start/debugStart';
import type { Game } from '@/catalog/types';
import { PLATFORMS } from '@/catalog/platforms';
import { capitalise, matchesSearch } from '@/text/strings';
import { gameDateLabel } from '@/time/gameDateLabel';
import type { WeatherKind } from '@/world/weather/Weather';
import type { Overlay } from '@/ui/Overlay';
import { html, type Html } from '@/ui/panel/html';
import { pictogram } from '@/ui/panel/pictograms';
import { coverImg } from '@/ui/panel/widgets';
import { FACE_PAPER, portrait } from '@/ui/social/portrait';
import { cardOf } from '@/world/travel/travelCards';
import { formatCoins, formatTickets } from '@/text/money';
import type { PersonId } from '@/social/types';
import { labTarget, socialLabGroups } from '@/cheats/socialLab';
import { flag } from '@/settings/flags';
import type { Services } from './services';
import { albumDebugEvents, grandmaDebugEvents, grandmaHintDebugEvents, keepsakeDebugEvents, lindenDebugEvents, presenceDebugEvents } from '@/grandma/grandmaDebug';
import { ritualsDebugEvents } from '@/grandma/ritualsDebug';
import { familyDebugEvents } from '@/family/familyDebug';
import type { Travel } from '@/world/travel';
import type { ZoneId } from '@/world/zoneIds';
import { SEED_GAMES } from '@/catalog';
import { forceCatOut } from '@/world/cat/escapes';

/** Every light (every shadow-casting one with `shadowed`) in the zones but `current`, for the F9 bisection. */
function lightsOutside(zones: readonly { readonly group: THREE.Object3D }[], current: object, shadowed: boolean): THREE.Light[] {
  const lights: THREE.Light[] = [];
  for (const zone of zones) {
    if (zone === current) continue;
    zone.group.traverse((obj) => {
      const light = obj as THREE.Light;
      if (light.isLight && (!shadowed || light.castShadow)) lights.push(light);
    });
  }
  return lights;
}

/**
 * `?stats`: fps, draw calls and lights logged every 2 s, and a console handle for profiling:
 * `bibliothek.bisect()` runs the F9 bisection, `bibliothek.player.setPosition(x, z)` teleports.
 */
export function installStats(parts: { engine: Engine; world: { readonly zones: readonly Zone[] }; zones: { readonly current: Zone }; player: FirstPersonController; graphics: Graphics }): void {
  const { engine, world, zones, player, graphics } = parts;
  const perf = startPerfLog(engine, {
    drawCurrentZoneOnly: () => world.zones.forEach((zone) => zone !== zones.current && zone.setDrawn(false)),
    drawAllZones: () => world.zones.forEach((zone) => zone.isActive && zone.setDrawn(true)),
    shadowLightsOutsideCurrentZone: () => lightsOutside(world.zones, zones.current, true),
    lightsOutsideCurrentZone: () => lightsOutside(world.zones, zones.current, false),
  });
  exposeDebug({ engine, world, player, zones, graphics, bisect: perf.bisect });
}

/** `?debug`: `bibliothek.blackout()` cuts the building's power (the next fuse reset brings it back), `bibliothek.endlessStairs()` makes tonight an endless night. */
export function installBuildingDebug(): void {
  exposeDebug({ blackout: forceBlackout, endlessStairs: forceEndlessStairs });
}

/** What the debug progressions are read and written through, from the services' stores. */
export function debugSubjects(parts: Omit<DebugSubjects, 'day'> & { today: { readonly gameDay: number } }): DebugSubjects {
  const { today, ...stores } = parts;
  return { day: () => today.gameDay, ...stores };
}

/** How many test cartridges "Fill the shelves" adds: more than every bookcase holds, so the overflow shows. */
const FILL_COUNT = 160;
/** Most games the collection's search lists to add or take away. */
const MAX_GAMES = 30;
/** How many of the newest games the collection's page lists before a search. */
const NEWEST = 8;
/** The People cards' faces, CSS pixels. */
const FACE_PX = 48;
/** Farthest a day jump goes in one go (each day is wound through, so everything that counts days sees it pass). */
const MAX_DAYS = 120;
const WEATHERS: readonly WeatherKind[] = ['clear', 'fair', 'cloudy', 'overcast', 'fog', 'showers', 'rain', 'storm', 'snow'];

/** The wallet set to exactly `coins` and `tickets`. */
function setMoney(wallet: Services['wallet'], coins: number | null, tickets: number | null): void {
  const dc = coins === null ? 0 : Math.max(0, Math.round(coins)) - wallet.coins;
  if (dc > 0) wallet.earnCoins(dc);
  else if (dc < 0) wallet.spend(-dc);
  const dt = tickets === null ? 0 : Math.max(0, Math.round(tickets)) - wallet.tickets;
  if (dt > 0) wallet.addTickets(dt);
  else if (dt < 0) wallet.spendTickets(-dt);
}

/** Where the debug save starts again from (`cheats/start`): the story's acts, each wiping the debug save. */
function startEntries(): DebugEntry[] {
  // A debug save never started from the panel is the one of before: everything done.
  const here = debugStart().point ?? 'end';
  return START_POINTS.map((point) => ({
    kind: 'action',
    tab: 'start',
    group: 'The story, from the opening to the end',
    label: point.label,
    hint: point.blurb,
    button: 'Start here',
    confirm: true,
    current: point.id === here,
    run: () => startFrom(point),
  }));
}

/** The money, the clock, the day and the weather. */
function stateEntries(services: Services): DebugEntry[] {
  const { wallet, sky, today } = services;
  const { dayNight, weather } = sky;
  let pinned: WeatherKind | null = null;
  const days = (n: number): string => {
    const target = today.gameDay + Math.max(0, Math.min(MAX_DAYS, Math.round(n)));
    // Each wind to the morning's eight passes midnight once (the first may only reach this morning's); standing at
    // eight already, the wind goes round to just before it first.
    for (let guard = 3 * MAX_DAYS + 3; today.gameDay < target && guard > 0; guard--) {
      if (Math.abs(dayNight.state.hours - 8) < 0.01) dayNight.advanceTo(7.9);
      dayNight.advanceTo(8);
    }
    return `Now game day ${today.gameDay}, ${gameDateLabel(today.gameDay, dayNight.state.hours)}.`;
  };
  return [
    { kind: 'number', tab: 'state', group: 'Money', label: 'Coins', min: 0, step: 100, presets: [0, 100, 1000, 5000, 20000], value: () => wallet.coins, set: (n) => setMoney(wallet, n, null) },
    { kind: 'number', tab: 'state', group: 'Money', label: 'Tickets', min: 0, step: 50, presets: [0, 100, 500, 2000], value: () => wallet.tickets, set: (n) => setMoney(wallet, null, n) },
    { kind: 'number', tab: 'state', group: 'Time', label: 'The hour', hint: 'A jump: no day passes.', min: 0, max: 23.5, step: 0.5, presets: [8, 13, 19, 23], value: () => Math.round(dayNight.state.hours * 2) / 2, set: (n) => dayNight.setTime(n) },
    { kind: 'action', tab: 'state', group: 'Time', label: 'Next morning', hint: 'A night passes, as in bed.', button: 'Sleep', run: () => days(1) },
    { kind: 'action', tab: 'state', group: 'Time', label: 'A week on', hint: 'Seven days pass, one by one.', button: 'Wind on', run: () => days(7) },
    { kind: 'number', tab: 'state', group: 'Time', label: 'Wind on by days', hint: `Each one passes (at most ${MAX_DAYS}).`, min: 0, max: MAX_DAYS, presets: [1, 3, 30], value: () => 0, set: days },
    {
      kind: 'dial',
      tab: 'state',
      group: 'Weather',
      label: 'The sky',
      levels: ['On its own', ...WEATHERS.map(capitalise)],
      at: () => (pinned ? WEATHERS.indexOf(pinned) + 1 : 0),
      set: (n) => {
        pinned = WEATHERS[n - 1] ?? null;
        weather.pin(pinned);
        if (pinned) weather.settle();
      },
    },
  ];
}

/**
 * The flat and the collection (docs/checks.md "Debug mode"): the shelves filled past their room with test carts (the
 * overflow), the collection emptied, a parcel of three games in the hall; with a search, any built-in game added or
 * any game taken away.
 */
function collectionEntries(services: Services, query: string): DebugEntry[] {
  const { collection, today } = services;
  const fill = (): void => {
    const start = collection.games.filter((g) => g.id.startsWith('debug-fill-')).length;
    for (let i = start; i < start + FILL_COUNT; i++) {
      collection.add({ id: `debug-fill-${i}`, title: `Test Cart ${i + 1}`, platform: (['nes', 'snes', 'megadrive', 'gb'] as const)[i % 4]!, status: 'owned', acquired: { price: 0, where: 'the debug panel', day: today.gameDay } });
    }
  };
  const give = (game: Game): void => collection.add({ ...game, status: 'owned', addedAt: new Date().toISOString(), acquired: { price: 0, where: 'the debug panel', day: today.gameDay } });
  // Three of the built-in games the collection lacks, one at a time: under the import threshold, they go in the parcel.
  const parcel = (): void => SEED_GAMES.filter((g) => !collection.has(g.id)).slice(0, 3).forEach(give);
  const tools: DebugEntry[] = [
    { kind: 'action', tab: 'collection', group: 'The shelves', label: 'Fill the shelves past their room', run: fill },
    { kind: 'action', tab: 'collection', group: 'The shelves', label: 'A parcel of three games in the hall', run: parcel },
    { kind: 'action', tab: 'collection', group: 'The shelves', label: 'Empty the collection', confirm: true, run: () => [...collection.games].forEach((g) => collection.remove(g.id)), reload: true },
  ];
  // Searched: any game matching, owned or built in; else the newest in the collection.
  const seen = new Set<string>();
  const games = query
    ? [...collection.games, ...SEED_GAMES].filter((g) => !seen.has(g.id) && seen.add(g.id) && matchesSearch(g.title, query)).slice(0, MAX_GAMES)
    : [...collection.games].sort((a, b) => (b.addedAt ?? '').localeCompare(a.addedAt ?? '')).slice(0, NEWEST);
  const group = query ? 'Add or take away a game' : `The newest of ${formatCount(collection.games.length, 'game')}`;
  return [
    ...tools,
    ...games.map((game): DebugEntry => {
      const owned = collection.has(game.id);
      return {
        kind: 'action',
        tab: 'collection',
        group,
        label: game.title,
        hint: `${PLATFORMS[game.platform]?.shortName ?? game.platform}${owned ? ' · in the collection' : ''}`,
        button: owned ? 'Take away' : 'Add',
        visual: () => coverImg(services.coverUrl(game), game, 'debug-panel__cover'),
        run: () => {
          if (collection.has(game.id)) collection.remove(game.id);
          else give(game);
          return `${game.title}: ${collection.has(game.id) ? 'added (in the parcel in the hall)' : 'taken away'}.`;
        },
      };
    }),
  ];
}

/** A `DebugEvent` list as one group of the Now page. */
function nowEntries(group: string, events: readonly DebugEvent[]): DebugEntry[] {
  return events.map((e) => ({ kind: 'action', tab: 'events', group, label: e.label, run: () => e.run(), ...(e.reload ? { reload: true } : {}) }));
}

/** The key that opens the debug panel (physical: the one left of 1, `²` on AZERTY), and F8 where that one is missing. */
const PANEL_KEYS = ['Backquote', 'F8'];

/**
 * `?debug`: the debug panel on its key (and `bibliothek.debugPanel()`): where the debug save starts from, every
 * progression's switch and dials, everyone's tier, the money, the clock and the weather, the collection, events made
 * to happen now, a trip anywhere, the social lab (docs/checks.md "Debug mode"). `bibliothek.party()` makes today a
 * party day in the courtyard, `bibliothek.estateSale()` opens the building's estate sale today, `bibliothek.bulkyDay()`
 * makes today a bulky-waste day (the courtyard's pile shows the next time the yard is built), `bibliothek.filmNight()`
 * puts the collection's first game on the courtyard's sheet and the film night on now, dark or not.
 */
export function installDebugPanel(services: Services, parts: { input: Input; openPanel(panel: DebugPanel): void; modalOpen(): boolean; travel: Pick<Travel, 'everyStop' | 'go'>; cat?: { makeHungry(): void }; menu?: Pick<Overlay, 'addPauseButton'> }): void {
  const { today, wallet, collection } = services;
  const party = (): void => forcePartyOn(today.gameDay);
  const estateSale = (): void => forceEstateSale(today.gameDay);
  const bulkyDay = (): void => forceBulkyDay(today.gameDay);
  // The first game of the collection on the courtyard's sheet, the film night on now whatever the sky.
  const filmNight = (): void => {
    const game = collection.games.find((g) => g.status !== 'wishlist');
    if (game) forceFilmNight(game, today.gameDay);
  };
  const dials = buildDials({ day: () => today.gameDay, upgrades: services.upgrades, medals: services.medals, standing: services.standing, grandma: services.grandma, story: services.story, collection });
  // A start point's dials and coins, once, as the page is back from its wipe (`cheats/start`); a dial the world is
  // built from wants one more reload.
  const pending = takePendingStart();
  if (pending) {
    let rebuild = false;
    for (const [id, level] of Object.entries(pending.levels)) {
      const dial = dials.find((d) => d.id === id);
      dial?.set(level);
      rebuild ||= !!dial?.reload;
    }
    if (pending.coins !== undefined) setMoney(wallet, pending.coins, null);
    if (rebuild) location.reload();
  }
  const fixed: DebugEntry[] = [
    ...startEntries(),
    ...dials.map((d): DebugEntry => ({ kind: 'dial', ...d, ...(d.person ? { visual: faceOf(d.person, () => d.tones?.[d.at()]) } : {}) })),
    ...CHOICES.map((c): DebugEntry => ({
      kind: 'dial',
      tab: 'progress',
      group: 'The co-owners’ votes',
      label: c.label,
      levels: c.options.map((o) => o.label),
      at: () => c.options.findIndex((o) => o.id === c.current()),
      set: (n) => c.choose(c.options[n]?.id ?? ''),
      reload: true,
    })),
    ...stateEntries(services),
    ...nowEntries('The building and the courtyard', [
      { label: 'Power cut now', run: forceBlackout },
      { label: 'An endless night on the stairs', run: forceEndlessStairs },
      { label: 'The neighbours’ party today', run: party },
      { label: 'The estate sale today', run: estateSale, reload: true },
      { label: 'Bulky-waste day today', run: bulkyDay },
      { label: 'The kids down in the courtyard now', run: () => forceKidsOut(today.gameDay) },
      { label: 'A film night in the courtyard now', run: filmNight },
    ]),
    ...nowEntries('The cat', [...(parts.cat ? [{ label: 'The cat hungry now', run: () => parts.cat?.makeHungry() }] : []), { label: 'The cat slips out now', run: forceCatOut }]),
    // Mémé's: back to the first day, every memory ready or seen, the Sunday envelope again (docs/story.md "Mémé").
    ...nowEntries('Mémé', [...grandmaDebugEvents(services.grandma), ...grandmaHintDebugEvents(services.grandmaHints), ...albumDebugEvents(services.albumFinds), ...presenceDebugEvents(services.grandmaPresence), ...lindenDebugEvents(services.grandmaBread, services.sharedRide, () => today.gameDay)]),
    ...nowEntries('Mémé’s keepsakes and Félix’s lots', keepsakeDebugEvents(services.keepsakes, collection)),
    // Her ways: lunch, favours, recipes, the occasions forced (docs/grandma.md).
    ...nowEntries('Mémé’s ways', ritualsDebugEvents(services.grandmaRituals)),
    // The end of the family's story: Gaspard at her table, the Game Boy, her visit to the flat (docs/grandma.md).
    ...nowEntries('The family', familyDebugEvents(services.family, () => today.gameDay)),
    ...socialLabGroups({ day: () => today.gameDay, settings: services.settings }).flatMap((g) => g.events.map((e): DebugEntry => ({ kind: 'action', tab: 'social', group: g.label, label: e.label, run: () => e.run() }))),
    { kind: 'action', tab: 'tools', group: 'Checks', label: 'Z-fighting here', hint: 'The faces fighting in this zone, listed in the console.', button: 'Check', run: zfightHere },
    { kind: 'action', tab: 'tools', group: 'Checks', label: 'Everyone’s standing', hint: 'Warmth, trust and tier of everyone, in the console.', button: 'List', run: () => (logSocialTable(), 'Listed in the console.') },
    { kind: 'action', tab: 'tools', group: 'Render', label: 'The render of before', hint: 'The old ambient, occlusion and looks from the same spot, or back.', button: 'Switch', run: () => toggleLegacyRender() },
    { kind: 'action', tab: 'tools', group: 'The page', label: 'Reload', hint: 'The world built again from the saves.', button: 'Reload', run: () => location.reload() },
  ];
  const panel = new DebugPanel(services.container, {
    subjects: debugSubjects(services),
    entries: (query) => [
      ...fixed,
      ...parts.travel.everyStop().map((p): DebugEntry => ({ kind: 'action', tab: 'places', group: 'Every place', label: p.label, visual: () => placePhoto(p.id), run: () => (panel.close(), void parts.travel.go(p.id)) })),
      ...collectionEntries(services, query),
    ],
    readouts: () => [
      { label: 'Game day', value: `${today.gameDay} · ${gameDateLabel(today.gameDay, services.sky.dayNight.state.hours)}` },
      { label: 'Wallet', value: `${formatCoins(wallet.coins)} · ${formatTickets(wallet.tickets)}` },
      { label: 'Weather', value: capitalise(services.sky.weather.state.kind) },
      { label: 'Started from', value: START_POINTS.find((p) => p.id === (debugStart().point ?? 'end'))?.label ?? '' },
    ],
    header: (tab) => {
      if (tab !== 'social') return null;
      const id = labTarget();
      return `Acting on ${id ? shortName(id) : 'nobody yet: talk to someone first'}.`;
    },
    reload: () => location.reload(),
  });
  const open = (): void => {
    if (panel.isOpen) panel.close();
    else if (!parts.modalOpen()) parts.openPanel(panel);
  };
  // In the pause menu too, its own group last.
  parts.menu?.addPauseButton('debug', 'Debug console', () => {
    if (!panel.isOpen) parts.openPanel(panel);
  }, undefined, { group: 'debug', key: PANEL_KEYS[0] });
  parts.input.onPress((_code, e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
    if (PANEL_KEYS.includes(e.code)) open();
  });
  exposeDebug({ debugPanel: open, party, estateSale, bulkyDay, filmNight });
  // `?social-lab`: the panel open on the lab from the start.
  if (flag('social-lab')) {
    panel.showTab('social');
    open();
  }
}

/** A person's face for the People cards, on their tier's colour now (painted once per person and colour). */
const faces = new Map<string, string>();
function faceOf(id: PersonId, tone: () => string | undefined): () => Html {
  return () => {
    const backdrop = tone() ?? FACE_PAPER;
    const key = `${id}:${backdrop}`;
    let url = faces.get(key);
    if (!url) faces.set(key, (url = portrait(id, FACE_PX, backdrop).toDataURL()));
    return html`<img src="${url}" alt="">`;
  };
}

/** A place's travel card photo (as it was last left), or its door's pictogram before it was ever seen. */
function placePhoto(id: ZoneId): Html {
  const photo = cardOf(id).photo;
  return photo ? html`<img src="${photo}" alt="">` : html`<span class="debug-panel__photo-none">${pictogram('door', '')}</span>`;
}

/** `bibliothek.zfight()` on the player's zone, when `installZFight` put it on the console's handle. */
function zfightHere(): string {
  const zfight = (globalThis as { bibliothek?: { zfight?: () => unknown } }).bibliothek?.zfight;
  if (!zfight) return 'Not on the console’s handle (bibliothek.zfight).';
  zfight();
  return 'Listed in the console.';
}

/** `console.table` of how the player stands with everyone (warmth, trust, tier, met). */
function logSocialTable(): void {
  console.table(
    Object.fromEntries(
      everyone().map((p) => {
        const s = standing(p.id);
        return [p.id, { name: p.short ?? p.name, warmth: s.warmth, trust: s.trust, tier: tierOf(s.warmth, s.trust), met: s.met, memories: s.memories.length }];
      }),
    ),
  );
}

/** The render pass's before and after from the same spot: the old ambient, occlusion and looks, or the current ones. */
function toggleLegacyRender(on = !RENDER_TUNING.legacy): string {
  RENDER_TUNING.legacy = on;
  useLegacyLooks(on);
  return on ? 'legacy render' : 'current render';
}

/**
 * `?debug`: `bibliothek.social.table()` lists how the player stands with everyone (warmth, trust, tier, met),
 * `bibliothek.social.set(id, warmth, trust)` sets one outright (docs/social.md).
 */
export function installSocialDebug(day: () => number): void {
  exposeDebug({
    social: {
      table: logSocialTable,
      set: (id: string, warmth: number, trust: number) => {
        if (!findPerson(id)) return `No one called "${id}": bibliothek.social.table() lists the ids.`;
        setStanding(id, warmth, trust, day());
        return `${id}: ${tierOf(warmth, trust)}`;
      },
    },
  });
}

/**
 * `?debug`: the room without the mouse locked (a browser driven by a script cannot lock it): `bibliothek.room.enter()`
 * enters it as a controller would (a virtual lock), `look(yaw, pitch)` turns the view, `go(x, z)` steps there.
 */
export function installRoomDebug(enter: () => Promise<void>, player: Pick<FirstPersonController, 'setLook' | 'getLook' | 'setPosition' | 'getEyePosition'>): void {
  const global = globalThis as { bibliothek?: { room?: Record<string, unknown> } };
  exposeDebug({
    room: {
      ...global.bibliothek?.room,
      enter,
      look: (yaw: number, pitch: number) => player.setLook(yaw, pitch),
      where: () => ({ ...player.getLook(), ...player.getEyePosition() }),
      go: (x: number, z: number) => player.setPosition(x, z),
    },
    // The render pass's before and after from the same spot: `legacy(true)` puts the old ambient, occlusion and looks back.
    render: {
      legacy: (on = true) => toggleLegacyRender(on),
    },
  });
}

/** `?debug`: `bibliothek.room.use()` does what a click at the crosshair does (the room must be entered). */
export function exposeRoomUse(use: () => void): void {
  const global = globalThis as { bibliothek?: { room?: Record<string, unknown> } };
  exposeDebug({ room: { ...global.bibliothek?.room, use } });
}

/** Adds `entries` to the console's `bibliothek` handle (each installer adds its own). */
function exposeDebug(entries: Record<string, unknown>): void {
  const global = globalThis as { bibliothek?: Record<string, unknown> };
  global.bibliothek = { ...global.bibliothek, ...entries };
}

/** The farthest anything is seen from (m): Front Street's facades, down the street from where the player can walk. */
const FARTHEST = 140;

/**
 * `?debug` / `?stats`: `bibliothek.zfight(zoneId?, options?)` lists the overlapping coplanar faces
 * of a zone (the player's by default) that z-fight; with `?zfight` (`auto`) each zone also logs its count the first
 * time the player enters it once built (see `world/surface/zfight`). A zone is judged as far as it can be seen
 * across (most of its diagonal, at most `FARTHEST`: Front Street's far end). The subtrees outside any zone
 * (`registerZfightRoot`: a window's street) are checked with the first zone, or by name:
 * `bibliothek.zfight('outlook:stairwell')`.
 */
export function installZFight(parts: { world: { readonly zones: readonly Zone[] }; zones: { readonly current: Zone; onZoneChange(listener: (zone: Zone) => void): () => void }; auto: boolean }): void {
  const { world, zones, auto } = parts;
  const run = (zone: Zone, options?: ZFightOptions): ReturnType<typeof findZFighting> => {
    const diagonal = zone.bounds.getSize(new THREE.Vector3()).length();
    return report(zone.id, findZFighting(zone.group, { viewDistance: Math.min(FARTHEST, Math.max(6, diagonal * 0.8)), ...options }));
  };
  const report = (name: string, pairs: ReturnType<typeof findZFighting>): ReturnType<typeof findZFighting> => {
    console.log(`[zfight] ${name}: ${formatCount(pairs.length, 'pair')}${pairs.length ? ` (bibliothek.zfight('${name}') lists them)` : ''}`);
    return pairs;
  };
  const runRoot = (name: string, options?: ZFightOptions): ReturnType<typeof findZFighting> | null => {
    const entry = zfightRoots().get(name);
    return entry ? report(name, findZFighting(entry.root, { viewDistance: entry.viewDistance, ...options })) : null;
  };
  const rootsChecked = new WeakSet<THREE.Object3D>();
  const checked = new WeakSet<THREE.Object3D>();
  const materialsChecked = new WeakSet<THREE.Object3D>();
  const check = (zone: Zone): void => {
    if (checked.has(zone.group) || !zone.isActive) return;
    checked.add(zone.group);
    // After the frame that shows it: the zone's own `activate` may still be placing things.
    setTimeout(() => {
      run(zone);
      for (const [name, entry] of zfightRoots()) {
        if (rootsChecked.has(entry.root)) continue;
        rootsChecked.add(entry.root);
        runRoot(name);
      }
      if (!materialsChecked.has(zone.group)) {
        materialsChecked.add(zone.group);
        reportMixedInstancing(zone);
      }
    }, 1500);
  };
  // Each zone judged on its first visit with `?zfight` only: a whole zone's faces are a second or more on the main
  // thread (the stairwell's froze the first flight down under `?debug`).
  if (auto) {
    check(zones.current);
    zones.onZoneChange((zone) => check(zone));
  }
  exposeDebug({
    zfight: (id?: string, options?: ZFightOptions) => {
      const zone = id ? world.zones.find((z) => z.id === id) : zones.current;
      const pairs = zone ? run(zone, options) : id ? runRoot(id, options) : null;
      if (!pairs) return console.warn(`[zfight] no zone or registered root ${id} (roots: ${[...zfightRoots().keys()].join(', ') || 'none'})`);
      console.table(pairs.slice(0, 60));
      return pairs;
    },
  });
}

/**
 * Materials drawn by both an `InstancedMesh` and a plain mesh in `zone`: three r169 switches their
 * program at every such draw (see `world/materials/palette`). Logged once per zone under `?debug`.
 */
function reportMixedInstancing(zone: Zone): void {
  const uses = new Map<THREE.Material, { instanced: string[]; plain: string[] }>();
  zone.group.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const instanced = (mesh as THREE.InstancedMesh).isInstancedMesh === true;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      let use = uses.get(material);
      if (!use) uses.set(material, (use = { instanced: [], plain: [] }));
      (instanced ? use.instanced : use.plain).push(mesh.parent?.name || mesh.name || mesh.type);
    }
  });
  const mixed = [...uses].filter(([, u]) => u.instanced.length && u.plain.length);
  if (mixed.length) console.warn(`[materials] ${zone.id}: ${mixed.length} material(s) on both instanced and plain meshes (a program switch per draw):`, mixed.map(([m, u]) => ({ material: m.name || m.type, instanced: u.instanced.slice(0, 3), plain: u.plain.slice(0, 3) })));
}

/** `?payout`: the arcade's balance table (the headless balance is `npm run balance`). */
export function installPayoutTable(container: HTMLElement, stats: PayoutStats): void {
  new PayoutOverlay(container, stats);
}
