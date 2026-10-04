// The stylesheets: every colour, stacking level, font family and duration is a token (src/ui/design/tokens.css) or a
// slot variable a theme block sets (`--pz-hot: #e8245f;`), never a raw value in a rule; and nothing is `!important`
// but the few overrides that say why. Loaded by ../check-conventions.mjs on the `.css` files under src/; a line may
// opt out with a trailing `/* convention-ok: <why> */`.

/** A custom property's declaration (`--shop-ink: #2a2119;`): a token or a theme's slot, where a raw value belongs. */
const VARIABLE_DECLARATION = /--[\w-]+\s*:[^;}]*/g;
/** `line` less its custom-property declarations: what is left is read for raw values. */
const withoutVariables = (line) => line.replace(VARIABLE_DECLARATION, '');
/** A raw colour: a hex, an rgb() or an hsl(). */
const RAW_COLOUR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgb|hsl)a?\(/;
/** A family name or a generic family written out, rather than a `--ui-font-*` token. */
const FAMILY_LITERAL = /\bfont(?:-family)?\s*:[^;]*(?:'[^']+'|"[^"]+"|\b(?:serif|sans-serif|monospace|cursive|system-ui|ui-monospace)\b)/;
/** A duration written as a number of seconds or milliseconds in a transition or animation. */
const RAW_DURATION = /\b(?:transition|animation)(?:-duration|-delay)?\s*:[^;]*\b\d+(?:\.\d+)?m?s\b/;

const TOKENS = 'ui/design/tokens.css';

export const rules = [
  {
    name: 'raw colour',
    files: 'css',
    // A colour in a rule: the token or the theme's slot variable holds the value, the rule names it.
    test: (line) => RAW_COLOUR.test(withoutVariables(line)),
    except: [TOKENS],
    hint: 'name a token (src/ui/design/tokens.css) or set a slot variable in the theme block (`--shop-ink: #2a2119`) and read it with var()',
  },
  {
    name: 'raw z-index',
    files: 'css',
    // Stacking is the `--z-*` scale: a bare number lands somewhere between the layers by accident.
    test: (line) => /\bz-index\s*:\s*-?\d/.test(line),
    except: [TOKENS],
    hint: 'use a --z-* token (tokens.css: css-layer, canvas, hud, overlay, modal, fader, controls, notice; above / below inside one panel)',
  },
  {
    name: 'font family literal',
    files: 'css',
    // The faces are the `--ui-font-*` tokens; the canvases read the same stacks.
    test: (line) => FAMILY_LITERAL.test(withoutVariables(line)) && !/var\(--ui-font/.test(line),
    except: [TOKENS, 'ui/fonts.css'],
    hint: 'use a --ui-font-* token (tokens.css: body, display, marker, led, print, serif, hand, comic, mono, typewriter)',
  },
  {
    name: 'raw duration',
    files: 'css',
    // Durations come from the `--dur-*` scale; one a module mirrors in TypeScript is a slot variable beside it.
    test: (line) => RAW_DURATION.test(withoutVariables(line)),
    except: [TOKENS],
    hint: 'use a --dur-* token (tokens.css), or a slot variable in the block when TypeScript waits for exactly that time',
  },
  {
    name: 'important',
    files: 'css',
    // An `!important` fights the cascade instead of naming the layer; the overrides that must say why.
    test: (line) => /!important/.test(line),
    except: [],
    hint: 'raise the selector or move the rule to the right layer; an override that must win takes `/* convention-ok: <why> */`',
  },
];
