import { nextAgenda, nextMeetingDay } from '@/building/coproMeeting';
import { COPRO_PLAN, RESOLUTIONS, type Resolution } from '@/building/coproPlan';
import { ballotFor } from '@/building/coproState';
import { addExtras } from '../extras';
import { dueWords, weekdayName } from '../life/due';
import { isMet, nudge, standing } from '../standing';
import type { TalkExtra } from '../talk';
import { addThreadSource, type Thread } from '../threads';
import { atLeast, tierOf } from '../tiers';
import type { PersonId } from '../types';
import { conflictSave, saveConflicts, type VotePromise } from './conflictStore';

/*
 * Votes as promises (docs/building.md "The co-owners' meeting"): while a meeting's ballot is open, each resident with
 * a fixed leaning on a resolution of its agenda asks the player for their vote ("You'll vote with me on the stair
 * carpet, won't you?"), and two of them may want opposite things. Saying yes is a promise (a ticket due at the
 * meeting); once the meeting has sat, the player's ballot keeps it (a stamp of trust) or breaks it. Not answering
 * costs nothing.
 */

/** What a vote kept moves, and one broken: a promise's worth (`PROMISE` in spirit), the broken one remembered. */
const VOTE = { kept: { warmth: 5, trust: 15 }, broken: { warmth: -6, trust: -15 } } as const;

/** The residents asking now, each with the resolution and the option they want (the first of their agenda's). */
function asks(day: number): { person: PersonId; meeting: number; resolution: Resolution; option: { id: string; label: string } }[] {
  const meeting = nextMeetingDay(day);
  if (meeting - day > COPRO_PLAN.openDays) return [];
  const agenda = nextAgenda(day).titles.map((t) => RESOLUTIONS.find((r) => r.title === t)).filter((r): r is Resolution => !!r);
  const out: ReturnType<typeof asks> = [];
  for (const voter of COPRO_PLAN.voters) {
    const person = voter.person;
    if (!person || !isMet(person)) continue;
    const s = standing(person);
    if (!atLeast(tierOf(s.warmth, s.trust), 'acquaintance')) continue;
    for (const resolution of agenda) {
      const id = voter.leans[resolution.id];
      const option = resolution.options.find((o) => o.id === id);
      if (!option) continue;
      out.push({ person, meeting, resolution, option });
      break;
    }
  }
  return out;
}

function promised(person: PersonId, meeting: number): VotePromise | undefined {
  return conflictSave().votes.find((v) => v.person === person && v.meeting === meeting);
}

/** Starts the votes asked as promises: the asks in conversation, the tickets in the book, kept or broken after the meeting. */
export function startVotePromises(d: { day(): number; onNewDay(cb: (day: number) => void): void; note(text: string, weight?: 'line' | 'note'): void }): void {
  const settle = (day: number): void => {
    let changed = false;
    for (const v of conflictSave().votes) {
      if (v.kept !== null || day <= v.meeting) continue;
      v.kept = ballotFor(v.meeting).votes[v.resolution as Resolution['id']] === v.option;
      changed = true;
      const title = RESOLUTIONS.find((r) => r.id === v.resolution)?.title.toLowerCase() ?? 'the vote';
      if (v.kept) nudge(v.person, { ...VOTE.kept, raw: true, why: 'you voted with them, as you said', day, memory: `you voted with me on ${title}`, memoryWeight: 10 });
      else {
        nudge(v.person, { ...VOTE.broken, why: 'you said you’d vote with them', day, memory: `you went back on your vote on ${title}`, memoryWeight: -12 });
        d.note(`Went back on a vote promised at the co-owners’ meeting`);
      }
    }
    // Keep the last couple of dozen.
    const votes = conflictSave().votes;
    if (votes.length > 30) votes.splice(0, votes.length - 30);
    if (changed) saveConflicts();
  };
  settle(d.day());
  d.onNewDay(settle);
  addExtras((ctx) => {
    const ask = asks(ctx.day).find((a) => a.person === ctx.person);
    if (!ask || promised(ask.person, ask.meeting)) return [];
    const extra: TalkExtra = {
      id: `vote-${ask.meeting}-${ask.resolution.id}`,
      group: 'promise',
      label: `I’ll vote “${ask.option.label}” at the meeting, like you.`,
      once: true,
      due: `at the meeting on ${weekdayName(ask.meeting)}`,
      fit: 'loves',
      run: () => {
        conflictSave().votes.push({ person: ask.person, meeting: ask.meeting, resolution: ask.resolution.id, option: ask.option.id, made: ctx.day, kept: null });
        saveConflicts();
        d.note(`Promised my vote on ${ask.resolution.title.toLowerCase()}`, 'note');
        return { line: 'I knew I could count on you. Every vote counts, you know.' };
      },
    };
    return [extra];
  });
  addThreadSource((id, day): Thread[] => {
    const out: Thread[] = [];
    const ask = asks(day).find((a) => a.person === id);
    const v = ask ? promised(id, ask.meeting) : undefined;
    if (ask && !v) out.push({ person: id, kind: 'need', text: `You’ll vote with me on ${ask.resolution.title.toLowerCase()}, won’t you? ${ask.option.label}.`, day });
    for (const p of conflictSave().votes) {
      if (p.person !== id || p.kept !== null) continue;
      const r = RESOLUTIONS.find((x) => x.id === p.resolution);
      const label = r?.options.find((o) => o.id === p.option)?.label ?? p.option;
      out.push({ person: id, kind: 'promise', text: `Vote “${label}” on ${r?.title.toLowerCase() ?? 'the resolution'}.`, due: dueWords(p.meeting, day), day: p.made });
    }
    return out;
  });
}

