import { defineConfig } from 'rolldown';

// Mirrors create-vue's own shape: bundle src/index.ts into a single dependency-free
// bundle.js, published as the `bin` entry point (see package.json's `files`/`bin`) so
// `npx @symbiote-native/cli new` never resolves a runtime dependency tree. The `bin` key is
// technically `symbiote-native-cli` (npm forbids `/`/`@` in a bin filename, and a bare
// `symbiote` would collide with the unrelated `@symbiotejs/symbiote` package in a developer's
// head/PATH) — but it's never documented as a name to remember; every invocation goes through
// the full package specifier via npx.
//
// Not wired into the root `pnpm run build`/`prepublish-build` pipeline yet, and the
// shebang-preservation behavior on the bundled entry chunk is unverified — both are
// real work for once this package moves past the CLI-skeleton stage (see README.md).
export default defineConfig({
  input: 'src/index.ts',
  platform: 'node',
  output: {
    file: 'bundle.js',
    format: 'esm',
  },
});
