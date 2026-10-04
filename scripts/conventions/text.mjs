// Player-facing text: counts, money, clocks and numbers read through `src/text/` (count, money, clock, strings), so
// "1,250 coins", "1 game", "0 tickets" and "18:05" are written one way (docs/consistency-audit.md §3.9-C1/D1/D2).
// Loaded by ../check-conventions.mjs; see there for a rule's shape.

export const rules = [
  {
    name: 'hand-made plural',
    // `game${n === 1 ? '' : 's'}` and `coin${n > 1 ? 's' : ''}` (which read "0 coin"): the noun goes through plural().
    test: (line) => /\? '' : 's'|\? 's' : ''/.test(line),
    except: ['text/count.ts'],
    hint: "use formatCount(n, 'game') or plural(n, 'game') from text/count (formatCoins / formatTickets from text/money); a verb agreeing with its noun takes `// convention-ok: <why>`",
  },
  {
    name: 'hand-made money',
    // "${price} coins" and "${n} tickets" by hand: the unit is pluralised and the digits grouped by text/money.
    test: (line) => /\$\{[^}]*\} coins?\b(?!\s*=)|\$\{[^}]*\} tickets?\b(?!\s*=)/.test(line),
    except: ['text/money.ts'],
    hint: 'use formatCoins(n) / formatTickets(n) from text/money (with { sign: true } for a change)',
  },
  {
    name: 'number format',
    // Grouped digits are formatNumber's: one locale, a true minus sign, "+" only when asked.
    test: (line) => /\.toLocaleString\(/.test(line),
    except: ['text/count.ts'],
    hint: 'use formatNumber(n) from text/count (formatNumber(n, { sign: true }) for a change)',
  },
  {
    name: 'hand-made clock',
    // Hours and minutes padded by hand round the minutes alone and can read ":60"; a date for a file name likewise.
    test: (line) => /padStart\(2, '0'\)\}:\$\{|\}:\$\{String\([^)]*\)\.padStart\(2, '0'\)|\(hours? % 1\) \* 60|- Math\.floor\(hours?\)\) \* 60|getMonth\(\) \+ 1\)\.padStart/.test(line),
    except: ['text/clock.ts', 'economy/calendar.ts'],
    hint: 'use formatClock(hours) / clockShort(hours) / fileStamp(date) from text/clock (economy/calendar keeps its save keys)',
  },
  {
    name: 'hand-made capital',
    // A first letter upper-cased by hand: capitalise() from text/strings.
    test: (line) => /charAt\(0\)\.toUpperCase\(\) \+ \w+\.slice\(1\)|\[0\]!?\.toUpperCase\(\) \+ \w+\.slice\(1\)/.test(line),
    except: ['text/strings.ts'],
    hint: 'use capitalise(text) from text/strings',
  },
  {
    name: 'title order',
    // Titles sorted with a bare localeCompare file "The Legend of Zelda" under T and "Mega Man 10" before "Mega Man 2".
    test: (line) => /\.title\.localeCompare\(/.test(line),
    except: ['text/strings.ts'],
    hint: 'use compareTitles(a.title, b.title) from text/strings (the shelves\' order: articles dropped, numbers by value)',
  },
];
