import type { SessionActions } from '@/game/SessionActions';
import type { NoticeActions, ReadingNotice } from '@/notices';
import { readMs } from '@/notices';
import type { MailPiece } from '@/world/props/MailDrop';
import type { FaceKey, GestureName } from '@/world/people/motion/gestures';
import { giveKeepsake, hasKeepsake, keepsakeFor, noteOnce, pendingScenes, queueScene, sceneDone, type KeepsakeDef, type PendingScene } from '../keepsakes';
import { findPerson, shortName } from '../people';
import { talkingWith } from '../talkState';
import type { PersonId, SocialChange, TierId } from '../types';
import { CLOSE_INVITES, COOLING_NOTES, DOOR_GOODBYES, DOOR_OPENERS, FRIENDLY_NOTES, MISSED_LINES, POSTED_LINES, WELCOME_THANKS, lineFor, sceneVoice, type SceneVoice } from './sceneLines';
import { tier as tierNow } from '../standing';
import { atLeast } from '../tiers';
import { capitalise } from '@/text/strings';
import { inHours } from '@/time/clock';

/*
 * A tier reached is staged, not only announced (docs/social.md "Tier scenes"): someone who becomes a friend or a close
 * friend comes up to the flat's door one evening, says a word and hands over their keepsake (`keepsakes`: it goes on
 * the fridge; a close friend's is often a photo taken there and then), and only once they have gone back down does
 * the reward banner come. Someone who does not come to the door (a shopkeeper, Victor, Mémé across town) posts theirs:
 * an envelope under the door, the banner at once. Friendly is smaller: a note under the door, for the neighbours and
 * the old friends. A friendship that falls to Cold or lower is no scene either: their note, in their hand, under
 * the door, saying what it costs now. Nothing of it happens while a conversation is open (`talkState`). The scenes
 * still to play are saved (`keepsakes.pendingScenes`); the world hands its stage in once built (`setSceneStage`).
 */

/** The body of someone at the door, as a scene moves it (`world/stairwell/DoorVisitor`'s walker). */
interface SceneWalker {
  speak(text: string): void;
  gesture(name: GestureName): void;
  feel(face: FaceKey, seconds: number): void;
  nod(): void;
}

/** A visit to the door (the shape `DoorVisitor.come` takes). */
interface SceneVisit {
  who: string;
  knocks: number;
  answer(session: SessionActions, walker: SceneWalker): number;
  gaveUp(walker: SceneWalker): void;
  leaving?(walker: SceneWalker): void;
  gone?(): void;
}

/** Someone who can come up to the door: one person's `DoorVisitor`. */
export interface SceneVisitor {
  readonly busy: boolean;
  come(visit: SceneVisit): boolean;
}

/** What the world gives the scenes (`bootstrap/worldLife`). */
interface SceneStage {
  /** A note or an envelope under the flat's door (`Doorstep.slipNote`: onto the hallway's mat). */
  slipNote(piece: MailPiece): void;
  /** `id`'s body to come up the stairs to the door, or null for now (the stairs not loaded: the scene waits). */
  visitorFor(id: PersonId): SceneVisitor | null;
  /** The player is in the flat. */
  atHome(): boolean;
  hour(): number;
  day(): number;
  /** The frame as the player sees it now (a close friend's photo at the door), or null. */
  snapshot?(): HTMLCanvasElement | null;
  /** The keepsake drawn as it will hang on the fridge (`photo`: a close friend's print, drawn in once loaded), for the slip. */
  keepsakePicture?(def: KeepsakeDef, giver: string, key: string, photo?: string): HTMLCanvasElement;
  notices: Pick<NoticeActions, 'slip'>;
}

/** When a door scene may play: evenings at home (a scene waiting `ANY_HOUR_AFTER` days plays any waking hour). */
const EVENING: readonly [number, number] = [17, 22.5];
const WAKING: readonly [number, number] = [9, 22.5];
const ANY_HOUR_AFTER = 2;
/** After this many game days without the player at home in the hours, the keepsake is posted instead. */
const POST_AFTER = 4;
/** A close friend's photo is taken this long (s) after the door opens (it has swung open by then). */
const PHOTO_DELAY = 1.4;
/** A print's width in px (the save keeps it as a small JPEG). */
const PRINT_WIDTH = 256;

