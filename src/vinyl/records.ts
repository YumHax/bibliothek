/**
 * The video-game soundtrack LPs the flea market's household stall sells, one at a time from its crate (`record` in
 * `economy/homeGoods`: the nth bought is `RECORDS[n]`), played on the sideboard's turntable (`world/vinyl`). Original
 * music only: every track is made up as it plays (`RecordTune`), the same each time from the record's id and the
 * track's number, in the style of a console's sound chip (`era`). The pressings, labels and composers are invented.
 */

/** Whose sound chip a record's tracks are written for (see `RecordTune`'s styles). */
export type Era = 'nes' | 'gb' | 'snes' | 'megadrive' | 'n64' | 'ps1';

export interface Soundtrack {
  id: string;
  title: string;
  /** The (made-up) composer on the sleeve. */
  artist: string;
  /** The (made-up) label and year on the sleeve's back. */
  label: string;
  year: number;
  era: Era;
  /** Major (bright) or minor (brooding) keys throughout. */
  mood: 'major' | 'minor';
  /** The sleeve's ground and ink, and the centre label's colour. */
  sleeve: { ground: number; ink: number; label: number };
  /** Side A, in order. */
  tracks: string[];
}

export const RECORDS: readonly Soundtrack[] = [
  {
    id: 'pixel-overture', title: 'Pixel Overture', artist: 'K. Tanabe', label: 'Cartridge Records', year: 1987, era: 'nes', mood: 'major',
    sleeve: { ground: 0xd8302a, ink: 0xfff4d6, label: 0xffd23a },
    tracks: ['World 1 Theme', 'Underground Pipes', 'Castle Gate', 'Ending Fanfare'],
  },
  {
    id: 'pocket-melodies', title: 'Pocket Melodies', artist: 'Mina Okada', label: 'Link Cable Music', year: 1990, era: 'gb', mood: 'major',
    sleeve: { ground: 0x9bbc0f, ink: 0x0f380f, label: 0x306230 },
    tracks: ['Route Two', 'Rainy Town', 'Trade Centre', 'The Long Way Home'],
  },
  {
    id: 'mode-seven-skies', title: 'Mode 7 Skies', artist: 'Hiro Sakamura', label: 'Sixteen Bit Sound', year: 1993, era: 'snes', mood: 'minor',
    sleeve: { ground: 0x3a2f7a, ink: 0xe8e0ff, label: 0xb8a0ff },
    tracks: ['Airship Departure', 'Crystal Caves', 'The Old Kingdom', 'Over the Clouds'],
  },
  {
    id: 'blast-processing', title: 'Blast Processing', artist: 'DJ Yamato', label: 'Genesis Tapes', year: 1992, era: 'megadrive', mood: 'minor',
    sleeve: { ground: 0x101418, ink: 0x2fd0ff, label: 0xe8302a },
    tracks: ['Turbo Zone', 'Chemical Rush', 'Night Highway', 'Final Boss: Overdrive'],
  },
  {
    id: 'polygon-dreams', title: 'Polygon Dreams', artist: 'Clara Weiss', label: 'Expansion Pak', year: 1997, era: 'n64', mood: 'major',
    sleeve: { ground: 0x2a6a3a, ink: 0xfff2c8, label: 0x3a8ad8 },
    tracks: ['Lake Shore', 'Peach Garden', 'Ice Slide', 'Starlight Ending'],
  },
  {
    id: 'memory-card-blues', title: 'Memory Card Blues', artist: 'Sato & Lime', label: 'Disc Two', year: 1998, era: 'ps1', mood: 'minor',
    sleeve: { ground: 0x1a1a22, ink: 0xc0c4d8, label: 0x8a2ad8 },
    tracks: ['Loading', 'Neon District', 'Rain on the Overpass', 'Save and Quit'],
  },
  {
    id: 'boss-rush', title: 'Boss Rush', artist: 'Team Eight', label: 'Cartridge Records', year: 1989, era: 'nes', mood: 'minor',
    sleeve: { ground: 0x1e1e24, ink: 0xff6a2a, label: 0xffffff },
    tracks: ['Gatekeeper', 'Clockwork Tower', 'Wily Waltz', 'Last Life'],
  },
  {
    id: 'save-point-lullabies', title: 'Save Point Lullabies', artist: 'Hiro Sakamura', label: 'Sixteen Bit Sound', year: 1995, era: 'snes', mood: 'major',
    sleeve: { ground: 0xf0e2c0, ink: 0x5a3a28, label: 0xd88a5a },
    tracks: ['Inn at Dusk', 'Campfire', 'The Mapmaker', 'Morning, Again'],
  },
];

export function recordOf(id: string): Soundtrack | undefined {
  return RECORDS.find((r) => r.id === id);
}
