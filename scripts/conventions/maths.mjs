// Maths: one clamp, one lerp, one angle convention, one way to ease towards a target (`src/math/`). The repo once
// had two `easeInOut` curves, two opposite `angleBetween`s, three `bump`s and fifty eases that snapped at low frame
// rates. Loaded by ../check-conventions.mjs; see there for a rule's shape.

/** A helper of the shared module defined again locally (a function, or an arrow bound to its name; a value called `ramp` or `spring` is not one). */
const NAMES = 'clamp|clamp01|lerp|inverseLerp|smoothstep|smootherstep|smooth|smoother|ease(?:In|Out|InOut)\\w*|angleDelta|angleBetween|angleTo|wrapAngle|lerpAngle|damp|dampAngle|dampFactor|gaussian|ramp|bump|spring';
const LOCAL_HELPER = new RegExp(`^\\s*(?:export\\s+)?(?:function\\s+(?:${NAMES})\\s*\\(|(?:const|let)\\s+(?:${NAMES})\\s*=\\s*(?:\\([^)]*\\)|\\w+)\\s*(?::[^=]*)?=>)`);
/**
 * A share of the gap per frame: `Math.min(1, dt * k)` closes k/60 of it at 60 fps and snaps at 20 fps. The clamped
 * progress `Math.min(1, t + dt / seconds)` is not one (it starts with the value, not with `dt`).
 */
const FRAME_SHARE = /Math\.min\(\s*1\s*,\s*(dt\b[^()+]*|[^()+\-]*\*\s*dt\b[^()+]*)\)/;

export const rules = [
  {
    name: 'local maths helper',
    test: (line) => LOCAL_HELPER.test(line),
    except: ['math/'],
    hint: 'import it from @/math (scalar, easing, angles, damp, springs); a validator or a rounding is not a clamp: give it its own name',
  },
  {
    name: 'angle wrapped by hand',
    // `atan2(sin(d), cos(d))` and the modulo dance: the module has one convention (`angleTo(from, to)`).
    test: (line) => /Math\.atan2\(\s*Math\.sin\(/.test(line) || /euclideanModulo\([^)]*Math\.PI/.test(line),
    except: ['math/'],
    hint: 'use wrapAngle(angle), angleTo(from, to) or lerpAngle(from, to, t) from @/math/angles',
  },
  {
    name: 'frame-rate-dependent smoothing',
    test: (line) => FRAME_SHARE.test(line) || /1\s*-\s*Math\.exp\(\s*-[^)]*\bdt\b/.test(line),
    except: ['math/'],
    hint: 'use damp(current, target, rate, dt) / dampFactor(rate, dt) / dampAngle from @/math/damp (a true per-frame share takes `// convention-ok: <why>`)',
  },
  {
    name: 'smoothstep by hand',
    // `t * t * (3 - 2 * t)` is `smooth(t)` (clamped) from @/math/scalar.
    test: (line) => /\b(\w+) \* \1 \* \(3 - 2 \* \1\)/.test(line),
    except: ['math/'],
    hint: 'use smooth(t) (or ramp(x, from, to)) from @/math/scalar',
  },
];
