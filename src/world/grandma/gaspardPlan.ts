/*
 * GASPARD AT MÉMÉ'S SUNDAY TABLE (docs/grandma.md "The end of the story"), zone-local metres of her flat (the numbers
 * of `GRANDMA_FLAT_PLAN`'s table, chairs and landing door): his chair at the door end, as in the row of 1999; the way
 * he goes when he leaves; and the time he stays.
 */

type Vec2 = [number, number];

export const GASPARD_PLAN = {
  /** The table's first chair, at the door end, facing along the table. */
  seat: { at: [0.42, -0.15] as Vec2, yaw: Math.PI / 2, height: 0.47 },
  /** Where his eyes rest, seated: across the cloth (world height). */
  gaze: [1.35, 0.9, -0.3] as [number, number, number],
  /** Head height, seated and on his feet (for Mémé's eyes on him). */
  headSeated: 1.12,
  headStanding: 1.68,
  /** Out of the chair, round the sitting corner, to the landing door (then gone). */
  leave: [[0.1, -0.75], [-1.2, -1.5], [-2.0, -1.95], [-2.0, -2.2]] as Vec2[],
  /** Seconds after the player is in before he checks his watch and goes, unless talking or having it out. */
  stay: 140,
  /** Seconds between the beats of the reckoning (her lines, his). */
  beat: 3.4,
} as const;
