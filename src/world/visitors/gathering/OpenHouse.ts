import * as THREE from 'three';
import { VISIT_RULES } from '../friendsPlan';
import { fill } from '../friendLines';
import type { VisitRoute } from '../Visit';
import type { GatheringDeps } from './deps';
import { GATHERING_LINES, GATHERING_RULES, GUESTS } from './gatheringPlan';
import { Party, type PartyMember } from './Party';

type Stop = VisitRoute['browse'][number];

/** The second guest of a wave sets off this long after the first (s). */
const PAIR_GAP = 2.5;

/**
 * An open house (docs/visitors.md "Gatherings"): announced to the paper on the bedroom's phone, held on its day in the
 * afternoon. Strangers come up the stairs in waves of two (never more than `inFlat` in the flat), ring, drop their
 * coins in the jar at the door, look round the shelves, the window and the display cases (a rare copy gets a gasp),
 * and go. The day's account (how many came, the coins, the best piece, a quote or two) is the paper's article the next
 * day, and the market hears of it (a deed for the standing). Nobody home, nobody comes in: no harm done.
 */
export class OpenHouse {
  readonly party: Party;
  private readonly rules = GATHERING_RULES.openHouse;
  private waves = 0;
  private nextWaveAt = 0;
  private guests = 0;
  private coins = 0;
  private readonly quotes: string[] = [];
  private finished = false;
  private awayFor = 0;
  /** The stops at the display cases, made fresh for each wave (the cases may have changed). */
  private caseStops: { stop: Stop; title: string; look: THREE.Vector3 }[] = [];

  constructor(private readonly deps: GatheringDeps, private readonly day: number) {
    const { host } = deps;
    const house = this;
    this.party = new Party(host, {
      enterLine: (m) => house.pay(m),
      browse: (m, kind, at, yaw) => house.browse(m, kind, at, yaw),
      sitLine: () => '',
      leaveLine: () => host.line('houseLeave', GATHERING_LINES.houseLeave),
      chat: (m) => host.line(`${m.plan.id}:smalltalk`, m.plan.lines.smalltalk),
      visitOptions: (m) => ({ sits: false, stops: () => house.stopsFor(m) }),
    });
    this.launchWave();
  }

  /** Every wave came (or the afternoon is over) and everyone has gone. */
  get done(): boolean {
    return this.party.done && (this.waves >= this.rules.waves || this.afternoonOver);
  }

  private get afternoonOver(): boolean {
    return this.deps.host.options.clock.state.hours >= this.rules.until;
  }

  update(dt: number): void {
    const { host } = this.deps;
    this.party.update(dt);
    const inFlat = this.party.members.some((m) => m.cameIn && !m.gone);
    const home = host.options.atHome() && !host.options.busy?.();
    if (inFlat) {
      this.awayFor = home || this.party.passing() ? 0 : this.awayFor + dt;
      if (this.awayFor > VISIT_RULES.aloneFor) {
        host.options.notices?.react('Your last visitors let themselves out.');
        this.party.cancel();
        return;
      }
    }
    // The next wave once the last one is in (or gave up), there is room, and the player is home to open.
    const last = this.party.members.slice(-this.rules.perWave);
    const settled = last.every((m) => m.cameIn || m.gone);
    if (this.waves < this.rules.waves && settled && home && !this.afternoonOver && this.party.time >= this.nextWaveAt && this.party.present + this.rules.perWave <= this.rules.inFlat) this.launchWave();
  }

  private launchWave(): void {
    const { perWave, waveGap } = this.rules;
    for (let i = 0; i < perWave; i++) {
      const plan = GUESTS[(this.waves * perWave + i) % GUESTS.length];
      if (plan) this.party.add(plan, i * PAIR_GAP);
    }
    this.waves += 1;
    this.nextWaveAt = this.party.time + waveGap[0] + Math.random() * (waveGap[1] - waveGap[0]);
    this.caseStops = this.casesNow();
  }

  /** Just inside the door: their coins in the jar. */
  private pay(m: PartyMember): string {
    const { host } = this.deps;
    const { entry } = this.rules;
    host.options.purse?.earnCoins(entry);
    host.coinsFrom(m.plan, entry);
    this.guests += 1;
    this.coins += entry;
    return fill(host.line('houseEnter', GATHERING_LINES.houseEnter), { coins: entry });
  }

  /** A guest's round: `stops` of the shelves, the window and the cases, each guest starting further along. */
  private stopsFor(m: PartyMember): Stop[] {
    const all = [...this.caseStops.map((c) => c.stop), ...this.deps.host.route.browse];
    if (!all.length) return [];
    const out: Stop[] = [];
    for (let i = 0; i < Math.min(this.rules.stops, all.length); i++) out.push(all[(m.index + i * 2) % all.length]!);
    return out;
  }

  private browse(m: PartyMember, kind: 'shelf' | 'window', at: THREE.Vector3, yaw: number): { look: THREE.Vector3 | null; line: string | null } {
    const { host, isRare } = this.deps;
    const local = host.options.living.toLocal(at.clone()).setY(0);
    const atCase = this.caseStops.find((c) => c.stop.at.distanceTo(local) < 0.3);
    if (atCase) {
      const line = fill(host.line('houseDisplay', GATHERING_LINES.houseDisplay), { title: atCase.title });
      this.quote(line);
      return { look: atCase.look.clone(), line };
    }
    const seen = host.browse(m.plan, kind, at, yaw);
    if (seen.game && isRare?.(seen.game)) {
      const line = fill(host.line('houseRare', GATHERING_LINES.houseRare), { title: seen.game.title });
      this.quote(line);
      return { look: seen.look, line };
    }
    return { look: seen.look, line: seen.line };
  }

  private quote(line: string): void {
    if (this.quotes.length < 2 && !this.quotes.includes(line)) this.quotes.push(line);
  }

  /** The displays with something in them as stops (`Showcases.stops`): where to stand, facing them, two at most. */
  private casesNow(): { stop: Stop; title: string; look: THREE.Vector3 }[] {
    const { host, showcases } = this.deps;
    const living = host.options.living;
    return (showcases?.() ?? []).slice(0, 2).map((s) => ({
      stop: { at: living.toLocal(s.at.clone()).setY(0), yaw: s.yaw, kind: 'shelf' as const, via: [] },
      title: s.games[0]?.title ?? s.name,
      look: s.look.clone(),
    }));
  }

  /** The afternoon is over: the paper's account, the market's word, the player told. */
  finish(): void {
    if (this.finished) return;
    this.finished = true;
    const { book, standing, showpiece, host } = this.deps;
    if (!this.guests) {
      book.heldHouse(null, this.day);
      return;
    }
    book.heldHouse({ day: this.day, guests: this.guests, coins: this.coins, best: showpiece?.()?.title ?? null, quotes: [...this.quotes] }, this.day);
    standing?.record('openHouse');
    host.options.journal?.note('visit', `Open house: ${this.guests} visitors, ${this.coins} coins in the jar`);
    host.options.notices?.reward({ title: 'Open house', detail: `${this.guests} visitor${this.guests === 1 ? '' : 's'} came up the stairs. The paper will have it tomorrow.`, coins: this.coins });
  }
}
