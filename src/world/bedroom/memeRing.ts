import * as THREE from 'three';
import type { BuildContext } from '../buildContext';
import type { Zone } from '../zone/Zone';
import type { SessionActions } from '@/game/SessionActions';
import { Prop } from '../props/Prop';
import type { Phone } from './Phone';
import { MEME_ID } from '@/social/people/family';
import { RING } from '@/grandma/hintLines';
import { HEARING, hear } from '@/audio/hearing';
import { playPhoneRing } from '@/audio/phoneRing';

/** Seconds between two looks at whether she rings (the player in earshot, a memory ready, her hours). */
const LOOK_EVERY = 3;
/** A ring's period and how many before she gives up and leaves a message. */
const RING_EVERY = 3.4;
const RINGS = 6;
/** The ring's level at the phone, and the least heard for her to ring at all (the player home, not on the stairs). */
const LEVEL = 0.09;
const EARSHOT = 0.04;

/** What the bedroom's phone asks of her call: its caption while it rings or holds her message, and the click. */
export interface MemeRing {
  /** The caption while she rings or her message waits; null for the phone's own. */
  label(): string | null;
  /** The click: picks up, or reads her message; false when it is the phone's own (the panel). */
  answer(session: SessionActions): boolean;
}

/**
 * MÉMÉ RINGS (docs/grandma.md "Hints toward the next memory"): when a photo of her album is ready (`GrandmaHints.callWaiting`)
 * and the player is home within earshot, the bedroom's phone rings, its screen lit with each ring. Picked up, the
 * conversation opens with her news; let ring out, she leaves a message, read off the phone at the next click. Once a
 * memory. Only while the phone stands (`owned`: the nightstands bought).
 */
export function placeMemeRing(zone: Zone, ctx: Pick<BuildContext, 'grandmaHints' | 'social' | 'sky' | 'memories'>, phone: Phone, owned: () => boolean): MemeRing | null {
  const hints = ctx.grandmaHints;
  if (!hints) return null;
  let calling: string | null = null;
  let rings = 0;
  let wait = LOOK_EVERY;
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

  zone.place(
    new Ticker((dt) => {
      wait -= dt;
      if (wait > 0) return;
      if (calling) {
        wait = RING_EVERY;
        if (++rings > RINGS || !ring()) {
          hints.rang(calling, 'missed');
          stop();
        }
        return;
      }
      wait = LOOK_EVERY;
      if (!owned() || ctx.memories?.filming) return;
      const memory = hints.callWaiting(ctx.sky.dayNight.state.hours);
      if (!memory) return;
      calling = memory.id;
      rings = 1;
      wait = RING_EVERY;
      if (!ring()) stop();
    }),
    new THREE.Vector3(),
  );

  return {
    label: () => (calling ? RING.calling : hints.message() ? RING.message : null),
    answer: (session) => {
      if (calling) {
        const id = calling;
        stop();
        hints.rang(id, 'answered');
        const line = hints.callLine(id);
        if (ctx.social) ctx.social.open(session, { person: MEME_ID, place: 'phone', opening: () => line });
        else session.read({ title: 'Mémé, on the phone', text: line, look: 'note' });
        return true;
      }
      const message = hints.message();
      if (!message) return false;
      hints.messageHeard();
      session.read({ title: message.title, text: message.text, look: 'note' });
      return true;
    },
  };
}

/** Ticks the call (a prop of the bedroom's: it stops with the zone). */
class Ticker extends Prop {
  constructor(private readonly tick: (dt: number) => void) {
    super();
    this.name = 'MemeRing';
  }

  update(dt: number): void {
    this.tick(dt);
  }
}