let stage: SceneStage | null = null;
let banner: ((id: PersonId, before: TierId, after: TierId) => void) | null = null;
/** The scene at the door now, and the photo it waits to take. */
let playing: { scene: PendingScene; answered: boolean; photoIn: number | null } | null = null;

/** How a tier's banner is shown once its scene is over (`announce.announceTiers` registers it). */
export function useTierBanner(show: (id: PersonId, before: TierId, after: TierId) => void): void {
  banner = show;
}

/** The world's stage for the scenes, until the returned removal. */
export function setSceneStage(given: SceneStage): () => void {
  stage = given;
  return () => {
    if (stage === given) stage = null;
  };
}

/** Whose words `id`'s scene is in (a neighbour's, by default). */
function voiceOf(id: PersonId): SceneVoice {
  const card = findPerson(id);
  return card ? sceneVoice(card) : 'neighbour';
}

/** Whether `id` comes up to the door for their scene: the building's people (who live here) and the old friends. */
function comesToDoor(id: PersonId): boolean {
  const card = findPerson(id);
  if (!card || card.family) return false;
  if (card.group === 'building') return id !== 'claire';
  return card.group === 'friends';
}

/** Whether a friendly note is theirs to slip: someone close to home (the building, the old friends), not family. */
function writesNotes(id: PersonId): boolean {
  return comesToDoor(id) || findPerson(id)?.depth === 'deep';
}

/** "Mrs Roux’s", "Inès’", "the Moreaus’". */
function possessive(name: string): string {
  return /s$/i.test(name) ? `${name}’` : `${name}’s`;
}

/**
 * A tier reached (`announce` asks before its banner): true when a scene will show it (the banner then comes at the
 * scene's end), false when the banner is for now. A friendly note is slipped as well, without holding the banner.
 */
export function stageTierUp(change: SocialChange): boolean {
  const { id, after, before } = change;
  const day = stage?.day() ?? 0;
  if (after === 'friend' || after === 'close') {
    if (!keepsakeFor(id, after) || hasKeepsake(id, after)) return false;
    queueScene({ person: id, tier: after, before, day });
    return true;
  }
  if (after === 'friendly' && writesNotes(id)) queueScene({ person: id, tier: 'friendly', before, day });
  return false;
}

/**
 * A friendship fallen to Cold or lower (`announce` asks before its card): true when it went as their note under the
 * door (someone close to home), false when the card is for now.
 */
export function slipCoolingNote(change: SocialChange, card: ReadingNotice): boolean {
  if (!stage || !writesNotes(change.id)) return false;
  const card0 = findPerson(change.id);
  if (!card0) return false;
  const notes = COOLING_NOTES[voiceOf(change.id)];
  const lines = notes[change.after] ?? notes.cold ?? COOLING_NOTES.neighbour.cold!;
  stage.slipNote({ look: 'letter', title: card.title ?? `A note from ${shortName(change.id)}`, lines: [lineFor(change.id, lines, stage.day())], from: card0.name, hand: 'pen', ...(card.effect ? { effect: card.effect } : {}) });
  return true;
}

/** The scenes' clock (`bootstrap/worldLife` ticks it): the posted ones go out, a door scene starts when it may. */
export function tickScenes(dt: number): void {
  const s = stage;
  if (!s || talkingWith()) return;
  if (playing?.photoIn !== null && playing?.photoIn !== undefined) {
    playing.photoIn -= dt;
    if (playing.photoIn <= 0) takePhoto(playing);
  }
  const day = s.day();
  for (const scene of pendingScenes()) {
    if (playing?.scene === scene || (scene.notBefore !== undefined && day < scene.notBefore)) continue;
    if (!atTheDoor(scene) || day - scene.day > POST_AFTER) post(s, scene);
  }
  if (playing || !s.atHome()) return;
  const hour = s.hour();
  const scene = pendingScenes().find((p) => atTheDoor(p) && inHours(hour, day - p.day >= ANY_HOUR_AFTER ? WAKING : EVENING));
  if (scene) startDoorScene(s, scene);
}

