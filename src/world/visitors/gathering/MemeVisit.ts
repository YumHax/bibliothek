import type * as THREE from 'three';
import type { FamilyStory } from '@/family/FamilyStory';
import type { AlbumPrint } from '@/grandma/albumPrints';
import { EPILOGUE_TALK } from '@/grandma/epilogueLines';
import { playShutter } from '@/photo/shutterSound';
import { MEME_ID } from '@/social/people/family';
import { nudge } from '@/social/standing';
import { fill } from '../friendLines';
import type { VisitRoute } from '../Visit';
import type { Friend } from '../Friend';
import { bodyOf, talkHook } from '../../people/socialHook';
import type { GatheringDeps } from './deps';
import { MEME_VISIT, MEME_VISITOR } from './memeVisitPlan';
import { Party } from './Party';

type Stop = VisitRoute['browse'][number];

/** What her visit needs besides the gatherings' own: the story, Félix's games, her album, a frame for her photo. */
export interface MemeVisitDeps {
  family: FamilyStory;
  /** Whether a game is one of Félix's (his notebook's). */
  isHis(id: string): boolean;
  /** Her album's prints (`grandma/albumPrints`): her photo goes in as the epilogue's. */
  prints: { add(print: AlbumPrint): void };
  /** The epilogue print's id. */
  printId: string;
  /** A frame rendered now (the 3D view as the player sees it), for her photo; null when there is none. */
  frame(): HTMLCanvasElement | null;
}

/**
 * MÉMÉ COMES TO SEE THE FLAT (docs/grandma.md "The end of the story"): on her Saturday (planned at hers, `FamilyStory`),
 * in the afternoon, she climbs the five floors slowly and rings; let in, she says a word on the kitchen, stops at the
 * shelves (Félix's games she knows by their boxes) and the window, sits down (a word for the cat or the TV) and asks
 * for her photo for the album: the player takes it from where they stand (`Take her photo for the album`), and it goes
 * on her album's last page. Then the 38 home. Nobody answering, she tries the next Saturday; after her first visit she
 * drops in now and then.
 */
export class MemeVisit {
  readonly party: Party;
  private readonly body: Friend;
  private readonly first: boolean;
  private seatedAt = -1;
  private asked = false;
  private photo = false;
  private finished = false;
  private came = false;

  constructor(
    private readonly deps: GatheringDeps,
    private readonly meme: MemeVisitDeps,
    private readonly day: number,
  ) {
    const { host } = deps;
    const visit = this;
    this.first = !meme.family.visited;
    this.party = new Party(host, {
      enterLine: () => (visit.first ? EPILOGUE_TALK.visit.kitchen : host.line('meme:again', EPILOGUE_TALK.visit.enterAgain)),
      browse: (_, kind, at, yaw) => visit.browse(kind, at, yaw),
      sitLine: () => visit.sat(),
      leaveLine: () => host.line('meme:leave', EPILOGUE_TALK.visit.leave),
      chat: () => (visit.photoOpen() ? EPILOGUE_TALK.visit.photoAsk : host.line('meme:chat', EPILOGUE_TALK.visit.chat)),
      visitOptions: () => ({ sits: true, stops: () => visit.route(), ...(meme.family.photoTaken ? {} : { stayUntil: { done: () => visit.photo, max: MEME_VISIT.waitPhoto } }) }),
      cameIn: () => visit.letIn(),
      gaveUp: () => {
        host.options.notices?.react(EPILOGUE_TALK.visit.gaveUp);
        meme.family.missed(day);
      },
    });
    const member = this.party.add(MEME_VISITOR, 0);
    this.body = member.friend;
    this.body.talker =
      talkHook(deps.social, MEME_ID, () => ({
        person: MEME_ID,
        place: 'flat',
        body: bodyOf(member.friend),
        extras: [{ id: 'meme:photo', group: 'invite', label: EPILOGUE_TALK.visit.photoLabel, disabled: () => (visit.photoOpen() ? null : 'not now'), run: () => ({ line: visit.takePhoto(), close: true }) }],
      })) ?? null;
    // Without the social layer, a click once she has asked takes it.
    const chat = this.body.chat;
    this.body.chat = () => (this.photoOpen() ? this.takePhoto() : (chat?.() ?? EPILOGUE_TALK.visit.chat[0]));
  }

