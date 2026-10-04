import * as THREE from 'three';
import { getPlatform } from '@/catalog/platforms';
import type { Honour } from '@/economy/Honours';
import { fill } from '../friendLines';
import type { VisitRoute } from '../Visit';
import type { GatheringDeps } from './deps';
import { CLUB_VISITOR, GATHERING_LINES, GATHERING_RULES } from './gatheringPlan';
import { Party } from './Party';
import type { Friend } from '../Friend';
import { bodyOf, talkHook } from '../../people/socialHook';
import { effectValue } from '@/social/perks';

/** The club's secretary's person (`social/people/town`). */
const CLUB_PERSON = 'albers';

type Stop = VisitRoute['browse'][number];

/**
 * The collectors' club comes to see a completed set (docs/visitors.md "Gatherings", `economy/Honours`): the day after
 * it was completed, in the afternoon, their secretary rings, comes in, stands at the shelves under the set's neon,
 * looks up at it, says a word on it, leaves the club's thanks (coins) on the way out. Nobody answering, they come back
 * another day. One honour a visit.
 */
export class ClubVisit {
  readonly party: Party;
  private thanked = false;
  private finished = false;
  private seen = false;

  constructor(private readonly deps: GatheringDeps, readonly honour: Honour, private readonly onSeen: (id: string) => void) {
    const { host } = deps;
    const visit = this;
    this.party = new Party(host, {
      enterLine: () => host.line('club:enter', CLUB_VISITOR.lines.smalltalk),
      browse: () => visit.atNeon(),
      sitLine: () => '',
      leaveLine: () => visit.thanks(),
      chat: () => host.line('club:smalltalk', CLUB_VISITOR.lines.smalltalk),
      visitOptions: () => ({ sits: false, stops: () => visit.stops() }),
      gaveUp: () => host.options.notices?.react('Nobody answered: the collectors’ club will try another day.'),
    });
    // Mrs Albers is someone to know (`social/people/town`): a word with her while she is round, the club's gift by how she takes to the player.
    const member = this.party.add(CLUB_VISITOR, 0);
    this.body = member.friend;
    this.body.talker = talkHook(deps.social, CLUB_PERSON, () => ({ person: CLUB_PERSON, place: 'flat', body: bodyOf(member.friend) })) ?? null;
  }

  /** The secretary's body, while her visit lasts (its conversation is let go with it). */
  private readonly body: Friend;

  get done(): boolean {
    return this.party.done;
  }

  update(dt: number): void {
    this.party.update(dt);
  }

  /** The shelf stop facing the neon's wall, nearest under it. */
  private stops(): Stop[] {
    const { host, honourAt } = this.deps;
    const wallYaw = this.honour.kind === 'set' ? Math.PI : Math.PI / 2;
    const shelves = host.route.browse.filter((b) => b.kind === 'shelf' && Math.abs(Math.cos(b.yaw - wallYaw)) > 0.9);
    const neon = honourAt?.(this.honour.id);
    const at = neon ? host.options.living.toLocal(neon.clone()).setY(0) : null;
    const best = at ? [...shelves].sort((a, b) => a.at.distanceTo(at) - b.at.distanceTo(at))[0] : shelves[0];
    return best ? [best] : host.route.browse.slice(0, 1);
  }

  /** Under the neon: they look up at it and say so. */
  private atNeon(): { look: THREE.Vector3 | null; line: string | null } {
    const { host, honourAt } = this.deps;
    this.seen = true;
    const look = honourAt?.(this.honour.id) ?? null;
    const line = this.honour.kind === 'set'
      ? fill(host.line('clubSet', GATHERING_LINES.clubSet), { set: this.honour.name })
      : fill(host.line('clubConsole', GATHERING_LINES.clubConsole), { platform: getPlatform(this.honour.platform).shortName });
    return { look, line };
  }

  /** On the way out: the club's thanks. */
  private thanks(): string {
    const { host } = this.deps;
    if (this.thanked) return host.line('houseLeave', GATHERING_LINES.houseLeave);
    this.thanked = true;
    const coins = Math.round(GATHERING_RULES.club.gift[this.honour.kind] * effectValue(CLUB_PERSON, 'clubBonus', 1));
    host.options.purse?.earnCoins(coins);
    host.coinsFrom(CLUB_VISITOR, coins);
    host.options.notices?.reward({ title: 'The collectors’ club', detail: `${CLUB_VISITOR.name} came to see ${this.honour.name}, and left the club’s thanks.`, coins });
    host.options.journal?.note('visit', `${CLUB_VISITOR.name} of the collectors’ club came to see ${this.honour.name}`);
    return fill(host.line('clubGift', GATHERING_LINES.clubGift), { coins });
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.body.talker = null;
    // Seen, or thanked on the way out (no shelf stop reached): either way the club came, and pays once.
    if (this.seen || this.thanked) this.onSeen(this.honour.id);
  }
}
