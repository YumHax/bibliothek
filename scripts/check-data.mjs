// The data the game is built from, checked headless (`scripts/headless.mjs` bundles it): the seed catalogue and the
// bootlegs (ids unique and canonical, platforms known, dates well-formed, a box and a cartridge for every copy), the
// media tables (every platform and region has a case, a label that fits its cartridge), the platforms, the baked box
// art (`public/boxart/index.json` against the files on disk and the seed games), the save keys (one place, unique,
// under the root prefix), the world plan (neighbours that exist, arrivals inside their zone, doorways onto
// neighbours), the arcade's payout table (a rate for every cabinet game) and the prices (finite, never negative, odds
// between 0 and 1). On every `npm run typecheck`:
//
//   node scripts/check-data.mjs           fails on a problem
//   node scripts/check-data.mjs --list    also what is only worth knowing (seed games without baked art, ...)
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, bundle, flag, hush } from './headless.mjs';

const LIST = flag('list');
const started = performance.now();
const restore = hush();
// What the script reads from the game is listed in `src/headless/data.ts` (typechecked, and knip sees it used).
const data = await bundle(`export * from '@/headless/data';`, { name: 'data' });
restore();

const problems = [];
const notes = [];
let checks = 0;
/** Records a failed check under `area`. */
function fail(area, what) {
  problems.push(`  ${area}: ${what}`);
}
/** One check: `ok` false fails with `what`. */
function expect(area, ok, what) {
  checks++;
  if (!ok) fail(area, what);
}
const finite = (n) => typeof n === 'number' && Number.isFinite(n);
const positive = (n) => finite(n) && n > 0;

// --- The seed catalogue and the bootlegs ------------------------------------------------------------------------

const { SEED_GAMES, BOOTLEGS, PLATFORMS } = data;
const games = [...SEED_GAMES, ...BOOTLEGS];
{
  const ids = new Map();
  const names = new Map();
  for (const g of games) {
    const where = `${g.platform}/${g.title}`;
    expect('catalog', typeof g.id === 'string' && g.id.length > 0, `${where}: no id`);
    expect('catalog', !ids.has(g.id), `${g.id}: id used twice (${ids.get(g.id)} and ${where})`);
    ids.set(g.id, where);
    expect('catalog', g.platform in PLATFORMS, `${g.id}: unknown platform '${g.platform}'`);
    expect('catalog', typeof g.title === 'string' && g.title.trim() === g.title && g.title.length > 0, `${g.id}: empty or untrimmed title`);
    if (g.releaseDate !== undefined) {
      const m = /^(\d{4})(?:-(\d{2})-(\d{2}))?$/.exec(g.releaseDate);
      const year = m ? Number(m[1]) : 0;
      const day = m && m[2] ? new Date(`${g.releaseDate}T00:00:00Z`) : null;
      const dayOk = !day || (!Number.isNaN(day.getTime()) && day.toISOString().startsWith(g.releaseDate));
      expect('catalog', Boolean(m) && year >= 1970 && year <= 2030 && dayOk, `${g.id}: releaseDate '${g.releaseDate}' is not YYYY or a real YYYY-MM-DD`);
    }
    const name = g.externalIds?.libretroName;
    if (name) {
      expect('catalog', !names.has(name), `${g.id}: libretroName '${name}' also on ${names.get(name)}`);
      names.set(name, g.id);
      expect('catalog', /\(.+\)/.test(name), `${g.id}: libretroName '${name}' has no region in parentheses`);
    }
    // Every copy has a box and a cartridge or disc.
    try {
      const box = data.caseOf(g).dims;
      expect('media', positive(box.width) && positive(box.height) && positive(box.depth), `${g.id}: box of no size`);
      const media = data.mediaOf(g);
      expect('media', positive(media.size.width) && positive(media.size.height) && positive(media.size.depth), `${g.id}: media of no size`);
    } catch (error) {
      fail('media', `${g.id}: ${String(error?.message ?? error)}`);
    }
  }
  for (const g of SEED_GAMES) {
    expect('catalog', data.canonicalGameId(g.id) === g.id, `${g.id}: not its canonical id (${data.canonicalGameId(g.id)})`);
    const name = g.externalIds?.libretroName;
    if (name) expect('catalog', data.gameIdFor(g.platform, name) === g.id, `${g.id}: id does not follow its libretro name (${data.gameIdFor(g.platform, name)})`);
    expect('catalog', !g.bootleg, `${g.id}: a seed game marked bootleg`);
  }
  for (const [from, to] of data.LEGACY_SEED_IDS) {
    expect('catalog', ids.has(to), `legacy id ${from} maps to ${to}, which no seed game has`);
    expect('catalog', !ids.has(from), `legacy id ${from} is still a game's id`);
  }
  for (const g of BOOTLEGS) {
    expect('bootlegs', data.isBootlegId(g.id) && g.id.startsWith(`bootleg-${g.platform}-`), `${g.id}: a bootleg's id is bootleg-<platform>-<slug>`);
    expect('bootlegs', g.bootleg === true && !g.externalIds?.libretroName, `${g.id}: a bootleg has no libretro name and says it is one`);
  }
  notes.push(`${SEED_GAMES.length} seed games, ${BOOTLEGS.length} bootlegs, ${names.size} libretro names`);
}