/** Whether `scene` is played at the door (a friend's, a close friend's, Mme Pereira's thanks), not posted. */
function atTheDoor(scene: PendingScene): boolean {
  return (scene.tier === 'friend' || scene.tier === 'close' || scene.tier === 'acquaintance') && comesToDoor(scene.person);
}

/**
 * The first day's promise kept (`onboarding/firstWelcome`): Mme Pereira comes up that evening to say thank you (her
 * first rise, Polite to Acquaintance, is its banner), and the next morning her welcome note is under the door and on
 * the fridge, the first keepsake of all.
 */
export function welcomeKept(person: PersonId, day: number): void {
  queueScene({ person, tier: 'acquaintance', before: 'polite', day });
  queueScene({ person, tier: 'welcome', before: 'polite', day, notBefore: day + 1 });
}

/**
 * `?debug`'s Social lab (`cheats/socialLab`): `person`'s scene of their tier now, at once, wherever the player is (a
 * keepsake already had is not given twice). False when there is no stage, a scene is playing, or nothing to stage.
 */
export function playSceneNow(person: PersonId): boolean {
  const s = stage;
  if (!s || playing) return false;
  const now = tierNow(person);
  const tier = atLeast(now, 'close') && keepsakeFor(person, 'close') ? 'close' : keepsakeFor(person, 'friend') ? 'friend' : keepsakeFor(person, 'acquaintance') ? 'acquaintance' : null;
  if (!tier) return false;
  const scene: PendingScene = { person, tier, before: 'polite', day: s.day() };
  sceneDone(scene);
  queueScene(scene);
  const queued = pendingScenes().find((p) => p.person === person && p.tier === tier) ?? scene;
  // At the door when someone can come up the stairs now, else under it.
  if (atTheDoor(queued) && s.visitorFor(person)) startDoorScene(s, queued);
  else post(s, queued);
  return true;
}

/** A scene that does not come to the door: a friendly note, or the keepsake in an envelope, under the door. */
function post(s: SceneStage, scene: PendingScene): void {
  const card = findPerson(scene.person);
  sceneDone(scene);
  if (!card) return;
  if (scene.tier === 'friendly') {
    if (noteOnce(scene.person)) s.slipNote({ look: 'letter', title: `A note from ${shortName(scene.person)}`, lines: [lineFor(scene.person, FRIENDLY_NOTES[voiceOf(scene.person)])], from: card.name, hand: 'pen', effect: 'Kept, in the kitchen drawer.' });
    return;
  }
  // Mme Pereira's thanks not said at the door (the player out for days): its banner only.
  if (scene.tier === 'acquaintance') {
    banner?.(scene.person, scene.before, 'acquaintance');
    return;
  }
  // Her welcome note, the morning after.
  if (scene.tier === 'welcome') {
    const welcome = keepsakeFor(scene.person, 'acquaintance');
    if (welcome && giveKeepsake(scene.person, 'acquaintance', s.day())) s.slipNote(envelope(scene.person, card.name, welcome, lineFor(scene.person, POSTED_LINES)));
    return;
  }
  const def = keepsakeFor(scene.person, scene.tier);
  if (!def || !giveKeepsake(scene.person, scene.tier, s.day())) return;
  s.slipNote(envelope(scene.person, card.name, def, lineFor(scene.person, POSTED_LINES)));
  banner?.(scene.person, scene.before, scene.tier);
}

/** Their keepsake's envelope: what they said giving it, and a word on where it is. */
function envelope(id: PersonId, name: string, def: KeepsakeDef, line: string): MailPiece {
  const postcard = def.kind === 'postcard';
  return {
    look: postcard ? 'postcard' : 'letter',
    title: `From ${shortName(id)}: ${def.name}`,
    lines: [def.giving, line],
    from: name,
    hand: 'pen',
    effect: `${capitalise(possessive(shortName(id)))} ${def.name} is on your fridge now.`,
    ...(postcard && def.place ? { place: def.place } : {}),
  };
}

