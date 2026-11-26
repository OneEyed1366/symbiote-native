const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
// `esm-env` exports only "./development", not a "./false.js" subpath, so the exports map rejects it
// The file is joined from the package root, and it is what the "production" condition points to
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
  // `@symbiote-native/svelte` ships the transformer that compiles .svelte files
  transformer: {
    babelTransformerPath: require.resolve(
      '@symbiote-native/svelte/metro-svelte-transformer',
    ),
    // `inlineRequires` makes the svelte client runtime re-enter itself on mount
    // The stack then overflows inside `metroRequire`, as that runtime keeps singleton state
    getTransformOptions: async () => ({
      transform: { experimentalImportSupport: false, inlineRequires: false },
    }),
  },
  resolver: {
    // .svelte and the style extensions are source files, the transformer turns each into a module
    // Style sources are the standalone stylesheet and CSS Modules path shared by every adapter
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
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === 'esm-env/development') {
        return { type: 'sourceFile', filePath: esmEnvFalseFile };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
    // A compiled .svelte exports a capitalised function that `react-refresh` takes for a component
    // It then walks a React fiber tree that does not exist, so the update is swallowed silently
    unstable_forceFullRefreshPatterns: [/\.svelte$/],
  },
};

module.exports = mergeConfig(defaultConfig, config);
