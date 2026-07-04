const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { withSymbioteAngularMetroConfig } = require('@symbiote-native/angular/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '../..');
const enginePkg = path.resolve(repoRoot, 'core/engine');
const componentsPkg = path.resolve(repoRoot, 'core/components');

const defaultConfig = getDefaultConfig(projectRoot);

/**
 * Angular is the one adapter that needs a pre-Metro compile step: ngc writes partial-Ivy JS
 * (adapters/angular/build/angular, packages/slider/build-ngc/angular), then Babel's Angular
 * linker plugin (babel.config.js) runs inside Metro and turns that partial output into full
 * Ivy. Both packages build this themselves via their own `prepare` script (runs automatically
 * on `pnpm install`, in dependency order) and point their package.json `exports`'s
 * "react-native" condition straight at it — Metro's own package-exports resolution (on by
 * default: @react-native/metro-config sets unstable_enablePackageExports + conditionNames
 * ['react-native']) picks that up with no custom resolveRequest needed here.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  // Compile standalone .css/.module.css imports on the way into the bundle —
  // @symbiote-native/angular ships the transformer itself, so no local wiring file is needed
  // (same framework-agnostic path the React and Vue examples use via their own adapter's
  // ./metro-css-parser export). Angular has no compiler-plugin conflict here: the ngc/linker
  // pipeline (see the block comment above) only ever sees .ts files, never .css.
  transformer: {
    babelTransformerPath: require.resolve('@symbiote-native/angular/metro-css-parser'),
  },
  watchFolders: [repoRoot],
  resolver: {
    // sourceExts + the ngc-outDir CSS-redirect resolveRequest — see
    // adapters/angular/metro-config.cjs for the full mechanism.
    ...withSymbioteAngularMetroConfig(defaultConfig, projectRoot).resolver,
    extraNodeModules: {
      '@symbiote-native/engine': enginePkg,
      '@symbiote-native/components': componentsPkg,
      '@angular/core': path.resolve(projectRoot, 'node_modules/@angular/core'),
      react: path.resolve(projectRoot, 'node_modules/react'),
    },
    nodeModulesPaths: [
      path.resolve(projectRoot, 'node_modules'),
      path.resolve(repoRoot, 'node_modules'),
    ],
  },
};

module.exports = mergeConfig(defaultConfig, config);
