/**
 * Picks a random start offset inside a longplay, skipping the intro / title screens at the
 * beginning and the credits at the end. Falls back to 0 when the duration is unknown.
 */
export function randomStartSeconds(durationSeconds: number, fromRatio = 0.1, toRatio = 0.8): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const start = durationSeconds * fromRatio;
  const end = durationSeconds * toRatio;
  return Math.floor(start + Math.random() * (end - start));
}