// --- The media tables and the platforms -------------------------------------------------------------------------

{
  const regions = { na: 'USA', eu: 'Europe', jp: 'Japan' };
  for (const platform of Object.keys(PLATFORMS)) {
    const widest = data.widestCaseOf(platform);
    for (const [region, tag] of Object.entries(regions)) {
      const copy = { platform, region: tag };
      expect('media', data.regionOf(copy) === region, `${platform}: region tag '${tag}' reads as ${data.regionOf(copy)}, not ${region}`);
      const { dims, kind } = data.caseOf(copy);
      expect('media', positive(dims.width) && positive(dims.height) && positive(dims.depth), `${platform}/${region}: case of no size`);
      expect('media', ['cardboard', 'clamshell', 'jewel'].includes(kind), `${platform}/${region}: unknown case kind '${kind}'`);
      expect('media', dims.width <= widest.width + 1e-9, `${platform}/${region}: wider (${dims.width}) than widestCaseOf says (${widest.width})`);
      const m = data.mediaOf(copy);
      const fits = Math.abs(m.label.x) + m.label.width / 2 <= m.size.width / 2 + 1e-6 && Math.abs(m.label.y) + m.label.height / 2 <= m.size.height / 2 + 1e-6;
      expect('media', fits, `${platform}/${region}: the ${m.shape} label (${m.label.width} x ${m.label.height} at ${m.label.x}, ${m.label.y}) runs off its ${m.size.width} x ${m.size.height} front`);
      expect('media', finite(m.recess) && m.recess >= 0 && finite(m.insert) && m.insert >= 0, `${platform}/${region}: recess or insert not a length`);
      expect('media', Number.isInteger(m.colour) && m.colour >= 0 && m.colour <= 0xffffff, `${platform}/${region}: media colour is not a 24-bit value`);
    }
  }
  for (const [id, p] of Object.entries(PLATFORMS)) {
    expect('platforms', p.id === id, `${id}: entry says its id is '${p.id}'`);
    expect('platforms', p.name?.trim() && p.shortName?.trim(), `${id}: name or shortName empty`);
    const def = data.defaultCaseOf(id).dims;
    expect('platforms', p.boxDimensions.width === def.width && p.boxDimensions.height === def.height && p.boxDimensions.depth === def.depth, `${id}: boxDimensions differ from the North American case`);
    expect('platforms', Number.isInteger(p.accentColor) && p.accentColor >= 0 && p.accentColor <= 0xffffff, `${id}: accentColor is not a 24-bit value`);
    expect('platforms', typeof p.libretroRepo === 'string' && /^[A-Za-z0-9_.-]+$/.test(p.libretroRepo), `${id}: libretroRepo '${p.libretroRepo}' is not a repository name`);
  }
  expect('platforms', data.PLATFORM_LIST.length === Object.keys(PLATFORMS).length, 'PLATFORM_LIST does not list every platform once');
}

// --- The baked box art --------------------------------------------------------------------------------------------

