/**
 * What a scene-lint check reports (`scripts/scene-lint.mjs`): `check` names the rule, `key` tells this finding from
 * the others of its subject and stays the same from one run to the next (names, kinds and classes, never coordinates:
 * the baseline is keyed by it), `detail` says what was measured.
 */
export interface Finding {
  check: string;
  key: string;
  detail: string;
}
