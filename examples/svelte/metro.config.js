const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withRozenite } = require('@rozenite/metro');
const path = require('node:path');

const projectRoot = __dirname;
// esm-env's package.json "exports" only publishes "./development" (a conditional export), not a
// literal "./false.js" subpath — Node's exports-map resolution rejects that path directly.
// Resolving the package root via its manifest and joining the filename ourselves bypasses the
// exports map (this is our own file lookup, not a package-consumer import), landing on the exact
// same physical file the "production" condition of "./development" already points to.
const esmEnvFalseFile = path.join(path.dirname(require.resolve('esm-env')), 'false.js');

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
    babelTransformerPath: require.resolve('@symbiote-native/svelte/metro-svelte-transformer'),
    // @react-native/metro-config defaults inlineRequires to true — every top-level import gets
    // rewritten to a lazy, per-call-site require(). Svelte's internal client runtime
    // (svelte/internal/client/**) is a graph of small files wired via module-scope singleton
    // reactivity state (the "current effect"/signal graph) — under inlineRequires this graph
    // re-enters itself during mount and blows the JS stack (`Maximum call stack size exceeded`
    // inside metroRequire, on a real device/simulator). Disabled here; app code doesn't rely on
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
    sourceExts: [...defaultConfig.resolver.sourceExts, 'svelte', 'css', 'scss', 'sass', 'less', 'styl'],
    // `svelte`'s package.json "." export splits `browser` (the real client runtime — mount()/
    // unmount()) from `default`/`worker` (the SSR build, whose mount() throws
    // `lifecycle_function_unavailable`). Metro's own `unstable_conditionsByPlatform` only maps
    // `web: ['browser']` by default, so iOS/Android get NO browser condition and Metro resolves
    // Svelte's SSR build into the native bundle, crashing on the very first mount() call.
    // Identical problem, identical fix, already proven in adapters/svelte's own test harness —
    // see the root vitest.config.ts's `resolve.conditions: ['browser']` /
    // `ssr.resolve.conditions: ['browser']` (svelte-adapter-dom-shim skill §15).
    unstable_conditionNames: ['browser'],
    // svelte/internal/client/dom/operations.js's init_operations() (the function our own
    // dom-shim patches) gates a block on esm-env's DEV export: when true it calls
    // init_array_prototype_warnings(), which monkey-patches the REAL global
    // Array.prototype.indexOf/lastIndexOf/includes for the app's lifetime. DEV falls back to
    // process.env.NODE_ENV (Metro sets no custom development/production condition), which is
    // 'development' in every --dev build, so this patch is ALWAYS active in dev today. That
    // global Array.prototype mutation is real-DOM-debugging tooling with zero relevance under our
    // DOM shim, and is the prime suspect for a repeatable native SIGSEGV (null pointer deref deep
    // in libhermesvm.so, inside RuntimeScheduler_Modern::performMicrotaskCheckpoint, ~1-2 minutes
    // into every run on a real device/emulator) — Hermes's JIT/inline-caching for built-in Array
    // methods doesn't tolerate the prototype being swapped out from under it. Force esm-env's DEV
    // to resolve false by redirecting its one physical import site, without touching global
    // condition resolution (which would affect every other package's dev/prod export choice).
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'esm-env/development') {
        return { type: 'sourceFile', filePath: esmEnvFalseFile };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
    // Metro's dev-server HMR runtime decides per updated module whether to hot-patch in place or
    // fall back to a full reload, via react-refresh's own heuristic (isLikelyComponentType):
    // typeof export === 'function' and its name starts with an uppercase letter. Svelte 5 compiles
    // every .svelte file to exactly that shape - `function App($$anchor, $$props) {...}`, named
    // after the file - so it's misread as a hot-patchable React component. react-refresh then
    // calls performReactRefresh(), which walks React's own Fiber tree (via the devtools hook) for
    // live instances to patch; this adapter never registers one (no react-reconciler in the path),
    // so the walk finds nothing and the update is silently swallowed - no error, no visible change.
    // Vue's compiled SFC (`export default { setup, render }`, an object) and Angular's (a class)
    // both fail the same heuristic the other way and correctly fall through to Metro's "no
    // boundary found" full-reload path - the path that actually makes HMR work for every other
    // adapter. `unstable_forceFullRefreshPatterns` is Metro's own escape hatch for this false
    // positive: force every `.svelte` update straight to a full reload, skipping the boundary check.
    unstable_forceFullRefreshPatterns: [/\.svelte$/],
  },
};

// Rozenite (github.com/callstackincubator/rozenite) wires custom React Native DevTools panels
// into Metro's dev-server middleware. It only touches `watchFolders`/`resolver.extraNodeModules`/
// `resolver.resolveRequest` (chaining through to whatever resolveRequest is already there, ours
// included) and `server.enhanceMiddleware` — it never touches `transformer`, so the Svelte
// babelTransformerPath/getTransformOptions above are untouched.
//
// On by default for any dev build, off for release — this is a development-time tool, not a
// diagnostic you opt into (unlike the DEBUG log flag, which stays opt-in even in dev). RN CLI's
// own `bundle` command sets `process.env.NODE_ENV = args.dev ? 'development' : 'production'`
// (@react-native/community-cli-plugin's buildBundle.js) BEFORE this config is evaluated, so
// `--dev false`/a release bundle reliably disables it. `react-native start` (the everyday dev
// server) never touches NODE_ENV at all, so it stays enabled there by default too.
module.exports = withRozenite(mergeConfig(defaultConfig, config), {
  enabled: process.env.NODE_ENV !== 'production',
});
