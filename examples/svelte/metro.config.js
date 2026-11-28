const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('node:path');
const { bundleModeMetroConfig } = require('react-native-worklets/bundleMode');

const projectRoot = __dirname;
const ESM_ENV_DEV_MODULE = 'esm-env/development';
// `esm-env` exports only "./development", not a "./false.js" subpath, so the exports map rejects it
// The file is joined from the package root, and it is what the "production" condition points to
const esmEnvFalseFile = path.join(
  path.dirname(require.resolve('esm-env')),
  'false.js',
);

const defaultConfig = getDefaultConfig(projectRoot);

// A worklet runtime starts from `react-native-worklets`, where eager requires reach React Native
// All else keeps requires on top, as the svelte runtime overflows the stack when inlined
const INLINED_LIBRARY = /[/\\]react-native-worklets[/\\]/;
const keepRequiresOnTop = new Proxy(
  {},
  { has: (_, file) => !INLINED_LIBRARY.test(String(file)) },
);

/**
 * @symbiote-native/* and svelte resolve as ordinary npm packages from this app's own
 * node_modules, since examples/* is a standalone npm install outside the pnpm workspace
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  // `@symbiote-native/svelte` ships the transformer that compiles .svelte files
  transformer: {
    babelTransformerPath:
      require.resolve('@symbiote-native/svelte/metro-svelte-transformer'),
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: { blockList: keepRequiresOnTop },
      },
    }),
  },
  resolver: {
    // .svelte and the style extensions are source files, the transformer turns each into a module
    // Style sources are the standalone stylesheet and CSS Modules path shared by every example
    sourceExts: [
      ...defaultConfig.resolver.sourceExts,
      'svelte',
      'css',
      'scss',
      'sass',
      'less',
      'styl',
    ],
    // `svelte-custom-renderer` picks the svelte client runtime that ships `svelte/renderer`
    // Native gets no `browser` condition by default, which other packages' client builds also need
    unstable_conditionNames: ['svelte-custom-renderer', 'browser'],
    // A dev build sets `DEV` of `esm-env`, so svelte patches the global `Array.prototype`
    // That patch is the suspect for a Hermes SIGSEGV, so `DEV` is forced false
    // The rest goes to the Bundle Mode resolver, which redirects worklets files and `react-native`
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === ESM_ENV_DEV_MODULE) {
        return { type: 'sourceFile', filePath: esmEnvFalseFile };
      }
      return bundleModeMetroConfig.resolver.resolveRequest(
        context,
        moduleName,
        platform,
      );
    },
    // A compiled .svelte exports a capitalised function that `react-refresh` takes for a component
    // It then walks a React fiber tree that does not exist, so the update is swallowed silently
    unstable_forceFullRefreshPatterns: [/\.svelte$/],
  },
};

module.exports = mergeConfig(defaultConfig, bundleModeMetroConfig, config);
