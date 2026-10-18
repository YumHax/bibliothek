import type { PlatformId } from '@/catalog/types';
import type { ToolId } from '@/repair/consoles';
import { CONSOLES } from '@/repair/consoles';

/*
 * The repair panels' drawings, as SVG text (`raw`: nothing in them comes from the player): the bench tray's tools,
 * drawn in the bench's own inks instead of the system's emoji, and each console's silhouette as the counter and the
 * kitchen table show it (`ConsoleDeskPanel`, `RepairPanel`'s empty table).
 */

/** The bench's inks: wood, steel, the cleaner's blue, the iron's glow, cotton, cardboard. */
const INK = { line: '#2a2622', steel: '#a8b0b8', steelDark: '#5a6068', wood: '#b07a46', woodDark: '#7a4e2a', blue: '#3f74b8', red: '#c8463a', glow: '#f0a040', cotton: '#f4f1ea', card: '#c9a46a', cardDark: '#9a7a48', green: '#2f6b45' } as const;

/** The tray's tools, 48 x 48: a brush by its can of cleaner, the soldering iron on its cord, the box of spares, two cotton buds by their bottle, a screwdriver. */
const TOOL_ART: Readonly<Record<ToolId, string>> = {
  brush:
    `<rect x="27" y="20" width="14" height="22" rx="2" fill="${INK.blue}" stroke="${INK.line}" stroke-width="1.5"/><rect x="30" y="15" width="8" height="6" fill="${INK.steel}" stroke="${INK.line}" stroke-width="1.5"/><rect x="29" y="27" width="10" height="7" fill="${INK.cotton}"/>` +
    `<g transform="rotate(-35 16 26)"><rect x="13" y="20" width="6" height="22" rx="2" fill="${INK.wood}" stroke="${INK.line}" stroke-width="1.5"/><rect x="12.5" y="15" width="7" height="6" fill="${INK.steel}" stroke="${INK.line}" stroke-width="1.2"/><path d="M13 15 L12 6 M15 15 L15 5 M17 15 L17 5 M19 15 L20 6" stroke="${INK.woodDark}" stroke-width="1.6" stroke-linecap="round"/></g>`,
  iron:
    `<path d="M6 42 C 12 30, 4 24, 14 20" stroke="${INK.line}" stroke-width="2" fill="none" stroke-linecap="round"/><g transform="rotate(-40 26 24)"><rect x="12" y="20" width="18" height="8" rx="3" fill="${INK.red}" stroke="${INK.line}" stroke-width="1.5"/><rect x="30" y="21.5" width="8" height="5" fill="${INK.steel}" stroke="${INK.line}" stroke-width="1.2"/><path d="M38 24 L45 24" stroke="${INK.steelDark}" stroke-width="2.4" stroke-linecap="round"/><circle cx="45.5" cy="24" r="2.2" fill="${INK.glow}"/></g>` +
    `<path d="M38 8 q 2 3 0 6 M42 6 q 2 3 0 6" stroke="${INK.steelDark}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.7"/>`,
  spare:
    `<path d="M6 20 L24 14 L42 20 L42 40 L24 46 L6 40 Z" fill="${INK.card}" stroke="${INK.line}" stroke-width="1.5" stroke-linejoin="round"/><path d="M6 20 L24 26 L42 20 M24 26 V46" stroke="${INK.cardDark}" stroke-width="1.5" fill="none"/>` +
    `<rect x="14" y="8" width="12" height="9" rx="1" fill="#1c1c1c" stroke="${INK.line}" stroke-width="1"/><path d="M15.5 17 v3 M18.5 17 v3 M21.5 17 v3 M24.5 17 v3" stroke="${INK.steel}" stroke-width="1.2"/><rect x="28" y="10" width="11" height="5" rx="2.5" fill="#cfe3ea" stroke="${INK.steelDark}" stroke-width="1.2"/>`,
  swab:
    `<rect x="30" y="16" width="12" height="26" rx="3" fill="${INK.cotton}" stroke="${INK.line}" stroke-width="1.5"/><rect x="32" y="10" width="8" height="7" rx="1" fill="${INK.blue}" stroke="${INK.line}" stroke-width="1.2"/><rect x="31.5" y="24" width="9" height="9" fill="${INK.green}" opacity="0.6"/>` +
    `<g stroke="${INK.line}" stroke-width="1.2"><path d="M8 40 L24 10" stroke="${INK.cotton}" stroke-width="2.4"/><ellipse cx="7" cy="42" rx="2.6" ry="3.6" transform="rotate(28 7 42)" fill="${INK.cotton}"/><ellipse cx="25" cy="8" rx="2.6" ry="3.6" transform="rotate(28 25 8)" fill="${INK.cotton}"/>` +
    `<path d="M12 42 L22 16" stroke="${INK.cotton}" stroke-width="2.4"/><ellipse cx="11.5" cy="44" rx="2.6" ry="3.6" transform="rotate(20 11.5 44)" fill="${INK.cotton}"/><ellipse cx="22.5" cy="14" rx="2.6" ry="3.6" transform="rotate(20 22.5 14)" fill="${INK.cotton}"/></g>`,
  screwdriver:
    `<g transform="rotate(-45 24 24)"><rect x="4" y="19" width="18" height="10" rx="4" fill="${INK.red}" stroke="${INK.line}" stroke-width="1.5"/><path d="M8 21 v6 M12 21 v6 M16 21 v6" stroke="#8a2a22" stroke-width="1.2"/><rect x="22" y="22.5" width="20" height="3" fill="${INK.steel}" stroke="${INK.line}" stroke-width="1"/><path d="M42 21.5 L46 24 L42 26.5 Z" fill="${INK.steelDark}"/></g>`,
};

