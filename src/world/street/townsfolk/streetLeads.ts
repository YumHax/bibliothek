import { getPlatform } from '@/catalog/platforms';
import { felixLotGame, felixLotOn } from '@/economy/felixLots';
import { RIVAL_COLLECTOR, rivalOnFrontStreet } from '@/economy/rivalCollector';
import { passerLead, type Lead } from '@/social/street/leads';
import { mansionGossip } from '@/social/street/mansionDoors';
import { random } from '@/random';

/*
 * What a passer-by may know on game day `day` that is worth a journal line (`social/street/leads`): who at Park
 * Corner Mansions is clearing out or needs a hand (`mansionDoors`), Victor setting up outside RETRO GAMES tomorrow,
 * one of Félix's copies on a stall at the flea market today. All read off the day, so they are true when acted on.
 */

/** Today's leads, the likeliest to matter first. */
function leadsOn(day: number, owns: (id: string) => boolean): (Lead | null)[] {
  const felix = felixLotOn(day, 'stall', owns);
  const felixGame = felix && felixLotGame(felix);
  return [
    felix && felixGame
      ? {
          id: `felix-stall:${day}`,
          says: `There’s an old ${getPlatform(felixGame.platform).shortName} game on a stall at the flea market with a funny round sticker on the back. F.A., in biro.`,
          note: `A passer-by saw a ${getPlatform(felixGame.platform).shortName} game with an F.A. sticker on a flea-market stall today.`,
        }
      : null,
    mansionGossip(day),
    rivalOnFrontStreet(day + 1) && !rivalOnFrontStreet(day)
      ? {
          id: `victor-tomorrow:${day}`,
          says: `That collector with the suitcase, ${RIVAL_COLLECTOR.short}? He told the newsagent he’ll be outside RETRO GAMES tomorrow.`,
          note: `A passer-by: ${RIVAL_COLLECTOR.short} sets up outside RETRO GAMES tomorrow.`,
        }
      : null,
  ];
}

/** The day's lead told on asking (a regular's word: Bastien's), said or not before; null when there is none. */
export function leadToday(day: number, owns: (id: string) => boolean): Lead | null {
  return leadsOn(day, owns).find((l): l is Lead => l !== null) ?? null;
}

/**
 * Wraps the street's talk (`life/streetTalk`) so a click on a passer-by now and then brings the day's lead instead of
 * the usual line (said once, one a day; the journal writes it down).
 */
export function withLeads<R>(talk: (role?: R) => string, day: () => number, owns: (id: string) => boolean): (role?: R) => string {
  return (role) => {
    const today = day();
    const lead = passerLead(today, leadsOn(today, owns), random());
    return lead ? `“${lead.says}”` : talk(role);
  };
}
