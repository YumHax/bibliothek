/*
 * DOOR OPENINGS shared by more than one zone's plan: the building's street door is a hole in the street's facade
 * (`city/facades`), the sas behind it hangs the leaf (`airlock/airlockPlan`), the painted entrance draws it.
 */

/** The building's street door: the opening in the facade (metres), the leaf the sas hangs in it. */
export const STREET_DOOR = { width: 1.4, height: 2.7 } as const;
