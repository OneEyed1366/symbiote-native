const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
// esm-env's package.json "exports" only publishes "./development" (a conditional export), not a
// literal "./false.js" subpath — Node's exports-map resolution rejects that path directly.
// Resolving the package root via its manifest and joining the filename ourselves bypasses the
// exports map (this is our own file lookup, not a package-consumer import), landing on the exact
// same physical file the "production" condition of "./development" already points to.
const esmEnvFalseFile = path.join(
  path.dirname(require.resolve('esm-env')),
  'false.js',
);

const defaultConfig = getDefaultConfig(projectRoot);

/**
 * @symbiote-native/* and svelte resolve as ordinary npm packages from this app's own
 * node_modules (examples/* is a standalone npm install, decoupled from the monorepo's pnpm
 * workspace — see pnpm-workspace.yaml). @react-native/babel-preset strips the types.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  // Compile .svelte SFCs on the way into the bundle — @symbiote-native/svelte ships the
  // transformer itself, so no local wiring file is needed (see
  // adapters/svelte/metro-svelte-transformer.cjs).
  transformer: {
    babelTransformerPath:
      require.resolve('@symbiote-native/svelte/metro-svelte-transformer'),
    // @react-native/metro-config defaults inlineRequires to true — every top-level
    // import/require gets rewritten to a lazy, per-call-site require() instead of running once
    // at module-load time. Svelte's internal client runtime (svelte/internal/client/**) is a
    // large graph of small files wired together via module-scope singleton reactivity state
    // (the "current effect"/signal graph) and Node's #imports subpath aliases (#client/constants
    // etc.) — under inlineRequires this graph re-enters itself during mount and blows the JS
    // stack (`Maximum call stack size exceeded` inside metroRequire, first hit trying to run
    // examples/svelte on a real device/simulator). Disabled here; app code doesn't rely on
    // inlineRequires for cold-start perf at this example's size.
    getTransformOptions: async () => ({
      transform: { experimentalImportSupport: false, inlineRequires: false },
    }),
  },
  resolver: {
    // Teach Metro that .svelte and every style extension are source files (the transformer
    // turns each into a module) — css/scss/sass/less/styl is the framework-agnostic standalone
    // stylesheet/CSS-Modules path, shared with the React/Vue/Angular examples (see
    // metro-css-transformer.js there); scss/sass/less/styl are optional preprocessor sources
    // (see core/css-parser/src/preprocessors.ts).
    sourceExts: [
      ...defaultConfig.resolver.sourceExts,
      'svelte',
      'css',
      'scss',
      'sass',
      'less',
      'styl',
    ],
    // `svelte`'s package.json "." export splits `browser` (the real client runtime — mount()/
    // unmount()) from `default`/`worker` (the SSR build, whose mount() throws
    // `lifecycle_function_unavailable`). Metro's own `unstable_conditionsByPlatform` only maps
    // `web: ['browser']` by default, so iOS/Android get NO browser condition and Metro resolves
    // Svelte's SSR build into the native bundle, crashing on the very first mount() call.
    // Identical problem, identical fix, already proven in adapters/svelte's own test harness —
    // see the root vitest.config.ts's `resolve.conditions: ['browser']` /
    // `ssr.resolve.conditions: ['browser']` (svelte-adapter-dom-shim skill §15).
    unstable_conditionNames: ['browser'],
    // svelte/internal/client/dom/operations.js's init_operations() (the very function our own
    // dom-shim patches) gates an extra block on esm-env's DEV export: when true, it calls
    // init_array_prototype_warnings(), which monkey-patches the REAL global
    // Array.prototype.indexOf/lastIndexOf/includes for the lifetime of the app. DEV resolves via
    // esm-env's "./development" conditional export, which — with no custom `development`/
    // `production` condition set (Metro doesn't set either by default) — falls back to reading
    // process.env.NODE_ENV, which is 'development' in every --dev build, so this patch is ALWAYS
    // active in dev today. That global Array.prototype mutation is real-DOM-debugging tooling
    // (built for a real browser's Array.from(document.querySelectorAll(...)) proxy-equality
    // checks) with zero relevance under our DOM shim, and is the prime suspect for a repeatable
    // native SIGSEGV (null pointer deref deep in libhermesvm.so, inside
    // RuntimeScheduler_Modern::performMicrotaskCheckpoint, ~1-2 minutes into every run on a real
    // device/emulator) — Hermes's JIT/inline-caching for built-in Array methods is not expected
    // to tolerate the prototype being swapped out from under it. Force esm-env's DEV to resolve
    // false by redirecting its one physical import site, without touching global condition
    // resolution (which would affect every other package's dev/prod export choice, not just
    // this one file).
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'esm-env/development') {
        return { type: 'sourceFile', filePath: esmEnvFalseFile };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);
