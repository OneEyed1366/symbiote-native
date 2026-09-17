/**
 * Runs `*.itest.ts` inside the real engine: bundle, evaluate in `symbiote_tester`, report.
 *
 * The shape is React Native's own (`private/react-native-fantom/runner`) — there is no way around a
 * bundler here, because the binary evaluates ONE script against a JSI runtime with no module
 * loader. esbuild is already in the tree; Metro would be the equivalent choice and buys nothing on
 * a host build.
 *
 * What makes this worth the machinery: a test run this way commits into the engine that ships. The
 * alternative is a TypeScript tree standing in for it, which is what this is replacing.
 */

import babel from '@babel/core';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import esbuild from 'esbuild';

const require_ = createRequire(import.meta.url);

/**
 * What the PLATFORM supplies and a bare JSI runtime does not.
 *
 * On a device this is React Native's `InitializeCore`. Hermes carries `queueMicrotask`;
 * JavaScriptCore does not, and Vue's scheduler wants it on the first render. Neither engine carries
 * timers at all — they are a host facility, and React's scheduler stops dead without them.
 *
 * Timers are QUEUED rather than run on a clock: there is no event loop here, so a test drains them
 * (`flushTimers` in `js/harness.ts`) at the point it decides work should have settled. That is the
 * same deal the event beat makes — the tick is explicit because the process has no run loop — and
 * it is what keeps a test deterministic instead of racing a wall clock.
 */
const PLATFORM_PRELUDE = `
if (typeof queueMicrotask !== "function") {
  globalThis.queueMicrotask = function (task) { Promise.resolve().then(task); };
}
if (typeof setTimeout !== "function") {
  var pending = [];
  var nextTimerId = 1;
  globalThis.setTimeout = function (task, delay) {
    var id = nextTimerId++;
    pending.push({ id: id, task: task, at: typeof delay === "number" ? delay : 0 });
    return id;
  };
  globalThis.clearTimeout = function (id) {
    pending = pending.filter(function (one) { return one.id !== id; });
  };
  globalThis.setInterval = globalThis.setTimeout;
  globalThis.clearInterval = globalThis.clearTimeout;
  globalThis.__symbioteFlushTimers = function (rounds) {
    var left = typeof rounds === "number" ? rounds : 32;
    while (pending.length > 0 && left-- > 0) {
      var due = pending.sort(function (a, b) { return a.at - b.at; });
      pending = [];
      for (var at = 0; at < due.length; at++) due[at].task();
    }
  };
}
if (typeof globalThis.__symbioteFlushTimers !== "function") {
  globalThis.__symbioteFlushTimers = function () {};
}
// React Native's own InitializeCore sets both: \`window\` IS the global there, and \`navigator.product\`
// is the string every library uses to detect React Native. Svelte's DOM shim reads them at module
// scope, so their absence is a hard failure rather than a degraded path.
// RN's InitializeCore installs a \`performance\` with a real monotonic clock, and Angular's profiler
// calls \`performance.now()\` on its first mount and stops dead without one.
//
// The tester binds a \`steady_clock\` in fractional milliseconds, so use it. The \`Date.now\` fallback
// below is WHOLE milliseconds and stays only for a host that predates the binding — at that
// granularity a phase of a few ms reads as 0 or as double its size, which is how a sub-phase split
// of the JS fill was impossible to take until the clock landed.
if (typeof globalThis.performance === "undefined") {
  const tester = globalThis.__symbioteTester;
  if (tester !== undefined && typeof tester.now === "function") {
    globalThis.performance = { now: function () { return tester.now(); } };
  } else {
    const started = Date.now();
    globalThis.performance = { now: function () { return Date.now() - started; } };
  }
}
if (typeof globalThis.window === "undefined") globalThis.window = globalThis;
if (typeof globalThis.navigator === "undefined") {
  globalThis.navigator = { product: "ReactNative" };
}
if (typeof URLSearchParams !== "function") {
  globalThis.URLSearchParams = class URLSearchParams {
    constructor(init) {
      this._pairs = [];
      if (typeof init === "string") {
        for (const part of init.replace(/^\\?/, "").split("&")) {
          if (part === "") continue;
          const at = part.indexOf("=");
          const key = at < 0 ? part : part.slice(0, at);
          const value = at < 0 ? "" : part.slice(at + 1);
          this._pairs.push([decodeURIComponent(key.replace(/\\+/g, " ")),
                            decodeURIComponent(value.replace(/\\+/g, " "))]);
        }
      } else if (Array.isArray(init)) {
        for (const [key, value] of init) this._pairs.push([String(key), String(value)]);
      } else if (init && typeof init === "object") {
        for (const key of Object.keys(init)) this._pairs.push([key, String(init[key])]);
      }
    }
    append(key, value) { this._pairs.push([String(key), String(value)]); }
    delete(key) { this._pairs = this._pairs.filter(pair => pair[0] !== String(key)); }
    get(key) {
      const found = this._pairs.find(pair => pair[0] === String(key));
      return found === undefined ? null : found[1];
    }
    getAll(key) {
      return this._pairs.filter(pair => pair[0] === String(key)).map(pair => pair[1]);
    }
    has(key) { return this._pairs.some(pair => pair[0] === String(key)); }
    set(key, value) {
      const at = this._pairs.findIndex(pair => pair[0] === String(key));
      if (at < 0) this._pairs.push([String(key), String(value)]);
      else {
        this._pairs[at] = [String(key), String(value)];
        this._pairs = this._pairs.filter((pair, index) => index <= at || pair[0] !== String(key));
      }
    }
    sort() { this._pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)); }
    forEach(visit, self) {
      for (const [key, value] of this._pairs) visit.call(self, value, key, this);
    }
    keys() { return this._pairs.map(pair => pair[0])[Symbol.iterator](); }
    values() { return this._pairs.map(pair => pair[1])[Symbol.iterator](); }
    entries() { return this._pairs.map(pair => [pair[0], pair[1]])[Symbol.iterator](); }
    [Symbol.iterator]() { return this.entries(); }
    get size() { return this._pairs.length; }
    toString() {
      return this._pairs
        .map(([key, value]) => encodeURIComponent(key) + "=" + encodeURIComponent(value))
        .join("&");
    }
  };
}
`;

