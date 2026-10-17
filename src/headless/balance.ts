/*
 * What `scripts/arcade-balance.mjs` plays: the cabinet games, the alley, the hoops and the pinball with their rates
 * (see `data.ts` for why the headless scripts import through this folder).
 */
export { ARCADE_GAMES } from '@/world/arcade/games';
export { pointsPerTicket, ticketsAt, TICKET_FLOOR } from '@/economy/pricing';
// The progress table: what the coins buy, priced as the game prices it.
export { BARGAIN_PRICE, BOOKCASE_PRICE, MARKET_DISCOUNT, STARTING_COINS, TICKETS_PER_COIN, shopPrice } from '@/economy/pricing';
export { HOME_GOODS } from '@/economy/homeGoods';
export { GRAILS } from '@/economy/grails';
export { rivalTable } from '@/economy/rivals';
export { HoopSim } from '@/world/arcade/hoop/HoopSim';
export { AlleySim } from '@/world/arcade/alley/AlleySim';
export { PinballSim } from '@/world/arcade/pinball/PinballSim';
export { REPLAY_STEP } from '@/world/arcade/replay/Replay';
export * as THREE from 'three';
