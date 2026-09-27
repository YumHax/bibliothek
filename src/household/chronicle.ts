import { getPlatform } from '@/catalog/platforms';
import { grailGame, upcomingGrail } from '@/economy/grails';
import { themeOf } from '@/economy/marketDays';
import { clearanceOn, nextBrocante, whenText } from '@/economy/marketEvents';
import { HOUSEHOLD } from './rules';

/**
 * Radio Brocante's morning chronicle for market day `day`: the one voice that hears of a grail
 * further ahead than the stalls and the papers do (`HOUSEHOLD.radio.grailDays`, and on which
 * stall), then what kind of day tomorrow is, a clearance tomorrow, the next Grand Flea Fair within
 * the week. Pure: the same words on every reload. `owns` leaves out a grail already on the shelves.
 */
export function morningChronicle(day: number, owns: (id: string) => boolean): string[] {
  const lines: string[] = [];
  const grail = upcomingGrail(day, HOUSEHOLD.radio.grailDays);
  if (grail && !owns(grailGame(grail.grail).id)) {
    const g = grail.grail;
    lines.push(grail.inDays === 0
      ? `“…and a caller swears a boxed ${g.title} is on the ${getPlatform(g.platform).shortName} stall this very morning.”`
      : `“A little bird tells us: ${g.seller}. Word is a ${g.title} is in there. Expect it on the ${getPlatform(g.platform).shortName} stall ${whenText(grail.inDays)}.”`);
  }
  const tomorrow = themeOf(day + 1);
  if (tomorrow.kind !== 'ordinary') lines.push(`“Tomorrow at the market: ${tomorrow.title.toLowerCase()}. ${tomorrow.blurb}”`);
  const clearance = clearanceOn(day + 1);
  if (clearance) lines.push(`“The ${getPlatform(clearance.platform).shortName} stall clears out tomorrow. Bring a bag.”`);
  const fair = nextBrocante(day);
  if (fair > day && fair - day <= 7) lines.push(`“The Grand Flea Fair is ${whenText(fair - day)}: save your coins.”`);
  if (!lines.length) lines.push('“A quiet week at the flea market, folks. Nothing on the grapevine.”');
  return lines;
}
