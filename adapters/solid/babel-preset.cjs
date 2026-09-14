// The Babel preset a consuming app puts in its babel.config.js:
//
//   presets: ['module:@react-native/babel-preset', '@symbiote-native/solid/babel-preset']
//
// It is babel-preset-solid with the two options that MUST be right pre-filled, so an app can
// never get them wrong:
//
//   generate: 'universal'  — emit calls into a custom renderer instead of DOM operations.
//   moduleName             — where those calls are imported FROM. Compiled JSX turns into
//                            `import { createElement } from '<moduleName>'`, so this string has
//                            to name a real, resolvable module exporting the 11 functions
//                            createRenderer() returns (src/renderer.ts, published as the
//                            ./renderer subpath). A typo here fails at bundle time with a
//                            module-not-found on a path nobody wrote by hand.
//
// Same reasoning as ./metro-css-parser.cjs: shipping the wiring from the adapter means the app
// declares no extra devDependency (babel-preset-solid is OUR dependency, and require() resolves
// relative to this file, not via the app's node_modules).
//
// .cjs, not .js: this package is "type": "module", and Babel require()s a preset.
//
// Preset ORDER in the app matters and is not arbitrary. Babel applies presets in REVERSE array
// order, so listing this one LAST runs it FIRST — before @react-native/babel-preset's own
// React-JSX transform gets a chance to claim the same JSX nodes.
module.exports = function symbioteSolidBabelPreset(_api, options = {}) {
  return {
    presets: [
      [
        require('babel-preset-solid'),
        {
          ...options,
          // Last, deliberately: an app may pass other babel-preset-solid options through, but
          // not these two — overriding either one silently produces output this adapter cannot
          // satisfy (DOM operations, or imports from a module that exports nothing we provide).
          generate: 'universal',
          moduleName: '@symbiote-native/solid/renderer',
        },
      ],
    ],
  };
};
