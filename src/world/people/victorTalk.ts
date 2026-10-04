import { RIVAL_PERSON, type RivalCollector } from '@/economy/rivalCollector';
import type { SocialServices, TalkExtra } from '@/social/talk';
import type { SocialPlace } from '@/social/types';
import { bodyOf, talkHook, type SocialHook } from './socialHook';
import type { Walker } from './Walker';

/**
 * Victor Crane as someone to talk to, wherever he is met (the hall, his suitcase on Front Street, the saleroom's
 * front row; docs/social.md "Victor"): his first word is how the rivalry stands (`opening`, by default his
 * `greeting`), talking to him counts as having met him, and the place adds what it offers (`extras`).
 */
export function victorHook(
  social: SocialServices | undefined,
  rival: RivalCollector,
  place: SocialPlace,
  body: () => Walker,
  options: { opening?: () => string; extras?: () => readonly TalkExtra[] } = {},
): SocialHook | undefined {
  return talkHook(social, RIVAL_PERSON, () => {
    rival.meet();
    return {
      person: RIVAL_PERSON,
      place,
      body: bodyOf(body()),
      extras: options.extras?.() ?? [],
      opening: options.opening ?? (() => rival.greeting()),
    };
  });
}
