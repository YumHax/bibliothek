// Sound: one kit, one way to the audio context, one hearing curve. The rules that keep the synth building blocks
// from being written again per file (docs/architecture.md "audio/"). Loaded by ../check-conventions.mjs.

export const rules = [
  {
    name: 'audio kit',
    // A local noise burst, ping, bed or random helper: the kit has them (`audio/synth`), parameterised for every
    // envelope the game uses; a file that needs a new shape adds it there, once.
    test: (line) => /^(export )?function (rand|jitter|burst|noiseBurst|noiseBand|ping|bed|output|thump|plip|bloop|bloopAt)\(/.test(line),
    except: ['audio/synth.ts', 'audio/oneShot.ts', 'audio/furnitureSounds.ts', 'audio/footfall.ts'],
    hint: 'use noiseBurst / tone / partials / bed / rand from audio/synth (and oneShot / shot from audio/oneShot for the output)',
  },
  {
    name: 'audio context',
    // One context, created on the first gesture (`unlockAudioOnFirstGesture`), asked for with `audioContext()` /
    // `startedAudioContext()`, waited for with `onAudioStart`.
    test: (line) => /new (webkit)?AudioContext\(/.test(line),
    except: ['audio/audioContext.ts'],
    hint: 'audioContext() for a sound that follows a click, startedAudioContext() for one nobody clicked for, onAudioStart(cb) to begin when there is sound (audio/audioContext)',
  },
  {
    name: 'own gesture listener',
    // Listening for a click or a key to start a sound is the one unlock's job.
    test: (line) => /addEventListener\('(pointerdown|keydown|click|touchstart)'/.test(line),
    within: ['audio/'],
    except: ['audio/audioContext.ts'],
    hint: 'onAudioStart(cb) from audio/audioContext: the first gesture starts the audio and the callback follows',
  },
  {
    name: 'hearing curve',
    // How loud a sound is at a distance is one curve family with named profiles (`audio/hearing`): a curve written
    // in place (`1 / (1 + (d / x) ** 2)`, `Math.max(0, 1 - d / reach) ** 2`) is another law for the same ears.
    test: (line) => /\/\s*\(\s*1\s*\+\s*\(?\s*(d|dist|distance|metres)\b[^;]*(\*\*\s*2|\*\s*(d|dist|distance)\b)|Math\.max\(0,\s*1\s*-\s*(d|dist|distance|metres)\b\s*\/[^;]*\)\s*\*\*\s*2|Math\.pow\(\s*(0\.\d+|wallGain)\s*,\s*walls\s*\)/.test(line),
    except: ['audio/hearing.ts'],
    hint: 'loudness(distance, profile, walls) or hear(at, profile) from audio/hearing, a HEARING profile or an inline one',
  },
];
