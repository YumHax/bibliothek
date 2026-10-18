/**
 * How the player's next trip goes, when something on wheels takes them (`SessionActions.travel` carries only where):
 * line 38 (`StreetBus`: the ride's interlude plays over the curtain) or a taxi (`traffic/TaxiRank`: the back seat,
 * `ui/taxiRide`, with what the driver said and the fare). Set just before `travel`, read once by the trip's interlude
 * (`bootstrap/player`), then forgotten.
 */
type RideVia = { by: 'bus' } | { by: 'taxi'; to: string; fare: number; chat: string };

let next: RideVia | null = null;

/** The next trip is by `via`. */
export function rideBy(via: RideVia): void {
  next = via;
}

/** How this trip goes (null: on foot, through a door), forgotten once read. */
export function takeRideVia(): RideVia | null {
  const via = next;
  next = null;
  return via;
}
