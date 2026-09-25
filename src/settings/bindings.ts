/**
 * Key bindings as a permutation of physical codes: `{ physical: gameCode }`, identity entries left
 * out. Rebinding swaps two keys, so every action keeps exactly one key and nothing is ever unbound.
 */
export type Bindings = Readonly<Record<string, string>>;

/** What the game reads when `physical` is pressed. */
export function logicalAt(bindings: Bindings, physical: string): string {
  return bindings[physical] ?? physical;
}

/** The physical key that produces `logical`. */
export function physicalOf(bindings: Bindings, logical: string): string {
  for (const [physical, code] of Object.entries(bindings)) if (code === logical) return physical;
  return logical;
}

/** Puts `logical` on the key `physical`; whatever that key did moves to the key `logical` leaves. */
export function rebind(bindings: Bindings, logical: string, physical: string): Record<string, string> {
  const from = physicalOf(bindings, logical);
  if (from === physical) return { ...bindings };
  const displaced = logicalAt(bindings, physical);
  const next: Record<string, string> = { ...bindings, [physical]: logical, [from]: displaced };
  for (const [key, value] of Object.entries(next)) if (key === value) delete next[key];
  return next;
}
