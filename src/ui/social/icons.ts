import type { MoodId } from '@/social/socialPlan';
import type { GiftKind, InteractionGroup, InteractionId } from '@/social/types';
import { raw, type Html } from '../panel/html';

/*
 * The social panels' icons: small line drawings on a 24-unit grid, stroked in `currentColor` (so a button's colour,
 * the danger tint or the tier's colour carries through), round caps and joins. Inline SVG, so nothing loads.
 */

/** Path data by name: a list of `d` strings (each one `<path>`), drawn with the shared stroke. */
const PATHS = {
  chat: ['M4 5.5h16a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4.5 3.5V16.5H4A1.5 1.5 0 0 1 2.5 15V7A1.5 1.5 0 0 1 4 5.5Z', 'M7.5 11h.01M12 11h.01M16.5 11h.01'],
  sun: ['M12 7.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9Z', 'M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4'],
  pad: ['M7 8h10a4.5 4.5 0 0 1 4.3 5.8l-1 3.3a2.2 2.2 0 0 1-3.8.8L14.6 16H9.4l-1.9 1.9a2.2 2.2 0 0 1-3.8-.8l-1-3.3A4.5 4.5 0 0 1 7 8Z', 'M7.5 11v3M6 12.5h3M15.5 12h.01M17.5 13.5h.01'],
  sparkle: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z', 'M18.5 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z'],
  smile: ['M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z', 'M8 14.5c1 1.5 2.4 2.2 4 2.2s3-.7 4-2.2', 'M9 9.5h.01M15 9.5h.01'],
  whisper: ['M3 6.5h11a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1H8l-3 2.5v-2.5H3a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1Z', 'M17 10h3.5a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1H20V19l-3-2.5h-4.5'],
  storm: ['M7 15.5a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 7.5a3.8 3.8 0 0 1 .5 7.6', 'M12.5 12l-2 4h3l-2 4'],
  mend: ['M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z', 'M9 12.5l2 2 4-4'],
  phone: ['M7 2.5h10a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 20V4A1.5 1.5 0 0 1 7 2.5Z', 'M10.5 18.5h3'],
  hand: ['M7 11V6.5a1.5 1.5 0 0 1 3 0V11', 'M10 10V4.5a1.5 1.5 0 0 1 3 0V10', 'M13 10.5V5.5a1.5 1.5 0 0 1 3 0v6', 'M16 11.5V8.5a1.5 1.5 0 0 1 3 0v5.5a7 7 0 0 1-7 7h-.5a6.5 6.5 0 0 1-5-2.4L4 15.5a1.6 1.6 0 0 1 2.4-2.1L7 14'],
  bulb: ['M9 18h6M10 21h4', 'M12 3a6 6 0 0 1 3.6 10.8c-.7.5-1.1 1.3-1.1 2.2H9.5c0-.9-.4-1.7-1.1-2.2A6 6 0 0 1 12 3Z'],
  tag: ['M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8a1.4 1.4 0 0 1 0 2l-7 7a1.4 1.4 0 0 1-2 0Z', 'M8 8h.01'],
  wink: ['M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z', 'M8.5 14.5c.9 1.4 2.1 2 3.5 2s2.6-.6 3.5-2', 'M8 9.5h2.5M15 9.5h.01'],
  bolt: ['M13 2.5L4.5 13.5h6l-1 8 8.5-11h-6Z'],
  trophy: ['M8 3.5h8v5a4 4 0 0 1-8 0Z', 'M8 5.5H5a3 3 0 0 0 3 4M16 5.5h3a3 3 0 0 1-3 4', 'M12 12.5v3.5M8.5 20.5h7M9.5 20.5c0-2.5 1-4.5 2.5-4.5s2.5 2 2.5 4.5'],
  gift: ['M3.5 8.5h17v4h-17Z', 'M5 12.5v8h14v-8M12 8.5v12', 'M12 8.5S10.5 3.5 8 4.5c-2 .8-.8 4 4 4ZM12 8.5s1.5-5 4-4c2 .8.8 4-4 4Z'],
  cart: ['M5.5 3.5h13v14.5a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 18Z', 'M8.5 6.5h7v6h-7Z', 'M8 19.5v1.5M10.5 19.5v1.5M13.5 19.5v1.5M16 19.5v1.5'],
  coin: ['M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17Z', 'M12 7.5v9M14.5 9.3c-.5-.8-1.4-1.3-2.5-1.3-1.5 0-2.5.8-2.5 2s1 1.6 2.5 1.9 2.5.8 2.5 2-1 2-2.5 2c-1.1 0-2-.5-2.5-1.3'],
  swap: ['M4 8.5h14l-3.5-3.5', 'M20 15.5H6l3.5 3.5'],
  door: ['M5.5 20.5v-16a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v16', 'M3.5 20.5h17', 'M14.5 12.5h.01'],
  horns: ['M5 3.5c-.5 3 .5 5 2.5 6.5M19 3.5c.5 3-.5 5-2.5 6.5', 'M12 7a7 7 0 0 1 7 7c0 3.9-3.1 6.5-7 6.5S5 17.9 5 14a7 7 0 0 1 7-7Z', 'M9 14.5l2 .8M15 14.5l-2 .8'],
  heart: ['M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z'],
  heartCrack: ['M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z', 'M12 7.4l-1.6 3.8 2.6 1.7-2.1 3.6'],
  clock: ['M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z', 'M12 7.5V12l3 2'],
  croissant: ['M3.5 14c1.5-4.5 5-7.5 8.5-7.5s7 3 8.5 7.5c-1.6.9-3.3.6-4.3-.6-.9 1.6-2.4 2.6-4.2 2.6s-3.3-1-4.2-2.6c-1 1.2-2.7 1.5-4.3.6Z', 'M9.3 7.6l1.2 6.6M14.7 7.6l-1.2 6.6'],
  flowers: ['M12 21v-8', 'M12 13c-3 0-4.5-2.5-4.5-6l2.2 1.6L12 5l2.3 3.6L16.5 7c0 3.5-1.5 6-4.5 6Z', 'M12 18c-2.4-.1-3.9-1.3-4.4-3.1M12 17.5c2.2-.2 3.6-1.3 4.1-3'],
  fish: ['M3 12c2.5-3.5 6-5 9.5-5 3 0 5.2 1.6 6.5 3l2.5-2v8l-2.5-2c-1.3 1.4-3.5 3-6.5 3-3.5 0-7-1.5-9.5-5Z', 'M8 11h.01'],
  bone: ['M6.5 6.5l11 11', 'M5 5.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Z', 'M7 3.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Z', 'M17 17.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Z', 'M19 15.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6Z'],
  wave: ['M7 11V6.5a1.5 1.5 0 0 1 3 0V11', 'M10 10V4.5a1.5 1.5 0 0 1 3 0V10', 'M13 10.5V5.5a1.5 1.5 0 0 1 3 0v6', 'M16 11.5V8.5a1.5 1.5 0 0 1 3 0v5.5a7 7 0 0 1-7 7h-.5a6.5 6.5 0 0 1-5-2.4L4 15.5a1.6 1.6 0 0 1 2.4-2.1L7 14', 'M3.5 7.5c.4-1.5 1.3-2.7 2.6-3.5M20.5 4.5c.6.8 1 1.7 1.1 2.7'],
  key: ['M8.5 11a4 4 0 1 1 0 .01Z', 'M12 11.5h9M18.5 11.5v3M15.5 11.5v2'],
  lock: ['M6.5 10.5h11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z', 'M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3'],
  cake: ['M4.5 20.5h15v-7a1.5 1.5 0 0 0-1.5-1.5H6a1.5 1.5 0 0 0-1.5 1.5Z', 'M4.5 15.5c1.3 1 2.5 1 3.75 0s2.5-1 3.75 0 2.5 1 3.75 0 2.5-1 3.75 0', 'M12 12V8.5M12 5.5c.8 0 1.3-.7 1-1.5L12 2.5l-1 1.5c-.3.8.2 1.5 1 1.5Z'],
  partly: ['M9 5.5v1.5M4.5 10h1.5M5.8 6.8l1 1M12.2 6.8l-1 1', 'M6.6 12.4A3.5 3.5 0 1 1 12.3 9', 'M8.5 19.5a3.5 3.5 0 0 1-.4-7 5 5 0 0 1 9.6-.5 3.8 3.8 0 0 1 .3 7.5Z'],
  cloud: ['M7 18.5a4.5 4.5 0 0 1-.4-9 6 6 0 0 1 11.3.4 4.3 4.3 0 0 1-.4 8.6Z'],
  arrowLeft: ['M19 12H5M11 6l-6 6 6 6'],
  close: ['M6 6l12 12M18 6L6 18'],
  book: ['M4.5 4.5a1 1 0 0 1 1-1H18a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6.5a2 2 0 0 1-2-2Z', 'M4.5 18.5a2 2 0 0 1 2-2H19', 'M9 7.5h6'],
  pin: ['M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11Z', 'M12 7.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z'],
  people: ['M9 11a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z', 'M2.5 20c.5-3.6 3.2-6 6.5-6s6 2.4 6.5 6', 'M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.3c2 .8 3.3 2.9 3.5 5.7'],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof PATHS;

/** An icon as markup, `size` in em (it scales with the text it sits in). */
export function icon(name: IconName, size = 1.15): Html {
  const paths = PATHS[name].map((d) => `<path d="${d}"/>`).join('');
  return raw(`<svg class="social-icon" viewBox="0 0 24 24" width="${size}em" height="${size}em" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`);
}

/** Each interaction's icon. */
export const INTERACTION_ICONS: Record<InteractionId, IconName> = {
  chat: 'chat',
  askDay: 'sun',
  talkGames: 'pad',
  compliment: 'sparkle',
  joke: 'smile',
  gossip: 'whisper',
  complain: 'storm',
  apologise: 'mend',
  askNumber: 'phone',
  askFavour: 'hand',
  askTip: 'bulb',
  askDiscount: 'tag',
  tease: 'wink',
  insult: 'bolt',
  challenge: 'trophy',
  giveGift: 'gift',
  giveGame: 'cart',
  giveCoins: 'coin',
};

/** Each group's icon (its heading, and the place's own entries of that group). */
export const GROUP_ICONS: Record<InteractionGroup, IconName> = {
  talk: 'chat',
  give: 'gift',
  ask: 'hand',
  trade: 'swap',
  invite: 'door',
  mean: 'horns',
};

/** What a gift from the pocket looks like in the Give list (the rest: the gift box). */
export const GIFT_ICONS: Partial<Record<GiftKind, IconName>> = {
  croissant: 'croissant',
  flowers: 'flowers',
  treats: 'fish',
  scrap: 'bone',
  cake: 'cake',
};

/** Each mood's weather. */
export const MOOD_ICONS: Record<MoodId, IconName> = {
  good: 'sun',
  fine: 'partly',
  low: 'cloud',
  annoyed: 'storm',
};
