import type { PlatformId } from '@/catalog/types';
import { registerProgram } from '@/onscreen/programs';
import type { ReviewSource } from '@/reviews/Reviews';
import { MoonpostProgram } from './moonpost/MoonpostProgram';
import type { PrototypeStory } from './PrototypeStory';
import { PROTOTYPE_ID, PROTOTYPE_REVIEWS, type StoryMail } from './prototype';

export { PrototypeStory,  } from './PrototypeStory';
export {  type StoryMail,  } from './prototype';
export {  isPrototype,  } from './prototypeArt';

/**
 * What the world's people and things ask the trail (`BuildContext.story`): each returns the line to say
 * when it has the next clue (the trail moves on as it is said), else null and they say their own.
 */
export interface StoryChannels {
  mail(day: number): StoryMail | null;
  atStall(platform: PlatformId): string | null;
  onRadio(): string | null;
  atArcadeCounter(): string | null;
  atTrader(): string | null;
  atFriend(friendId: string): string | null;
}

/**
 * The prototype's part outside the trail: its cart runs MOONPOST on the TV (`onscreen/programs`), and
 * its one preview stands for reviews in the game panel. Call once at start-up (`bootstrap/session`).
 */
export function registerPrototype(story: PrototypeStory, reviews?: ReviewSource): () => void {
  reviews?.override(PROTOTYPE_ID, PROTOTYPE_REVIEWS);
  return registerProgram((game) => (game.id === PROTOTYPE_ID ? () => new MoonpostProgram(() => story.demoFinished()) : null));
}