{
  const dir = path.join(ROOT, 'public', 'boxart');
  const indexFile = path.join(dir, 'index.json');
  const kinds = new Set(['front', 'back', 'spine', 'snap', 'title', 'cart', 'disc']);
  const bySeedName = new Map(SEED_GAMES.filter((g) => g.externalIds?.libretroName).map((g) => [`${g.platform}/${g.externalIds.libretroName}`, g]));
  if (!fs.existsSync(indexFile)) {
    fail('boxart', 'public/boxart/index.json is missing (npm run bake-art writes it)');
  } else {
    const index = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
    expect('boxart', index.version === 1 && index.games && typeof index.games === 'object', 'index.json is not a version 1 index');
    const listed = new Set();
    for (const [key, entry] of Object.entries(index.games ?? {})) {
      const platform = key.split('/')[0];
      expect('boxart', platform in PLATFORMS, `${key}: unknown platform`);
      expect('boxart', bySeedName.has(key), `${key}: no seed game has this platform and libretro name (an orphan bake: re-run npm run bake-art, or drop it)`);
      expect('boxart', typeof entry.dir === 'string' && entry.dir.startsWith(`${platform}/`) && !entry.dir.includes('..'), `${key}: dir '${entry.dir}' is not under its platform`);
      listed.add(entry.dir);
      const folder = path.join(dir, entry.dir);
      expect('boxart', fs.existsSync(folder), `${key}: folder ${entry.dir} is missing`);
      if (!fs.existsSync(folder)) continue;
      const files = new Set(fs.readdirSync(folder));
      for (const kind of entry.files) {
        expect('boxart', kinds.has(kind), `${key}: '${kind}' is not a box art kind`);
        expect('boxart', files.has(`${kind}.webp`), `${key}: ${entry.dir}/${kind}.webp is missing`);
      }
      for (const file of files) {
        const kind = file.replace(/\.webp$/, '');
        expect('boxart', file.endsWith('.webp') && entry.files.includes(kind), `${key}: ${entry.dir}/${file} is on disk but not in the index`);
      }
    }
    for (const platform of fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) {
      expect('boxart', platform in PLATFORMS, `public/boxart/${platform}: not a platform`);
      for (const slug of fs.readdirSync(path.join(dir, platform))) {
        expect('boxart', listed.has(`${platform}/${slug}`), `public/boxart/${platform}/${slug}: on disk but not in the index`);
      }
    }
    const unbaked = [...bySeedName.keys()].filter((key) => !index.games?.[key]);
    notes.push(`${Object.keys(index.games ?? {}).length} games with baked art, ${unbaked.length} seed games without${unbaked.length && LIST ? `: ${unbaked.join(', ')}` : ''}`);
  }
}

// --- The save keys ------------------------------------------------------------------------------------------------

{
  const { KEYS, ROOT_PREFIX, CACHE_PREFIX, CORRUPT_PREFIX, PREFERENCE_KEYS } = data;
  const seen = new Map();
  for (const [name, key] of Object.entries(KEYS)) {
    expect('keys', typeof key === 'string' && key.startsWith(ROOT_PREFIX) && !/\s/.test(key), `KEYS.${name} = '${key}' is not under '${ROOT_PREFIX}'`);
    expect('keys', !seen.has(key), `KEYS.${name} and KEYS.${seen.get(key)} are both '${key}'`);
    seen.set(key, name);
    // The corrupt copies are named after the save they were: a save under that prefix would be taken for one.
    expect('keys', !key.startsWith(CORRUPT_PREFIX), `KEYS.${name} = '${key}' sits in the corrupt-save namespace`);
    expect('keys', !key.startsWith(CACHE_PREFIX) || /cache|misses/i.test(name), `KEYS.${name} = '${key}' sits in the cache namespace without being named a cache`);
  }
  for (const key of PREFERENCE_KEYS) expect('keys', seen.has(key), `PREFERENCE_KEYS names '${key}', which is not in KEYS`);
  notes.push(`${seen.size} save keys`);
}

// --- The world plan -----------------------------------------------------------------------------------------------

{
  const { WORLD_PLAN, FLAT, DEFAULT_ROOM } = data;
  const zones = new Map(WORLD_PLAN.zones.map((z) => [z.id, z]));
  expect('world', zones.has(WORLD_PLAN.start), `start zone '${WORLD_PLAN.start}' is not in the plan`);
  expect('world', zones.size === WORLD_PLAN.zones.length, 'a zone id is used twice');
  const inside = (z, [x, zz]) => finite(x) && finite(zz) && Math.abs(x) <= z.extent.width / 2 + 1e-6 && Math.abs(zz) <= z.extent.depth / 2 + 1e-6;
  for (const z of WORLD_PLAN.zones) {
    expect('world', z.origin.length === 3 && z.origin.every(finite), `${z.id}: origin is not three finite numbers`);
    expect('world', positive(z.extent.width) && positive(z.extent.depth) && positive(z.extent.height), `${z.id}: extent is not three positive lengths`);
    expect('world', typeof z.kind === 'string' && z.kind.length > 0, `${z.id}: no kind`);
    for (const n of z.neighbours) {
      expect('world', zones.has(n), `${z.id}: neighbour '${n}' is not a zone`);
      expect('world', n !== z.id, `${z.id}: its own neighbour`);
      if (zones.has(n) && !zones.get(n).neighbours.includes(z.id)) notes.push(`${z.id} keeps ${n} loaded but not the other way round`);
    }
    expect('world', new Set(z.neighbours).size === z.neighbours.length, `${z.id}: a neighbour listed twice`);
    if (z.travel) {
      expect('world', inside(z, z.travel.arrival), `${z.id}: travel arrival (${z.travel.arrival}) is outside its ${z.extent.width} x ${z.extent.depth} extent`);
      expect('world', finite(z.travel.yaw), `${z.id}: travel yaw is not a number`);
      expect('world', typeof z.travel.label === 'string' && z.travel.label.length > 0, `${z.id}: travel has no label`);
      for (const [from, spot] of Object.entries(z.travel.arrivals ?? {})) {
        expect('world', zones.has(from), `${z.id}: an arrival from '${from}', which is not a zone`);
        expect('world', inside(z, spot.at) && finite(spot.yaw), `${z.id}: arrival from ${from} (${spot.at}) is outside its extent`);
      }
    }
  }
  for (const id of FLAT) expect('world', zones.has(id), `FLAT names '${id}', which is not a zone`);
  const living = zones.get('living');
  for (const door of DEFAULT_ROOM.doorways ?? []) {
    expect('world', zones.has(door.to), `the collection room has a doorway to '${door.to}', which is not a zone`);
    expect('world', living?.neighbours.includes(door.to), `the collection room's doorway to '${door.to}' leads to a zone that is not among its neighbours`);
  }
  notes.push(`${zones.size} zones`);
}

