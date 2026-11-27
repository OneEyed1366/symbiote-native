const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { bundleModeMetroConfig } = require('react-native-worklets/bundleMode');

const projectRoot = __dirname;

const defaultConfig = getDefaultConfig(projectRoot);

/**
 * @symbiote-native/* and @vue/runtime-core resolve from this app's own node_modules
 * `examples/*` is a standalone npm install, outside the monorepo's pnpm workspace
 * @react-native/babel-preset strips the types
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  // Compile .vue SFCs on the way into the bundle — @symbiote-native/vue ships the transformer
  // itself, so no local wiring file is needed (see adapters/vue/metro-vue-transformer.cjs).
  transformer: {
    babelTransformerPath:
      require.resolve('@symbiote-native/vue/metro-vue-transformer'),
  },
  resolver: {
    // .vue and the style extensions are source files, the transformer turns each into a module
    // Style sources use the standalone stylesheet and CSS Modules path of the other examples
    // scss, sass, less and styl are optional preprocessors (core/css-parser/src/preprocessors.ts)
    sourceExts: [
      ...defaultConfig.resolver.sourceExts,
      'vue',
      'css',
      'scss',
      'sass',
      'less',
      'styl',
    ],
  },
};

module.exports = mergeConfig(defaultConfig, bundleModeMetroConfig, config);
