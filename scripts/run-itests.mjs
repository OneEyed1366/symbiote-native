/**
 * Runs `*.itest.ts` inside the real engine: bundle, evaluate in `symbiote_tester`, report
 * Same shape as RN's runner (`private/react-native-fantom/runner`), as the binary evaluates
 * one script against a JSI runtime with no module loader, so a bundler is unavoidable
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

import {
  reanimatedItestSeams,
  reanimatedNodePaths,
} from './reanimated-itest-seams.mjs';

const require_ = createRequire(import.meta.url);

/**
 * What the platform supplies and a bare JSI runtime does not (RN's `InitializeCore` on a device)
 * Hermes has `queueMicrotask`, JavaScriptCore does not, and neither has timers, which React needs
 * Timers are queued and drained by the test (`flushTimers` in `js/harness.ts`): no run loop here
 */
const PLATFORM_PRELUDE = `
// JSC has no \`global\`, but RN sources reach \`global.__fbBatchedBridge\` and friends
// Without it a real RN component import dies on "Can't find variable: global", which reads as a
// missing native module
if (typeof global === "undefined") {
  globalThis.global = globalThis;
}
if (typeof queueMicrotask !== "function") {
  // A device reports a throw from a microtask, while a bare \`then\` drops it with no handler
  globalThis.queueMicrotask = function (task) {
    Promise.resolve().then(function () {
      try {
        task();
      } catch (error) {
        console.error("uncaught in a microtask: " + String((error && error.stack) || error));
      }
    });
  };
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
  // Hermes needs \`setImmediate\` by name: its Promise lives in \`InternalBytecode.js\` and
  // resolves through it, so the first \`await\` dies on a missing host facility
  // JavaScriptCore never asked, as its promises use their own microtask queue
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
// RN's \`InitializeCore\` sets both: \`window\` is the global, \`navigator.product\` marks RN
// Libraries read them at module scope, so their absence is a hard failure

// RN's \`InitializeCore\` installs a \`performance\` with a monotonic clock, and Angular's
// profiler calls \`performance.now()\` on its first mount

// The tester binds a \`steady_clock\` in fractional ms, which is used here
// The \`Date.now\` fallback is whole ms and stays only for a host that predates the binding
if (typeof globalThis.performance === "undefined") {
  const tester = globalThis.__symbioteTester;
  if (tester !== undefined && typeof tester.now === "function") {
    globalThis.performance = { now: function () { return tester.now(); } };
  } else {
    const started = Date.now();
    globalThis.performance = { now: function () { return Date.now() - started; } };
  }
}
// JavaScriptCore carries a \`console\`, Hermes does not, and on a device React Native installs one
// A fixture capturing \`console.error\` dies at module scope without it (\`stock-suite.itest.tsx\`)
// Output goes through the tester's own \`print\`, so anything written is visible in the run
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
 * RN ships Flow and no bundler parses it, so Hermes' own parser is used, as in `vitest.config.ts`
 * `@babel/preset-flow` dies on `flattenStyle.js`, and esbuild resolves CommonJS itself
 */
const HERMES_SYNTAX = require_.resolve('babel-plugin-syntax-hermes-parser');
const FLOW_STRIP = require_.resolve('@babel/plugin-transform-flow-strip-types');
// Not just `react-native/`, as its Flow reaches into sibling `@react-native/*` packages
const RN_SOURCE =
  /\/node_modules\/(react-native|@react-native\/[^/]+)\/.*\.jsx?$/;

/**
 * Metro platform extensions for RN files only, opt-in via `@symbiote-platform-extensions`.
 * Without them `Platform.js` resolves to itself, always-on it broke 154 of 158 itests at import
 * (`NativePlatformConstantsIOS` needs a native module), so our own sources keep plain resolution
 */
const PLATFORM_EXTENSIONS_DIRECTIVE = '@symbiote-platform-extensions';
const REACT_JSX_DIRECTIVE = '@symbiote-react-jsx';

