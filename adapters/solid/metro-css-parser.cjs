// Re-exported from THIS file's own location so a consuming app's
// require('@symbiote-native/solid/metro-css-parser') resolves css-parser as a dependency of THIS
// package, not the app's node_modules (Node resolves require() relative to the requiring file,
// not via pnpm hoisting) — the app never needs to declare @symbiote-native/css-parser itself.
// .cjs, not .js: this package is "type": "module", but Metro's babelTransformerPath loading needs
// a require()-able file. createCssMetroTransformer() is a factory — Metro needs the actual
// {transform, getCacheKey} object it returns, not the css-parser package barrel.
module.exports = require('@symbiote-native/css-parser').createCssMetroTransformer();
