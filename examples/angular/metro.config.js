const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const {
  withSymbioteAngularMetroConfig,
} = require('@symbiote-native/angular/metro-config');
const { bundleModeMetroConfig } = require('react-native-worklets/bundleMode');

const projectRoot = __dirname;

const defaultConfig = getDefaultConfig(projectRoot);
const angularResolver = withSymbioteAngularMetroConfig(
  defaultConfig,
  projectRoot,
).resolver;

/**
 * Angular needs ngc before Metro, then the Babel linker in babel.config.js finishes the job
 * @symbiote-native/angular and slider build themselves in `prepare`, `exports` points at that
 * @symbiote-native/* resolve from this app's own node_modules, outside the pnpm workspace
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
    // Plain CSS transformer. It used to be `./metro-transformer`, which wrapped this one in a
    // source pre-pass that rewrote <View>/<Text> to their intrinsic tags; the app writes the tag
    // itself now, so the pre-pass and its wrapper are gone.
    babelTransformerPath:
      require.resolve('@symbiote-native/angular/metro-css-parser'),
  },
  resolver: {
    // sourceExts + the ngc-outDir CSS-redirect resolveRequest — see
    // adapters/angular/metro-config.cjs for the full mechanism.
    ...angularResolver,
    // Bundle Mode maps worklets files and the RN shim first, anything else goes to the Angular one
    resolveRequest: (context, moduleName, platform) =>
      bundleModeMetroConfig.resolver.resolveRequest(
        {
          ...context,
          resolveRequest: (_bundleContext, name, target) =>
            angularResolver.resolveRequest(context, name, target),
        },
        moduleName,
        platform,
      ),
  },
};

module.exports = mergeConfig(defaultConfig, bundleModeMetroConfig, config);