/** A tool of the tray, drawn: `<svg>` text for a button (it carries its name in words beside it). */
export function toolArt(id: ToolId): string {
  return `<svg class="repair__tool-art" viewBox="0 0 48 48" aria-hidden="true">${TOOL_ART[id]}</svg>`;
}

/** Each console from the front and a little above, 120 x 72: its shell and band colours from `CONSOLES`. */
function consoleShape(platform: PlatformId): string {
  const { shell, band } = CONSOLES[platform];
  const line = INK.line;
  switch (platform) {
    case 'nes':
      return `<rect x="10" y="18" width="100" height="44" rx="3" fill="${shell}" stroke="${line}" stroke-width="2"/><rect x="10" y="44" width="100" height="18" rx="2" fill="${band}"/><rect x="28" y="22" width="64" height="16" rx="1.5" fill="${band}" opacity="0.85"/><rect x="18" y="49" width="10" height="5" fill="${shell}"/><rect x="31" y="49" width="10" height="5" fill="${shell}"/><circle cx="16" cy="40" r="1.6" fill="${INK.red}"/><rect x="72" y="48" width="12" height="6" rx="1" fill="#1c1c1c"/><rect x="88" y="48" width="12" height="6" rx="1" fill="#1c1c1c"/>`;
    case 'snes':
      return `<path d="M12 30 Q 12 18 28 18 H 92 Q 108 18 108 30 V 52 Q 108 62 96 62 H 24 Q 12 62 12 52 Z" fill="${shell}" stroke="${line}" stroke-width="2"/><rect x="36" y="22" width="48" height="12" rx="3" fill="#8f8c86" stroke="${line}" stroke-width="1"/><rect x="22" y="40" width="14" height="6" rx="3" fill="${band}"/><rect x="84" y="40" width="14" height="6" rx="3" fill="${band}"/><rect x="32" y="54" width="12" height="5" rx="1" fill="#6a6762"/><rect x="76" y="54" width="12" height="5" rx="1" fill="#6a6762"/>`;
    case 'n64':
      return `<path d="M10 40 Q 14 22 36 20 H 84 Q 106 22 110 40 L 106 60 H 14 Z" fill="${shell}" stroke="${line}" stroke-width="2"/><rect x="40" y="16" width="40" height="14" rx="3" fill="${band}" stroke="#111" stroke-width="1.5"/><rect x="46" y="20" width="28" height="4" fill="#111"/><rect x="22" y="52" width="10" height="5" rx="1" fill="#1a1a1e"/><rect x="40" y="52" width="10" height="5" rx="1" fill="#1a1a1e"/><rect x="70" y="52" width="10" height="5" rx="1" fill="#1a1a1e"/><rect x="88" y="52" width="10" height="5" rx="1" fill="#1a1a1e"/>`;
    case 'megadrive':
      return `<rect x="8" y="26" width="104" height="36" rx="6" fill="${shell}" stroke="${line}" stroke-width="2"/><ellipse cx="60" cy="34" rx="30" ry="14" fill="#2a2a2e" stroke="${band}" stroke-width="3"/><rect x="44" y="30" width="32" height="6" rx="1" fill="#0e0e10"/><rect x="16" y="50" width="16" height="5" rx="1" fill="#2c2c30"/><rect x="88" y="50" width="16" height="5" rx="1" fill="#2c2c30"/><circle cx="84" cy="44" r="1.6" fill="${INK.red}"/>`;
    case 'gb':
      return `<path d="M42 4 H 80 Q 84 4 84 8 V 60 Q 84 68 70 68 H 42 Q 38 68 38 64 V 8 Q 38 4 42 4 Z" fill="${shell}" stroke="${line}" stroke-width="2"/><rect x="44" y="9" width="34" height="27" rx="2" fill="${band}"/><rect x="50" y="13" width="22" height="19" fill="#8b9a5a"/><path d="M45 47 h 10 M50 42 v 10" stroke="#1c1c20" stroke-width="3.4"/><circle cx="70" cy="49" r="3" fill="#8a1f4a"/><circle cx="77" cy="45" r="3" fill="#8a1f4a"/><path d="M58 60 l 4 -2 M64 60 l 4 -2" stroke="#6a6a72" stroke-width="2" stroke-linecap="round"/>`;
    case 'ps1':
      return `<rect x="10" y="22" width="100" height="40" rx="4" fill="${shell}" stroke="${line}" stroke-width="2"/><circle cx="54" cy="36" r="14" fill="#c8c8c4" stroke="${band}" stroke-width="1.5"/><circle cx="54" cy="36" r="4" fill="${band}"/><circle cx="90" cy="30" r="3" fill="${band}"/><circle cx="90" cy="40" r="3" fill="${band}"/><circle cx="98" cy="35" r="3" fill="${band}"/><rect x="16" y="54" width="14" height="5" rx="1" fill="#6a6a70"/><rect x="34" y="54" width="14" height="5" rx="1" fill="#6a6a70"/>`;
  }
}

