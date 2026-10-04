import type { NoticeActions } from '@/notices';
import { gameDayRandom } from '@/time/daily';
import type { Today } from '@/time/Today';
import { addExtras } from '@/social/extras';
import { tiesOf } from '@/social/gossip';
import { markMood } from '@/social/mood';
import { everyone, findPerson, shortName } from '@/social/people';
import { has } from '@/social/perks';
import { buildingName } from '@/social/reputation';
import { isMet, learn, nudge, onSocial, standing, tier } from '@/social/standing';
import { atLeast, tierRank } from '@/social/tiers';
import type { TalkExtra } from '@/social/talk';
import type { PersonId } from '@/social/types';
import { notesOn, pinSource, type BoardNote } from './boardNotes';
import { onBlackout } from './blackout';
import { BUILDING_SOCIAL as plan } from './buildingSocialPlan';
import { nextAgenda } from './coproMeeting';
import { giveKey } from './keys';

/*
 * The building's standing at work (docs/social.md "The building"): what the residents' warmth changes beyond the
 * noise (`noiseComplaints`) and the vote (`coproMeeting`): feuds' notes on the hall's board, Mrs Dubois' news and
 * her bad-mouthing, the concierge's post and the roof key, the syndic's agenda early, the power cut's good mood.
 * Started once in `bootstrap/social`; `setBuildingPost` hands it the post when the world has made it.
 */

/** What the concierge's word on the post reads. */
interface PostLike {
  readonly count: number;
  due(): readonly unknown[];
}

let post: PostLike | null = null;
const PARCELS = plan.parcels;

/** The building's post (`collection/MailPost`), made with the world: the concierge's word on parcels reads it. */
export function setBuildingPost(mail: PostLike | undefined): void {
  post = mail ?? null;
}

/** How the concierge's goodwill moves the post (`MailPost.delayHours`): a day late when she is cold, a round sooner when she signs for the player. */
export function parcelDelayHours(): number {
  if (has('pereira', 'lateParcels')) return PARCELS.late;
  if (has('pereira', 'holdsParcels')) return PARCELS.sooner;
  return 0;
}

/** Everyone who lives or works in the building. */
function residents(): PersonId[] {
  return everyone()
    .filter((p) => p.group === 'building')
    .map((p) => p.id);
}

function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ''));
}

/** Starts the building's social effects; returns the stop (for a debug reset). */
export function startBuildingSocial(options: { today: Today; notices: Pick<NoticeActions, 'reward'> }): () => void {
  const { today, notices } = options;
  const stops: (() => void)[] = [];
  // The power cut brings everyone out on the landings with candles: a better mood all round, that day.
  stops.push(
    onBlackout((cut) => {
      if (!cut) return;
      for (const id of residents()) markMood(id, today.gameDay, 1, plan.powerCutMood);
    }),
  );
  // Mrs Dubois, hostile, talks about the player to those she likes, once a game week.
  stops.push(
    today.onNewGameDay((day) => {
      if (day % plan.badMouths.everyDays !== 0 || !has('dubois', 'badMouths')) return;
      for (const t of tiesOf('dubois')) {
        if (t.tie <= 0 || !findPerson(t.id)) continue;
        nudge(t.id, { warmth: Math.round(plan.badMouths.warmth * t.tie) || -1, why: plan.badMouths.why, reason: 'badMouths', day });
      }
    }),
  );
  // Mme Pereira at Close hands over the roof key, once.
  stops.push(
    onSocial((change) => {
      if (change.id !== 'pereira' || !has('pereira', 'roofKey')) return;
      if (giveKey('roof')) notices.reward({ title: plan.pereira.roofKey.title, detail: plan.pereira.roofKey.detail });
    }),
  );
  stops.push(pinSource('feuds', feudNotes));
  stops.push(addExtras((ctx) => extrasFor(ctx.person, ctx.day)));
  return () => stops.forEach((stop) => stop());
}

/** The feuding residents' notes about the player on the hall's board, about every other day each. */
function feudNotes(day: number): BoardNote[] {
  const { feudNotes: feud } = plan;
  const notes: BoardNote[] = [];
  for (const id of residents()) {
    if (!isMet(id) || tierRank(tier(id)) > tierRank('hostile')) continue;
    if (gameDayRandom(`feud:${id}`, day)() >= feud.share) continue;
    const note = feud.byPerson[id] ?? feud.fallback;
    notes.push({ id: `feud-${id}`, title: note.title, lines: [...note.lines], signed: findPerson(id)?.name, paper: feud.paper, weight: feud.weight });
  }
  return notes;
}

/** What the building's people add to a conversation: Dubois' news, the concierge's post and opinion, Bertin's agenda. */
function extrasFor(id: PersonId, day: number): TalkExtra[] {
  const out: TalkExtra[] = [];
  if (id === 'dubois' && has('dubois', 'gossipBoard')) out.push({ id: 'dubois-news', group: 'ask', label: plan.duboisNews.label, run: () => ({ line: duboisNews(day) }) });
  if (id === 'pereira') {
    if (has('pereira', 'parcelNews') && post) out.push({ id: 'pereira-post', group: 'ask', label: plan.pereira.postLabel, run: () => ({ line: postLine() }) });
    if (atLeast(tier('pereira'), 'acquaintance')) out.push({ id: 'pereira-opinion', group: 'ask', label: plan.pereira.opinionLabel, run: () => ({ line: fill(plan.pereira.opinion, { name: buildingName() }) }) });
  }
  if (id === 'bertin' && has('bertin', 'agendaEarly')) {
    out.push({
      id: 'bertin-agenda',
      group: 'ask',
      label: plan.bertin.label,
      run: () => {
        const agenda = nextAgenda(day);
        return { line: fill(plan.bertin.line, { day: agenda.day, items: agenda.titles.join('; ') }) };
      },
    });
  }
  return out;
}

/** Mrs Dubois' news: a resident's secret now and then (a fact of theirs the player learns), else the board's latest. */
function duboisNews(day: number): string {
  const random = gameDayRandom('dubois-news', day);
  if (random() < 0.5) {
    for (const id of residents()) {
      if (id === 'dubois' || !isMet(id)) continue;
      const s = standing(id);
      const fact = findPerson(id)?.facts?.find((f) => !s.known.includes(f.id) && (f.from === undefined || f.from === 'stranger' || f.from === 'acquaintance'));
      if (fact && learn(id, fact.id)) return fill(plan.duboisNews.secret, { name: shortName(id), says: fact.says });
    }
  }
  const notes = notesOn(day).filter((n) => !n.id.startsWith('feud-dubois'));
  const note = notes[Math.floor(random() * notes.length)];
  return note ? fill(plan.duboisNews.board, { title: note.title, line: note.lines[0] ?? '' }) : plan.duboisNews.noNews;
}

/** Mme Pereira on the post: what is on its way for the player. */
function postLine(): string {
  if (!post || post.count === 0) return plan.pereira.postNone;
  if (post.due().length) return plan.pereira.postDue;
  return fill(plan.pereira.postSome, { n: post.count === 1 ? 'A parcel' : `${post.count} parcels`, when: 'next' });
}
