const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;

const defaultConfig = getDefaultConfig(projectRoot);

/**
 * @symbiote-native/* and solid-js resolve as ordinary npm packages from this app's own
 * node_modules (examples/* is a standalone npm install, decoupled from the monorepo's pnpm
 * workspace - see pnpm-workspace.yaml). @react-native/babel-preset strips the types, and
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
    // @symbiote-native/solid ships the standalone .css/.module.css transformer itself (the same
    // framework-agnostic path the React, Vue-TSX and Angular examples use via their own adapter's
    // ./metro-css-parser export), so no local wiring file is needed.
    babelTransformerPath:
      require.resolve('@symbiote-native/solid/metro-css-parser'),
  },
  resolver: {
    // Teach Metro that a style file is a source file (the transformer turns it into a module).
    // scss/sass/less/styl are optional SCSS/Sass/Less/Stylus preprocessor sources - see
    // core/css-parser/src/preprocessors.ts.
    sourceExts: [
      ...defaultConfig.resolver.sourceExts,
      'css',
      'scss',
      'sass',
      'less',
      'styl',
    ],

    // Solid compiles a component to `function App(props)` - a function with an uppercase name,
    // which is exactly what react-refresh's isLikelyComponentType heuristic accepts as a React
    // component. Metro's HMR runtime then hands the update to performReactRefresh, which walks
    // React's Fiber tree for live instances to patch; this adapter never registers one (no
    // react-reconciler in the path), so the update is silently swallowed - no error, no visible
    // change. Vue's compiled SFC (an object) and Angular's (a class) both fail that heuristic and
    // correctly fall through to Metro's full-reload path. This forces every .tsx update straight to
    // a full reload, skipping the boundary check. Same fix, same reason as the Svelte canary's
    // `/\.svelte$/` entry.
    unstable_forceFullRefreshPatterns: [/\.tsx$/],

    // DELIBERATELY NOT setting `unstable_conditionNames`, unlike the Svelte canary - verified
    // against the installed Metro rather than assumed, because solid-js's export map DOES have a
    // `node` branch pointing at its SSR build (dist/server.js), the same shape that resolved into
    // Svelte's native bundle and threw `lifecycle_function_unavailable` on first mount.
    //
    // Metro builds its condition set as {'default', 'import'|'require' (from the call syntax),
    // ...unstable_conditionNames, ...unstable_conditionsByPlatform[platform]} - see
    // metro-resolver/src/utils/matchSubpathFromExportsLike.js. RN's own default contributes
    // ['react-native'] (@react-native/metro-config/dist/index.js). `node` is never in that set, so
    // solid-js's SSR branch is unreachable and the first matching key is the top-level `import`:
    // dist/solid.js, the client build. Correct by default.
    //
    // Adding 'browser' would NOT change which file wins (solid-js declares `browser` after
    // `import`, and first-match-in-declaration-order decides), but mergeConfig REPLACES the array
    // rather than extending it - so it would silently drop 'react-native' and with it every
    // package's react-native-specific entry point. Strictly a loss.
  },
};

module.exports = mergeConfig(defaultConfig, config);
