/**
 * A shader read from a `.glsl` file (`import frag from './Foo.frag.glsl?raw'`), made whole before three.js compiles
 * it. The file is a parseable program (`scripts/check-glsl.mjs` checks it); what it cannot hold statically comes in
 * here: a value TypeScript knows (`defines`: `#define NAME value` lines prepended, so the GLSL reads `NAME`), and a
 * chunk shared with other shaders or generated (`chunks`: each `#include <name>` the file writes is replaced by the
 * chunk's text; names not given are left for three.js, which resolves its own chunks when the program compiles).
 */
interface ShaderParts {
  /** `#define NAME value` lines prepended, a number written as is (`1.5`), a string verbatim. */
  defines?: Record<string, string | number>;
  /** The text each `#include <name>` of ours is replaced with. */
  chunks?: Record<string, string>;
}

export function assemble(source: string, parts: ShaderParts = {}): string {
  let text = source;
  if (parts.chunks) {
    const chunks = parts.chunks;
    text = text.replace(/^[ \t]*#include\s*<([^>]+)>[ \t]*$/gm, (line, name: string) => chunks[name] ?? line);
  }
  if (parts.defines) {
    const lines = Object.entries(parts.defines).map(([name, value]) => `#define ${name} ${value}`);
    text = `${lines.join('\n')}\n${text}`;
  }
  return text;
}
