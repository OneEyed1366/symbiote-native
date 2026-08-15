import { defineConfig } from 'vitest/config';

// Root unit/integration runner. Tests are co-located with what they exercise:
// pure engine/components logic next to `core/*/src`, framework-driven pipeline tests next to
// the adapter source. `@symbiote-native/*` packages resolve to raw `src/*.ts` (their package
// `main`), so they must be inlined for Vitest to transform them. examples/* left the pnpm
// workspace (2026-07, standalone npm installs) and no longer shares this install/lockfile,
// so its tests are out of scope here — run them from inside the example app itself.
// A single `react` copy across the monorepo is enforced by the `overrides` in
// pnpm-workspace.yaml (the adapter's reconciler and the app's hooks must share one instance,
// else "Invalid hook call"); no Vitest-side dedupe/alias is needed on top of that.

const INCLUDE_ALL = [
  'core/**/src/**/*.test.{ts,tsx}',
  'adapters/**/src/**/*.test.{ts,tsx}',
  // A Metro transformer must be a hand-authored, package-root .cjs (Metro requires() it
  // directly; a compiled-from-src ESM file wouldn't load) — its co-located test lives at
  // the same root level, not under src/. See adapters/vue/metro-vue-transformer.cjs.
  'adapters/*/*.test.{ts,tsx}',
  'packages/**/src/**/*.test.{ts,tsx}',
  // Cross-cutting checks that belong to no single package — they read several packages' sources
  // and assert a contract BETWEEN them (e.g. adapter barrel parity).
  'tests/**/*.test.{ts,tsx}',
];

// `**/e2e/**` keeps the Detox on-device suite (jest-based) out of the vitest run.
// Its `*.test.ts` files import `detox` and drive a real device, not the fake-Fabric slot.
const EXCLUDE_ALL = ['**/node_modules/**', '**/build/**', '**/e2e/**'];

// Everything that actually mounts Svelte. NOT just the adapter: each `@symbiote-native/*`
// package ships a per-framework entry, so its `src/svelte/**` smokes drive the same mount() path
// and need the same condition. Find new ones with
// `grep -rl --include='*.test.ts' svelte core packages adapters`.
const SVELTE_TESTS = [
  'adapters/svelte/**/*.test.{ts,tsx}',
  'packages/**/src/svelte/**/*.test.{ts,tsx}',
];

// Vitest imports Angular adapter source directly. The production AOT path is still ngc partial
// compilation, but source tests need Vite/Oxc to lower Angular's legacy TS decorators before
// Node evaluates @Component/@Directive files.
const SHARED = {
  oxc: { decorator: { legacy: true } },
  test: { environment: 'node' as const, server: { deps: { inline: [/@symbiote-native\//] } } },
};

// `svelte`'s package.json "." export splits on a `browser` condition (client runtime,
// `mount()`/`unmount()` etc.) vs `default`/`worker` (the SSR runtime, where `mount()` throws
// `lifecycle_function_unavailable`). Vite/Vitest's default Node conditions pick the SSR build,
// which crashes the FIRST call the Svelte adapter's `render.ts` makes — caught by
// adapters/svelte/src/mount-pipeline.smoke.test.ts. Both `resolve` and `ssr.resolve` are needed:
// Vitest executes test files through Vite's SSR module graph, which reads `ssr.resolve.conditions`
// (defaulting to Node conditions), NOT the plain `resolve.conditions`. Metro (the real production
// bundler) needs the equivalent `conditionNames` fix in whatever app config bundles
// adapters/svelte for a device; tracked in the svelte-adapter-dom-shim skill.
//
// SCOPED TO THE SVELTE PROJECT ON PURPOSE — it used to be global and that broke unrelated
// packages (2026-08-14). `less`, `sass` and `stylus` each declare a `browser` key FIRST in their
// `exports`, so a global browser condition resolves them to their BROWSER bundles, which fail to
// load under Node; core/css-parser's preprocessor tests then died in `loadLess`'s catch with the
// misleading "less is required for .less files. Install it" (it WAS installed). Reordering our
// conditions array cannot fix that — Node/Vite pick the first matching key in the PACKAGE's own
// declaration order, not ours — so the condition has to be narrowed to the tests that need it.
const BROWSER_CONDITIONS = {
  resolve: { conditions: ['browser'] },
  ssr: { resolve: { conditions: ['browser'] } },
};

export default defineConfig({
  ...SHARED,
  test: {
    ...SHARED.test,
    projects: [
      {
        ...SHARED,
        ...BROWSER_CONDITIONS,
        test: { ...SHARED.test, name: 'svelte', include: SVELTE_TESTS, exclude: EXCLUDE_ALL },
      },
      {
        ...SHARED,
        test: {
          ...SHARED.test,
          name: 'default',
          include: INCLUDE_ALL,
          exclude: [...EXCLUDE_ALL, ...SVELTE_TESTS],
        },
      },
    ],
  },
});
