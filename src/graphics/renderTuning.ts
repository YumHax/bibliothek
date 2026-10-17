/*
 * The render pass's switch (`?debug`: `bibliothek.render.legacy(true)`), so a change of the image can be compared
 * with what it replaced in one sitting, from the same spot: with `legacy` set, the room's capture is no longer the
 * main ambient (`Room`, `Environment`), the occlusion is one scale again (`PostFx`) and the looks keep their old
 * values (`grade`). Off in play; nothing reads it but those.
 */
export const RENDER_TUNING = { legacy: false };
