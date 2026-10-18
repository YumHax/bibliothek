import { KEYS, PersistedStore } from '@/persistence';

/** A cart's save RAM, as the NES maps it (0x6000-0x7FFF). */
const SRAM_BYTES = 0x2000;

function readSaves(data: unknown): Record<string, string> | null {
  if (!data || typeof data !== 'object') return null;
  const saves: Record<string, string> = {};
  for (const [rom, text] of Object.entries(data as Record<string, unknown>)) if (typeof text === 'string') saves[rom] = text;
  return saves;
}

const store = new PersistedStore<Record<string, string>>({ key: KEYS.nesBattery, version: 1, defaults: () => ({}), read: readSaves });
let saves: Record<string, string> | null = null;

/**
 * The homebrew carts' battery saves (docs/media.md "Homebrew carts"): a cart with a battery (its header says so) keeps
 * its 8 KB of save RAM in the save file, by ROM, as base64, so its saved game outlives the page as the real cart's does.
 */
export function batteryOf(rom: string): Uint8Array | null {
  saves ??= store.load();
  const text = saves[rom];
  if (!text) return null;
  try {
    const bytes = Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
    return bytes.length === SRAM_BYTES ? bytes : null;
  } catch {
    return null;
  }
}

/** Keeps `rom`'s save RAM (`SRAM_BYTES`). */
export function keepBattery(rom: string, sram: ArrayLike<number>): void {
  saves ??= store.load();
  let text = '';
  for (let i = 0; i < SRAM_BYTES; i++) text += String.fromCharCode((sram[i] ?? 0) & 0xff);
  saves[rom] = btoa(text);
  store.save(saves);
}
