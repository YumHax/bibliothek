// ESLint, type-aware, for the handful of correctness rules tsc does not cover (docs/checks.md "Lint"): a switch over a
// union that forgets a member, an array callback with no return on one path, a promise dropped on the floor or handed
// to something that wants a plain function, `==` on anything but null, a comparison that is always true. Nothing
// stylistic: the style lives in docs/ and the skills, the layout rules in scripts/check-conventions.mjs.
//
//   npm run lint          (eslint, cspell, knip)
//   npx eslint src server api
import { fileURLToPath } from 'node:url';
import tseslint from 'typescript-eslint';

const root = fileURLToPath(new URL('.', import.meta.url));

export default tseslint.config(
  { ignores: ['dist/**', '.cache/**', 'public/**', 'scripts/**', '*.mjs', '*.ts'] },
  {
    files: ['src/**/*.ts', 'server/**/*.ts', 'api/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      // `src` and `server` are tsconfig.json's, `api` has its own (api/tsconfig.json): the service picks per file.
      parserOptions: { projectService: true, tsconfigRootDir: root },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // A switch over a union must name every member (a `default` counts): state machines grow states.
      '@typescript-eslint/switch-exhaustiveness-check': ['error', { considerDefaultExhaustiveForUnions: true }],
      // map / filter / reduce callbacks return on every path.
      'array-callback-return': 'error',
      // A promise is awaited, returned, or deliberately dropped with `void`.
      '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
      // No async function where a plain callback is wanted (a listener, a filter).
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-constant-binary-expression': 'error',
      'no-self-compare': 'error',
      'no-dupe-else-if': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-template-curly-in-string': 'error',
    },
  },
);
