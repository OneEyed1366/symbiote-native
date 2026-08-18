import { defineConfig } from 'vitest/config';
import solidPlugin from 'vite-plugin-solid';

// Root unit/integration runner. Tests are co-located with what they exercise. `@symbiote-native/*`
// packages resolve to raw `src/*.ts` (their package `main`), so they must be inlined for Vitest
// to transform them. examples/* left the pnpm workspace (2026-07, standalone npm installs) and is
// out of scope here — run its tests from inside the example app itself. A single `react` copy is
// enforced by pnpm-workspace.yaml's `overrides` (else "Invalid hook call"), so no Vitest-side
// dedupe/alias is needed.

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

// Everything that compiles Solid JSX. adapters/solid builds with `jsx: 'preserve'` — tsc type-checks
// the JSX and emits it untouched, because the real compilation is babel-preset-solid's job in the
// consuming app's Metro. That leaves nothing executable for Vitest, so this project runs the same
// transform through Vite, with the SAME two options ../adapters/solid/babel-preset.cjs pins for the
// app. They must not drift: a test running against `generate: 'dom'` would exercise DOM operations
// that never appear on a device.
const SOLID_TESTS = [
  'adapters/solid/**/*.test.{ts,tsx}',
  'packages/**/src/solid/**/*.test.{ts,tsx}',
];

const SOLID_TRANSFORM = solidPlugin({
  solid: {
    moduleName: '@symbiote-native/solid/renderer',
    generate: 'universal',
  },
});

// Vitest imports Angular adapter source directly. The production AOT path is still ngc partial
// compilation, but source tests need Vite/Oxc to lower Angular's legacy TS decorators before
// Node evaluates @Component/@Directive files.
const SHARED = {
  oxc: { decorator: { legacy: true } },
  test: {
    environment: 'node' as const,
    server: { deps: { inline: [/@symbiote-native\//] } },
  },
};

// svelte's package.json "." export splits on a `browser` condition (client runtime, mount()/
// unmount()) vs `default`/`worker` (SSR runtime, where mount() throws `lifecycle_function_
// unavailable`). Vite/Vitest's default Node conditions pick the SSR build, which crashes the
// first call adapters/svelte/src/render.ts makes. Both `resolve` and `ssr.resolve` are needed —
// Vitest runs test files through Vite's SSR module graph, which reads `ssr.resolve.conditions`,
// not the plain `resolve.conditions`. Metro needs the equivalent `conditionNames` fix for a real
// device build; tracked in the svelte-adapter-dom-shim skill.
//
// Scoped to the svelte project on purpose (was global, broke unrelated packages 2026-08-14):
// `less`/`sass`/`stylus` each declare a `browser` key first in their own exports, so a global
// browser condition resolves them to browser bundles that fail to load under Node — reordering
// our conditions array can't fix that, since Node/Vite pick the first matching key in the
// PACKAGE's own declaration order. So the condition is narrowed to just the tests that need it.
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
        test: {
          ...SHARED.test,
          name: 'svelte',
          include: SVELTE_TESTS,
          exclude: EXCLUDE_ALL,
        },
      },
      {
        ...SHARED,
        plugins: [SOLID_TRANSFORM],
        test: {
          ...SHARED.test,
          name: 'solid',
          include: SOLID_TESTS,
          exclude: EXCLUDE_ALL,
        },
      },
      {
        ...SHARED,
        test: {
          ...SHARED.test,
          name: 'default',
          include: INCLUDE_ALL,
          exclude: [...EXCLUDE_ALL, ...SVELTE_TESTS, ...SOLID_TESTS],
        },
      },
    ],
  },
});
