import * as THREE from 'three';
import type { BuildContext } from '../buildContext';
import type { Zone } from '../zone/Zone';
import type { SessionActions } from '@/game/SessionActions';
import { Prop } from '../props/Prop';
import type { Phone } from './Phone';
import { callEnded, callerOpening, messages, phoneCaller } from '@/social/phoneCalls';
import { shortName } from '@/social/people';
import { talkingWith } from '@/social/talkState';
import { HEARING, hear } from '@/audio/hearing';
import { playPhoneRing } from '@/audio/phoneRing';

/** Seconds between two looks at whether someone rings; a ring's period and how many before they leave a message. */
const LOOK_EVERY = 4;
const RING_EVERY = 3.4;
const RINGS = 6;
/** The ring's level at the phone, and the least heard for it to ring at all (the player home, not on the stairs). */
const LEVEL = 0.09;
const EARSHOT = 0.04;
/** The message light's blink, a cycle in seconds. */
const BLINK = 1.6;

/** What the bedroom's phone asks of the friends' calls: its caption while one rings or messages wait, and the click. */
export interface FriendCalls {
  /** The caption while a friend rings or messages wait; null for the phone's own. */
  label(): string | null;
  /** The click: picks up (the conversation opens over the phone); false when it is the phone's own (the panel). */
  answer(session: SessionActions): boolean;
}

/**
 * FRIENDS RING (docs/social.md "The phone"): at the hour of the day `social/phoneCalls` drew, one of the player's
 * friends rings the flat. Heard (the player home within earshot), the phone rings and its screen lights with each
 * ring; picked up, the conversation opens over the phone with their first word; let ring out (or rung while the
 * player was out), they leave a message, and a red light blinks on the phone until it is played (the phone's panel).
 * Never over Mémé's call (`busy`) nor while a conversation is open. Only while the phone stands (`owned`).
 */
export function placeFriendCalls(zone: Zone, ctx: Pick<BuildContext, 'social' | 'sky' | 'memories'>, phone: Phone, owned: () => boolean, busy: () => boolean): FriendCalls | null {
  const social = ctx.social;
  if (!social) return null;
  let calling: string | null = null;
  let rings = 0;
  let wait = LOOK_EVERY;
  let blink = 0;
  const at = new THREE.Vector3();

  /** One ring, heard where the player is; false when out of earshot. */
  const ring = (): boolean => {
    const heard = hear(phone.getWorldPosition(at), HEARING.visitor);
    if (heard.gain < EARSHOT) return false;
    const length = playPhoneRing(LEVEL * heard.gain, heard.spatial);
    phone.setRinging(1);
    zone.after(Math.max(0.6, length), () => phone.setRinging(calling ? 0.35 : 0));
    return true;
  };
  const stop = (): void => {
    calling = null;
    rings = 0;
    phone.setRinging(0);
  };
  const missed = (id: string): void => {
    callEnded(id, social.day(), ctx.sky.dayNight.state.hours, false);
    stop();
  };

  zone.place(
    new Ticker((dt) => {
      blink = (blink + dt) % BLINK;
      phone.setNotice(messages().length && owned() ? (blink < BLINK / 2 ? 1 : 0.15) : 0);
      wait -= dt;
      if (wait > 0) return;
      if (calling) {
        wait = RING_EVERY;
        if (++rings > RINGS || !ring()) missed(calling);
        return;
      }
      wait = LOOK_EVERY;
      if (!owned() || busy() || talkingWith() !== null || ctx.memories?.filming) return;
      const call = phoneCaller(social.day(), ctx.sky.dayNight.state.hours);
      if (!call) return;
      // Rung long ago, while the player was out: only the message is left.
      if (call.late) return void callEnded(call.id, social.day(), ctx.sky.dayNight.state.hours, false);
      calling = call.id;
      rings = 1;
      wait = RING_EVERY;
      if (!ring()) missed(call.id);
    }),
    new THREE.Vector3(),
  );

  return {
    label: () => {
      if (calling) return `Phone · ${shortName(calling)} calling · answer`;
      const waiting = owned() ? messages().length : 0;
      return waiting ? `Phone · ${waiting === 1 ? 'a message' : `${waiting} messages`} · play` : null;
    },
    answer: (session) => {
      if (!calling) return false;
      const id = calling;
      const day = social.day();
      stop();
      callEnded(id, day, ctx.sky.dayNight.state.hours, true);
      const line = callerOpening(id, day);
      social.open(session, { person: id, place: 'phone', opening: () => line });
      return true;
    },
  };
}

/** Ticks the calls (a prop of the bedroom's: it stops with the zone). */
class Ticker extends Prop {
  constructor(private readonly tick: (dt: number) => void) {
    super();
    this.name = 'FriendCalls';
  }

  update(dt: number): void {
    this.tick(dt);
  }
}