/**
 * React Native ships Flow, and no bundler parses it — the same wall `vitest.config.ts` hits, with
 * the same answer: Hermes' own parser, because `@babel/preset-flow` is behind Flow's syntax and
 * dies on `flattenStyle.js`. esbuild needs no `requireToImport` counterpart; it resolves CommonJS
 * itself.
 */
const HERMES_SYNTAX = require_.resolve('babel-plugin-syntax-hermes-parser');
const FLOW_STRIP = require_.resolve('@babel/plugin-transform-flow-strip-types');
// NOT just `react-native/`: its Flow reaches into sibling `@react-native/*` packages.
const RN_SOURCE =
  /\/node_modules\/(react-native|@react-native\/[^/]+)\/.*\.jsx?$/;

/**
 * `ReactNativePrivateInitializeCore` is RN's app bootstrap, and nothing headless wants it to run.
 *
 * React's own Fabric renderer (`ReactFabric-prod.js`) requires it for its side effects on line 16,
 * and it pulls in LogBox, the DevTools hook and RN's whole component tree behind it — which reaches
 * `.png` imports and a dev-only module that does not resolve, so a bundle that merely MENTIONS the
 * stock renderer fails with dozens of errors naming files nobody asked for. What it installs is
 * global polyfills, error reporting and dev tooling; a measurement that ran them would be measuring
 * them.
 *
 * Emptied rather than resolved, so the renderer can be imported for an A/B against our own without
 * dragging an app bootstrap into every itest bundle. Stubbing a module no other itest imports costs
 * the rest of the suite nothing.
 */
const RN_INITIALIZE_CORE = /ReactNativePrivateInitializeCore(\.js)?$/;

const stubReactNativeBootstrap = {
  name: 'stub-react-native-initialize-core',
  setup(build) {
    build.onResolve({ filter: RN_INITIALIZE_CORE }, ({ path: request }) => ({
      path: request,
      namespace: 'rn-initialize-core-stub',
    }));
    build.onLoad(
      { filter: /.*/, namespace: 'rn-initialize-core-stub' },
      () => ({ contents: 'export {};', loader: 'js' }),
    );
  },
};