/**
 * Counts what a stock arm asks Fabric to create, by view name (twin of `fabric-call-counter.ts`)
 * Lives in the banner as React captures `createNode` before any test body runs
 * Opt-in via `@symbiote-count-fabric-calls`, the file owes `__symbioteRestoreFabric()` after load
 */
const FABRIC_COUNT_DIRECTIVE = '@symbiote-count-fabric-calls';

// A file asks for Fabric feature flags with `@symbiote-fabric-flags {"enableViewCulling":true}`,
// on as many lines as it likes. The tester reads them once per process: `SYMBIOTE_FLAGS`
const FABRIC_FLAGS_PATTERN = /@symbiote-fabric-flags\s+(\{.*\})/g;

// A flag value `"*"` runs the file once per boolean, as Fantom's `@fantom_flags name:*` does
const EVERY_VALUE = '*';

function parseJson(text, origin) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid JSON in ${origin}: ${error.message}`);
  }
}

// One entry per flag combination a file asks for, `flags` undefined when it asks for none
function fabricFlagVariantsOf(file) {
  const found = [...readFileSync(file, 'utf8').matchAll(FABRIC_FLAGS_PATTERN)];
  if (found.length === 0) return [{ flags: undefined, label: '' }];
  const merged = Object.assign({}, ...found.map(match => parseJson(match[1], file)));
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

// `resolveDir` and `request` fix the candidate, so the `existsSync` result is cached per pair
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
// The `react-native` barrel lazily reaches RN's experimental virtual-collection components
// esbuild bundles them anyway and `VirtualCollectionView.js` fails on a missing `VirtualViewMode`
// A stock `FlatList` arm reaches it via `@react-native/virtualized-lists`, nothing renders one
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

// Bundles share the same RN files (`Platform.js`, `StyleSheet.js`), so the Flow strip is cached
// per run, keyed by promise so two builds on one uncached file pay for the transform once
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
          // `jsx`, not `js`: RN writes JSX in `.js` files (`VirtualizedList.js`) and stripping
          // Flow leaves it untouched, so the `js` loader fails with "JSX syntax extension is not
          // currently enabled", which reads as a Flow problem
          .then(out => ({ contents: out?.code ?? '', loader: 'jsx' }));
        reactNativeFlowCache.set(file, cached);
      }
      return cached;
    });
  },
};

/**
 * Solid's JSX is compiled by `babel-preset-solid`, never by esbuild (tsc keeps it as `preserve`)
 * The two options below are the ones `adapters/solid/babel-preset.cjs` and `vitest.config.ts` pin
 * `generate: 'dom'` would exercise DOM operations that never happen on a device
 */
const SOLID_SOURCE =
  /(\/adapters\/solid\/|\/src\/solid\/).*\.tsx$|\/solid-[^/]*\.itest\.tsx$/;

const solidRequire = createRequire(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../adapters/solid/package.json',
  ),
);

// Same as `reactNativeFlow`: a shared `.tsx` under `adapters/solid` is re-entered by every itest
// bundle that touches Solid, so the two-pass compile is cached
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
                // Resolved from `adapters/solid`, as pnpm keeps a package's `devDependencies`
                // beside it, invisible at the repo root
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
 * Svelte components are compiled at bundle time, as a real app builds them
 * There is no file system to write to here, so a component is a `.svelte` file next to the test
 * The server build has no `mount()`, hence `generate: 'client'` and the `browser` condition below
 */
const svelteRequire = createRequire(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../adapters/svelte/package.json',
  ),
);

// Loaded once per run, as the dynamic `import()` always resolves the same module
let svelteCompilePromise;
function svelteCompile() {
  if (svelteCompilePromise === undefined) {
    // `?? .default` because a path import loses the package's ESM/CJS framing, so the namespace
    // can arrive wrapped
    svelteCompilePromise = import(
      `file://${svelteRequire.resolve('svelte/compiler')}`
    ).then(loaded => loaded.compile ?? loaded.default?.compile);
  }
  return svelteCompilePromise;
}

