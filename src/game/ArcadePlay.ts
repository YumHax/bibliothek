import { PLAY_COST, playIsFree } from '@/economy/pricing';
import { arcadePayout } from '@/economy/arcadePayout';
import { tournamentLine, type TournamentOutcome } from '@/economy/ArcadeTournament';
import { batch } from '@/persistence';
import type { ArcadeMachineLike, ArcadeResult } from './SessionActions';
import type { ArcadeDailyLike, CoreParts, LeagueLike, MedalsLike, PayoutStatsLike, PerksLike, PrizesLike, WalletLike } from './SessionParts';
import { isAction } from '@/input/actions';
import { actionKeyLabel } from '@/ui/keys';
import type { KeyRoute, SessionHost } from './SessionHost';

export interface ArcadeParts extends Pick<CoreParts, 'player'> {
  wallet?: WalletLike;
  prizes?: PrizesLike;
  arcadeDaily?: ArcadeDailyLike;
  medals?: MedalsLike;
  league?: LeagueLike;
  payoutStats?: PayoutStatsLike;
  /** The Saturday tournament: a play on its cabinet, once signed, is the player's next round (`economy/ArcadeTournament`). */
  tournament?: TournamentLike;
  /** What the player wears: the arcade tee pays a few tickets more a play (`household/`). */
  perks?: PerksLike;
}

/** The tournament as a finished play is settled against it. */
export interface TournamentLike {
  readonly gameId: string;
  readonly running: boolean;
  play(score: number): TournamentOutcome | null;
}

/**
 * Playing at the arcade: a coin goes in and the player stands at the controls (every key is the
 * game's then, but E to walk away and, on the end card, fire to replay); a finished play is paid
 * (`economy/arcadePayout`). Also the change machine's few coins.
 */
export class ArcadePlay implements KeyRoute {
  /** The machine the player stands at, from the coin going in until they walk away. */
  private machine: ArcadeMachineLike | null = null;
  /** When the play at `machine` started (ms), for the balance table. */
  private started = 0;
  /** Machines whose controls the HUD has spelled out once (after that, the card on the machine does). */
  private readonly hinted = new Set<string>();

  constructor(private readonly parts: ArcadeParts, private readonly host: SessionHost) {}

  /** The machine being played, if any. */
  get current(): ArcadeMachineLike | null {
    return this.machine;
  }

  /**
   * An arcade machine was clicked: pay a coin and stand at the controls; at the one being played,
   * walk away mid-game or, once its end card shows, pay again and go straight into another play.
   */
  play(machine: ArcadeMachineLike): void {
    const replay = this.machine === machine;
    if (replay && machine.isPlaying) {
      this.leave();
      return;
    }
    if (this.machine && !replay) return;
    const { wallet, player } = this.parts;
    if (!wallet) return;
    // Broke, and not even a coin's worth of tickets: the house stands a ticket machine's play, so the loop never dead-ends.
    const onTheHouse = machine.freeWhenBroke && playIsFree(wallet);
    if (onTheHouse) this.host.reward({ title: 'On the house!', detail: 'Out of coins? This play is free. Win some tickets!' });
    else if (!wallet.spend(PLAY_COST)) {
      this.host.refuse(`Insert coin: a play costs ${PLAY_COST} coin${PLAY_COST > 1 ? 's' : ''} and you have ${wallet.coins}.`);
      this.host.tip('Short of coins? Tickets turn into coins at the prize counter.', { id: 'short-of-coins' });
      return;
    }
    if (!replay) {
      this.host.putBack();
      this.host.stand();
      const { position, yaw } = machine.eyePose();
      player.sit(position, yaw); // parks the camera and freezes walking, like an armchair
      player.lookAt(machine.screenCentre());
      this.machine = machine;
    }
    this.started = performance.now();
    machine.start((result) => this.over(machine, result));
    const first = !this.hinted.has(machine.game.id);
    this.hinted.add(machine.game.id);
    const walkAway = `${actionKeyLabel('walkAway')} walks away.`;
    this.host.tip(first ? `${machine.game.hint}\n${walkAway}` : walkAway, { id: 'arcade-play', until: () => this.machine !== machine || !machine.isPlaying });
  }

