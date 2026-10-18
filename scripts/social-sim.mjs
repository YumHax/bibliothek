// The social layer's balance and coverage (`npm run social`, part of `npm run typecheck`; docs/checks.md "Social
// sim"): simulated players live with the cast of `src/social/people` through the real rules (topics, news, small talk,
// gifts, promises kept and broken, the drift) and the table says, per person, the tier reached and the perks in force.
// It fails when:
//   - a perk is out of reach of two diligent players (120 game days: everyone, every day, the best choice, gifts,
//     every promise kept; reachable when either gets it);
//   - the typical player (60 game days: a few people a day, reading faces three times in four, a gift now and then,
//     most promises kept) has a share of the deep people at Friendly or more, the mean of three players, outside
//     TYPICAL_FRIENDLY (a note outside it, a failure outside it by more than TOLERANCE), or more than SATURATED of
//     everyone at 95+ warmth;
//   - a careless clicker (30 choices in a row with one person on day 1, anything but a long press) gains more than
//     CARELESS_CAP warmth (one conversation at its best), or ends more than CARELESS_LOSS down;
//   - the coverage: a deep person with fewer than four topics, a topic without an answer, a choice that is a dead end;
//   - down the phone: a line a call can show (their topics' phone side, their `phoneLines`, the shared phone pools)
//     with words that need the player there (`IN_PERSON` in src/headless/social.ts: "pass me", "sit down", "you look").
//
//   npm run social
//   npm run social -- --days 90 --seed 7
import { arg, bundle } from './headless.mjs';

const DAYS = Number(arg('days', 60));
const SEED = Number(arg('seed', 1));
const DILIGENT_DAYS = 120;
/** The share of deep people a typical player has at Friendly or more after DAYS game days: the target. */
const TYPICAL_FRIENDLY = [0.4, 0.6];
/** How far outside the target the share may be before the run fails (the target is a feel, not a contract). */
const TOLERANCE = 0.1;
/** The most of everyone a typical player may have at 95 warmth or more (warmth that comes too easily). */
const SATURATED = 0.25;
const SATURATED_TARGET = 0.2;
/**
 * The most warmth one careless day with one person may bring: no more than one conversation at its best (socialPlan
 * TALK: 3 exchanges × 3 loved × 1.25 good mood, + 1 for a good talk), however many choices are clicked.
 */
const CARELESS_CAP = 12.5;
/**
 * The most it may cost without an insult: a disliked choice costs a little (their face showed it before the click), a
 * careless day never more than this.
 */
const CARELESS_LOSS = -3;

/** A fresh copy of the rules and their store (the store is module-level, so each run bundles its own). */
let runs = 0;
const fresh = () => bundle(`export * from '@/headless/social';`, { name: `social-${runs++}` });
const pct = (x) => `${Math.round(x * 100)} %`;

function table(title, rows) {
  console.log(`\n${title}`);
  console.log('person'.padEnd(18) + 'group'.padEnd(10) + 'deep'.padEnd(6) + 'warmth'.padStart(7) + 'trust'.padStart(7) + '  tier'.padEnd(15) + 'perks in force');
  for (const r of rows) console.log(r.id.padEnd(18) + r.group.padEnd(10) + (r.deep ? 'yes' : '').padEnd(6) + String(r.warmth).padStart(7) + String(r.trust).padStart(7) + `  ${r.tier}`.padEnd(15) + (r.perks.join(', ') || '-'));
}

const failures = [];
const WARM = new Set(['friendly', 'friend', 'close']);