// A `.svelte` fixture shared by several bundles compiles once, its output is fixed for the run
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
            experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
            filename: path.basename(file),
          });
          return { contents: out.js.code, loader: 'js' };
        });
        svelteComponentsCache.set(file, cached);
      }
      return cached;
    });
    // A rune module goes through the function Metro runs, as a plain bundle keeps `$state` bare
    build.onLoad({ filter: /\.svelte\.[jt]s$/ }, ({ path: file }) => {
      const { compileSvelteModuleFile } = svelteRequire(
        './metro-svelte-transformer.cjs',
      );
      return {
        contents: compileSvelteModuleFile(readFileSync(file, 'utf8'), file),
        loader: 'js',
      };
    });
  },
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Vue's SFC compiler at bundle time, for the same reason as the `.svelte` loader above
 * `compileSfc` of `metro-vue-transformer.cjs` is what Metro calls in a real app, and it is pure JS,
 * so it runs here in Node with no file system inside the JSI runtime
 */
const vueTransformerPath = path.join(
  root,
  'adapters/vue/metro-vue-transformer.cjs',
);

// Same as the Svelte compiler load: one dynamic `import()` per run, not per `.vue` file
let vueCompileSfcPromise;
function vueCompileSfc() {
  vueCompileSfcPromise ??= import(`file://${vueTransformerPath}`).then(
    loaded => loaded.compileSfc ?? loaded.default?.compileSfc,
  );
  return vueCompileSfcPromise;
}

// A shared `.vue` fixture is cached by file, as the SFC's content is fixed for the run
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
 * `@symbiote-native/*` resolved by source from the workspace, not from `node_modules`
 * `core/engine/cpp/tests/js` declares no dependencies, so pnpm links no sibling package to it
 * Sources are what a test wants: the subject is the code in the tree, not the last build
 */
const workspaceRoots = new Map(
  [
    'core/engine',
    'core/components',
    'core/test-utils',
    ...['react', 'vue', 'svelte', 'solid', 'angular'].map(
      name => `adapters/${name}`,
    ),
    'packages/navigation',
  ]
    .map(directory => {
      const manifest = path.join(root, directory, 'package.json');
      if (!existsSync(manifest)) return undefined;
      const { name } = parseJson(readFileSync(manifest, 'utf8'), manifest);
      return [name, path.join(root, directory, 'src')];
    })
    .filter(entry => entry !== undefined),
);

/**
 * A resolver and not an `alias` map: packages expose subpaths, and an alias matches exactly
 */
// Resolution depends only on the specifier string, so it is cached across bundles
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
// `SYMBIOTE_ITEST_BUILD=build-release` picks the optimized tester, Debug is the default
// Debug keeps `react_native_assert` but `REACT_NATIVE_DEBUG` checks make append O(N^2), not O(N)

// Correctness runs on `build`, timings run on `build-release`, and neither replaces the other
const buildDirectory = process.env.SYMBIOTE_ITEST_BUILD ?? 'build';

// The JS half of the build split: `__DEV__` and `NODE_ENV` track it, or `build-release` would
// time the development React (`react/index.js` picks `react.development.js` off `NODE_ENV`)

// It also blocks the stock arm: `ReactFabric-prod` is production-shaped, and a development
// `createElement` reaching for `dispatcher.getOwner()` renders and reports nothing
const isBenchBuild = buildDirectory !== 'build';
const binary = path.join(
  root,
  `core/engine/cpp/tests/${buildDirectory}/symbiote_tester`,
);

// `SYMBIOTE_ITEST_BYTECODE=1` runs each bundle as `hermesc -O` bytecode, what a device runs
// Source passed to `evaluateJavaScript` compiles without the optimizer, so it is not the default

