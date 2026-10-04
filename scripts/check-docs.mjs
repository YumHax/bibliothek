// Every path the docs name must exist. CLAUDE.md, README.md, docs/*.md and the skills are what a session reads
// before it touches the code (the token-lean layout: small CLAUDE.md, details in docs/), so a path that moved or a
// file that went costs every later session a search, or sends it to the wrong place. Checked on every
// `npm run typecheck`:
//
//   node scripts/check-docs.mjs            fails on a path that does not resolve
//   node scripts/check-docs.mjs --list     every path-like reference and what it resolved to
//
// A reference is a backticked token with a slash or a source extension (`world/surface/layers`, `roomPlan.ts`,
// `docs/props.md`); prose, commands and code blocks are not looked at. It resolves as written from the repository
// root, under `src/`, under `src/world/` (and `src/world/props/`), with `.ts` / `/index.ts` added, by its tail
// (`../nav/FloorNav.ts`), by its bare file name anywhere in the tree (a table listing a folder's files), or as
// `folder/Export` when a file of that folder exports that name (`city/SKYLINE`, `lighting/ShadowRefresh`).
// Placeholders are not checked: a token naming `MyThing` / `My<Thing>` or holding `<angle brackets>` or `...`.
// Gitignored places count as known (`.cache/`, `dist/`, `/tmp`). `docs/consistency-audit.md` is skipped: a
// proposal, naming files that do not exist yet.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIST = process.argv.includes('--list');

/** The docs checked, repository-relative. */
const DOCS = [
  'CLAUDE.md',
  'README.md',
  ...fs.readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => `docs/${f}`),
  ...fs.readdirSync(path.join(ROOT, '.claude', 'skills')).map((d) => `.claude/skills/${d}/SKILL.md`),
].filter((f) => fs.existsSync(path.join(ROOT, f)));

/** Docs that name files on purpose before they exist. */
const SKIPPED = new Set(['docs/consistency-audit.md']);

/** Folders walked for the file index (what a path may resolve to). */
const TREES = ['src', 'scripts', 'docs', 'server', 'api', 'public', '.claude', '.githooks'];
/** Root files a doc may name (the configs: package.json, tsconfig.json, eslint.config.mjs, knip.json, cspell.json...). */
const ROOT_FILES = fs.readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isFile()).map((e) => e.name);
/** File extensions a path may end with: `module.member` is stripped to the module, `file.ext` is not. */
const EXTENSIONS = new Set(['ts', 'mjs', 'cjs', 'js', 'md', 'css', 'json', 'html', 'txt', 'webp', 'png', 'jpg', 'svg', 'wasm', 'lock']);
/** Gitignored, so absent from a fresh clone, but real: never a stale reference. */
const KNOWN_ABSENT = /^(\.cache|dist|node_modules|\.vercel|\.netlify)(\/|$)|^\/tmp(\/|$)/;
/** What a token may not contain to be a path: prose, calls, globs, shell. */
const NOT_A_PATH = /[\s()*{}|=,;!'"`$#]/;
/** A placeholder standing for a name the reader fills in. */
const PLACEHOLDER = /\bMy[A-Z]\w*|<[^>]*>|\.\.\.|…/;
/** Where a path may stand in besides as written. */
const PREFIXES = ['', 'src/', 'src/world/', 'src/world/props/'];
const SUFFIXES = ['', '.ts', '/index.ts', '.mjs', '.md', '.css', '.json'];

// --- The file index -----------------------------------------------------------------------------------------

/** Every file and folder (folders with a trailing slash), repository-relative with forward slashes. */
const entries = new Set(ROOT_FILES.filter((f) => fs.existsSync(path.join(ROOT, f))));
/** File basename -> how many files bear it. */
const basenames = new Map();
function walk(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  entries.add(`${rel}/`);
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      basenames.set(`${entry.name}/`, (basenames.get(`${entry.name}/`) ?? 0) + 1);
      walk(child);
    } else {
      entries.add(child);
      basenames.set(entry.name, (basenames.get(entry.name) ?? 0) + 1);
    }
  }
}
for (const tree of TREES) walk(tree);
const files = [...entries].filter((e) => !e.endsWith('/'));
/** Folder -> its files' exports, read on demand (for `folder/Export` references). */
const exportsByFolder = new Map();

function exists(rel) {
  return entries.has(rel) || entries.has(`${rel}/`);
}

