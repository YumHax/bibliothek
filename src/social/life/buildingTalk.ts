import { onBlackout } from '@/building/blackout';
import { estatePhase } from '@/building/estateSale';
import { rouxPhase } from '@/building/rouxMove';
import { findPerson } from '../people';
import { isMet } from '../standing';
import { addTopicSource } from '../topicSources';
import type { PersonCard, PersonId, PersonTopic } from '../types';
import { isYoung } from '../voices';

/*
 * The talk of the building (docs/social.md "Topics"): what the residents bring up for a few days after it happened,
 * each in their own way: the gossip all ears, the grumbler grumbling, the rest plainly. The power cut, Mrs Roux's
 * flat for sale, the late Mr Lambert's things sold in the hall. Started with the social web (`startLife`).
 */

/** Something to talk about: the player's line, the book's name, and the answer by temperament. */
interface TalkOf {
  id: string;
  say: string;
  name: string;
  icon: string;
  eager: string;
  grumble: string;
  plain: string;
  /** A child's answer; none: the children don't bring it up. */
  kid?: string;
}

/** How long (game days) the power cut stays the talk of the stairs. */
const CUT_TALK_DAYS = 2;

/** `card`'s take on `t`: how it lands and what they say. */
function voiced(card: PersonCard, t: TalkOf): PersonTopic | null {
  const traits = card.traits;
  const young = isYoung(card);
  if (young && !t.kid) return null;
  const eager = traits.includes('gossip') || traits.includes('chatty');
  const grumbler = traits.includes('grumpy') || traits.includes('neat') || traits.includes('proud');
  const answer = young ? t.kid! : eager ? t.eager : grumbler ? t.grumble : t.plain;
  return { id: `event:${t.id}`, say: t.say, name: t.name, icon: t.icon, fit: eager ? 'loves' : traits.includes('shy') ? 'meh' : 'likes', obvious: true, answers: [answer] };
}

/** A resident the player has met (not family, not the person it is about). */
function resident(id: PersonId, not?: PersonId): PersonCard | null {
  const card = findPerson(id);
  return card && card.group === 'building' && !card.family && id !== not && isMet(id) ? card : null;
}

const CUT: TalkOf = {
  id: 'powerCut',
  say: 'Some power cut, eh?',
  name: 'The power cut',
  icon: 'bolt',
  eager: 'Wasn’t it wonderful? Candles on every landing, everyone out on the stairs. I heard such things!',
  grumble: 'An hour without power. In this day and age. I’ve written to the syndic about the fuse box.',
  plain: 'I was in the middle of dinner. Stirring a pan in the dark. You get used to it.',
  kid: 'It was SO dark! I had a torch. Best night ever.',
};

const ROUX: TalkOf = {
  id: 'rouxMove',
  say: 'Is Mrs Roux really selling up?',
  name: 'Mrs Roux’s move',
  icon: 'building',
  eager: 'Lyon, they say! Fifty years across that landing. The building won’t be the same, I’ll tell you that.',
  grumble: 'She was the only one who wiped her feet. Who knows who we’ll get now.',
  plain: 'I’ll miss her. She knew everyone’s birthday. Even mine.',
  kid: 'She gives the best sweets. Who’ll give sweets now?',
};

const ESTATE: TalkOf = {
  id: 'estateSale',
  say: 'Mr Lambert’s things are being sold?',
  name: 'Mr Lambert’s sale',
  icon: 'history',
  eager: 'In the hall, all of it! Forty years of a man’s life on trestle tables. His niece is a dear. Go and look.',
  grumble: 'Selling a man’s things in the hall, where everyone walks. In my day it was done quietly.',
  plain: 'Poor man. He kept to himself. His niece seems kind. Go and have a look, he’d have liked that.',
};

/** Starts the talk of the building. */
export function startBuildingTalk(day: () => number): void {
  let lastCut: number | null = null;
  onBlackout((cut) => {
    if (cut) lastCut = day();
  });
  addTopicSource((id, today) => {
    if (lastCut === null || today - lastCut > CUT_TALK_DAYS) return null;
    const card = resident(id);
    return card ? voiced(card, CUT) : null;
  });
  addTopicSource((id, today) => {
    const phase = rouxPhase(today);
    if (phase !== 'forSale' && phase !== 'moving') return null;
    const card = resident(id, 'roux');
    return card ? voiced(card, ROUX) : null;
  });
  addTopicSource((id, today) => {
    const phase = estatePhase(today);
    if (phase !== 'notice' && phase !== 'on') return null;
    const card = resident(id, 'claire');
    return card ? voiced(card, ESTATE) : null;
  });
}
