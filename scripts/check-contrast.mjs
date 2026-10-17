// The social UI's legibility (part of `npm run typecheck`; docs/checks.md "Contrast and text size"): every rule that
// sets a text colour in the social sheets (src/ui/social/**.css, and the social parts of src/notices/notices.css:
// the speech bubbles, the subtitles, the reward banner) is read against the background it sits on, its tokens
// resolved through src/ui/design/tokens.css, and must reach WCAG's 4.5:1 (3:1 for large text: 24 px, or 18.66 px
// bold); and no rule there sets a font size under 14 px (0.875rem at the 16 px root). The tier colour the code sets
// (`--tier`, `socialPlan.TIERS`) is tried for every tier: the worst decides.
//
// The background is the rule's own (`background-color`, or the last layer of `background`) laid over the ground it
// sits on: the background of the nearest class of its selector that another rule paints (its own compound first,
// then its ancestors, right to left, then the BEM blocks they belong to), else the sheet's ground (`GROUNDS`). A translucent colour is laid over what
// is under it. This is a reading, not a browser: what it cannot resolve (an `em` inside an `em`, a `vw`, an image) is
// skipped, a case that reads wrong takes `/* contrast-ok: <why> */` inside its rule.
//
// What fails today is in scripts/contrast-baseline.json (a case may not be added to it but by `--write-baseline`,
// after a look); `--list` prints every finding with its numbers.
//
//   node scripts/check-contrast.mjs [--list] [--write-baseline]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const BASELINE = path.join(ROOT, 'scripts', 'contrast-baseline.json');
const WRITE = process.argv.includes('--write-baseline');
const LIST = process.argv.includes('--list');

/** WCAG 2's thresholds, and the root size the rem sizes are read at. */
const NORMAL = 4.5;
const LARGE = 3;
const LARGE_PX = 24;
const LARGE_BOLD_PX = 18.66;
const ROOT_PX = 16;
/** The smallest text size the social sheets may set. */
const FLOOR_PX = 14;

/** The ground each sheet's text sits on when no rule of it paints one (an expression in that sheet's terms). */
const GROUNDS = {
  'ui/social/social.css': 'var(--card-ground)',
  'ui/social/PeopleBook.css': 'var(--page)',
  'notices/notices.css': 'var(--ui-panel-solid)',
  'ui/household/phoneContacts.css': 'var(--ui-panel-solid)',
};
const DEFAULT_GROUND = 'var(--ui-panel-solid)';
/** Blocks that are a frame around a page (the book's leather): their elements sit on the sheet's ground, not on them. */
const FRAMES = { 'ui/social/PeopleBook.css': ['people-book'] };
/** In notices.css, only these rules are the social layer's. */
const NOTICE_SCOPE = /social|people|reward|speech|subtitle|bubble/;

// --- CSS, read crudely -----------------------------------------------------------------------------------------

/** Every innermost `selector { declarations }` of `css` (comments dropped; at-rules descended into). */
function rulesOf(css) {
  const text = css.replace(/\/\*(?!\s*contrast-ok)[\s\S]*?\*\//g, '');
  const out = [];
  const stack = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      stack.push({ head: text.slice(start, i).trim(), open: i + 1, nested: false });
      if (stack.length > 1) stack[stack.length - 2].nested = true;
      start = i + 1;
    } else if (ch === '}') {
      const block = stack.pop();
      if (block && !block.nested && !block.head.startsWith('@') && !/^(from|to|\d+%)/.test(block.head)) {
        const body = text.slice(block.open, i);
        out.push({ selector: block.head.replace(/\s+/g, ' '), decls: declsOf(body), ok: /contrast-ok/.test(body) });
      }
      start = i + 1;
    } else if (ch === ';' && stack.length) {
      // A declaration ends: a nested rule's head starts after it.
      start = i + 1;
    }
  }
  return out;
}

/** `name: value` pairs of a block, the last one of a name winning. */
function declsOf(body) {
  const decls = {};
  for (const part of body.replace(/\/\*[\s\S]*?\*\//g, '').split(/;(?![^(]*\))/)) {
    const m = /^\s*(--?[\w-]+|[\w-]+)\s*:\s*([\s\S]+?)\s*$/.exec(part);
    if (m) decls[m[1]] = m[2].replace(/\s*!important\s*$/, '');
  }
  return decls;
}

/** The custom properties of `rules` (the first declaration of each name). */
function variablesOf(rules) {
  const vars = {};
  for (const r of rules) for (const [k, v] of Object.entries(r.decls)) if (k.startsWith('--') && !(k in vars)) vars[k] = v;
  return vars;
}

// --- Colours -----------------------------------------------------------------------------------------------------

const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0] };

