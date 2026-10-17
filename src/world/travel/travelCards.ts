import { KEYS } from '@/persistence';
import { safeStorage } from '@/persistence/storage';
import type { ZoneKind } from '../worldPlan';
import type { ZoneId } from '../zoneIds';

/*
 * What the travel card shows of a place while its curtain is down (`ui/Fader`, docs/zones.md "Travel"): a small
 * photo of it as the player last left it (the frame grabbed on the way out, kept as a JPEG of `PHOTO_W` x `PHOTO_H`),
 * a word on where it is, and how long the last trip there took, so the card's bar keeps its pace. Kept on this
 * browser under `KEYS.travelCardsCache`, never in the save: an empty cache only means a card without a photo.
 */

const PHOTO_W = 384;
const PHOTO_H = 216;
const PHOTO_QUALITY = 0.62;
/** How much of a newly measured trip goes into the remembered time (one slow trip does not stick). */
const BLEND = 0.6;

interface CardMemory {
  photo?: string;
  ms?: number;
}

let cards: Partial<Record<ZoneId, CardMemory>> | null = null;

function loaded(): Partial<Record<ZoneId, CardMemory>> {
  if (cards) return cards;
  cards = {};
  try {
    const parsed: unknown = JSON.parse(safeStorage()?.getItem(KEYS.travelCardsCache) ?? 'null');
    if (parsed && typeof parsed === 'object') {
      for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
        const v = value as CardMemory;
        cards[id as ZoneId] = {
          photo: typeof v?.photo === 'string' && v.photo.startsWith('data:image/jpeg') ? v.photo : undefined,
          ms: typeof v?.ms === 'number' && v.ms > 0 ? v.ms : undefined,
        };
      }
    }
  } catch {
    // Unreadable: cards without photos until the next trips take some.
  }
  return cards;
}

function store(): void {
  try {
    safeStorage()?.setItem(KEYS.travelCardsCache, JSON.stringify(loaded()));
  } catch {
    // Full or blocked: the photos live for this visit only.
  }
}

/** Keeps the middle of `frame` (the 3D view as it was just drawn) as `id`'s photo. */
export function rememberPhoto(id: ZoneId, frame: HTMLCanvasElement | null): void {
  if (!frame?.width || !frame.height) return;
  const out = document.createElement('canvas');
  out.width = PHOTO_W;
  out.height = PHOTO_H;
  const ctx = out.getContext('2d');
  if (!ctx) return;
  // The widest 16:9 crop of the frame's middle.
  const scale = Math.min(frame.width / PHOTO_W, frame.height / PHOTO_H);
  const w = PHOTO_W * scale;
  const h = PHOTO_H * scale;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, PHOTO_W, PHOTO_H);
  ctx.drawImage(frame, (frame.width - w) / 2, (frame.height - h) / 2, w, h, 0, 0, PHOTO_W, PHOTO_H);
  try {
    const url = out.toDataURL('image/jpeg', PHOTO_QUALITY);
    if (!url.startsWith('data:image/jpeg')) return;
    const all = loaded();
    all[id] = { ...all[id], photo: url };
    store();
  } catch {
    // A tainted or lost canvas: no photo this time.
  }
}

/** A trip to `id` took `ms`: the next card's bar is paced on it. */
export function rememberTripTime(id: ZoneId, ms: number): void {
  const all = loaded();
  const old = all[id]?.ms;
  all[id] = { ...all[id], ms: Math.round(old ? old * (1 - BLEND) + ms * BLEND : ms) };
  store();
}

/** What the card shows of `id`: its photo if one was taken, and how long the last trip there took. */
export function cardOf(id: ZoneId): CardMemory {
  return loaded()[id] ?? {};
}

/** Where a place is, in a few words, above its name on the card (none when the name says it already). */
export function placeWords(kind: ZoneKind): string {
  switch (kind) {
    case 'collectionRoom':
    case 'hallway':
    case 'bathroom':
    case 'bedroom':
    case 'kitchen':
    case 'balcony':
      return 'Home';
    case 'stairwell':
    case 'courtyard':
    case 'cellar':
    case 'attic':
    case 'roof':
    case 'neighbourFlat':
    case 'annex':
    case 'annexStudy':
      return 'The building';
    case 'street':
    case 'arcade':
    case 'market':
    case 'shop':
    case 'replayShop':
    case 'saleroom':
      return 'Front Street';
    case 'grandmaFlat':
    case 'lindenAvenue':
    case 'lindenLanding':
      return 'Linden Avenue';
    case 'sellerFlat':
      return 'Across town';
  }
}