// `-Xes6-block-scoping` is required: `hermesc` defaults it off, so closures in `report()` capture
// the last case, a wrong answer rather than an error
// Unset, `build-release` runs bytecode too (heap budgets are calibrated there), `=0` opts out
const bytecodeSetting = process.env.SYMBIOTE_ITEST_BYTECODE;
const shouldRunBytecode =
  bytecodeSetting === '1' ||
  (bytecodeSetting === undefined && buildDirectory === 'build-release');

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
if (bytecodeSetting === '1' && hermesc === undefined) {
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

// A test file's directory has no `node_modules`, and `react` is reachable from `adapters/react`
// only, so the search path is every workspace package plus the root, built once per run
const nodePaths = [
  path.join(root, 'node_modules'),
  ...[...workspaceRoots.values()].map(source =>
    path.join(path.dirname(source), 'node_modules'),
  ),
].filter(existsSync).concat(reanimatedNodePaths(root));

// A tester run shares no file or port with another, so runs go in parallel
// A release build holds timing budgets, so its testers take a quarter of the cores at a time
// `SYMBIOTE_ITEST_JOBS` sets the count, bundling is not timed and always uses every core
const cores = availableParallelism();
const testConcurrency = Math.max(
  1,
  Number(process.env.SYMBIOTE_ITEST_JOBS) ||
    (isBenchBuild ? Math.floor(cores / 4) : cores),
);

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
    // `close` reports (code, signal), and a process killed by a signal exits with code `null`,
    // so both are carried
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
  const limitBuild = createLimiter(cores);
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
    // Named by the path relative to the tests root, flattened, so two files of one basename in
    // different subdirectories keep separate bundles
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
      // The runtime is current JavaScriptCore, so there is no lowering to an old baseline
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
      // `browser` is for Svelte: its `.` export splits on it, and the `default` side is the SSR
      // runtime whose `mount()` throws, as in Vitest's Svelte project
      conditions: ['browser', 'import', 'default'],
      // Angular's JIT reads legacy decorator metadata (`@Input()` on a field), but esbuild
      // defaults to standard decorators, which Angular rejects in JIT mode
      // `useDefineForClassFields: false` follows, as a defined field would overwrite the decorator
      tsconfigRaw: {
        compilerOptions: {
          experimentalDecorators: true,
          useDefineForClassFields: false,
          // A test that names the directive renders JSX of the adapter, as an example app does
          ...(readFileSync(file, 'utf8').includes(REACT_JSX_DIRECTIVE)
            ? { jsx: 'react-jsx', jsxImportSource: '@symbiote-native/react' }
            : {}),
        },
      },
      banner: {
        js:
          PLATFORM_PRELUDE +
          (readFileSync(file, 'utf8').includes(FABRIC_COUNT_DIRECTIVE)
            ? FABRIC_COUNT_PRELUDE
            : ''),
      },
      // RN's development `FlatList` reaches LogBox `.png` requires, so they bundle as empty modules
      loader: { '.png': 'empty' },
      // A JSI runtime has no `process` and no Metro, so these are inlined here
      // `__DEV__` stays true outside a bench build to keep RN's invariants and warnings armed
      define: {
        __DEV__: isBenchBuild ? 'false' : 'true',
        'process.env.NODE_ENV': isBenchBuild ? '"production"' : '"development"',
        // Where `runBenchSuite` writes a Hermes sampling profile per step, empty means none
        __SYMBIOTE_PROFILE_DIR__: JSON.stringify(
          process.env.SYMBIOTE_PROFILE_DIR ?? '',
        ),
      },
      // Angular's dev switch (`ngDevMode`) is reached by neither `__DEV__` nor `NODE_ENV`, and a
      // compile-time `false` strips more than a Metro bundle does, so it is not a `define`
      // `mount()` calls `enableProdMode()` off `__DEV__`, which is what ships
      plugins: [
        workspaceSources,
        reanimatedItestSeams(root),
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
  // `SYMBIOTE_KEEP_BUNDLES=1` leaves them on disk and says where, as a tester stack trace
  // names a line in the bundle and is unreadable without the file
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
