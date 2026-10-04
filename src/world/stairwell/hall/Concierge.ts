import * as THREE from 'three';
import type { Updatable } from '@/core/Engine';
import type { SessionActions } from '@/game/SessionActions';
import { gameDayRandom } from '@/time/daily';
import { giveKey, hasKey } from '@/building/keys';
import { conciergeState, saveConcierge } from '@/building/conciergeState';
import type { OccupancyAware } from '../../Furniture';
import { randomLook, type PersonLook } from '../../people/looks';
import { Prop, part } from '../../props/Prop';
import { paint } from '../../materials/palette';
import { createCanvas, toTexture } from '@/graphics/canvas';
import { StairWalker, type StairWalkerOptions } from '../StairWalker';
import type { Lodge, LodgeSign } from './Lodge';
import { STAIRWELL_PLAN as plan } from '../stairwellPlan';
import { landingY } from '@/world/measures/building';
import { rememberLook } from '@/social/lookBook';
import { nudge } from '@/social/standing';
import type { SocialServices, TalkExtra, TalkSession } from '@/social/talk';
import { bodyOf, talkHook } from '../../people/socialHook';

const who = plan.concierge;

/** Her look: a blue housecoat over a mauve blouse, grey hair in a bun, glasses. */
function conciergeLook(): PersonLook {
  return {
    ...randomLook(who.seed, 'vendor'),
    figure: 'curvy',
    hairStyle: 'bun',
    hair: 0x9a958e,
    hat: undefined,
    glasses: 0x3a2a22,
    top: 'shirt',
    topColor: 0x6b4a7a,
    topAccent: 0xf2efe8,
    longSleeves: true,
    apron: 0x2a3a5a,
    trousers: 0x2a2a30,
    shorts: false,
    shoes: 'loafer',
    shoeColor: 0x2a2622,
    bag: undefined,
    smile: true,
    height: 1.6,
    build: 1.1,
  };
}

/** Where she is now: behind her glass, mopping a landing, or out of sight (her lunch, the night). */
type Whereabouts = { at: 'lodge' } | { at: 'mop'; k: number } | { at: 'away'; sign: LodgeSign };

interface ConciergeOptions extends Omit<StairWalkerOptions, 'look' | 'seed' | 'label' | 'speaker' | 'social'> {
  hours: () => number;
  day: () => number;
  lodge: Lodge;
  /** A line of the day besides her own (the last meeting's gossip), if any. */
  extraLines?: () => string | null;
  /** The people the player talks to (docs/social.md): a click on her opens the conversation, her errand and box among its entries. */
  people?: SocialServices;
}

/** Her person in the social layer (`social/people/building`). */
const PERSON = 'pereira';
/** A favour done for her (the timer buttons) and a tip in her box, as warmth and trust. */
const ERRAND_THANKS = { warmth: 8, trust: 6 };
const TIP_THANKS = { warmth: 4, trust: 1 };

/** The concierge as a person: a stair walker whose click is her conversation. */
class ConciergeWalker extends StairWalker {
  talkTo: ((session: SessionActions) => void) | null = null;

  override activate(session: SessionActions): void {
    if (this.talkTo) this.talkTo(session);
    else super.activate(session);
  }
}

/**
 * Mme Pereira, the concierge (`STAIRWELL_PLAN.concierge`): behind her lodge's glass in her hours (mornings and
 * afternoons), some mornings mopping a landing instead (the mop swinging, a wet-floor sign, her sign on the lodge's
 * door saying she is on the stairs), out of sight at lunch and at night. She keeps the building's keys: the cellar's
 * (`building/keys`) once the player has done her a favour (trying the timer buttons of the floors, `buttonPressed`) or
 * put a few coins in her Christmas box (`tipped`). Otherwise she chats: the building, the residents, the last
 * meeting. Met only while the player is in the stairwell (its occupancy): off the stairs nobody needs to see her.
 */
