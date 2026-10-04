import type { SessionActions } from '@/game/SessionActions';
import type { TalkExtra } from './talk';
import type { PersonId, SocialPlace } from './types';

/*
 * What features add to a conversation (docs/social.md "Extending"): a favour to hand in, a lunch to accept, a lot
 * to split. A provider is asked each time the panel paints, for whoever is being talked to; the conversation
 * panel adds its entries to the place's own (`TalkSession.extras`). Registered once at start-up by each feature.
 */

/** Who is talked to, where, when, and the session's moves (to open a panel, pay, travel). */
interface ExtrasContext {
  person: PersonId;
  place: SocialPlace;
  day: number;
  hour: number;
  session: SessionActions | null;
}

type ExtrasProvider = (ctx: ExtrasContext) => readonly TalkExtra[];

const providers = new Set<ExtrasProvider>();

/** Adds what `provider` offers to every conversation from now on. Returns the removal. */
export function addExtras(provider: ExtrasProvider): () => void {
  providers.add(provider);
  return () => providers.delete(provider);
}

/** Everything the registered features offer in this conversation. */
export function extrasFor(ctx: ExtrasContext): TalkExtra[] {
  const out: TalkExtra[] = [];
  for (const provider of providers) out.push(...provider(ctx));
  return out;
}