  get done(): boolean {
    return this.party.done;
  }

  update(dt: number): void {
    this.party.update(dt);
    if (this.seatedAt >= 0 && !this.asked && !this.meme.family.photoTaken && this.party.time - this.seatedAt > MEME_VISIT.askAfter) {
      this.asked = true;
      this.deps.host.say(MEME_VISITOR, EPILOGUE_TALK.visit.photoAsk, 'hi', true);
    }
  }

  finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.body.talker = null;
    if (!this.came) return;
    const { host } = this.deps;
    if (this.first) {
      this.meme.family.note(EPILOGUE_TALK.visit.note, 'headline');
      // Her photo in the album (a frame that could not be read leaves it for her next visit).
      if (this.photo && this.meme.family.photoTaken) host.options.notices?.reward({ ...EPILOGUE_TALK.visit.reward, big: true });
    }
    nudge(MEME_ID, { warmth: 8, trust: 5, why: 'you had her round', reason: 'flatVisit', day: this.day, memory: this.first ? 'I came to see the flat' : undefined, memoryWeight: 20 });
  }

  /** Let in: her visit counted. */
  private letIn(): void {
    this.came = true;
    this.meme.family.came(this.day);
  }

  /** The shelves (nearest two) and the window. */
  private route(): Stop[] {
    const browse = this.deps.host.route.browse;
    const shelves = browse.filter((b) => b.kind === 'shelf').slice(0, 2);
    const window = browse.find((b) => b.kind === 'window');
    return window ? [...shelves, window] : shelves;
  }

  /** At a stop: Félix's games by their boxes, the others, the street. */
  private browse(kind: 'shelf' | 'window', at: THREE.Vector3, yaw: number): { look: THREE.Vector3 | null; line: string | null } {
    const { host } = this.deps;
    const seen = host.browse(MEME_VISITOR, kind, at, yaw);
    if (kind === 'window') return { look: seen.look, line: host.line('meme:window', EPILOGUE_TALK.visit.window) };
    const game = seen.game;
    const his = game && this.meme.isHis(game.id);
    const line = his ? host.line('meme:his', EPILOGUE_TALK.visit.his) : host.line('meme:shelf', EPILOGUE_TALK.visit.shelf);
    return { look: seen.look, line: fill(line, { title: game?.title ?? 'That one' }) };
  }

  /** Sat down: a word for the cat if it is about, else the TV. */
  private sat(): string {
    this.seatedAt = this.party.time;
    return this.deps.host.greetCat() !== null ? EPILOGUE_TALK.visit.cat : EPILOGUE_TALK.visit.tv;
  }

  /** Seated, asked, and not taken yet (this visit and for good). */
  private photoOpen(): boolean {
    return this.asked && !this.photo && !this.meme.family.photoTaken;
  }

  /** The frame as the player sees it, into her album's last page; her word on it. */
  private takePhoto(): string {
    if (!this.photoOpen()) return EPILOGUE_TALK.visit.chat[0];
    this.photo = true;
    const image = this.print();
    playShutter();
    if (image) {
      this.meme.prints.add({ id: this.meme.printId, caption: EPILOGUE_TALK.visit.caption, image, day: this.day });
      this.meme.family.photographed();
    }
    return EPILOGUE_TALK.visit.photoTaken;
  }

  /** The middle of the frame at 4:3, small, as a JPEG data URL (the video cut-outs black). */
  private print(): string | null {
    try {
      const frame = this.meme.frame();
      if (!frame) return null;
      const { width, height, quality } = MEME_VISIT.print;
      const out = document.createElement('canvas');
      out.width = width;
      out.height = height;
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      const scale = Math.min(frame.width / width, frame.height / height);
      const w = width * scale;
      const h = height * scale;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(frame, (frame.width - w) / 2, (frame.height - h) / 2, w, h, 0, 0, width, height);
      return out.toDataURL('image/jpeg', quality);
    } catch (error) {
      console.warn('[visitors] no photo of Mémé', error);
      return null;
    }
  }
}