const typical = await fresh();
const casual = typical.simulate(typical.PROFILES.typical, DAYS, SEED);
table(`A typical player, ${DAYS} game days`, casual);
const deep = casual.filter((r) => r.deep);
/** The share of deep people at Friendly or more, averaged over a few players: Friendly rests on a promise kept, one event a person, too few people for one run to say it. */
const RUNS = 3;
async function friendlyShare() {
  let sum = 0;
  for (let i = 0; i < RUNS; i++) {
    const rows = i === 0 ? casual : (await fresh()).simulate(typical.PROFILES.typical, DAYS, SEED + i);
    const d = rows.filter((r) => r.deep);
    sum += d.filter((r) => WARM.has(r.tier)).length / Math.max(1, d.length);
  }
  return sum / RUNS;
}
if (deep.length) {
  const share = await friendlyShare();
  const [lo, hi] = TYPICAL_FRIENDLY;
  console.log(`\nDeep people at Friendly or more: ${pct(share)}, the mean of ${RUNS} players (target ${pct(lo)}-${pct(hi)})`);
  if (share < lo - TOLERANCE || share > hi + TOLERANCE) failures.push(`typical: ${pct(share)} of the deep people at Friendly or more after ${DAYS} days, outside ${pct(lo - TOLERANCE)}-${pct(hi + TOLERANCE)} (socialPlan TALK, PROMISE, TIERS)`);
  else if (share < lo || share > hi) console.log('Note: outside the target, inside the tolerance.');
} else failures.push('no deep person in the cast (PersonCard.depth): the typical player has no one to be measured on');
const saturated = casual.filter((r) => r.warmth >= 95).length / casual.length;
console.log(`At 95+ warmth: ${pct(saturated)} of everyone (at most ${pct(SATURATED_TARGET)} wanted)`);
if (saturated > SATURATED) failures.push(`typical: ${pct(saturated)} of everyone at 95+ warmth after ${DAYS} days, over ${pct(SATURATED)}: warmth comes too easily`);

const diligent = await fresh();
const rows = diligent.simulate(diligent.PROFILES.diligent, DILIGENT_DAYS, SEED);
table(`A diligent player, ${DILIGENT_DAYS} game days`, rows);
// Reachable means some diligent player gets there: a perk missed by this one is tried by a second (who is asked other favours).
const again = (await fresh()).simulate(diligent.PROFILES.diligent, DILIGENT_DAYS, SEED + 1);
for (const r of rows) {
  const other = new Set(again.find((x) => x.id === r.id)?.missing ?? []);
  const missing = r.missing.filter((m) => other.has(m));
  if (missing.length) failures.push(`${r.id}: out of reach after ${DILIGENT_DAYS} days: ${missing.join(', ')}`);
}

const clicker = await fresh();
const clicks = clicker.careless(30, SEED);
const worst = clicks.reduce((a, b) => (b.gain > a.gain ? b : a), clicks[0] ?? { id: '-', gain: 0, lowest: 0 });
console.log(`\nCareless clicker, 30 choices on day 1 with each of ${clicks.length}: the most gained ${worst.gain} (${worst.id}), cap ${CARELESS_CAP}`);
for (const c of clicks) {
  if (c.gain > CARELESS_CAP) failures.push(`careless: ${c.id} gained ${c.gain} warmth in one day of clicking (cap ${CARELESS_CAP})`);
  if (c.gain < CARELESS_LOSS) failures.push(`careless: ${c.id} ended ${c.gain} warmth down without an insult (floor ${CARELESS_LOSS})`);
}
const dips = clicks.filter((c) => c.lowest < 0);
if (dips.length) console.log(`Note: warmth dipped on the way for ${dips.map((c) => `${c.id} ${c.lowest}`).join(', ')} (a disliked choice: their face showed it)`);

const covered = await fresh();
const cover = covered.coverage();
console.log(`\nCoverage: ${cover.deep} deep people, ${cover.extras} place entries registered headless`);
failures.push(...cover.problems.map((p) => `coverage: ${p}`));
// Down the phone: a call never shows a line that needs the player there ("Pass me the salt").
failures.push(...covered.phoneProblems().map((p) => `phone: ${p}`));

if (failures.length) {
  console.error(`\nsocial-sim: ${failures.length} problem(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('\nsocial-sim: every perk reachable, the typical player in range, careless clicking capped, the cast covered.');
// The bundled game leaves listeners behind (storage, tabs): end here rather than wait on them.
process.exit(0);