/** Someone comes up the stairs and knocks, their keepsake in hand. */
function startDoorScene(s: SceneStage, scene: PendingScene): void {
  const visitor = s.visitorFor(scene.person);
  const thanks = scene.tier === 'acquaintance';
  const tier = scene.tier === 'close' ? 'close' : 'friend';
  const def = thanks ? null : keepsakeFor(scene.person, tier);
  const card = findPerson(scene.person);
  // Nobody to come up now (the stairs not loaded): it waits, and is posted after `POST_AFTER` days.
  if (!visitor || visitor.busy) return;
  if ((!def && !thanks) || !card) {
    post(s, scene);
    return;
  }
  const current = { scene, answered: false, photoIn: null as number | null };
  const ok = visitor.come({
    who: shortName(scene.person),
    knocks: 4,
    answer: (_session, walker) => {
      current.answered = true;
      const voice = voiceOf(scene.person);
      const lines = def ? [lineFor(scene.person, DOOR_OPENERS[voice][tier]), def.giving] : [...WELCOME_THANKS];
      if (def && tier === 'close') lines.push(lineFor(scene.person, CLOSE_INVITES[voice]));
      for (const line of lines) walker.speak(line);
      walker.gesture(tier === 'close' ? 'handsJoin' : 'claspHands');
      walker.feel({ smile: 0.9, browsUp: 0.4 }, 4);
      // A photo is taken once the door has swung open; anything else is given at once.
      if (def?.kind === 'photo' && s.snapshot) current.photoIn = PHOTO_DELAY;
      else if (def) handOver(s, scene, def);
      return lines.reduce((total, line) => total + readMs(line) / 1000, 1.5);
    },
    gaveUp: () => {
      // Out, or not answering: it is left under the door with a word.
      if (def && giveKeepsake(scene.person, tier, s.day())) s.slipNote(envelope(scene.person, card.name, def, lineFor(scene.person, MISSED_LINES)));
    },
    leaving: (walker) => {
      if (!current.answered) return;
      // The photo not taken yet (they were cut short): given without it.
      if (current.photoIn !== null && def) {
        current.photoIn = null;
        handOver(s, scene, def);
      }
      walker.speak(lineFor(scene.person, DOOR_GOODBYES[voiceOf(scene.person)]));
      walker.gesture('wave');
    },
    gone: () => {
      playing = null;
      sceneDone(scene);
      banner?.(scene.person, scene.before, thanks ? 'acquaintance' : tier);
    },
  });
  if (ok) playing = current;
}

/** The keepsake handed over at the door (with its photo, for a photo). */
function handOver(s: SceneStage, scene: PendingScene, def: KeepsakeDef, photo?: string): void {
  if (scene.tier !== 'friend' && scene.tier !== 'close') return;
  if (!giveKeepsake(scene.person, scene.tier, s.day(), photo)) return;
  // Drawn as the fridge draws it (`fridgeKeepsakes`: the same giver's name and key), so the slip shows what hangs there.
  const picture = s.keepsakePicture?.(def, shortName(scene.person), `${scene.person}:${scene.tier}`, photo);
  s.notices.slip({ title: `${capitalise(possessive(shortName(scene.person)))} ${def.name}`, detail: 'On your fridge now.', ...(picture ? { picture } : {}) });
}

/** A close friend's photo, the frame as the player sees it at the door, kept small. */
function takePhoto(current: NonNullable<typeof playing>): void {
  current.photoIn = null;
  const s = stage;
  const tier = current.scene.tier;
  const def = tier === 'friend' || tier === 'close' ? keepsakeFor(current.scene.person, tier) : null;
  if (!s || !def) return;
  handOver(s, current.scene, def, print(s.snapshot?.() ?? null));
}

/** A small square JPEG of the middle of `frame` (the photo's print), or undefined. */
function print(frame: HTMLCanvasElement | null): string | undefined {
  if (!frame?.width || !frame.height) return undefined;
  const side = Math.min(frame.width, frame.height);
  const out = document.createElement('canvas');
  out.width = PRINT_WIDTH;
  out.height = PRINT_WIDTH;
  const ctx = out.getContext('2d');
  if (!ctx) return undefined;
  ctx.drawImage(frame, (frame.width - side) / 2, (frame.height - side) / 2, side, side, 0, 0, PRINT_WIDTH, PRINT_WIDTH);
  try {
    const url = out.toDataURL('image/jpeg', 0.7);
    return url.startsWith('data:image/jpeg') ? url : undefined;
  } catch {
    return undefined;
  }
}
