import type { CatLike } from './SessionParts';
import { isAction } from '@/input/actions';
import type { KeyRoute, SessionHost } from './SessionHost';

export interface CatParts {
  cat?: CatLike;
}

/** How the cat was called: by name (C), with the feather wand (an arcade prize), or with the kitchen's treat jar. */
type CatCall = 'voice' | 'feathers' | 'treats';

type Outcome = ReturnType<CatLike['call']>;

const LINES: Record<CatCall, Record<Outcome, (name: string) => string>> = {
  voice: {
    coming: (name) => `${name} is coming`,
    asleep: (name) => `${name} is fast asleep`,
    ignored: (name) => `${name} looks at you… and looks away`,
    out: (name) => `${name} miaows back, from somewhere down the stairs`,
  },
  feathers: {
    coming: (name) => `${name} comes running for the feathers!`,
    ignored: (name) => `${name} watches the feathers swish, and decides against it.`,
    asleep: (name) => `${name} is asleep. The feathers can wait.`,
    out: (name) => `${name} is out on the stairs: the feathers swish for nobody.`,
  },
  treats: {
    coming: (name) => `${name} comes running from the other end of the flat. Crunch.`,
    // Not coming means no treat given: the jar keeps today's (`HomeLife.giveTreat`).
    ignored: (name) => `${name} is too busy to notice the jar. The treat can wait.`,
    asleep: (name) => `${name} is asleep. The jar goes back on the shelf till it wakes.`,
    out: (name) => `No ${name} at the jar: a faint miaow comes up the stairwell.`,
  },
};

/** Calls the cat and says how it went: the one place its answers are worded. */
export function callCat(cat: CatLike, how: CatCall): string {
  return callCatFor(cat, how).line;
}

/** `callCat`, also telling whether the cat is on its way (the treat jar only spends the day's treat then). */
export function callCatFor(cat: CatLike, how: CatCall): { came: boolean; line: string } {
  const outcome = cat.call(how);
  return { came: outcome === 'coming', line: LINES[how][outcome](cat.settings.name) };
}

/** C calls the cat over. */
export class CatCare implements KeyRoute {
  constructor(private readonly parts: CatParts, private readonly host: SessionHost) {}

  onKey(code: string): boolean {
    const { cat } = this.parts;
    if (!isAction(code, 'callCat') || !cat || cat.adopted === false) return false;
    this.host.react(callCat(cat, 'voice'));
    return true;
  }
}
