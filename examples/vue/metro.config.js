const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '../..');
const enginePkg = path.resolve(repoRoot, 'core/engine');
const vuePkg = path.resolve(repoRoot, 'adapters/vue');

/**
 * Metro is pointed straight at our packages' TypeScript source — there is no build step.
 * @react-native/babel-preset strips the types. react and @vue/runtime-core are pinned to
 * the app's single copies so the Vue adapter and the app share one Vue runtime — Vue's
 * reactivity is a singleton, so two copies would silently fail to react.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [enginePkg, vuePkg],
  resolver: {
    extraNodeModules: {
      '@symbiote/engine': enginePkg,
      '@symbiote/vue': vuePkg,
      react: path.resolve(projectRoot, 'node_modules/react'),
      '@vue/runtime-core': path.resolve(projectRoot, 'node_modules/@vue/runtime-core'),
    },
    nodeModulesPaths: [path.resolve(projectRoot, 'node_modules')],
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