export class Concierge extends Prop implements Updatable, OccupancyAware {
  readonly contactShadow = false;
  readonly walker: ConciergeWalker;
  private readonly mop = new THREE.Group();
  private readonly mopHead = new THREE.Group();
  private readonly handA = new THREE.Vector3();
  private readonly handB = new THREE.Vector3();
  private occupied = false;
  private where: Whereabouts = { at: 'away', sign: 'night' };
  private clock = 0;
  private sway = 0;
  private nextLine = 0;

  constructor(private readonly options: ConciergeOptions) {
    super();
    this.name = 'Concierge';
    const look = conciergeLook();
    rememberLook(PERSON, look);
    const social = talkHook(options.people, PERSON, (session) => this.conversation(session));
    this.walker = new ConciergeWalker({ ...options, seed: who.seed, look, speaker: who.name, label: `${who.name}, the concierge · chat`, lines: who.lines, speed: 0.6, social });
    if (!social) this.walker.talkTo = (session) => this.talk(session);
    this.buildMop();
    this.add(this.mop);
    this.mop.visible = false;
  }

  override get footprint(): THREE.Box3 {
    return new THREE.Box3();
  }

  setOccupied(occupied: boolean): void {
    this.occupied = occupied;
    this.clock = 0;
  }

  update(dt: number): void {
    this.clock -= dt;
    if (this.where.at === 'mop' && this.walker.isPresent) {
      // The mop swings to and fro over the stone.
      this.sway += dt;
      this.mopHead.position.x = Math.sin(this.sway * 1.6) * 0.22;
      this.mopHead.rotation.y = Math.sin(this.sway * 1.6) * 0.3;
    }
    if (this.clock > 0) return;
    this.clock = 1;
    const now = this.whereabouts();
    const moved = now.at !== this.where.at || (now.at === 'mop' && this.where.at === 'mop' && now.k !== this.where.k);
    this.where = now;
    this.options.lodge.setSign(now.at === 'lodge' ? null : now.at === 'mop' ? 'stairs' : now.sign);
    this.mop.visible = now.at === 'mop';
    if (now.at === 'mop') this.mop.position.set(who.mop.at[0], landingY(now.k), who.mop.at[1]);
    if (!this.occupied || now.at === 'away') {
      if (this.walker.isPresent) this.walker.away();
      return;
    }
    if (this.walker.isPresent && !moved) return;
    if (now.at === 'lodge') {
      const [x, z] = plan.lodge.stand;
      this.walker.appear(new THREE.Vector3(x, 0, z), 0);
      this.walker.stand(-Math.PI / 2, 'crossed');
    } else {
      const [x, z] = who.mop.at;
      const y = landingY(now.k);
      this.walker.appear(new THREE.Vector3(x - 0.35, y, z + 0.1), y);
      this.walker.stand(who.mop.yaw, 'stand', null, () => this.hands());
    }
  }

  /** Where her day has her now. */
  private whereabouts(): Whereabouts {
    const h = this.options.hours();
    const day = this.options.day();
    const random = gameDayRandom('concierge.mop', day);
    const mopping = random() < who.mop.share;
    const k = 1 + Math.floor(random() * 4);
    if (mopping && h >= who.mop.from && h < who.mop.to) return { at: 'mop', k };
    if (who.hours.some(([from, to]) => h >= from && h < to)) return { at: 'lodge' };
    const lunch = h >= who.hours[0]![1] && h < who.hours[1]![0];
    return { at: 'away', sign: lunch ? 'lunch' : 'night' };
  }

  /** Her hands on the mop's handle (world). */
  private hands(): readonly [THREE.Vector3, THREE.Vector3] {
    this.mopHead.updateWorldMatrix(true, false);
    // Up the handle, which leans back from the head towards her.
    this.mopHead.localToWorld(this.handA.set(-0.25, 1.0, 0));
    this.mopHead.localToWorld(this.handB.set(-0.19, 0.77, 0));
    return [this.handA, this.handB];
  }

