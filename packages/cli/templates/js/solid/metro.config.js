const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;

/**
 * @symbiote-native/* and solid-js resolve as ordinary npm packages from this app's own
 * node_modules. @react-native/babel-preset strips the types, and babel.config.js's
 * @symbiote-native/solid/babel-preset compiles the JSX.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultConfig = getDefaultConfig(projectRoot);

const config = {
  transformer: {
    // @symbiote-native/solid ships the standalone .css/.module.css transformer itself (the same
    // framework-agnostic path the React, Vue-TSX and Angular apps use via their own adapter's
    // ./metro-css-parser export), so no local wiring file is needed.
    babelTransformerPath:
      require.resolve('@symbiote-native/solid/metro-css-parser'),
  },
  resolver: {
    // Teach Metro that a style file is a source file (the transformer turns it into a module).
    // scss/sass/less/styl are optional SCSS/Sass/Less/Stylus preprocessor sources — see
    // core/css-parser/src/preprocessors.ts.
    sourceExts: [
      ...defaultConfig.resolver.sourceExts,
      'css',
      'scss',
      'sass',
      'less',
      'styl',
    ],

    // Solid compiles a component to `function App(props)` — a function with an uppercase name,
    // which is exactly what react-refresh's isLikelyComponentType heuristic accepts as a React
    // component. Metro's HMR runtime then hands the update to performReactRefresh, which walks
    // React's Fiber tree for live instances to patch; this adapter never registers one (no
    // react-reconciler in the path), so the update is silently swallowed — no error, no visible
    // change. Forces every .tsx update straight to a full reload, skipping the boundary check.
    unstable_forceFullRefreshPatterns: [/\.tsx$/],

    // DELIBERATELY NOT setting `unstable_conditionNames` — verified against the installed Metro
    // rather than assumed, because solid-js's export map DOES have a `node` branch pointing at
    // its SSR build (dist/server.js). Metro's own condition set never includes `node`, so the
    // top-level `import` condition (the client build) resolves correctly by default.
  },
};

module.exports = mergeConfig(defaultConfig, config);
