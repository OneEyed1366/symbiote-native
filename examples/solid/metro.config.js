const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const { bundleModeMetroConfig } = require('react-native-worklets/bundleMode');

const projectRoot = __dirname;

const defaultConfig = getDefaultConfig(projectRoot);

/**
 * @symbiote-native/* and solid-js resolve as ordinary npm packages from this app's own
 * node_modules (examples/* is a standalone npm install, decoupled from the monorepo's pnpm
 * workspace — see pnpm-workspace.yaml). @react-native/babel-preset strips the types, and
 * babel.config.js's @symbiote-native/solid/babel-preset compiles the JSX.
 *
 * Notably SHORTER than the Svelte canary's config: Solid needs no Metro transformer of its own.
 * Its compilation is a plain Babel preset, so the only transformer here is the framework-agnostic
 * stylesheet one every other canary also uses.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  transformer: {
    // @symbiote-native/solid ships the standalone .css/.module.css transformer itself
    // Same framework-agnostic path as the other examples, so no local wiring file is needed
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
    // change. Vue's compiled SFC (an object) and Angular's (a class) both fail that heuristic and
    // correctly fall through to Metro's full-reload path. This forces every .tsx update straight to
    // a full reload, skipping the boundary check. Same fix, same reason as the Svelte canary's
    // `/\.svelte$/` entry.
    unstable_forceFullRefreshPatterns: [/\.tsx$/],

    // `unstable_conditionNames` stays unset, т.к. Metro never adds `node` and solid-js then
    // resolves its client build (`dist/solid.js`), not the SSR one that broke the Svelte canary
    // Setting it drops the default `react-native` condition, as `mergeConfig` replaces arrays
  },
};

module.exports = mergeConfig(defaultConfig, bundleModeMetroConfig, config);
