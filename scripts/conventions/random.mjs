// Randomness: every draw comes from `src/random` (docs/architecture.md "Randomness"), so a stream can be seeded for
// the headless checks, saved days keep drawing what they drew, and a hash is the same in every engine. Loaded by
// ../check-conventions.mjs; see there for a rule's shape.

export const rules = [
  {
    name: 'live random',
    // `Math.random` is called in src/random/streams.ts only: everything live draws through `random()`.
    test: (line) => /\bMath\.random\b/.test(line),
    except: ['random/'],
    hint: 'draw through random() from @/random (seeded for the checks by seedLiveRandom), or a seeded stream',
  },
  {
    name: 'own generator',
    // A generator or hash constant outside src/random is another copy of one of its streams.
    test: (line) => /\b(1664525|1013904223|0x6d2b79f5|16807|1103515245|0x811c9dc5|2166136261|16777619|0x01000193|3266489909|2246822507|0x85ebca6b|0xc2b2ae35)\b/.test(line) || /Math\.sin\([^;]*\)\s*\*\s*43758/.test(line),
    except: ['random/'],
    hint: 'use lcg / frozenRng / seededRng and fnv1a / unit01 / hashInts / unitOf from @/random',
  },
  {
    name: 'sort shuffle',
    // Sorting by a random comparator is biased and depends on the engine's sort.
    test: (line) => /\.sort\(\(\)\s*=>\s*\w+\(\)\s*-\s*0\.5\)/.test(line),
    except: [],
    hint: 'use shuffled(stream, items) from @/random',
  },
  {
    name: 'clock seed',
    // A seed from the clock is a few thousand streams at most, and two of them collide.
    test: (line) => /(?<![\w.])(?:lcg|seededRng|frozenRng|mulberry32)\([^)]*Date\.now\(\)/.test(line),
    except: [],
    hint: 'seededRng() with no seed draws a fresh one from the live stream',
  },
  {
    name: 'day draw',
    // A day seeds a stream in time/daily only (`dailyRandom`, `gameDayRandom`, `dayStream`, `dayLcg`).
    test: (line) => /(?<![\w.])(?:frozenRng|lcg)\(\s*`[^`]*\$\{[^}]*\b(day|today\(\)|gameDay|week)\b/.test(line) || /(?<![\w.])lcg\(\s*(this\.)?\w*[dD]ay\w*\s*\*\s*\d+/.test(line),
    except: ['time/daily.ts'],
    hint: 'use dailyRandom / gameDayRandom (new draws) or dayStream / dayLcg (what was always drawn so) from @/time/daily',
  },
];
