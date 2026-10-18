import type { SocialAnchor } from '@/social/talk';

/*
 * Where the conversation sits (docs/social.md "The panel"): the view turns to their face and narrows a little, their
 * balloon stands over their head with the name tag pinned on top of it, and the player's balloons rise from the
 * bottom of the screen. Their balloon follows their head, kept inside the screen; it never covers their face, and the
 * player's balloons never reach up to it.
 */

/** From the point their words come from down to their face (m), for a body that does not say. */
const FACE = -0.45;
/** How much the view narrows while talking (70 degrees to about 64): from the waist up, the hands in the shot. */
export const CLOSE_SHOT = 1.12;
/** How far below their eyes the view is aimed (m): the face in the upper third, the hands in the frame. */
export const SHOT_BELOW_EYES = 0.2;
/** The view's turn to them (`player/lookTowards`, 0.35 s) and the zoom's (0.45 s). */
export const FRAMING_MS = 480;
/** Their balloon is kept this far (px) from the screen's edges. */
const EDGE = 14;

/**
 * From `anchor` down to their eyes (m): the body's own measure when it gives one (`userData.faceLift`: a child, a
 * seated friend, someone tall), else `FACE`.
 */
export function faceLift(anchor: SocialAnchor): number {
  const lift = anchor.userData.faceLift as (() => number) | undefined;
  return typeof lift === 'function' ? lift() : FACE;
}

/**
 * Places their balloon (`say`: the tag and the balloon, its foot the tail's tip) with the tail on `point` (the top of
 * their head on screen): centred on them, kept inside the screen, the tail sliding along the balloon to stay on them.
 * When there is no room above their head (they are tall in the shot) the balloon goes beside it, on the side with
 * more room. `burst` (in `say`) goes to the tail's tip. Returns the tail's point on screen (where the hearts burst).
 */
export function placeSay(say: HTMLElement, tail: HTMLElement, burst: HTMLElement, point: { x: number; y: number }, vw: number, vh: number): { x: number; y: number } {
  const w = say.offsetWidth;
  const h = say.offsetHeight;
  let left = Math.round(Math.max(EDGE, Math.min(vw - w - EDGE, point.x - w / 2)));
  let top = Math.round(point.y - h);
  let side = false;
  if (top < EDGE) {
    // No room over the head: beside it, the tail pointing at the head from the balloon's lower corner.
    side = true;
    const right = point.x + 40;
    left = right + w + EDGE <= vw ? Math.round(right) : Math.round(Math.max(EDGE, point.x - 40 - w));
    top = Math.round(Math.max(EDGE, Math.min(vh - h - EDGE, point.y - h * 0.6)));
  }
  say.style.translate = `${left}px ${top}px`;
  say.classList.toggle('social-say--side', side);
  // The tail hangs from the balloon, which can be narrower than the name tag over it (a short line): it stays on the balloon.
  const balloon = tail.offsetParent as HTMLElement | null;
  const bx = balloon?.offsetLeft ?? 0;
  const bw = balloon?.offsetWidth ?? w;
  const tailX = side ? (left + bx > point.x ? 18 : bw - 18) : Math.max(22, Math.min(bw - 22, point.x - left - bx));
  tail.style.left = `${Math.round(tailX)}px`;
  burst.style.left = `${Math.round(bx + tailX)}px`;
  return { x: left + bx + tailX, y: top + h };
}