const reactNativeFlow = {
  name: 'strip-flow-from-react-native',
  setup(build) {
    build.onLoad({ filter: RN_SOURCE }, async ({ path: file }) => {
      const out = await babel.transformAsync(readFileSync(file, 'utf8'), {
        filename: file,
        babelrc: false,
        configFile: false,
        plugins: [[HERMES_SYNTAX, { parseLangTypes: 'flow' }], FLOW_STRIP],
      });
      // `jsx`, not `js`: stripping Flow leaves JSX untouched, and React Native writes JSX in `.js`
      // files (`VirtualizedList.js`, `AnimatedScrollView.js`, …). Reaching one under the `js` loader
      // is 75 copies of "The JSX syntax extension is not currently enabled" — which reads as a Flow
      // problem and is not one. A `.js` file with no JSX parses identically either way, so this is
      // strictly wider.
      return { contents: out?.code ?? '', loader: 'jsx' };
    });
  },
};

/**
 * Solid's JSX is not esbuild's JSX and must not be handed to it.
 *
 * `adapters/solid` builds with `jsx: 'preserve'` — tsc type-checks the JSX and emits it untouched,
 * because the real compilation is `babel-preset-solid`'s job in the consuming app's Metro. esbuild
 * would happily apply its OWN transform and produce `createElement` calls into nothing.
 *
 * The two options below are the same two `adapters/solid/babel-preset.cjs` pins for an app, and
 * `vitest.config.ts` pins for vitest. They must not drift: `generate: 'dom'` would exercise DOM
 * operations that never happen on a device, and a wrong `moduleName` fails at bundle time on a path
 * nobody wrote by hand.
 */
const SOLID_SOURCE =
  /(\/adapters\/solid\/|\/src\/solid\/).*\.tsx$|\/solid-[^/]*\.itest\.tsx$/;

const solidRequire = createRequire(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../adapters/solid/package.json',
  ),
);

const solidJsx = {
  name: 'compile-solid-jsx',
  setup(build) {
    build.onLoad({ filter: SOLID_SOURCE }, async ({ path: file }) => {
      // esbuild strips the TYPES and leaves the JSX alone (`jsx: 'preserve'`), then babel compiles
      // the JSX. Two passes rather than one because babel cannot parse TypeScript without a preset
      // this workspace does not install, and because the split is exactly how the real pipelines
      // are built — tsc preserves, the app's babel compiles.
      const typescript = await esbuild.transform(readFileSync(file, 'utf8'), {
        loader: 'tsx',
        jsx: 'preserve',
        sourcefile: file,
      });
      const out = await babel.transformAsync(typescript.code, {
        filename: file.replace(/\.tsx$/, '.jsx'),
        babelrc: false,
        configFile: false,
        presets: [
          [
            // Resolved from `adapters/solid`, not from here: under pnpm's isolated layout a
            // package's devDependencies live beside IT and are invisible at the repo root.
            solidRequire('babel-preset-solid'),
            {
              generate: 'universal',
              moduleName: '@symbiote-native/solid/renderer',
            },
          ],
        ],
      });
      return { contents: out?.code ?? '', loader: 'js' };
    });
  },
};

/**
 * Svelte components are compiled by the Svelte compiler, at bundle time.
 *
 * The vitest suites do this by compiling a SOURCE STRING at runtime, writing the output to a loose
 * `.mjs` and dynamic-importing it by path. None of that exists here: no file system a test can
 * write to, no module loader. So a component is an ordinary `.svelte` file next to the test and the
 * compiler runs in this plugin — which is also how a real app builds, and one indirection fewer.
 *
 * `generate: 'client'` is not a default: Svelte's server build has no `mount()` at all, and the
 * `browser` condition below is the matching half of that choice.
 */
const svelteRequire = createRequire(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../adapters/svelte/package.json',
  ),
);

const svelteComponents = {
  name: 'compile-svelte-components',
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, async ({ path: file }) => {
      // `?? .default` because the resolved entry is reached by PATH rather than by specifier, and
      // that loses the package's own ESM/CJS framing — the namespace can arrive wrapped.
      const loaded = await import(
        `file://${svelteRequire.resolve('svelte/compiler')}`
      );
      const compile = loaded.compile ?? loaded.default?.compile;
      const out = compile(readFileSync(file, 'utf8'), {
        generate: 'client',
        fragments: 'tree',
        css: 'external',
        filename: path.basename(file),
      });
      return { contents: out.js.code, loader: 'js' };
    });
  },
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Vue's SFC compiler, at bundle time — the same reason Svelte's `.svelte` loader exists above.
 *
 * `metro-vue-transformer.cjs`'s `compileSfc` is the SAME function Metro calls in a real app; it is
 * pure JS (parse the SFC, compile `<script setup>` + `<template>`, retarget `from 'vue'` at
 * `@symbiote-native/vue/runtime-helpers`), so it runs here in Node exactly as it does in Metro's
 * worker — nothing about it needs a filesystem inside the JSI runtime, only this build step.
 */
