// The social layer's balance (`npm run social`, docs/checks.md "Social sim"): simulated players live with the cast of
// `src/social/people` through the real rules (talk, gifts, favours, the drift) and the table says, per person, the
// tier reached and the perks in force. A typical player (meets a few people a day) for `--days` game days (60), and a
// diligent one (everyone, every day, gifts and favours) for 120: any perk the diligent one cannot reach fails, and so
// does a single day's spam (30 interactions in a row with one stranger) gaining more than `SPAM_CAP` warmth.
//
//   npm run social
//   npm run social -- --days 90 --seed 7
import { arg, bundle } from './headless.mjs';

const DAYS = Number(arg('days', 60));
const SEED = Number(arg('seed', 1));
const DILIGENT_DAYS = 120;
/** The most warmth a stranger may be talked into in one day by brute repetition. */
const SPAM_CAP = 20;

/** A fresh copy of the rules and their store (the store is module-level, so each run bundles its own). */
let runs = 0;
const fresh = () => bundle(`export * from '@/headless/social';`, { name: `social-${runs++}` });

function table(title, rows) {
  console.log(`\n${title}`);
  console.log('person'.padEnd(18) + 'group'.padEnd(10) + 'warmth'.padStart(7) + 'trust'.padStart(7) + '  tier'.padEnd(15) + 'perks in force');
  for (const r of rows) console.log(r.id.padEnd(18) + r.group.padEnd(10) + String(r.warmth).padStart(7) + String(r.trust).padStart(7) + `  ${r.tier}`.padEnd(15) + (r.perks.join(', ') || '-'));
}

const typical = await fresh();
const casual = typical.simulate(typical.PROFILES.typical, DAYS, SEED);
table(`A typical player, ${DAYS} game days`, casual);
// Not a failure, a reading: a casual player at full warmth with most people means talk pays too much.
const saturated = casual.filter((r) => r.warmth >= 95).length;
if (saturated > casual.length / 2) console.log(`\nNote: ${saturated} of ${casual.length} people at 95+ warmth after ${DAYS} days of casual play: warmth comes easily (socialPlan INTERACTIONS, ODDS).`);

const diligent = await fresh();
const rows = diligent.simulate(diligent.PROFILES.diligent, DILIGENT_DAYS, SEED);
table(`A diligent player, ${DILIGENT_DAYS} game days`, rows);

const failures = [];
for (const r of rows) if (r.missing.length) failures.push(`${r.id}: out of reach after ${DILIGENT_DAYS} days: ${r.missing.join(', ')}`);

const spammed = await fresh();
const target = 'dubois';
const gain = spammed.spam(target, 30, SEED);
console.log(`\nSpam: 30 interactions in a row with ${target} on day 1: warmth ${gain.warmth >= 0 ? '+' : ''}${gain.warmth}, trust ${gain.trust >= 0 ? '+' : ''}${gain.trust} (cap ${SPAM_CAP})`);
if (gain.warmth > SPAM_CAP) failures.push(`spam: ${target} gained ${gain.warmth} warmth in one day (cap ${SPAM_CAP})`);

if (failures.length) {
  console.error(`\nsocial-sim: ${failures.length} problem(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log('\nsocial-sim: every perk reachable, spam capped.');
// The bundled game leaves listeners behind (storage, tabs): end here rather than wait on them.
process.exit(0);
