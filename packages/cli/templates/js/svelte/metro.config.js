const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
// esm-env's package.json "exports" only publishes "./development" (a conditional export), not a
// literal "./false.js" subpath — Node's exports-map resolution rejects that path directly.
// Resolving the package root via its manifest and joining the filename ourselves bypasses the
// exports map, landing on the exact same physical file the "production" condition of
// "./development" already points to.
const esmEnvFalseFile = path.join(
  path.dirname(require.resolve('esm-env')),
  'false.js',
);

const defaultConfig = getDefaultConfig(projectRoot);

/**
 * @symbiote-native/* and svelte resolve as ordinary npm packages from this app's own
 * node_modules. @react-native/babel-preset strips the types.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  // Compile .svelte SFCs on the way into the bundle — @symbiote-native/svelte ships the
  // transformer itself, so no local wiring file is needed.
  transformer: {
    babelTransformerPath:
      require.resolve('@symbiote-native/svelte/metro-svelte-transformer'),
    // @react-native/metro-config defaults inlineRequires to true — every top-level import gets
    // rewritten to a lazy, per-call-site require(). Svelte's internal client runtime is a graph
    // of small files wired via module-scope singleton reactivity state (the "current effect"/
    // signal graph) — under inlineRequires this graph re-enters itself during mount and blows the
    // JS stack (`Maximum call stack size exceeded` inside metroRequire, on a real device/
    // simulator). Disabled here.
    getTransformOptions: async () => ({
      transform: { experimentalImportSupport: false, inlineRequires: false },
    }),
  },
  resolver: {
    // Teach Metro that .svelte and every style extension are source files (the transformer
    // turns each into a module) — css/scss/sass/less/styl is the framework-agnostic standalone
    // stylesheet/CSS-Modules path, shared with the React/Vue/Angular apps; scss/sass/less/styl
    // are optional preprocessor sources (see core/css-parser/src/preprocessors.ts).
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
    unstable_conditionNames: ['browser'],
    // svelte/internal/client/dom/operations.js's init_operations() gates a block on esm-env's DEV
    // export: when true it calls init_array_prototype_warnings(), which monkey-patches the REAL
    // global Array.prototype.indexOf/lastIndexOf/includes for the app's lifetime. DEV falls back
    // to process.env.NODE_ENV ('development' in every --dev build), so this patch is ALWAYS
    // active in dev today — real-DOM-debugging tooling with zero relevance under our DOM shim,
    // and the prime suspect for a repeatable native SIGSEGV deep in Hermes's JIT/inline-caching
    // for built-in Array methods. Force esm-env's DEV to resolve false by redirecting its one
    // physical import site, without touching global condition resolution.
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'esm-env/development') {
        return { type: 'sourceFile', filePath: esmEnvFalseFile };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
    // Metro's dev-server HMR runtime decides per updated module whether to hot-patch in place or
    // fall back to a full reload, via react-refresh's own heuristic (isLikelyComponentType):
    // typeof export === 'function' and its name starts with an uppercase letter. Svelte 5 compiles
    // every .svelte file to exactly that shape, so it's misread as a hot-patchable React
    // component; this adapter never registers one, so the update is silently swallowed — no
    // error, no visible change. Force every `.svelte` update straight to a full reload.
    unstable_forceFullRefreshPatterns: [/\.svelte$/],
  },
};

module.exports = mergeConfig(defaultConfig, config);
