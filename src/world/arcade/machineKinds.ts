import type * as THREE from 'three';
import type { Input } from '@/core/Input';
import type { ArcadeMachineLike } from '@/game/SessionActions';
import { PLAY_COST, WHEEL_SLICES, pointsPerTicket } from '@/economy/pricing';
import { clawPrizeFor } from '@/economy/Prizes';
import type { Jackpot } from '@/economy/Jackpot';
import type { Furniture } from '../Furniture';
import type { Station } from './Station';
import type { ScoreTable } from './scoreTable';
import type { TicketMachineWiring } from './TicketMachine';
import { Pinball, type PinballOptions } from './Pinball';
import { ClawMachine, type ClawMachineOptions } from './ClawMachine';
import { AlleyRoller, type AlleyRollerOptions } from './AlleyRoller';
import { HoopShot, type HoopShotOptions } from './HoopShot';
import { TicketWheel, type TicketWheelOptions } from './TicketWheel';

/** What the hall gives a physical machine to be built with. */
export interface MachineContext {
  input: Input;
  /** The camera: speakers follow it, the hoops aim where it looks. */
  listener: THREE.Object3D;
  scores: ScoreTable;
  /** What the next ticket play costs right now (broke: on the house). */
  nextPlayCost: () => number;
  /** Whether the machine of this game id is out of order today. */
  outOfOrder: (id: string) => () => boolean;
  /** The ticket wheel's progressive pot. */
  jackpot: Jackpot;
}

/** A machine the player plays standing at it, that the crowd's regulars take too. */
export type PhysicalMachine = Furniture & Station & ArcadeMachineLike;

/** The wiring of a ticket machine playing game `id`: its payout rate and its out-of-order days go by the id. */
function ticketWiring(ctx: MachineContext, id: string): TicketMachineWiring {
  return { input: ctx.input, listener: ctx.listener, nextPlayCost: ctx.nextPlayCost, pointsPerTicket: pointsPerTicket(id), outOfOrder: ctx.outOfOrder(id) };
}

/**
 * Every physical machine the arcade plan can place (`ARCADE_PLAN.machines`), by kind, shaped like
 * `ARCADE_GAMES`: a factory from the hall's context and the plan entry's options. The key is also
 * the machine's game id (its table, medals, payout rate and out-of-order days go by it). A new kind
 * of machine is its class, a line here and an entry in the plan.
 */
export const MACHINE_KINDS = {
  pinball: (ctx: MachineContext, options: PinballOptions) => new Pinball(options, { ...ticketWiring(ctx, 'pinball'), scores: ctx.scores }),
  claw: (ctx: MachineContext, options: ClawMachineOptions) =>
    new ClawMachine(options, { input: ctx.input, listener: ctx.listener, playCost: () => PLAY_COST, prizeFor: (color) => clawPrizeFor(color)?.id, outOfOrder: ctx.outOfOrder('claw') }),
  alley: (ctx: MachineContext, options: AlleyRollerOptions) => new AlleyRoller(options, { ...ticketWiring(ctx, 'alley'), scores: ctx.scores }),
  hoops: (ctx: MachineContext, options: HoopShotOptions) => new HoopShot(options, { ...ticketWiring(ctx, 'hoops'), scores: ctx.scores }),
  wheel: (ctx: MachineContext, options: Omit<TicketWheelOptions, 'slices' | 'jackpot'>) => new TicketWheel({ slices: WHEEL_SLICES, jackpot: ctx.jackpot, ...options }, ticketWiring(ctx, 'wheel')),
} satisfies Record<string, (ctx: MachineContext, options: never) => PhysicalMachine>;

export type MachineKind = keyof typeof MACHINE_KINDS;
export type MachineOptionsOf<K extends MachineKind> = Parameters<(typeof MACHINE_KINDS)[K]>[1];

/** Builds a machine of `kind` from its plan entry's options. */
export function buildMachine<K extends MachineKind>(kind: K, context: MachineContext, options: MachineOptionsOf<K>): PhysicalMachine {
  const factory = MACHINE_KINDS[kind] as (context: MachineContext, options: MachineOptionsOf<K>) => PhysicalMachine;
  return factory(context, options);
}
