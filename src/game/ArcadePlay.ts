import { BEGINNER, PLAY_COST, PRIZE_TICKETS, TICKETS_PER_COIN, playIsFree } from '@/economy/pricing';
import { ArcadeHabits, HINTED_PLAYS } from '@/economy/ArcadeHabits';
import { arcadePayout } from '@/economy/arcadePayout';
import { tournamentLine, type TournamentOutcome } from '@/economy/ArcadeTournament';
import { batch } from '@/persistence';
import { playCoins } from '@/audio/coins';
import { playLatchClick } from '@/audio/furnitureSounds';
import type { ArcadeBonus, ArcadeMachineLike, ArcadeResult } from './SessionActions';
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
  /** Which machines' controls the HUD already spelled out, kept across sessions (the first day's store). */
  arcadeHints?: { seen(gameId: string): boolean; mark(gameId: string): void };
  /** Plays per machine, for how long the HUD keeps saying what the keys do next (`ArcadeHabits`; one of its own when absent). */
  arcadeHabits?: { plays(gameId: string): number; played(gameId: string): void };
}

/** How a tournament round is named when it starts. */
const ROUND_WORDS = ['quarter-final', 'semi-final', 'final'];

/** Two presses of walk-away this close together (ms) leave a running play. */
const WALK_AWAY_CONFIRM_MS = 1500;

/** The cheapest prize at the counter: a pocket this full of tickets could take one home. */
const CHEAPEST_PRIZE = Math.min(...Object.values(PRIZE_TICKETS));

/** The tournament as a finished play is settled against it. */
export interface TournamentLike {
  readonly gameId: string;
  readonly running: boolean;
  /** The next round and the score to beat, while the player is in. */
  readonly next?: { round: number; name: string; score: number } | null;
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
  /** Machines whose controls the HUD has spelled out once (after that, the card on the machine does), when no store keeps them. */
  private readonly hinted = new Set<string>();
  /** Whether the play at `machine` was paid for (a coin to refund when it reports nothing). */
  private paid = false;
  /** The machine held still while the pointer is unlocked. */
  private paused: ArcadeMachineLike | null = null;
  /** Plays per machine, kept across visits. */
  private readonly habits: NonNullable<ArcadeParts['arcadeHabits']>;
  /** Plays the house stood this session: the banner says so the first time, a word after that. */
  private housePlays = 0;
  /** The attendant asked once this session before swapping a prize's worth of tickets for a play's coin. */
  private swapAsked = false;
  /** When walk-away was first pressed mid-play (ms): a second press within `WALK_AWAY_CONFIRM_MS` leaves. */
  private walkArmed = 0;

  constructor(private readonly parts: ArcadeParts, private readonly host: SessionHost) {
    this.habits = parts.arcadeHabits ?? new ArcadeHabits();
  }

  /** The machine being played, if any. */
  get current(): ArcadeMachineLike | null {
    return this.machine;
  }

  /**
   * An arcade machine was clicked: pay a coin and stand at the controls; at the one being played,
   * nothing mid-game (walk-away leaves) or, once its end card shows, pay again and go straight into another play.
   */
  play(machine: ArcadeMachineLike): void {
    const replay = this.machine === machine;
    // A click on the machine being played is a reflex, not a choice: only walk-away leaves a running play.
    if (replay && machine.isPlaying) return;
    // The end card still counting (or fire still held from the play): not a replay yet.
    if (replay && machine.canReplay === false) return;
    if (this.machine && !replay) {
      if (this.machine.isPlaying) {
        this.host.refuse(`Finish here first: ${actionKeyLabel('walkAway')} walks away.`);
        return;
      }
      // On another machine's end card: walk over.
      this.leave();
    }
    const { wallet, player } = this.parts;
    if (!wallet) return;
    // Broke, and not even a coin's worth of tickets: the house stands a ticket machine's play, so the loop never dead-ends.
    const onTheHouse = !machine.freePlay && !machine.atHome && machine.freeWhenBroke && playIsFree(wallet);
    if (machine.freePlay || machine.atHome) {
      // Nothing to pay (and nothing paid out while its page sends no score).
    } else if (onTheHouse) {
      if (this.housePlays++ === 0) this.host.reward({ title: 'On the house!', detail: 'Out of coins? This play is free. Win some tickets!' });
      else this.host.react('On the house again.');
    } else if (!this.pay(wallet, machine)) return;
    this.paid = !onTheHouse && !machine.freePlay && !machine.atHome;
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
    const { arcadeHints } = this.parts;
    const id = machine.game.id;
    const first = !(arcadeHints?.seen(id) ?? this.hinted.has(id));
    this.hinted.add(id);
    arcadeHints?.mark(id);
    this.habits.played(id);
    // A tournament round: said before it starts, with the score to beat (a play on the house is not a round).
    const { tournament } = this.parts;
    const round = this.paid && tournament?.running && tournament.gameId === id ? tournament.next : null;
    if (round) this.host.react(`Tournament ${ROUND_WORDS[round.round] ?? 'round'}: beat ${round.name}'s ${round.score.toLocaleString('en-US')}.`);
    // The controls on a machine's first play ever; how to walk away for its first few, then the player knows.
    const walkAway = `${actionKeyLabel('walkAway')} walks away.`;
    if (first || this.hintsLeft(id)) this.host.tip(first ? `${machine.game.hint}\n${walkAway}` : walkAway, { id: 'arcade-play', until: () => this.machine !== machine || !machine.isPlaying });
  }