const vueTransformerPath = path.join(root, 'adapters/vue/metro-vue-transformer.cjs');

const vueSfc = {
  name: 'compile-vue-sfc',
  setup(build) {
    build.onLoad({ filter: /\.vue$/ }, async ({ path: file }) => {
      const loaded = await import(`file://${vueTransformerPath}`);
      const compileSfc = loaded.compileSfc ?? loaded.default?.compileSfc;
      const code = await compileSfc(readFileSync(file, 'utf8'), file);
      // `compileScript`'s output still carries the `<script setup>` block's TypeScript verbatim —
      // Metro's SECOND pass (RN's own babel transformer) is what strips it there; `ts` here is that
      // pass, esbuild's own.
      return { contents: code, loader: 'ts' };
    });
  },
};

/**
 * `@symbiote-native/*` by source, resolved from the workspace rather than from `node_modules`.
 *
 * A test file lives in `core/engine/cpp/tests/js`, which declares no dependencies, so pnpm's
 * isolated layout gives it no link to a sibling package. Pointing esbuild at the sources is also
 * what a test wants: the subject is the code in the tree, not the last build of it.
 */
const workspaceRoots = new Map(
  [
    'core/engine',
    'core/components',
    'core/test-utils',
    ...['react', 'vue', 'svelte', 'solid', 'angular'].map(
      name => `adapters/${name}`,
    ),
  ]
    .map(directory => {
      const manifest = path.join(root, directory, 'package.json');
      if (!existsSync(manifest)) return undefined;
      const { name } = JSON.parse(readFileSync(manifest, 'utf8'));
      return [name, path.join(root, directory, 'src')];
    })
    .filter(entry => entry !== undefined),
);

/**
 * A resolver rather than an `alias` map, because the packages expose SUBPATHS —
 * `@symbiote-native/components/register`, `@symbiote-native/engine/mutation-buffer` — and an alias
 * matches a specifier exactly. esbuild fills in the extension and the `/index` for us.
 */
const workspaceSources = {
  name: 'symbiote-workspace-sources',
  setup(build) {
    build.onResolve(
      { filter: /^@symbiote-native\// },
      ({ path: specifier }) => {
        for (const [name, source] of workspaceRoots) {
          const subpath =
            specifier === name
              ? 'index'
              : specifier.startsWith(`${name}/`)
                ? specifier.slice(name.length + 1)
                : undefined;
          if (subpath === undefined) continue;
          // Returning a path from `onResolve` is FINAL — esbuild does not then try extensions or an
          // index file — so the candidates are spelled out here.
          const base = path.join(source, subpath);
          for (const candidate of [
            `${base}.ts`,
            `${base}.tsx`,
            path.join(base, 'index.ts'),
            path.join(base, 'index.tsx'),
            base,
          ]) {
            if (existsSync(candidate)) return { path: candidate };
          }
        }
        return undefined;
      },
    );
  },
};
const testsDir = path.join(root, 'core/engine/cpp/tests/js');
/**
 * `SYMBIOTE_ITEST_BUILD=build-release` picks the optimized tester instead of the assert build.
 *
 * The default build is Debug with `NDEBUG` OFF, deliberately — `react_native_assert` is the whole
 * point of this harness, and two device aborts once hid under a green suite because a JS stand-in
 * could not abort. But `NDEBUG` off also defines `REACT_NATIVE_DEBUG`
 * (`ReactCommon/react/debug/flags.h`), and that compiles in consistency checks that walk a whole
 * child list on every mutation — `YogaLayoutableShadowNode::appendChild` calls `ensureConsistency`
 * plus `ensureYogaChildrenLookFine` and `ensureYogaChildrenAlignment`, so building a list of N
 * children one at a time is O(N²) in this build and O(N) in the one that ships.
 *
 * Measured 2026-09-17: 10 000 appends onto one parent took 3 554 ms here. A PERFORMANCE reading off
 * the default build is therefore not merely un-transferable in absolute terms, which was already
 * known — its SHAPE is wrong, and a quadratic that only exists under asserts is exactly the kind of
 * finding that sends a day's work at nothing.
 *
 * So: correctness runs on `build`, timings run on `build-release`. Neither replaces the other.
 */
const buildDirectory = process.env.SYMBIOTE_ITEST_BUILD ?? 'build';
const binary = path.join(
  root,
  `core/engine/cpp/tests/${buildDirectory}/symbiote_tester`,
);

/**
 * Recursive, because this directory has to hold hundreds of files eventually and a flat one stops
 * being readable long before that. A subdirectory per subject mirrors how the vitest suites are laid
 * out, which is also where these files come FROM.
 */
function itestsUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return itestsUnder(full);
    return entry.name.endsWith('.itest.ts') || entry.name.endsWith('.itest.tsx')
      ? [full]
      : [];
  });
}

