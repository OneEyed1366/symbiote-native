import { configDefaults, defineConfig } from 'vitest/config';

// Vitest's own default `exclude` is just `node_modules`/`.git` — nothing about `e2e` — so with no
// config at all, `npm test` (`vitest run`) picks up `e2e/*.test.ts` under its default include glob
// alongside `vue-fragment.test.ts`. Those import `detox`'s `device`/`element`/`by`, which only
// exist wired up by Detox's own on-device runner, not under plain vitest — a bare `vitest run`
// here crashes trying to execute them as unit tests. Same fix as the monorepo root's own
// vitest.config.ts (`**/e2e/**` in its `EXCLUDE_ALL`), just scoped to this standalone package.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