  /** A mop (its handle leaning back towards her), a bucket, the yellow wet-floor sign. */
  private buildMop(): void {
    const handle = paint(0xb88a4a, 0.6);
    const strings = paint(0xd8d2c0, 0.95);
    const stick = part(this.mopHead, 0.025, 1.2, 0.025, handle, { y: 0.62 });
    stick.rotation.z = 0.25;
    stick.position.x = -0.15;
    part(this.mopHead, 0.26, 0.06, 0.14, strings, { y: 0.03 });
    this.mop.add(this.mopHead);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.28, 12), paint(0x2a6b9a, 0.5));
    bucket.position.set(0.55, 0.14, 0.25);
    this.mop.add(bucket);
    const sign = new THREE.Group();
    const [canvas, ctx] = createCanvas(128, 160);
    ctx.fillStyle = '#f2c41a';
    ctx.fillRect(0, 0, 128, 160);
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CAUTION', 64, 40);
    ctx.fillText('WET', 64, 110);
    ctx.fillText('FLOOR', 64, 138);
    ctx.beginPath();
    ctx.moveTo(64, 52);
    ctx.lineTo(86, 88);
    ctx.lineTo(42, 88);
    ctx.closePath();
    ctx.fill();
    const face = new THREE.MeshStandardMaterial({ map: toTexture(canvas, 'facing'), roughness: 0.5, side: THREE.DoubleSide });
    for (const s of [-1, 1]) {
      const board = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.6), face);
      board.position.set(0, 0.29, s * 0.09);
      board.rotation.x = s * 0.3;
      sign.add(board);
    }
    sign.position.set(-1.6, 0, 0.3);
    this.mop.add(sign);
    this.mop.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = false;
    });
  }

  /** The player clicked her: the errand for the cellar key, else a chat. */
  private talk(session: SessionActions): void {
    const state = conciergeState();
    const w = this.walker;
    if (!state.met) {
      state.met = true;
      saveConcierge();
      w.speak(who.hello);
      return;
    }
    if (!hasKey('cellar')) {
      // Coins left in her tin while she was out count as the tip that buys the key.
      if (state.tips > 0) {
        this.handOverKey(session, who.tipKey);
        return;
      }
      if (state.errand === 'none') {
        state.errand = 'asked';
        state.pressed = [];
        saveConcierge();
        w.speak(who.askKey);
        session.tip('Try the timer button on the landings of the 1st to the 4th floor, then tell the concierge which one sticks.', {
          id: 'concierge-errand',
          head: 'To do',
          until: () => conciergeState().errand !== 'asked',
        });
        return;
      }
      if (state.errand === 'asked') {
        const left = who.errandFloors.filter((k) => !state.pressed.includes(k));
        w.speak(who.stillAsking);
        if (left.length < who.errandFloors.length) session.react(`Still to try: ${left.map((k) => plan.floorNames[k]).join(', ')}`);
        return;
      }
      if (state.errand === 'tried') this.handOverKey(session, who.given);
      return;
    }
    const extra = this.options.extraLines?.();
    const lines = [...who.lines, who.after, ...(extra ? [extra] : [])];
    w.speak(lines[this.nextLine++ % lines.length]!);
  }

  /** Hands the cellar key over with `line` (said by her unless `quiet`: the conversation says it itself). */
  private handOverKey(session: SessionActions, line: string, quiet = false): void {
    const state = conciergeState();
    state.errand = 'done';
    saveConcierge();
    if (!quiet) this.walker.speak(line);
    if (giveKey('cellar')) session.reward({ title: 'The cellar key', detail: 'Cellar No 5: the door at the foot of the stairs, in the hall.' });
  }

  /**
   * Talking to her (docs/social.md): her body answers; her errand for the cellar key, the answer to it, the
   * Christmas box and the building's news are entries of the conversation.
   */
  private conversation(session: SessionActions): TalkSession {
    const state = conciergeState();
    if (!state.met) {
      state.met = true;
      saveConcierge();
    }
    const extras: TalkExtra[] = [];
    if (!hasKey('cellar')) {
      if (state.tips > 0 || state.errand === 'tried') {
        const tried = state.errand === 'tried';
        extras.push({
          id: 'key',
          group: 'ask',
          label: tried ? 'The timer buttons: it’s the 3rd floor’s that sticks' : 'Ask for the cellar key',
          run: () => {
            this.handOverKey(session, tried ? who.given : who.tipKey, true);
            if (tried) nudge(PERSON, { ...ERRAND_THANKS, day: this.options.day(), why: 'you did her errand', memory: 'you tried the timer buttons for me', reason: 'errand' });
            return { line: tried ? who.given : who.tipKey };
          },
        });
      } else if (state.errand === 'none') {
        extras.push({
          id: 'key',
          group: 'ask',
          label: 'Ask for the cellar key',
          run: () => {
            state.errand = 'asked';
            state.pressed = [];
            saveConcierge();
            session.tip('Try the timer button on the landings of the 1st to the 4th floor, then tell the concierge which one sticks.', {
              id: 'concierge-errand',
              head: 'To do',
              until: () => conciergeState().errand !== 'asked',
            });
            return { line: who.askKey };
          },
        });
      } else if (state.errand === 'asked') {
        extras.push({
          id: 'key',
          group: 'ask',
          label: 'About the timer buttons…',
          run: () => {
            const left = who.errandFloors.filter((k) => !state.pressed.includes(k));
            if (left.length < who.errandFloors.length) session.react(`Still to try: ${left.map((k) => plan.floorNames[k]).join(', ')}`);
            return { line: who.stillAsking };
          },
        });
      }
    }
    extras.push({
      id: 'news',
      group: 'talk',
      label: 'Any news in the building?',
      run: () => {
        const extra = this.options.extraLines?.();
        const lines = [...who.lines, who.after, ...(extra ? [extra] : [])];
        return { line: lines[this.nextLine++ % lines.length]! };
      },
    });
    extras.push({
      id: 'tip',
      group: 'give',
      label: `Coins in the Christmas box (${plan.lodge.tipBox.price})`,
      run: () => session.pay({ price: plan.lodge.tipBox.price, paid: () => this.tipped(session) }),
    });
    return { person: PERSON, place: 'stairs', body: bodyOf(this.walker), extras };
  }

  /**
   * A landing's timer button was pressed (`TimerButton`): counted for her errand. Returns what the button does under
   * the finger: the sticky one stays in a moment.
   */
  buttonPressed(k: number): 'sticks' | 'fine' {
    const state = conciergeState();
    const sticks = k === who.sticky;
    if (state.errand !== 'asked' || !who.errandFloors.includes(k) || state.pressed.includes(k)) return sticks ? 'sticks' : 'fine';
    state.pressed.push(k);
    if (who.errandFloors.every((f) => state.pressed.includes(f))) state.errand = 'tried';
    saveConcierge();
    return sticks ? 'sticks' : 'fine';
  }

  /** Coins in her Christmas box: thanked if she is in, and before the cellar key is the player's, they buy it. Returns what is said. */
  tipped(session: SessionActions): string {
    const state = conciergeState();
    state.tips += plan.lodge.tipBox.price;
    saveConcierge();
    // Her box is a gift to her (once a day it warms her; the rest of the day it is only thanked).
    nudge(PERSON, { ...TIP_THANKS, day: this.options.day(), reason: 'tip', why: 'thanks for the Christmas box' });
    const here = this.walker.isPresent && this.where.at === 'lodge';
    if (!here) return 'The coins clink into the tin. She will find them.';
    // She is at her window: a tip is as good as a hello (else the coins bought nothing but a thank-you).
    if (!hasKey('cellar')) {
      state.met = true;
      this.handOverKey(session, who.tipKey);
      return 'The coins clink into the tin.';
    }
    this.walker.speak(who.tipThanks);
    return 'The coins clink into the tin.';
  }
}
