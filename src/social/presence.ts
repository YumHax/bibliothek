import type { PersonId } from './types';

/*
 * Who is around and where (docs/social.md "Witnesses"): the bodies of known people in the loaded zones register
 * here (`world/people` does it as it builds them), so the social layer can ask who saw something the player did in
 * public (`presentNear`) and have them show it (`notice`). Positions are world space, read when asked.
 */

/** A known person's body in the world, as the social layer sees it. */
export interface PresentBody {
  /** Where they stand now (world space), or null when they are not in the scene (unloaded, inside). */
  where(): { x: number; y: number; z: number } | null;
  /** They noticed something the player did: a turn of the head, a look, then (`whisper`) a word to whoever is beside them. */
  notice?(at: { x: number; y: number; z: number }, whisper: boolean): void;
}

const bodies = new Map<PersonId, Set<PresentBody>>();

/** `id`'s body is in the world (until the returned removal is called: the zone unloads, the body is disposed). */
export function registerPresence(id: PersonId, body: PresentBody): () => void {
  let set = bodies.get(id);
  if (!set) bodies.set(id, (set = new Set()));
  set.add(body);
  return () => {
    set.delete(body);
    if (!set.size) bodies.delete(id);
  };
}

/** The known people within `radius` metres of `point` (each once, nearest body), nearest first. */
export function presentNear(point: { x: number; y: number; z: number }, radius: number): { id: PersonId; body: PresentBody; distance: number }[] {
  const out: { id: PersonId; body: PresentBody; distance: number }[] = [];
  for (const [id, set] of bodies) {
    let best: { body: PresentBody; distance: number } | null = null;
    for (const body of set) {
      const at = body.where();
      if (!at) continue;
      const distance = Math.hypot(at.x - point.x, at.y - point.y, at.z - point.z);
      if (distance <= radius && (!best || distance < best.distance)) best = { body, distance };
    }
    if (best) out.push({ id, ...best });
  }
  return out.sort((a, b) => a.distance - b.distance);
}
