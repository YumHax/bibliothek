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
import { everyone, findPerson } from '@/social/people';
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
import { DebugPanel, type DebugEvent } from '@/ui/debug/DebugPanel';
import type { Services } from './services';
import { grandmaDebugEvents } from '@/grandma/grandmaDebug';
import type { Travel } from '@/world/travel';
import type { ZoneId } from '@/world/zoneIds';

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

/** The key that opens the debug panel (physical: the one left of 1, `²` on AZERTY), and F8 where that one is missing. */
const PANEL_KEYS = ['Backquote', 'F8'];

/**
 * `?debug`: the debug panel on its key (and `bibliothek.debugPanel()`): every progression's switch, the co-owners'
 * votes, events made to happen now, a trip anywhere (docs/checks.md "Debug mode"). `bibliothek.party()` makes today a
 * party day in the courtyard, `bibliothek.estateSale()` opens the building's estate sale today, `bibliothek.bulkyDay()`
 * makes today a bulky-waste day (the courtyard's pile shows the next time the yard is built), `bibliothek.filmNight()`
 * puts the collection's first game on the courtyard's sheet and the film night on now, dark or not.
 */
export function installDebugPanel(services: Services, parts: { input: Input; openPanel(panel: DebugPanel): void; modalOpen(): boolean; travel: Pick<Travel, 'everyStop' | 'go'> }): void {
  const { today, wallet } = services;
  const party = (): void => forcePartyOn(today.gameDay);
  const estateSale = (): void => forceEstateSale(today.gameDay);
  const bulkyDay = (): void => forceBulkyDay(today.gameDay);
  // The first game of the collection on the courtyard's sheet, the film night on now whatever the sky.
  const filmNight = (): void => {
    const game = services.collection.games.find((g) => g.status !== 'wishlist');
    if (game) forceFilmNight(game, today.gameDay);
  };
  const events: DebugEvent[] = [
    { label: 'Power cut now', run: forceBlackout },
    { label: 'An endless night on the stairs', run: forceEndlessStairs },
    { label: 'The neighbours’ party today', run: party },
    { label: 'The estate sale today', run: estateSale, reload: true },
    { label: 'Bulky-waste day today', run: bulkyDay },
    { label: 'The kids down in the courtyard now', run: () => forceKidsOut(today.gameDay) },
    { label: 'A film night in the courtyard now', run: filmNight },
    { label: '5000 coins', run: () => wallet.earnCoins(5000) },
    { label: '500 tickets', run: () => wallet.addTickets(500) },
  ];
  // Mémé's: back to the first day, every memory ready or seen, the Sunday envelope again (docs/story.md "Mémé").
  events.push(...grandmaDebugEvents(services.grandma));
  const panel = new DebugPanel(services.container, {
    subjects: debugSubjects(services),
    events,
    places: () => parts.travel.everyStop(),
    go: (id) => void parts.travel.go(id as ZoneId),
    reload: () => location.reload(),
  });
  const open = (): void => {
    if (panel.isOpen) panel.close();
    else if (!parts.modalOpen()) parts.openPanel(panel);
  };
  parts.input.onPress((_code, e) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (PANEL_KEYS.includes(e.code)) open();
  });
  exposeDebug({ debugPanel: open, party, estateSale, bulkyDay, filmNight });
}

/**
 * `?debug`: `bibliothek.social.table()` lists how the player stands with everyone (warmth, trust, tier, met),
 * `bibliothek.social.set(id, warmth, trust)` sets one outright (docs/social.md).
 */
export function installSocialDebug(day: () => number): void {
  exposeDebug({
    social: {
      table: () =>
        console.table(
          Object.fromEntries(
            everyone().map((p) => {
              const s = standing(p.id);
              return [p.id, { name: p.short ?? p.name, warmth: s.warmth, trust: s.trust, tier: tierOf(s.warmth, s.trust), met: s.met, memories: s.memories.length }];
            }),
          ),
        ),
      set: (id: string, warmth: number, trust: number) => {
        if (!findPerson(id)) return `No one called "${id}": bibliothek.social.table() lists the ids.`;
        setStanding(id, warmth, trust, day());
        return `${id}: ${tierOf(warmth, trust)}`;
      },
    },
  });
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
 * of a zone (the player's by default) that z-fight, and each zone logs its count the first time the
 * player enters it once built (see `world/surface/zfight`). A zone is judged as far as it can be seen
 * across (most of its diagonal, at most `FARTHEST`: Front Street's far end). The subtrees outside any zone
 * (`registerZfightRoot`: a window's street) are checked with the first zone, or by name:
 * `bibliothek.zfight('outlook:stairwell')`.
 */
export function installZFight(parts: { world: { readonly zones: readonly Zone[] }; zones: { readonly current: Zone; onZoneChange(listener: (zone: Zone) => void): () => void } }): void {
  const { world, zones } = parts;
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
  check(zones.current);
  zones.onZoneChange((zone) => check(zone));
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