const found = process.argv.slice(2).length
  ? process.argv.slice(2)
  : itestsUnder(testsDir).sort();

if (found.length === 0) {
  console.error('no *.itest.ts found');
  process.exit(1);
}

const out = mkdtempSync(path.join(tmpdir(), 'symbiote-itest-'));
let failed = 0;

try {
  for (const file of found) {
    // Named by the path relative to the tests root, flattened — two files of the same basename in
    // different subdirectories would otherwise write over each other's bundle.
    const bundle = path.join(
      out,
      `${path.relative(testsDir, file).replace(/[\\/]/g, '__').replace(/\.tsx?$/, '')}.js`,
    );
    await esbuild.build({
      entryPoints: [file],
      bundle: true,
      outfile: bundle,
      format: 'iife',
      // The runtime is JavaScriptCore on macOS, which is current — this only has to strip the
      // syntax the bundler cannot leave to it, not lower to an old baseline.
      target: 'es2022',
      platform: 'neutral',
      mainFields: ['module', 'main'],
      resolveExtensions: [
        '.ts',
        '.tsx',
        '.mjs',
        '.js',
        '.jsx',
        '.json',
        '.svelte',
        '.vue',
      ],
      // A test file's own directory has no `node_modules`, and under pnpm's isolated layout a
      // package's dependencies live beside IT. `react` is reachable from `adapters/react` and
      // nowhere else, so the search path is every workspace package plus the root.
      nodePaths: [
        path.join(root, 'node_modules'),
        ...[...workspaceRoots.values()].map(source =>
          path.join(path.dirname(source), 'node_modules'),
        ),
      ].filter(existsSync),
      // `browser` is for Svelte and is not cosmetic: its `.` export splits on it, and the
      // `default`/`worker` side is the SSR runtime whose `mount()` throws outright. Vitest's Svelte
      // project sets the same condition for the same reason.
      conditions: ['browser', 'import', 'default'],
      // A JSI runtime has no `process` and no Metro to inline these. `__DEV__` stays TRUE on
      // purpose: it is what keeps React Native's own invariants and warnings armed, which is the
      // same reason the C++ side is built Debug.
      // What the platform supplies and a bare JSI runtime does not. On a device this is React
      // Native's `InitializeCore`; Hermes carries `queueMicrotask` outright, JavaScriptCore does
      // not, and Vue's scheduler reaches for it on the first render. The body is the standard
      // one-liner, not an invention.
      // Angular's JIT compiler reads LEGACY decorator metadata — `@Input()` on a field, applied
      // the TypeScript way. esbuild defaults to the standard-decorators semantics, and Angular
      // rejects those outright ("Standard Angular field decorators are not supported in JIT mode").
      // `useDefineForClassFields: false` travels with it for the same reason: a defined (rather
      // than assigned) field would overwrite what the decorator installed.
      tsconfigRaw: {
        compilerOptions: {
          experimentalDecorators: true,
          useDefineForClassFields: false,
        },
      },
      banner: { js: PLATFORM_PRELUDE },
      define: {
        __DEV__: 'true',
        'process.env.NODE_ENV': '"development"',
      },
      plugins: [
        workspaceSources,
        solidJsx,
        svelteComponents,
        vueSfc,
        stubReactNativeBootstrap,
        reactNativeFlow,
      ],
      logLevel: 'silent',
    });

    const run = spawnSync(binary, [bundle], { encoding: 'utf8' });
    if (run.error) throw run.error;

    for (const line of run.stdout.split('\n').filter(Boolean)) {
      if (line.startsWith('FAIL ')) failed += 1;
      console.log(line);
    }
    if (run.status !== 0) {
      failed += 1;
      console.error(run.stderr.trim());
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

process.exit(failed > 0 ? 1 : 0);
