/*
 * What `scripts/arcade-balance.mjs` plays: the cabinet games, the alley, the hoops and the pinball with their rates
 * (see `data.ts` for why the headless scripts import through this folder).
 */
export { ARCADE_GAMES } from '@/world/arcade/games';
export { pointsPerTicket, TICKET_FLOOR } from '@/economy/pricing';
export { rivalTable } from '@/economy/rivals';
export { HoopSim } from '@/world/arcade/hoop/HoopSim';
export { AlleySim } from '@/world/arcade/alley/AlleySim';
export { PinballSim } from '@/world/arcade/pinball/PinballSim';
export { REPLAY_STEP } from '@/world/arcade/replay/Replay';
export * as THREE from 'three';