/** `platform`'s silhouette as `<svg>` text; `broken` draws it greyed with a crack of tape across, as it waits on the table. */
export function consoleArt(platform: PlatformId, options: { broken?: boolean } = {}): string {
  const tape = options.broken ? `<path d="M30 30 L 92 50" stroke="#e8dcb0" stroke-width="7" opacity="0.9"/><path d="M30 30 L 92 50" stroke="#c9b880" stroke-width="7" stroke-dasharray="2 5" opacity="0.6"/>` : '';
  return `<svg class="console-art${options.broken ? ' console-art--broken' : ''}" viewBox="0 0 120 72" aria-hidden="true"><ellipse cx="60" cy="66" rx="50" ry="4" fill="#000" opacity="0.18"/>${consoleShape(platform)}${tape}</svg>`;
}

/** The kitchen table with nothing on it: the bench mat, a screwdriver laid by, an empty parts tray. */
export function emptyBenchArt(): string {
  return `<svg class="repair__empty-art" viewBox="0 0 320 140" aria-hidden="true"><rect width="320" height="140" rx="10" fill="#3c5a4c"/><rect x="40" y="26" width="160" height="90" rx="6" fill="none" stroke="#5a7a68" stroke-width="2" stroke-dasharray="8 6"/>` +
    `<g transform="translate(222 40) scale(1.6)">${TOOL_ART.screwdriver}</g><rect x="226" y="98" width="60" height="22" rx="3" fill="#2a3a32" stroke="#1f2e26" stroke-width="2"/></svg>`;
}
