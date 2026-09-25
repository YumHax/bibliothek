import type { ZoneId } from '@/world/zoneIds';
import type { TravelLike, TravelMenuLike } from './SessionParts';
import type { SessionHost } from './SessionHost';
import type { Screens } from './Screens';

export interface TravelParts {
  travel?: TravelLike;
  travelMenu?: TravelMenuLike;
}

/**
 * The travel doors: straight to where a door leads (the street's doors), or the "Where to?" menu
 * (digits pick, Esc stays). The hands are emptied and the player stands first; a screen left on
 * at home is switched off (it would play on to an empty flat).
 */
export class GoingOut {
  constructor(private readonly parts: TravelParts, private readonly host: SessionHost, private readonly screens: Screens) {
    const { travelMenu } = parts;
    if (travelMenu) {
      travelMenu.onPick((id) => {
        host.setFrozen(false);
        this.go(id);
      });
      travelMenu.onCancel(() => host.setFrozen(false));
    }
  }

  /** The menu reads its digits itself: the room hears no key meanwhile. */
  get menuOpen(): boolean {
    return this.parts.travelMenu?.isOpen ?? false;
  }

  /** A travel door was clicked: go to `to`, or offer the destinations. */
  travel(to?: ZoneId): void {
    const { travel, travelMenu } = this.parts;
    if (to && travel) {
      this.host.putBack();
      this.host.stand();
      this.go(to);
      return;
    }
    if (!travel || !travelMenu) {
      this.host.notify('The door is locked');
      return;
    }
    const choices = travel.choices();
    if (!choices.length) return;
    this.host.putBack();
    this.host.stand();
    this.host.setFrozen(true);
    travelMenu.open(choices);
  }

  /** The pointer lock dropped (Esc under lock): the menu closes, the player stays. */
  onUnlock(): void {
    if (!this.parts.travelMenu?.isOpen) return;
    this.parts.travelMenu.close();
    this.host.setFrozen(false);
  }

  private go(id: ZoneId): void {
    this.screens.stopActive();
    void this.parts.travel?.go(id);
  }
}