  /** Whether the HUD still spells out the keys at `gameId`'s machine (its first `HINTED_PLAYS` plays). */
  private hintsLeft(gameId: string): boolean {
    return this.habits.plays(gameId) <= HINTED_PLAYS;
  }

  /**
   * The coin for a play: out of the wallet; with no coin but a coin's worth of tickets, the attendant
   * swaps them there and then. False (and said why) when the player cannot pay.
   */
  private pay(wallet: WalletLike, machine: ArcadeMachineLike): boolean {
    if (wallet.coins < PLAY_COST && wallet.tickets >= TICKETS_PER_COIN * PLAY_COST && wallet.redeemTickets) {
      // A pocket that could take a prize home: asked once a session before the first swap, never nibbled unawares.
      if (!this.swapAsked && wallet.tickets >= CHEAPEST_PRIZE) {
        this.swapAsked = true;
        this.host.refuse(`Out of coins. The attendant can swap ${TICKETS_PER_COIN * PLAY_COST} of your ${wallet.tickets} tickets for the coin: play again to swap, or save them for the prize counter.`);
        return false;
      }
      const swapped = wallet.redeemTickets(TICKETS_PER_COIN, PLAY_COST - wallet.coins);
      if (swapped) this.host.react(`Out of coins: the attendant swaps ${swapped * TICKETS_PER_COIN} tickets for ${swapped === 1 ? 'a coin' : `${swapped} coins`}.`);
    }
    if (wallet.spend(PLAY_COST)) return true;
    this.host.refuse(`Insert coin: a play costs ${PLAY_COST} coin${PLAY_COST > 1 ? 's' : ''} and you have ${wallet.coins}.`);
    // The claw never plays for free; the ticket machines do when the player is broke.
    if (!machine.freeWhenBroke && playIsFree(wallet)) this.host.tip('Broke? The ticket machines play on the house: win some tickets there first.', { id: 'short-of-coins' });
    else this.host.tip('Short of coins? Tickets turn into coins at the prize counter.', { id: 'short-of-coins' });
    return false;
  }

  /** The pointer was unlocked (Esc): a play under way holds still instead of being lost. True when one was held. */
  hold(): boolean {
    const machine = this.machine;
    if (!machine || !machine.isPlaying || !machine.pause) return false;
    machine.pause(true);
    this.paused = machine;
    return true;
  }

  /** The pointer is locked again: the held play goes on. */
  resume(): void {
    this.paused?.pause?.(false);
    this.paused = null;
  }

  /** Walks away from the machine (a running play is lost). False when the player was at none. */
  leave(): boolean {
    const machine = this.machine;
    if (!machine) return false;
    this.machine = null;
    this.paused = null;
    machine.abort();
    this.parts.player.stand();
    return true;
  }

  /**
   * Walk-away pressed at the controls: on the end card it leaves at once; mid-play it asks for a second press
   * (the same key puts a box back elsewhere: a reflex would lose the coin), then says the play is lost.
   */
  private walkAway(machine: ArcadeMachineLike): void {
    if (!machine.isPlaying) {
      this.leave();
      return;
    }
    const now = performance.now();
    if (now - this.walkArmed > WALK_AWAY_CONFIRM_MS) {
      this.walkArmed = now;
      this.host.react(`${actionKeyLabel('walkAway')} again to walk away from the machine.`);
      return;
    }
    this.walkArmed = 0;
    this.leave();
    this.host.react('Walked away: that play is over.');
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
    // The flap clunks and the coins rattle down into the cup.
    playLatchClick(0.14);
    playCoins(coins + 2, 0.14);
    this.host.reward({ title: 'Lucky day!', detail: 'The change machine coughs up some coins.', coins });
  }

