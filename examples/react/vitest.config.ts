import { configDefaults, defineConfig } from 'vitest/config';

// Same `e2e/**` exclusion as examples/vue-tsx's vitest.config.ts (see its comment) — without it,
// `npm test` picks up `e2e/*.test.ts` (Detox's `device`/`element`/`by`, real-device only) as
// vitest unit tests and crashes. Unlike vue-tsx, this app has no unit test of its own yet — only
// the `test`/`vitest` scaffolding — so `passWithNoTests` keeps a currently-honest "nothing to
// run" from exiting non-zero the way vitest treats zero matched files by default.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
    passWithNoTests: true,
  },
});
