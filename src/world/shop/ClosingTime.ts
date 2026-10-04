import type { Updatable } from '@/core/Engine';
import { STREET_PLAN, type ShopKind } from '../street/streetPlan'; // imports-ok: closing time sends the player out onto the street's arrival spots
import { SHOP_ZONE_OF } from '@/world/city/facades';
import { isShopOpen, SHOP_HOURS } from '../street/shops/shopHours';
import { clockShort } from '@/text/clock';

/** The places behind Front Street's doors that keep shop hours, by zone: the walk-in shops and the flea market (RETRO GAMES'). */
const HOURS_OF: Readonly<Record<string, ShopKind>> = {
  ...Object.fromEntries(Object.entries(SHOP_ZONE_OF).map(([kind, zone]) => [zone, kind as ShopKind])),
  market: 'retro',
};

/** What the clerk (or the stallholders) say at closing time, and who says it. */
const CLOSING: Readonly<Record<string, { who: string; warn: string; out: string }>> = {
  market: { who: 'Stallholder', warn: 'We’re packing up, friend! Last sales, then out you go.', out: 'The stallholders see you out onto Front Street.' },
  default: { who: 'Clerk', warn: 'We’re closing in a minute, love. Anything else?', out: 'The clerk turns the card to CLOSED and holds the door for you.' },
};

/** Real seconds between the warning and the door. */
const GRACE = 25;

/** The zone's shop kind, when the zone is one that keeps shop hours. */
function hoursKindOf(zone: string): ShopKind | null {
  return HOURS_OF[zone] ?? null;
}

/** Whether `zone` is a place behind a street door that is shut at `hours` (a reload never puts the player back in one). */
function isShutPlace(zone: string, hours: number): boolean {
  const kind = hoursKindOf(zone);
  return kind !== null && !isShopOpen(kind, hours);
}

/** Where on Front Street (zone-local) a player left in `zone` stands once it has shut: in front of its door; null while open. */
export function outsideIfShut(zone: string, hours: number): { at: readonly [number, number]; yaw: number } | null {
  if (!isShutPlace(zone, hours)) return null;
  return STREET_PLAN.arrivals[zone as keyof typeof STREET_PLAN.arrivals] ?? null;
}

interface ClosingTimeOptions {
  /** The zone the player is in. */
  here: () => string;
  hours: () => number;
  /** Mid-travel, asleep, in a pastime: wait. */
  busy: () => boolean;
  /** A voice: the clerk's word at closing. */
  say: (line: string, speaker: string) => void;
  /** Back out onto Front Street, in front of the shop's door (the street's arrivals are keyed by the zone left). */
  putOut: () => void;
}

/**
 * Closing time in the walk-in shops and the flea market: when the hour passes their `SHOP_HOURS` with the player still
 * inside, the clerk (or the stallholders) say so, and `GRACE` seconds later the player is seen out onto Front Street,
 * in front of the door they came in by. Wired in `bootstrap/world.ts`; never while travelling, asleep or busy.
 */
export class ClosingTime implements Updatable {
  /** The zone warned about, and how long ago. */
  private warned: { zone: string; clock: number } | null = null;

  constructor(private readonly options: ClosingTimeOptions) {}

  update(dt: number): void {
    const { here, hours, busy, say, putOut } = this.options;
    const zone = here();
    if (!isShutPlace(zone, hours())) {
      this.warned = null;
      return;
    }
    if (busy()) return;
    const words = CLOSING[zone] ?? CLOSING.default!;
    if (this.warned?.zone !== zone) {
      this.warned = { zone, clock: 0 };
      const kind = hoursKindOf(zone)!;
      say(`${words.warn} (Open again at ${clockShort(SHOP_HOURS[kind]?.open ?? 9)}.)`, words.who);
      return;
    }
    this.warned.clock += dt;
    if (this.warned.clock < GRACE) return;
    this.warned = null;
    say(words.out, words.who);
    putOut();
  }
}