// --- The arcade's payout and the prices ----------------------------------------------------------------------------

{
  const { ARCADE_GAMES, pricing } = data;
  for (const id of Object.keys(ARCADE_GAMES)) {
    expect('arcade', positive(pricing.PAYOUT[id]), `${id}: no PAYOUT rate (points per ticket) for this cabinet game`);
    try {
      expect('arcade', positive(pricing.pointsPerTicket(id)), `${id}: pointsPerTicket is not positive`);
      expect('arcade', pricing.ticketsFor(id, 0) === 0 && finite(pricing.ticketsFor(id, 10_000)), `${id}: ticketsFor misbehaves at 0 or 10 000 points`);
    } catch (error) {
      fail('arcade', `${id}: ${String(error?.message ?? error)}`);
    }
  }
  const others = Object.keys(pricing.PAYOUT).filter((id) => !(id in ARCADE_GAMES));
  if (others.length) notes.push(`PAYOUT rates for machines that are not cabinet games: ${others.join(', ')}`);

  /**
   * Every number under `value` (arrays and plain objects walked) must be finite; a price, a rate or a count (`money`:
   * the table's name says so) never negative; an odds (a key ending in `odds`/`Odds`) between 0 and 1; a two-number
   * array a low..high range; `min` <= `max`. Deltas (NEGOTIATION's rain, coffee) may be negative, factors above 1.
   */
  const walk = (name, value, money) => {
    if (typeof value === 'number') {
      expect('pricing', finite(value), `${name} = ${value}`);
      if (money) expect('pricing', value >= 0, `${name} = ${value} is negative`);
      if (/odds$/i.test(name)) expect('pricing', value >= 0 && value <= 1, `${name} = ${value} is not between 0 and 1`);
    } else if (Array.isArray(value)) {
      value.forEach((v, i) => walk(`${name}[${i}]`, v, money));
      if (value.length === 2 && value.every(finite)) expect('pricing', value[0] <= value[1], `${name} = [${value}] is not a low..high range`);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(`${name}.${k}`, v, money);
      if (finite(value.min) && finite(value.max)) expect('pricing', value.min <= value.max, `${name}: min ${value.min} > max ${value.max}`);
    }
  };
  let tables = 0;
  for (const [name, value] of Object.entries(pricing)) {
    if (typeof value === 'function' || typeof value === 'string') continue;
    tables++;
    walk(name, value, /PAYOUT|PRICE|COINS|COST|REWARD|TICKETS|POINTS|BACK$/.test(name));
  }
  notes.push(`${Object.keys(ARCADE_GAMES).length} cabinet games, ${tables} price tables`);
}

const seconds = ((performance.now() - started) / 1000).toFixed(1);
if (LIST) for (const note of notes) console.log(`  ${note}`);
if (problems.length) {
  console.error(`[data] ${problems.length} problem${problems.length === 1 ? '' : 's'} in ${checks} checks:\n${problems.join('\n')}`);
  process.exit(1);
}
console.log(`[data] ${checks} checks: ${notes.slice(0, 3).join(', ')}, all good (${seconds} s)`);
// The bundled modules leave timers behind (a clock, a tick): exit, or Node waits on them.
process.exit(0);