/** Splits `s` on top-level commas (not inside parentheses). */
function splitTop(s, sep = ',') {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === sep && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** `var(--x[, fallback])` replaced from `scopes` (first that has it), recursively; `--tier` left for the variants. */
function substitute(expr, scopes, depth = 0) {
  if (depth > 20) return null;
  let out = '';
  let i = 0;
  while (i < expr.length) {
    const at = expr.indexOf('var(', i);
    if (at < 0) {
      out += expr.slice(i);
      break;
    }
    out += expr.slice(i, at);
    let j = at + 4;
    let d = 1;
    while (j < expr.length && d) {
      if (expr[j] === '(') d++;
      if (expr[j] === ')') d--;
      j++;
    }
    const inner = expr.slice(at + 4, j - 1);
    const [name, ...rest] = splitTop(inner);
    const fallback = rest.join(',');
    if (name === '--tier') out += 'TIER';
    else {
      const found = scopes.find((s) => name in s)?.[name] ?? (fallback || null);
      if (found === null) return null;
      const sub = substitute(found, scopes, depth + 1);
      if (sub === null) return null;
      out += sub;
    }
    i = j;
  }
  return out;
}

/** A colour expression (tokens substituted) as RGBA 0..255 / 0..1, or null. */
function colourOf(s, tier) {
  s = s.trim().replace(/\bTIER\b/g, tier);
  if (s in NAMED) return NAMED[s];
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    const n = (k) => parseInt(h.slice(k, k + 2), 16);
    return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
  }
  m = /^rgba?\((.*)\)$/i.exec(s);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    const v = parts.map((p) => (p.endsWith('%') ? parseFloat(p) / 100 : parseFloat(p)));
    if (v.length < 3 || v.some((x) => Number.isNaN(x))) return null;
    return [v[0], v[1], v[2], v[3] ?? 1];
  }
  m = /^color-mix\(\s*in\s+[\w-]+\s*,(.*)\)$/i.exec(s);
  if (m) {
    const [a, b] = splitTop(m[1]);
    if (!a || !b) return null;
    const share = (part) => {
      const p = /\s(\d+(?:\.\d+)?)%\s*$/.exec(` ${part}`);
      return p ? [part.replace(/\s*\d+(?:\.\d+)?%\s*$/, ''), parseFloat(p[1]) / 100] : [part, null];
    };
    const [ca, pa0] = share(a);
    const [cb, pb0] = share(b);
    const A = colourOf(ca, tier);
    const B = colourOf(cb, tier);
    if (!A || !B) return null;
    let pa = pa0 ?? (pb0 !== null ? 1 - pb0 : 0.5);
    let pb = pb0 ?? 1 - pa;
    const sum = pa + pb;
    const alphaScale = sum < 1 ? sum : 1;
    pa /= sum;
    pb /= sum;
    // Premultiplied, as CSS mixes.
    const alpha = A[3] * pa + B[3] * pb;
    const ch = (k) => (alpha ? (A[k] * A[3] * pa + B[k] * B[3] * pb) / alpha : 0);
    return [ch(0), ch(1), ch(2), alpha * alphaScale];
  }
  return null;
}

/** `top` laid over the opaque `under`. */
function over(top, under) {
  const a = top[3];
  return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1];
}

function luminance([r, g, b]) {
  const lin = (c) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** A `background` value's colour: the whole value when it is one, else its last layer when that one is (a gradient's ground). */
