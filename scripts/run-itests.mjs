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
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { availableParallelism, tmpdir } from 'node:os';
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
// JSC has no \`global\`; Node and Hermes both do, and React Native's source spells it that way —
// \`ReactNativeViewConfigRegistry\` and its neighbours reach \`global.__fbBatchedBridge\` and friends.
// Without it, importing a real RN component module dies on "Can't find variable: global", which
// reads as a missing native module and is not one.
if (typeof global === "undefined") {
  globalThis.global = globalThis;
}
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
  // HERMES NEEDS THIS ONE BY NAME. Its Promise implementation lives in \`InternalBytecode.js\` and
  // schedules every resolution through \`setImmediate\`, so on the Hermes host the first \`await\`
  // anywhere dies with "Property 'setImmediate' doesn't exist" — pointing at bytecode, which reads
  // like an engine fault and is a missing host facility. JavaScriptCore never asked because its
  // promises resolve on their own microtask queue.
  globalThis.setImmediate = function (task) {
    return globalThis.setTimeout(task, 0);
  };
  globalThis.clearImmediate = globalThis.clearTimeout;
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
// JavaScriptCore carries a \`console\`; Hermes does not, and on a device React Native installs one.
// A fixture that captures \`console.error\` to prove the stock renderer stayed quiet — the trap
// \`stock-suite.itest.tsx\` records — dies at module scope without it, naming a property rather than
// the missing platform. Routed through the tester's own \`print\` so anything written is visible in
// the run rather than swallowed.
if (typeof globalThis.console === "undefined") {
  const say = function (level) {
    return function () {
      const parts = [];
      for (let at = 0; at < arguments.length; at++) parts.push(String(arguments[at]));
      const tester = globalThis.__symbioteTester;
      const line = level + ": " + parts.join(" ");
      if (tester !== undefined && typeof tester.print === "function") tester.print(line);
    };
  };
  globalThis.console = {
    log: say("log"), info: say("info"), warn: say("warn"),
    error: say("error"), debug: say("debug"), trace: say("trace"),
    group: say("group"), groupEnd: function () {}, table: say("table"),
  };
}
// A bridgeless host always has this global and the engine's device-event hub refuses to start
// without it. Nothing is reachable behind it, so Dimensions falls back to zero metrics
if (typeof globalThis.RN$registerCallableModule !== "function") {
  globalThis.RN$registerCallableModule = function () {};
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
 * Metro platform extensions for RN files only, opt-in via `@symbiote-platform-extensions`.
 * Without them `Platform.js` resolves to itself, always-on it broke 154 of 158 itests at import
 * (`NativePlatformConstantsIOS` needs a native module), so our own sources keep plain resolution
 */
const PLATFORM_EXTENSIONS_DIRECTIVE = '@symbiote-platform-extensions';

/**
 * Count what a STOCK arm asks Fabric to create, by view name — the headless twin of
 * `examples/*​/fabric-call-counter.ts`, and the only way to take that number here.
 *
 * It lives in the banner because React captures `createNode` before any test body runs
 * Opt-in via `@symbiote-count-fabric-calls`, the file owes `__symbioteRestoreFabric()` after load
 */
const FABRIC_COUNT_DIRECTIVE = '@symbiote-count-fabric-calls';

// A file asks for Fabric feature flags with `@symbiote-fabric-flags {"enableViewCulling":true}`,
// on as many lines as it likes. The tester reads them once per process: `SYMBIOTE_FLAGS`
const FABRIC_FLAGS_PATTERN = /@symbiote-fabric-flags\s+(\{.*\})/g;

// A flag value `"*"` runs the file once per boolean, as Fantom's `@fantom_flags name:*` does
const EVERY_VALUE = '*';

// One entry per flag combination a file asks for, `flags` undefined when it asks for none
function fabricFlagVariantsOf(file) {
  const found = [...readFileSync(file, 'utf8').matchAll(FABRIC_FLAGS_PATTERN)];
  if (found.length === 0) return [{ flags: undefined, label: '' }];
  const merged = Object.assign({}, ...found.map(match => JSON.parse(match[1])));
  const combinations = Object.entries(merged).reduce(
    (variants, [name, value]) =>
      variants.flatMap(variant =>
        (value === EVERY_VALUE ? [true, false] : [value]).map(one => ({
          ...variant,
          [name]: one,
        })),
      ),
    [{}],
  );
  const isExpanded = Object.values(merged).includes(EVERY_VALUE);
  return combinations.map(flags => ({
    flags: JSON.stringify(flags),
    label: isExpanded ? `[${JSON.stringify(flags)}] ` : '',
  }));
}

const FABRIC_COUNT_PRELUDE = `
(function () {
  var original = globalThis.nativeFabricUIManager;
  if (original === undefined || original === null) return;
  var createNode = original.createNode;
  if (typeof createNode !== "function") return;
  var counts = Object.create(null);
  var view = Object.create(original);
  var counting = function () {
    var name = arguments[1];
    if (typeof name === "string") counts[name] = (counts[name] || 0) + 1;
    return createNode.apply(original, arguments);
  };
  // A rest/arguments function reports \`length === 0\`, and the engine feature-detects the batched
  // clone bindings BY ARITY (\`core/engine/src/fabric.ts\`). Copy the host's own.
  Object.defineProperty(counting, "length", { value: createNode.length });
  view.createNode = counting;
  globalThis.nativeFabricUIManager = view;
  globalThis.__symbioteFabricCreates = counts;
  globalThis.__symbioteRestoreFabric = function () {
    globalThis.nativeFabricUIManager = original;
  };
})();
`;

const RN_IMPORTER = /[/\\]node_modules[/\\](react-native|@react-native[/\\])/;
const RELATIVE_REQUEST = /^\.\.?[/\\]/;

// `resolveDir` + `request` alone determine the candidate — the `existsSync` check is worth caching
// since the same RN-internal relative import repeats across every bundle that reaches it.
const platformExtensionCache = new Map();

const reactNativePlatformExtensions = {
  name: 'react-native-platform-extensions',
  setup(build) {
    build.onResolve(
      { filter: RELATIVE_REQUEST },
      ({ path: request, importer, resolveDir }) => {
        if (!RN_IMPORTER.test(importer)) return undefined;
        const key = `${resolveDir}\0${request}`;
        if (platformExtensionCache.has(key))
          return platformExtensionCache.get(key);
        const candidate = path.resolve(resolveDir, `${request}.ios.js`);
        const resolved = existsSync(candidate)
          ? { path: candidate }
          : undefined;
        platformExtensionCache.set(key, resolved);
        return resolved;
      },
    );
  },
};

/**
 * `ReactNativePrivateInitializeCore` is RN's app bootstrap, so it is emptied for every bundle.
 * The stock renderer requires it for side effects, and it drags in LogBox and `.png` imports
 */
const RN_INITIALIZE_CORE = /ReactNativePrivateInitializeCore(\.js)?$/;
// The `react-native` barrel reaches RN's experimental virtual-collection components through lazy
// getters, and esbuild bundles them anyway - where `VirtualCollectionView.js` imports a
// `VirtualViewMode` its sibling does not export and the build fails. `@react-native/virtualized-
// lists` imports that barrel, so any stock `FlatList` arm hits it. Nothing headless renders one.
const RN_VIRTUAL_COLLECTION = /virtualcollection\//;
// RN's feature flags read their native spec through the legacy bridge, which does not exist here
// A null spec leaves every flag on its JS default, the value a stock app without native flags sees
const RN_FEATURE_FLAGS_SPEC = /specs\/NativeReactNativeFeatureFlags(\.js)?$/;

const stubReactNativeBootstrap = {
  name: 'stub-react-native-initialize-core',
  setup(build) {
    build.onResolve({ filter: RN_VIRTUAL_COLLECTION }, ({ path: request }) => ({
      path: request,
      namespace: 'rn-initialize-core-stub',
    }));
    build.onResolve({ filter: RN_INITIALIZE_CORE }, ({ path: request }) => ({
      path: request,
      namespace: 'rn-initialize-core-stub',
    }));
    build.onLoad(
      { filter: /.*/, namespace: 'rn-initialize-core-stub' },
      () => ({ contents: 'export {};', loader: 'js' }),
    );
    build.onResolve({ filter: RN_FEATURE_FLAGS_SPEC }, ({ path: request }) => ({
      path: request,
      namespace: 'rn-feature-flags-stub',
    }));
    build.onLoad(
      { filter: /.*/, namespace: 'rn-feature-flags-stub' },
      () => ({ contents: 'export default null;', loader: 'js' }),
    );
  },
};

// One RN source file is imported by nearly every bundle (`Platform.js`, `StyleSheet.js`, …), and
// its content can't change mid-run — so the Flow strip is a pure function of `file` for the whole
// process. Keyed by promise, not by result, so two builds that hit the same uncached file don't
// both pay for the transform.
const reactNativeFlowCache = new Map();

const reactNativeFlow = {
  name: 'strip-flow-from-react-native',
  setup(build) {
    build.onLoad({ filter: RN_SOURCE }, ({ path: file }) => {
      let cached = reactNativeFlowCache.get(file);
      if (cached === undefined) {
        cached = babel
          .transformAsync(readFileSync(file, 'utf8'), {
            filename: file,
            babelrc: false,
            configFile: false,
            plugins: [[HERMES_SYNTAX, { parseLangTypes: 'flow' }], FLOW_STRIP],
          })
          // `jsx`, not `js`: stripping Flow leaves JSX untouched, and React Native writes JSX in
          // `.js` files (`VirtualizedList.js`, `AnimatedScrollView.js`, …). Reaching one under the
          // `js` loader is 75 copies of "The JSX syntax extension is not currently enabled" — which
          // reads as a Flow problem and is not one. A `.js` file with no JSX parses identically
          // either way, so this is strictly wider.
          .then(out => ({ contents: out?.code ?? '', loader: 'jsx' }));
        reactNativeFlowCache.set(file, cached);
      }
      return cached;
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

// Same deal as `reactNativeFlow`: a shared `.tsx` under `adapters/solid` is re-entered by every
// itest bundle that touches Solid, and the two-pass compile is redone identically each time
// without this cache.
const solidJsxCache = new Map();

const solidJsx = {
  name: 'compile-solid-jsx',
  setup(build) {
    build.onLoad({ filter: SOLID_SOURCE }, ({ path: file }) => {
      let cached = solidJsxCache.get(file);
      if (cached === undefined) {
        cached = (async () => {
          // esbuild strips TYPES and keeps the JSX (`jsx: 'preserve'`), then babel compiles it
          // Two passes because babel cannot parse TypeScript without a preset this workspace lacks
          const typescript = await esbuild.transform(
            readFileSync(file, 'utf8'),
            {
              loader: 'tsx',
              jsx: 'preserve',
              sourcefile: file,
            },
          );
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
        })();
        solidJsxCache.set(file, cached);
      }
      return cached;
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

// Loaded once for the whole run, not once per `.svelte` file: the dynamic `import()` was re-run on
// every load even though it always resolves the same module.
let svelteCompilePromise;
function svelteCompile() {
  if (svelteCompilePromise === undefined) {
    // `?? .default` because the resolved entry is reached by PATH rather than by specifier, and
    // that loses the package's own ESM/CJS framing — the namespace can arrive wrapped.
    svelteCompilePromise = import(
      `file://${svelteRequire.resolve('svelte/compiler')}`
    ).then(loaded => loaded.compile ?? loaded.default?.compile);
  }
  return svelteCompilePromise;
}

// A `.svelte` fixture shared across multiple itest bundles was recompiled once per bundle; its
// output can't change mid-run.
const svelteComponentsCache = new Map();

const svelteComponents = {
  name: 'compile-svelte-components',
  setup(build) {
    build.onLoad({ filter: /\.svelte$/ }, ({ path: file }) => {
      let cached = svelteComponentsCache.get(file);
      if (cached === undefined) {
        cached = svelteCompile().then(compile => {
          const out = compile(readFileSync(file, 'utf8'), {
            generate: 'client',
            fragments: 'tree',
            css: 'external',
            filename: path.basename(file),
          });
          return { contents: out.js.code, loader: 'js' };
        });
        svelteComponentsCache.set(file, cached);
      }
      return cached;
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
const vueTransformerPath = path.join(
  root,
  'adapters/vue/metro-vue-transformer.cjs',
);

// Same fix as Svelte's compiler load: one dynamic `import()` for the whole run, not one per `.vue`
// file.
let vueCompileSfcPromise;
function vueCompileSfc() {
  if (vueCompileSfcPromise === undefined) {
    vueCompileSfcPromise = import(`file://${vueTransformerPath}`).then(
      loaded => loaded.compileSfc ?? loaded.default?.compileSfc,
    );
  }
  return vueCompileSfcPromise;
}

// A shared `.vue` fixture compiled once per itest bundle that imports it; cache by file since the
// SFC's content is fixed for the run.
const vueSfcCache = new Map();

async function compileVueFixture(file) {
  const compileSfc = await vueCompileSfc();
  const code = await compileSfc(readFileSync(file, 'utf8'), file);
  // The compiled script still carries its TypeScript, the `ts` loader is esbuild's strip pass
  return { contents: code, loader: 'ts' };
}

const vueSfc = {
  name: 'compile-vue-sfc',
  setup(build) {
    build.onLoad({ filter: /\.vue$/ }, ({ path: file }) => {
      let cached = vueSfcCache.get(file);
      if (cached === undefined) {
        cached = compileVueFixture(file);
        vueSfcCache.set(file, cached);
      }
      return cached;
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
// A specifier like `@symbiote-native/engine` recurs in nearly every bundle, and resolution depends
// only on the specifier string, so it is cached instead of re-walking `existsSync` candidates
const workspaceResolveCache = new Map();

function subpathWithin(specifier, packageName) {
  if (specifier === packageName) return 'index';
  if (specifier.startsWith(`${packageName}/`)) {
    return specifier.slice(packageName.length + 1);
  }
  return undefined;
}

// The Android arm resolves our own sources the way Metro does on a device: `X.android.ts` and
// `X/index.android.ts` win over the base file. Without it every name table is the iOS one
const platformSuffixes = () => (shouldRunAndroid ? ['.android', ''] : ['']);

// Returning a path from `onResolve` is final, esbuild would not try extensions or an index file
function firstExistingModule(source, subpath) {
  const base = path.join(source, subpath);
  const found = platformSuffixes().flatMap(suffix => [
    `${base}${suffix}.ts`,
    `${base}${suffix}.tsx`,
    path.join(base, `index${suffix}.ts`),
    path.join(base, `index${suffix}.tsx`),
  ])
    .concat(base)
    .find(candidate => existsSync(candidate));
  return found === undefined ? undefined : { path: found };
}

function resolveWorkspace(specifier) {
  for (const [name, source] of workspaceRoots) {
    const subpath = subpathWithin(specifier, name);
    if (subpath === undefined) continue;
    const resolved = firstExistingModule(source, subpath);
    if (resolved !== undefined) return resolved;
  }
  return undefined;
}

const workspaceSources = {
  name: 'symbiote-workspace-sources',
  setup(build) {
    build.onResolve(
      { filter: /^@symbiote-native\// },
      ({ path: specifier }) => {
        if (!workspaceResolveCache.has(specifier)) {
          workspaceResolveCache.set(specifier, resolveWorkspace(specifier));
        }
        return workspaceResolveCache.get(specifier);
      },
    );
  },
};
const testsDir = path.join(root, 'core/engine/cpp/tests/js');
// `SYMBIOTE_ITEST_BUILD=build-release` picks the optimized tester. Default Debug (`NDEBUG` OFF) is
// deliberate — `react_native_assert` is the point — but it also enables `REACT_NATIVE_DEBUG`
// consistency checks walking the whole child list per mutation: O(N²) here, O(N) in the ship build.

// Correctness runs on `build`, timings run on `build-release`. Neither replaces the other.
const buildDirectory = process.env.SYMBIOTE_ITEST_BUILD ?? 'build';

// The JS half of the `build`/`build-release` split: `__DEV__`/`NODE_ENV` must track it too.
// Pinned to development, `build-release` would time the DEVELOPMENT React (`react/index.js` picks
// `react.development.js` off `NODE_ENV`) — the JS twin of never benchmarking a Debug native build.

// It also blocks the stock arm: `ReactFabric-prod` is production-shaped, and a development
// `createElement` reaching for `dispatcher.getOwner()` renders and reports nothing
const isBenchBuild = buildDirectory !== 'build';
const binary = path.join(
  root,
  `core/engine/cpp/tests/${buildDirectory}/symbiote_tester`,
);

// `SYMBIOTE_ITEST_BYTECODE=1` compiles each bundle with `hermesc -O` and runs the BYTECODE — what a
// device runs. `runtime.evaluateJavaScript(StringBuffer(source))` compiles at load WITHOUT the
// optimizer, so a release app's `.hbc` (`-O`) is not what this harness measures by default.

// `-Xes6-block-scoping` IS NOT OPTIONAL: `hermesc` defaults it off, so `const one` in a `for…of`
// stops being per-iteration and every closure in `report()`'s case chain captures the LAST case —
// a wrong ANSWER, not an error. A single-case fixture passes happily, which is how this hides.
const shouldRunBytecode = process.env.SYMBIOTE_ITEST_BYTECODE === '1';

// `hermesc` ships inside the `hermes-engine` pod, not on npm, so it is the SAME compiler the app
// build uses and pairs with the `hermesvm.framework` the tester links against
function findHermesc() {
  const examples = path.join(root, 'examples');
  const entries = existsSync(examples)
    ? readdirSync(examples, { withFileTypes: true })
    : [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(
      examples,
      entry.name,
      'ios/Pods/hermes-engine/destroot/bin/hermesc',
    );
    if (existsSync(candidate)) return candidate;
  }
  // `scripts/fetch-hermes.mjs` unpacks the same pod, and on a runner that never runs `pod install`
  // it is the only copy - the path CMake already searches for `hermesvm.framework`
  const fetched = path.join(root, '.hermes/destroot/bin/hermesc');
  return existsSync(fetched) ? fetched : undefined;
}

const hermesc = shouldRunBytecode ? findHermesc() : undefined;
if (shouldRunBytecode && hermesc === undefined) {
  console.error(
    'SYMBIOTE_ITEST_BYTECODE=1 but no hermesc found - run `node scripts/fetch-hermes.mjs`',
  );
  process.exit(2);
}

function compileToBytecode(bundle) {
  const out = `${bundle.replace(/\.js$/, '')}.hbc`;
  return new Promise((resolve, reject) => {
    const child = spawn(hermesc, [
      '-Xes6-block-scoping',
      '-O',
      '-emit-binary',
      '-out',
      out,
      bundle,
    ]);
    let stderr = '';
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', status =>
      status === 0
        ? resolve(out)
        : reject(new Error(`hermesc failed on ${bundle}:\n${stderr.trim()}`)),
    );
  });
}

// Kept out of the print loop so the loop stays one line per finished bundle: this is the whole
// per-run report, and it returns how many failures it saw
function reportRun(run) {
  let failures = 0;
  for (const line of run.stdout.split('\n').filter(Boolean)) {
    if (line.startsWith('FAIL ')) failures += 1;
    console.log(run.label === undefined ? line : `${run.label}${line}`);
  }
  if (run.status === 0 && run.signal === null) return failures;
  // A tester killed by a SIGNAL exits with `status` `null` and writes NOTHING to stderr, so without
  // the file name and the signal a dead run is indistinguishable from a silent one
  const how =
    run.signal === null
      ? `exit status ${run.status}`
      : `killed by ${run.signal}`;
  const silent = run.stdout.trim() === '' ? ', no output' : '';
  console.error(`CRASH ${path.relative(testsDir, run.file)} - ${how}${silent}`);
  if (run.stderr.trim() !== '') console.error(run.stderr.trim());
  return failures + 1;
}

/**
 * `*.android.itest.ts` runs only on `build-android`, every other file only on the other builds
 * A hard split because each arm's fixtures assume their own platform, like Metro's `.ios.js` suffix
 */
const ANDROID_SUFFIX = '.android.itest.ts';
const shouldRunAndroid = buildDirectory === 'build-android';

/**
 * Recursive, a subdirectory per subject mirrors how the vitest suites are laid out
 */
function itestsUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return itestsUnder(full);
    if (entry.name.endsWith(ANDROID_SUFFIX)) {
      return shouldRunAndroid ? [full] : [];
    }
    if (shouldRunAndroid) return [];
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

// A test file's own directory has no `node_modules`, and under pnpm's isolated layout a package's
// dependencies live beside IT. `react` is reachable from `adapters/react` and nowhere else, so the
// search path is every workspace package plus the root. Fixed for the whole run — hoisted out of
// the loop so the `existsSync` filter doesn't re-run per bundle.
const nodePaths = [
  path.join(root, 'node_modules'),
  ...[...workspaceRoots.values()].map(source =>
    path.join(path.dirname(source), 'node_modules'),
  ),
].filter(existsSync);

// The tester binary is a clean per-process invocation — one bundle in on argv, stdout/stderr out,
// no shared file or port across runs — so nothing here needs the runs to be sequential. The binary
// wall time dominates a run, not the bundling this file already caches.
const testConcurrency = Math.max(1, availableParallelism());

/**
 * A fixed chunk of `Promise.all` stalls on its slowest member, and benchmarks mix with unit tests
 * Here a slot refills the moment it frees, from one shared queue, so a fast file never waits
 */
function createLimiter(max) {
  let active = 0;
  const queue = [];
  const pump = () => {
    if (active >= max || queue.length === 0) return;
    active += 1;
    const { fn, resolve, reject } = queue.shift();
    fn()
      .then(resolve, reject)
      .finally(() => {
        active -= 1;
        pump();
      });
  };
  return fn =>
    new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      pump();
    });
}

const limitTestRun = createLimiter(testConcurrency);

function runTester(bundle, flags) {
  return new Promise((resolve, reject) => {
    const env =
      flags === undefined ? process.env : { ...process.env, SYMBIOTE_FLAGS: flags };
    const child = spawn(binary, [bundle], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', reject);
    // `close` reports (code, signal) and the signal is the half that used to be dropped: a process
    // killed by one exits with code `null`, so a caller reading only the code sees "not zero" and
    // learns nothing else. Both are carried.
    child.on('close', (status, signal) =>
      resolve({ status, signal, stdout, stderr }),
    );
  });
}

const out = mkdtempSync(path.join(tmpdir(), 'symbiote-itest-'));
let failed = 0;
let buildMs = 0;
let runMs = 0;

try {
  const limitBuild = createLimiter(testConcurrency);
  // Builds overlap now, so `buildMs` is the sum of each build's own duration
  const timeBuild = async run => {
    const start = performance.now();
    try {
      return await run();
    } finally {
      buildMs += performance.now() - start;
    }
  };
  const buildBundle = async file => {
    // Named by the path relative to the tests root, flattened — two files of the same basename in
    // different subdirectories would otherwise write over each other's bundle.
    const bundle = path.join(
      out,
      `${path
        .relative(testsDir, file)
        .replace(/[\\/]/g, '__')
        .replace(/\.tsx?$/, '')}.js`,
    );
    await timeBuild(() => esbuild.build({
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
        ...(shouldRunAndroid ? ['.android.ts', '.android.tsx'] : []),
        '.ts',
        '.tsx',
        '.mjs',
        '.js',
        '.jsx',
        '.json',
        '.svelte',
        '.vue',
      ],
      nodePaths,
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
      banner: {
        js:
          PLATFORM_PRELUDE +
          (readFileSync(file, 'utf8').includes(FABRIC_COUNT_DIRECTIVE)
            ? FABRIC_COUNT_PRELUDE
            : ''),
      },
      // RN's development FlatList reaches LogBox, whose chevrons are `.png` requires; nothing here
      // paints an image, so they bundle as empty modules.
      loader: { '.png': 'empty' },
      define: {
        __DEV__: isBenchBuild ? 'false' : 'true',
        'process.env.NODE_ENV': isBenchBuild ? '"production"' : '"development"',
        // Where `runBenchSuite` writes a Hermes sampling-profile per step; empty = no profiling.
        __SYMBIOTE_PROFILE_DIR__: JSON.stringify(
          process.env.SYMBIOTE_PROFILE_DIR ?? '',
        ),
      },
      // ANGULAR'S OWN DEV SWITCH IS A THIRD ONE — neither `__DEV__` nor `NODE_ENV` reaches it, and
      // `initNgDevMode` turns itself ON when the global is undefined (`ng_dev_mode.ts:85`). Every
      // Angular arm this directory has ever timed ran under it.
      //
      // IT IS DELIBERATELY NOT A `define` HERE, and that was tried first. A compile-time `false`
      // also strips the metadata a component definition builds at class-definition time, which is
      // MORE than a Metro bundle gets — so it would measure a build the device cannot have and
      // publish the difference as ours. `mount()` calls Angular's own `enableProdMode()` off the
      // `__DEV__` above instead, which is exactly what ships, so these arms measure that.
      plugins: [
        workspaceSources,
        solidJsx,
        svelteComponents,
        vueSfc,
        stubReactNativeBootstrap,
        ...(readFileSync(file, 'utf8').includes(PLATFORM_EXTENSIONS_DIRECTIVE)
          ? [reactNativePlatformExtensions]
          : []),
        reactNativeFlow,
      ],
      logLevel: 'silent',
    }));
    // Counted as BUILD time, not run time: a release app does this step at build time too
    // Paired with its SOURCE file, since a bundle path is a flattened temp name
    const built = shouldRunBytecode
      ? await timeBuild(() => compileToBytecode(bundle))
      : bundle;
    return { file, bundle: built };
  };
  const bundles = await Promise.all(
    found.map(file => limitBuild(() => buildBundle(file))),
  );

  const runStart = performance.now();
  // Every bundle is queued at once and the limiter caps how many run concurrently
  // Printing walks them in submission order, so output stays grouped as a sequential run's
  const runPromises = bundles.flatMap(({ file, bundle }) =>
    fabricFlagVariantsOf(file).map(({ flags, label }) =>
      limitTestRun(() =>
        runTester(bundle, flags).then(run => ({ ...run, file, label })),
      ),
    ),
  );
  const runs = await Promise.all(runPromises);
  for (const run of runs) failed += reportRun(run);
  runMs += performance.now() - runStart;
} finally {
  // `SYMBIOTE_KEEP_BUNDLES=1` leaves them on disk and says where. A stack trace out of the tester
  // names a line in the BUNDLE, and without the file that line number is unreadable — which is a
  // debugging wall every time a failure is about module order rather than about the test.
  if (process.env.SYMBIOTE_KEEP_BUNDLES === '1') {
    console.error(`BUNDLES ${out}`);
  } else {
    rmSync(out, { recursive: true, force: true });
  }
}

console.error(
  `PROFILE build=${buildMs.toFixed(0)}ms run=${runMs.toFixed(0)}ms files=${found.length}`,
);
process.exit(failed > 0 ? 1 : 0);
