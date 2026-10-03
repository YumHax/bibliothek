import { annexJoined } from '@/building/rouxMove';

/**
 * The opening between the collection room and the new room as the portal culler reads a door (`Portal.door`): shut (0)
 * while it is walled up, open (1) once the wall is down, so the annex is never drawn from the living room before then.
 * Both sides' portals name it (the collection room's falls back to the annex's, `PortalCuller`).
 */
export const ANNEX_PASSAGE: { readonly openness: number } = {
  get openness(): number {
    return annexJoined() ? 1 : 0;
  },
};
