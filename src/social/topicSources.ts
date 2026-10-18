import type { PersonId, PersonTopic } from './types';

/*
 * Topics that come from what is going on, not from someone's card (docs/social.md "Topics"): the power cut, a
 * quarrel on the stairs, Mrs Roux's move. A source is asked while a conversation paints and answers, for one person
 * on one day, with a topic of theirs (its fit and answer in their voice) or null. Each is talked about once (an
 * `obvious` topic without `again`), so a week's news is never stale in the menu.
 */

type TopicSource = (id: PersonId, day: number) => PersonTopic | null;

const sources = new Set<TopicSource>();

/** Adds what `source` brings up from now on. Returns the removal. */
export function addTopicSource(source: TopicSource): () => void {
  sources.add(source);
  return () => sources.delete(source);
}

/** What is going on that `id` would talk about on `day`. */
export function eventTopics(id: PersonId, day: number): PersonTopic[] {
  const out: PersonTopic[] = [];
  for (const source of sources) {
    const topic = source(id, day);
    if (topic) out.push(topic);
  }
  return out;
}
