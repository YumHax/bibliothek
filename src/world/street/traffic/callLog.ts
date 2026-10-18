import type { Vec2 } from '@/world/measures/street';

/*
 * The last emergency call on Front Street (`Emergency`: an ambulance, the police, the fire engine pulled up with its
 * crew in at a door), kept for the page's life so the street talks about it the same day (`shops/streetNews`): the
 * regulars at the bar, the bench's overheard word. Nothing is drawn from it but talk.
 */

type CallKind = 'ambulance' | 'police' | 'fire';

let last: { kind: CallKind; door: Vec2; day: number } | null = null;

/** A crew went in at `door` on game day `day`. */
export function noteCall(kind: CallKind, door: Vec2, day: number): void {
  last = { kind, door, day };
}

/** Which door it was, as the street names it: ours (the near row), or the far row's by the bus stop. */
function whose(door: Vec2): 'ours' | 'far' {
  return door[1] < 0 ? 'ours' : 'far';
}

const TALK: Readonly<Record<CallKind, Readonly<Record<'ours' | 'far', string>>>> = {
  ambulance: {
    ours: 'The ambulance at the door of your building earlier? Somebody turned an ankle on the stairs. Nothing serious, they say.',
    far: 'Did you see the ambulance across from the bus stop? The old gentleman at number 34. Just a dizzy spell, he was waving from the stretcher.',
  },
  police: {
    ours: 'Police at your building today! A bike nicked from the hall. They found it round the corner, of course.',
    far: 'The police were in across the road by the bus stop. A row over a parking space, apparently. Grown men.',
  },
  fire: {
    ours: 'The fire engine at your building? Burnt toast and a very keen alarm. They were very nice about it.',
    far: 'Fire engine across the road earlier: a chip pan. Everyone’s fine, the kitchen less so.',
  },
};

/** What the street says of today's call, if there was one on game day `day`. */
export function callTalk(day: number): string | null {
  return last && last.day === day ? TALK[last.kind][whose(last.door)] : null;
}