/** The names a folder's TypeScript files export (`export const X`, `export class X`...), read once. */
function exportsOf(folder) {
  let names = exportsByFolder.get(folder);
  if (names) return names;
  names = new Set();
  for (const file of files) {
    if (!file.startsWith(`${folder}/`) || file.slice(folder.length + 1).includes('/') || !/\.(ts|mjs)$/.test(file)) continue;
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of source.matchAll(/^export\s+(?:async\s+)?(?:const|let|function\*?|class|type|interface|enum|abstract class)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
    for (const m of source.matchAll(/^export\s*\{([^}]*)\}/gm)) for (const part of m[1].split(',')) {
      const name = part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop();
      if (name) names.add(name);
    }
  }
  exportsByFolder.set(folder, names);
  return names;
}

/** Where `token` resolves, or null. */
function resolve(token) {
  if (KNOWN_ABSENT.test(token)) return token;
  for (const prefix of PREFIXES) {
    for (const suffix of SUFFIXES) {
      const candidate = prefix + token + suffix;
      if (exists(candidate)) return candidate;
    }
  }
  // By its tail: `../nav/FloorNav.ts`, `zone/Zone.ts`.
  const tail = token.replace(/^(\.\.?\/)+/, '');
  if (tail !== token || tail.includes('/')) {
    for (const suffix of SUFFIXES) {
      const hit = files.find((f) => f.endsWith(`/${tail}${suffix}`));
      if (hit) return hit;
    }
  }
  // A bare file or folder name, anywhere (a table listing a folder's files, a folder's subfolders).
  if (!token.includes('/')) {
    for (const name of [token, `${token}.ts`, `${token}/`]) if (basenames.has(name)) return `*/${name}`;
  }
  // `folder/Export`: a name one of the folder's files exports.
  const slash = token.lastIndexOf('/');
  if (slash > 0) {
    const name = token.slice(slash + 1);
    const folder = token.slice(0, slash);
    if (/^[A-Za-z_$][\w$]*$/.test(name)) {
      for (const prefix of PREFIXES) {
        const dir = (prefix + folder).replace(/\/$/, '');
        if (exists(dir) && exportsOf(dir).has(name)) return `${dir}/ exports ${name}`;
        // `folder/Module.member`: the module exists, the member is not checked.
      }
    }
  }
  return null;
}

/** `token` as a path to look up, or null when it is not a path-like reference. */
function pathOf(raw) {
  let token = raw.trim();
  if (!token || NOT_A_PATH.test(token) || PLACEHOLDER.test(token)) return null;
  if (!(token.includes('/') || /\.(ts|mjs|md|json|css|html)$/.test(token))) return null;
  // Not paths: URLs, API routes, a scoped npm package, a bare extension, `object.member/other` prose.
  if (/^(https?:|mailto:|\/api\/|\?|~|GET |POST |@[^/]+\/)/.test(token)) return null;
  if (/^\.[a-z]+$/.test(token) || /^[a-z_$][\w$]*\.[a-z_$][\w$]*\//.test(token)) return null;
  token = token.replace(/^@\//, 'src/').replace(/[.,:]+$/, '').replace(/:\d+(-\d+)?$/, '').replace(/\/$/, '');
  if (token.startsWith('/') && !token.startsWith('/tmp')) token = token.slice(1);
  // `game/Screens.playOn`: the member after the module is not checked.
  const member = token.match(/^(.*\/[^./]+)\.([A-Za-z_$][\w$]*)$/);
  if (member && !EXTENSIONS.has(member[2])) token = member[1];
  return token || null;
}

const problems = [];
let checked = 0;
for (const doc of DOCS) {
  if (SKIPPED.has(doc)) continue;
  const lines = fs.readFileSync(path.join(ROOT, doc), 'utf8').split('\n');
  lines.forEach((line, i) => {
    // Backticked tokens anywhere (a fenced folder map holds them too), and a line opening with a repository path
    // (the folder map's first column).
    const tokens = [...line.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
    const opening = line.match(/^(?:src|server|api|scripts|docs|public|\.claude)\/[^\s`]*/);
    if (opening) tokens.unshift(opening[0]);
    for (const raw of tokens) {
      const token = pathOf(raw);
      if (!token) continue;
      checked++;
      const found = resolve(token);
      if (LIST) console.log(`${doc}:${i + 1}: \`${raw}\` -> ${found ?? 'NOT FOUND'}`);
      if (!found) problems.push(`${doc}:${i + 1}: path not found: \`${raw}\``);
    }
  });
}

if (problems.length) {
  console.error(
    `[docs] ${problems.length} stale path${problems.length === 1 ? '' : 's'} (${checked} checked): fix the path, or name a placeholder \`MyThing\` / \`<kind>\`\n${problems.join('\n')}`,
  );
  process.exit(1);
}
console.log(`[docs] ${checked} paths in ${DOCS.length - SKIPPED.size} docs, all found`);