function backgroundColour(value) {
  if (!value || /url\(/.test(value)) return null;
  const layers = splitTop(value);
  const last = layers[layers.length - 1];
  return /gradient\(/.test(last) ? null : last;
}

// --- Sizes -------------------------------------------------------------------------------------------------------

/** A font size (tokens substituted) in px at the 16 px root, or null when it depends on what this cannot see. */
function pxOf(expr) {
  if (!expr || /%|vw|vh|vmin|vmax|ch\b|ex\b|inherit|smaller|larger/.test(expr)) return null;
  const js = expr
    .replace(/(\d*\.?\d+)rem/g, (_, n) => String(n * ROOT_PX))
    .replace(/(\d*\.?\d+)em/g, (_, n) => String(n * ROOT_PX))
    .replace(/(\d*\.?\d+)px/g, '$1')
    .replace(/\bcalc\(/g, '(')
    .replace(/\bmax\(/g, 'Math.max(')
    .replace(/\bmin\(/g, 'Math.min(')
    .replace(/\bclamp\(/g, 'clamp(');
  if (!/^[\d\s.+\-*/(),Mathaxinclmp]*$/.test(js)) return null; // cspell:disable-line
  try {
    const v = Function('clamp', `return (${js});`)((lo, x, hi) => Math.min(Math.max(lo, x), hi));
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

// --- The walk ----------------------------------------------------------------------------------------------------

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.css') ? [path.join(dir, e.name)] : []));
}

const tokenRules = rulesOf(fs.readFileSync(path.join(SRC, 'ui/design/tokens.css'), 'utf8'));
const tokens = variablesOf(tokenRules);
const plan = fs.readFileSync(path.join(SRC, 'social/socialPlan.ts'), 'utf8');
const tierBlock = /export const TIERS[\s\S]*?\];/.exec(plan)?.[0] ?? '';
const TIER_COLOURS = [...tierBlock.matchAll(/id: '(\w+)'[^}]*colour: '(#[0-9a-fA-F]{6})'/g)].map((m) => ({ id: m[1], colour: m[2] }));
if (!TIER_COLOURS.length) throw new Error('check-contrast: no tier colours read from src/social/socialPlan.ts TIERS');

const files = [...walk(path.join(SRC, 'ui/social')), path.join(SRC, 'notices/notices.css'), path.join(SRC, 'ui/household/phoneContacts.css')].filter((f) => fs.existsSync(f));
const findings = [];
let rulesRead = 0;
let pairs = 0;

/** The classes of a compound selector part (`.a.b:hover` -> a, b). */
const classesOf = (compound) => [...compound.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);

for (const file of files) {
  const rel = path.relative(SRC, file).split(path.sep).join('/');
  const rules = rulesOf(fs.readFileSync(file, 'utf8'));
  const sheetVars = variablesOf(rules);
  const scopes = (local) => [local, sheetVars, tokens];
  // Who paints a background, by class: the last compound's classes of each rule that sets one.
  const painted = new Map();
  const sized = new Map();
  for (const r of rules) {
    for (const sel of splitTop(r.selector)) {
      const compounds = sel.split(/\s*[\s>+~]\s*/).filter(Boolean);
      const last = compounds[compounds.length - 1] ?? '';
      if (/::?(before|after|placeholder|marker|selection)/.test(last)) continue;
      const bg = backgroundColour(r.decls['background-color'] ?? r.decls.background);
      for (const c of classesOf(last)) {
        if (bg && !painted.has(c)) painted.set(c, { expr: bg, local: r.decls });
        if (r.decls['font-size'] && !sized.has(c)) sized.set(c, { expr: r.decls['font-size'], local: r.decls });
      }
    }
  }
  const ground = GROUNDS[rel] ?? DEFAULT_GROUND;
  for (const r of rules) {
    if (r.ok) continue;
    if (rel === 'notices/notices.css' && !NOTICE_SCOPE.test(r.selector)) continue;
    rulesRead++;
    for (const sel of splitTop(r.selector)) {
      if (/::?(placeholder|selection)/.test(sel)) continue;
      const compounds = sel.split(/\s*[\s>+~]\s*/).filter(Boolean);
      const key = `${rel}|${sel}`;
      // Text size: its own, else the nearest class that sets one.
      let sizeExpr = r.decls['font-size'] ? { expr: r.decls['font-size'], local: r.decls } : null;
      // Its own classes, its ancestors' (right to left), then the BEM blocks they belong to (`.speech__name` sits in a `.speech`).
      const named = [...compounds].reverse().flatMap((c) => classesOf(c));
      const frames = FRAMES[rel] ?? [];
      const ancestry = [...named, ...named.map((c) => c.split(/__|--/)[0]).filter((c) => !named.includes(c) && !frames.includes(c))];
      if (!sizeExpr) for (const c of ancestry) if (sized.has(c)) { sizeExpr = sized.get(c); break; }
      const sizeText = sizeExpr ? substitute(sizeExpr.expr, scopes(sizeExpr.local)) : null;
      const px = sizeText === null ? null : pxOf(sizeText);
      if (r.decls['font-size'] && px !== null && px < FLOOR_PX - 0.01) findings.push({ key: `size|${key}`, detail: `font-size ${r.decls['font-size']} = ${px.toFixed(1)} px, under ${FLOOR_PX} px` });
      if (!r.decls.color) continue;
      // The background: its own laid over the nearest painted class above it, else the sheet's ground.
      const own = backgroundColour(r.decls['background-color'] ?? r.decls.background);
      let under = null;
      for (const c of ancestry) {
        const p = painted.get(c);
        if (p && !(own && p.local === r.decls)) { under = p; break; }
      }
      const groundText = substitute(ground, scopes({}));
      const underText = under ? substitute(under.expr, scopes(under.local)) : null;
      const ownText = own ? substitute(own, scopes(r.decls)) : null;
      const fgText = substitute(r.decls.color, scopes(r.decls));
      if (fgText === null || groundText === null || /currentcolor|inherit/i.test(fgText)) continue;
      const weight = /bold|[6-9]00/.test(r.decls['font-weight'] ?? '') ? 700 : 400;
      const large = px !== null && (px >= LARGE_PX || (weight >= 700 && px >= LARGE_BOLD_PX));
      const need = large ? LARGE : NORMAL;
      let worst = null;
      for (const { id, colour } of TIER_COLOURS) {
        const g = colourOf(groundText, colour);
        if (!g) break;
        let bg = over(g, [255, 255, 255, 1]);
        const u = underText ? colourOf(underText, colour) : null;
        if (u) bg = over(u, bg);
        const o = ownText ? colourOf(ownText, colour) : null;
        if (o) bg = over(o, bg);
        const fg = colourOf(fgText, colour);
        if (!fg) break;
        const r2 = ratio(over(fg, bg), bg);
        pairs++;
        if (!worst || r2 < worst.ratio) worst = { ratio: r2, tier: /TIER/.test(fgText + (ownText ?? '') + (underText ?? '')) ? id : null };
        if (!/TIER/.test(fgText + (ownText ?? '') + (underText ?? '') + groundText)) break;
      }
      if (worst && worst.ratio < need - 0.005) findings.push({ key: `contrast|${key}`, detail: `${worst.ratio.toFixed(2)}:1${worst.tier ? ` (tier ${worst.tier})` : ''}, under ${need}:1${large ? ' (large text)' : ''}` });
    }
  }
}

const known = fs.existsSync(BASELINE) ? new Set(JSON.parse(fs.readFileSync(BASELINE, 'utf8')).findings ?? []) : new Set();
const keys = [...new Set(findings.map((f) => f.key))].sort();
if (WRITE) {
  fs.writeFileSync(BASELINE, `${JSON.stringify({ findings: keys }, null, 2)}\n`);
  console.log(`[contrast] baseline written: ${keys.length} finding(s)`);
  process.exit(0);
}
if (LIST) for (const f of findings) console.log(`${known.has(f.key) ? '  known' : '  NEW  '} ${f.key}: ${f.detail}`);
const fresh = findings.filter((f) => !known.has(f.key));
const gone = [...known].filter((k) => !keys.includes(k));
if (fresh.length) {
  console.error(`[contrast] ${fresh.length} new finding(s) in the social sheets (WCAG ${NORMAL}:1, ${LARGE}:1 large; text ${FLOOR_PX} px at least):`);
  for (const f of fresh) console.error(`  ${f.key}: ${f.detail}`);
  console.error('  Fix the colour or the size (a token: src/ui/design/tokens.css); a reviewed case: `node scripts/check-contrast.mjs --write-baseline`; a misreading: `/* contrast-ok: <why> */` in the rule.');
  process.exit(1);
}
console.log(`[contrast] ${files.length} sheets, ${rulesRead} rules, ${pairs} pairs, ${keys.length} known finding(s), none new${gone.length ? ` (${gone.length} fixed: rewrite the baseline)` : ''}`);
