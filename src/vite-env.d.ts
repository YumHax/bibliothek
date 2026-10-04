/*
 * What Vite hands a module for an asset import, typed for tsc. A shader lives in a `.glsl` file next to the code that
 * compiles it and is imported as its text (`import frag from './Foo.frag.glsl?raw'`); `scripts/headless.mjs` loads the
 * same imports in Node, `scripts/check-glsl.mjs` parses the files.
 */
declare module '*.glsl?raw' {
  const source: string;
  export default source;
}
