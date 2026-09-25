import { pointsPerTicket } from '@/economy/pricing';
import { ARCADE_GAMES, type ArcadeGame } from './games';
import { REPLAY_STEP } from './replay/Replay';

/** One game's line in a simulated balance table. */
export interface SimulatedPayout {
  gameId: string;
  skill: number;
  runs: number;
  avgScore: number;
  avgSeconds: number;
  avgTickets: number;
  ticketsPerMinute: number;
}

/** Longest simulated play, seconds (a game that never ends at this skill is cut off here). */
const MAX_SECONDS = 240;

/**
 * Plays every cabinet game headless on its own autopilot, `runs` times per skill, at the cabinets'
 * fixed step, and reports what a play scores, lasts and pays (`PAYOUT`): a quick way to see which
 * game is the obvious earner after a change of rules or rates. The autopilots play better than
 * people (they read the board), so compare the games with each other, not with a person's plays
 * (`?payout` shows those). The machines that are not cabinets (pinball, alley, hoops, wheel) are
 * 3D and not simulated here. Console: `bibliothek.simulatePayouts()` (with `?stats`).
 */
export function simulatePayouts(options: { runs?: number; skills?: readonly number[] } = {}): SimulatedPayout[] {
  const runs = options.runs ?? 12;
  const skills = options.skills ?? [0.4, 0.65, 0.9];
  const rows: SimulatedPayout[] = [];
  for (const [id, make] of Object.entries(ARCADE_GAMES)) {
    const game: ArcadeGame = make({});
    if (game.demoable === false) continue;
    for (const skill of skills) {
      let score = 0;
      let seconds = 0;
      for (let r = 0; r < runs; r++) {
        game.reset({ best: 0, pointsPerTicket: pointsPerTicket(id), seed: (r + 1) * 7919 });
        let t = 0;
        while (!game.over && t < MAX_SECONDS) {
          game.update(REPLAY_STEP, game.autopilot(skill));
          game.takeSounds();
          t += REPLAY_STEP;
        }
        score += game.score;
        seconds += t;
      }
      const tickets = Math.floor(score / runs / pointsPerTicket(id));
      rows.push({
        gameId: id,
        skill,
        runs,
        avgScore: Math.round(score / runs),
        avgSeconds: Math.round((seconds / runs) * 10) / 10,
        avgTickets: tickets,
        ticketsPerMinute: Math.round((tickets / (seconds / runs)) * 60),
      });
    }
  }
  console.table(rows);
  return rows;
}