  /** At a machine every key is the game's, except E to walk away and, on the end card (once counted up, fire let go), fire to replay. */
  onKey(code: string): boolean {
    const machine = this.machine;
    if (!machine) return false;
    if (isAction(code, 'walkAway')) this.walkAway(machine);
    else if (!machine.isPlaying && machine.canReplay !== false && isAction(code, 'fire')) this.play(machine);
    return true;
  }

  /**
   * A play ended: hand over what `arcadePayout` settles. The machine's end card counts the score's
   * tickets and every bonus up; a banner only for what goes beyond a plain play (a challenge, a
   * medal, the streak, the league, the tournament, a prize, a new best).
   */
  private over(machine: ArcadeMachineLike, result: ArcadeResult): void {
    const { wallet, prizes, arcadeDaily, medals, league, payoutStats, tournament, perks } = this.parts;
    // At home, for fun: the end card says how it went, nothing is paid or counted.
    if (machine.atHome) {
      this.endTip(machine);
      return;
    }
    // Nothing came back (LexiPunk's page sent no score): the coin goes back, nothing else is settled.
    if (result.refund) {
      if (this.paid) wallet?.earnCoins(PLAY_COST);
      this.host.react(this.paid ? `No score came back from ${machine.game.title}: your coin is returned.` : `No score came back from ${machine.game.title}.`);
      this.paid = false;
      this.endTip(machine);
      return;
    }
    const beginner = this.habits.plays(machine.game.id) <= BEGINNER.plays;
    const payout = arcadePayout(machine, { ...result, beginner, paid: this.paid }, { daily: arcadeDaily, medals, league });
    // The arcade tee: the regulars nod the player through, a few tickets on top of the play's own.
    const tee = payout.tickets ? perks?.arcadeBonus(payout.tickets.paid) ?? 0 : 0;
    if (tee) payout.lines.push(`Arcade tee: +${tee} tickets`);
    // On tournament day, a play on its cabinet by a player still in is their next round.
    const round = tournament && this.paid && machine.freeWhenBroke && machine.game.id === tournament.gameId && tournament.running ? tournament.play(result.score) : null;
    batch(() => {
      for (const prize of payout.prizes) prizes?.add(prize);
      if (payout.tickets) wallet?.addTickets(payout.tickets.paid + tee);
      if (round?.tickets) wallet?.addTickets(round.tickets);
      if (round?.prize) prizes?.add(round.prize);
      // The tee's and the round's tickets are won at the arcade too: they count in the week's league.
      league?.count?.(tee + (round?.tickets ?? 0));
    });
    if (payout.tickets) payoutStats?.record(machine.game.id, result.score, payout.tickets.earned, (performance.now() - this.started) / 1000);
    if (round) payout.lines.push(tournamentLine(round));
    // The bonuses count up on the machine's end card after the score's tickets, and feed out on its strip.
    const bonuses: ArcadeBonus[] = [...payout.bonuses];
    if (tee) bonuses.push({ label: 'ARCADE TEE', tickets: tee });
    if (round?.tickets) bonuses.push({ label: 'TOURNAMENT', tickets: round.tickets });
    machine.showBonus?.(bonuses);
    const [headline, ...extras] = payout.lines;
    const tickets = (payout.tickets?.paid ?? 0) + tee + (round?.tickets ?? 0);
    const prizesWon = payout.prizes.length > 0 || Boolean(round?.prize);
    if (payout.notable || round || prizesWon || result.best) this.host.reward({ title: headline ?? 'Well played!', detail: extras.join('\n') || undefined, tickets: tickets || undefined, big: prizesWon || result.best });
    else if (!machine.freeWhenBroke || result.first) this.host.react([headline, ...extras].filter(Boolean).join('\n'));
    this.endTip(machine);
  }

  /** What the keys do next: the initials (a score that makes the table goes there first), or another go (the machine's first few plays). */
  private endTip(machine: ArcadeMachineLike): void {
    if (machine.isPlaying) this.host.tip('Sign the hall of fame: up / down picks a letter, fire moves on.', { id: 'arcade-play', until: () => !machine.isPlaying });
    else if (this.hintsLeft(machine.game.id)) this.host.tip(`${actionKeyLabel('fire')} or a click plays again, ${actionKeyLabel('walkAway')} walks away.`, { id: 'arcade-play', until: () => this.machine !== machine || machine.isPlaying });
  }
}