  /** Walks away from the machine (a running play is lost). False when the player was at none. */
  leave(): boolean {
    const machine = this.machine;
    if (!machine) return false;
    this.machine = null;
    machine.abort();
    this.parts.player.stand();
    return true;
  }

  /** The change machine was clicked: today's coins if it works and still has them, else its line. */
  collectChange(): void {
    const { arcadeDaily, wallet } = this.parts;
    if (!arcadeDaily || !wallet) return;
    if (!arcadeDaily.changeMachineWorks) {
      this.host.refuse('OUT OF ORDER. Tickets turn into coins at the prize counter.');
      return;
    }
    const coins = arcadeDaily.claimChange();
    if (!coins) {
      this.host.refuse('It works today, for once. It has nothing left in it, though.');
      return;
    }
    wallet.earnCoins(coins);
    this.host.reward({ title: 'Lucky day!', detail: 'The change machine coughs up some coins.', coins });
  }

  /** At a machine every key is the game's, except E to walk away and, on the end card, fire to replay. */
  onKey(code: string): boolean {
    const machine = this.machine;
    if (!machine) return false;
    if (isAction(code, 'walkAway')) this.leave();
    else if (!machine.isPlaying && isAction(code, 'fire')) this.play(machine);
    return true;
  }

  /** A play ended: hand over what `arcadePayout` settles, and say it. */
  private over(machine: ArcadeMachineLike, result: ArcadeResult): void {
    const { wallet, prizes, arcadeDaily, medals, league, payoutStats, tournament, perks } = this.parts;
    const payout = arcadePayout(machine, result, { daily: arcadeDaily, medals, league });
    // The arcade tee: the regulars nod the player through, a few tickets on top of the play's own.
    const tee = payout.tickets ? perks?.arcadeBonus(payout.tickets.paid) ?? 0 : 0;
    if (tee) payout.lines.push(`Arcade tee: +${tee} tickets`);
    // On tournament day, a play on its cabinet by a player still in is their next round.
    const round = tournament && machine.freeWhenBroke && machine.game.id === tournament.gameId && tournament.running ? tournament.play(result.score) : null;
    batch(() => {
      for (const prize of payout.prizes) prizes?.add(prize);
      if (payout.tickets) wallet?.addTickets(payout.tickets.paid + tee);
      if (round?.tickets) wallet?.addTickets(round.tickets);
      if (round?.prize) prizes?.add(round.prize);
    });
    if (payout.tickets) payoutStats?.record(machine.game.id, result.score, payout.tickets.earned, (performance.now() - this.started) / 1000);
    if (round) payout.lines.push(tournamentLine(round));
    // A score that makes the table goes to the initials screen first (the machine is still being played).
    const [headline, ...extras] = payout.lines;
    const tickets = (payout.tickets?.paid ?? 0) + tee + (round?.tickets ?? 0);
    const prizesWon = payout.prizes.length > 0 || Boolean(round?.prize);
    if (tickets || prizesWon) this.host.reward({ title: headline ?? 'Well played!', detail: extras.join('\n') || undefined, tickets: tickets || undefined, big: prizesWon || result.best });
    else if (headline) this.host.react([headline, ...extras].join('\n'));
    if (machine.isPlaying) this.host.tip('Sign the hall of fame: up / down picks a letter, fire moves on.', { id: 'arcade-play', until: () => !machine.isPlaying });
    else this.host.tip(`${actionKeyLabel('fire')} or a click plays again, ${actionKeyLabel('walkAway')} walks away.`, { id: 'arcade-play', until: () => this.machine !== machine || machine.isPlaying });
  }
}
