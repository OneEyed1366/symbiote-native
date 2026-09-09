import babel from '@babel/core';
import { createRequire } from 'node:module';
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

// `vitest bench` files, co-located next to the tests of the thing they time. Scoped
// explicitly because both projects below would otherwise match the same file by default and
// run every benchmark twice.
const BENCH_ALL = [
  'core/**/src/**/*.bench.ts',
  'adapters/**/src/**/*.bench.ts',
  'packages/**/src/**/*.bench.ts',
];
const SVELTE_BENCH = ['adapters/svelte/**/*.bench.ts'];

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

// `dev: false` is NOT a production-mode nicety — without it this project loads TWO solid-js builds
// at once. vite-plugin-solid re-adds the `development` export condition from its own config() hook,
// so solid-js resolves to dist/dev.js for the plugin's own path while dist/solid.js is resolved
// elsewhere; a profile of one create showed functions from both files. Signals then live in one
// runtime and the renderer's prop effects in the other, so THEY NEVER SEE EACH OTHER: measured
// 2026-08-23, a signal driving a prop on an intrinsic element went clip -> clip -> clip (no update
// at all), and clip -> head -> tail with this flag. Structural updates (<Show>, <For>) kept working
// because they run inside the test file's own solid-js, which is why nothing was red.
//
// `conditions: ['browser']` picks solid-js's client build over its `node` -> dist/server.js entry,
// and BOTH resolve and ssr.resolve are needed for the reason the svelte project states below:
// Vitest runs test files through Vite's SSR module graph.
const SOLID_TRANSFORM = solidPlugin({
  dev: false,
  hot: false,
  solid: {
    moduleName: '@symbiote-native/solid/renderer',
    generate: 'universal',
  },
});

// Vitest imports Angular adapter source directly. The production AOT path is still ngc partial
// compilation, but source tests need Vite/Oxc to lower Angular's legacy TS decorators before
// Node evaluates @Component/@Directive files.
// react-native's own source is Flow, which Rolldown cannot parse - importing any of it from a
// module a test reaches kills the run with `Parse failure: Flow is not supported`. That is the
// single reason this repo hand-ported 36 RN modules (symbiote-rn-port-elimination); stripping the
// types here is what lets a port be deleted in favour of the upstream implementation.
//
// The parser swap is load-bearing. @babel/preset-flow, the obvious choice, is BEHIND Flow's
// syntax and dies on the conditional type at flattenStyle.js:19 with a bare `Missing semicolon`.
// react-native compiles itself with Hermes' parser for exactly that reason.
const require_ = createRequire(import.meta.url);
const HERMES_SYNTAX = require_.resolve('babel-plugin-syntax-hermes-parser');
const FLOW_STRIP = require_.resolve('@babel/plugin-transform-flow-strip-types');

// RN mixes ESM `import` with top-level `require('./X')` in ONE file (PanResponder.js:15). Vite
// rewrites the imports and leaves the require, so Node loads the next hop RAW - as Flow - and the
// failure reads as a syntax error in a file this transform was never asked about. Hoisting those
// requires into real imports keeps every hop inside the transform.
const requireToImport = ({ types: t }: { types: typeof babel.types }) => ({
  visitor: {
    CallExpression(path: babel.NodePath<babel.types.CallExpression>, state) {
      if (!t.isIdentifier(path.node.callee, { name: 'require' })) return;
      const [arg] = path.node.arguments;
      if (!t.isStringLiteral(arg)) return;
      if (path.scope.getBinding('require')) return;
      const ns = path.scope.generateUidIdentifier('req');
      // A namespace object is not callable, so a CJS target (`invariant`) is read through
      // `.default`. But RN writes `require('./X').default` against its own ESM files, where that
      // unwrap is already the caller's - doing it twice yields undefined.
      const callerUnwraps =
        path.parentPath.isMemberExpression({ computed: false }) &&
        t.isIdentifier(path.parentPath.node.property, { name: 'default' });
      state.file.path.unshiftContainer(
        'body',
        t.importDeclaration(
          [t.importNamespaceSpecifier(ns)],
          t.stringLiteral(arg.value),
        ),
      );
      path.replaceWith(
        callerUnwraps
          ? ns
          : t.logicalExpression(
              '??',
              t.memberExpression(ns, t.identifier('default')),
              ns,
            ),
      );
    },
  },
});

// NOT just `react-native/`: its Flow reaches into sibling @react-native/* packages.
const RN_SOURCE =
  /\/node_modules\/(react-native|@react-native\/[^/]+)\/.*\.jsx?$/;

const REACT_NATIVE_FLOW = {
  name: 'strip-flow-from-react-native',
  enforce: 'pre' as const,
  async transform(code: string, id: string) {
    if (!RN_SOURCE.test(id.split('?')[0])) return null;
    const out = await babel.transformAsync(code, {
      filename: id,
      babelrc: false,
      configFile: false,
      sourceMaps: true,
      plugins: [
        [HERMES_SYNTAX, { parseLangTypes: 'flow' }],
        FLOW_STRIP,
        requireToImport,
      ],
    });
    return out?.code == null ? null : { code: out.code, map: out.map };
  },
};

const SHARED = {
  oxc: { decorator: { legacy: true } },
  plugins: [REACT_NATIVE_FLOW],
  test: {
    environment: 'node' as const,
    // ./vitest.setup.ts defines __DEV__, which react-native's own source reads bare.
    setupFiles: ['./vitest.setup.ts'],
    server: { deps: { inline: [/@symbiote-native\//, /react-native/] } },
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
          benchmark: { include: SVELTE_BENCH, exclude: EXCLUDE_ALL },
        },
      },
      {
        ...SHARED,
        ...BROWSER_CONDITIONS,
        // SHARED.plugins is REPLACED, not merged, so the Flow transform has to be restated.
        plugins: [REACT_NATIVE_FLOW, SOLID_TRANSFORM],
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
          benchmark: {
            include: BENCH_ALL,
            exclude: [...EXCLUDE_ALL, ...SVELTE_BENCH],
          },
        },
      },
    ],
  },
});
