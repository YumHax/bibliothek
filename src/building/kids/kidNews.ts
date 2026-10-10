import type { StoryStage } from '@/story/prototype';
import { HUNT, type ClueId } from '@/building/hunt/huntPlan';
import { huntFile } from '@/building/hunt/BuildingHunt';
import { rivalAtMarket, rivalOnFrontStreet } from '@/economy/rivalCollector';
import { gameDayRandom } from '@/time/daily';
import { shuffled } from '@/random';
import { bulkyLot } from '../bulkyWaste';
import { isPartyDay } from '../neighboursParty';
import { KIDS_NEWS } from './kidsPlan';

/*
 * What the courtyard's kids have heard (docs/building.md "The kids in the yard"): kids hear everything. Built from
 * the building's state as it is now, in their words: the clear-out by the bins tomorrow (and the console in it), the
 * party coming, Victor seen about, a nudge towards the next place of the treasure hunt and of the lost prototype's
 * trail (never a new step: where the trail already goes), and what is in the neighbours' cupboards.
 */

/** The prototype's trail as the kids hear of it: its stage (`story/PrototypeStory`), handed in once by the wiring. */
let story: { readonly stage: StoryStage } | null = null;

/** Tells the kids where the lost prototype's trail stands (`bootstrap/worldLife`, once). */
export function tellKidsTheStory(source: { readonly stage: StoryStage }): void {
  story = source;
}

/** The day `n` days on, as the party's real calendar reads it (the Fête des voisins is a real date). */
function dateIn(date: Date, n: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + n);
  return next;
}

/** How a day ahead is said. */
const WHEN = ['today', 'tomorrow', 'in two days', 'in three days'];

/** The treasure hunt's last clue found on the main way, read back from the journal's file (`huntFile().next`). */
function lastClue(): ClueId | null {
  const next = huntFile()?.next;
  if (!next) return null;
  const entry = Object.entries(HUNT.next).find(([, text]) => text === next);
  return entry ? (entry[0] as ClueId) : null;
}

/**
 * Today's news, most urgent first: what happens in the yard (`urgent`: the kids shout it when the player comes out),
 * then the hunt, the trail, Victor, and two of the cupboards (drawn per day).
 */
export function kidsNews(day: number, date: Date): { urgent: string[]; rest: string[] } {
  const urgent: string[] = [];
  const tomorrow = bulkyLot(day + 1, () => true);
  if (tomorrow) urgent.push(KIDS_NEWS.bulkyTomorrow.replace('{owner}', tomorrow.owner.name) + (tomorrow.console ? KIDS_NEWS.bulkyConsole : ''));
  if (bulkyLot(day, () => true)) urgent.push(KIDS_NEWS.bulkyToday);
  for (let n = 1; n < WHEN.length; n++) {
    if (!isPartyDay(day + n, dateIn(date, n))) continue;
    urgent.push(KIDS_NEWS.party.replace('{when}', WHEN[n]!));
    break;
  }
  const rest: string[] = [];
  const clue = lastClue();
  const hunt = clue ? (KIDS_NEWS.hunt as Partial<Record<ClueId, string>>)[clue] : undefined;
  if (hunt) rest.push(hunt);
  const trail = story ? (KIDS_NEWS.story as Partial<Record<StoryStage, string>>)[story.stage] : undefined;
  if (trail) rest.push(trail);
  if (rivalAtMarket(day)) rest.push(KIDS_NEWS.rivalMarket);
  else if (rivalOnFrontStreet(day)) rest.push(KIDS_NEWS.rivalStreet);
  rest.push(...shuffled(gameDayRandom('kids-cupboards', day), KIDS_NEWS.cupboards).slice(0, 2));
  return { urgent, rest };
}
