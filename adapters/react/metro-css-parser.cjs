// Re-exports @symbiote-native/css-parser verbatim from INSIDE this package, so a consuming app's own
// require('@symbiote-native/react/metro-css-parser') resolves css-parser relative to THIS file's
// location (adapters/react/node_modules, where css-parser IS a real dependency — see
// package.json), not relative to the app's own node_modules, which does not and should not
// need to declare @symbiote-native/css-parser itself. Node resolves each require() relative to the
// requiring FILE's own location, so this indirection is what actually removes the extra install
// step, not pnpm hoisting (which does not propagate this transitively across workspace packages
// the way a flat classic node_modules would). .cjs, not .js: this package is "type": "module",
// and Metro's babelTransformerPath loading expects a require()-able module.
// createCssMetroTransformer is a factory, not a ready transformer — Metro's
// babelTransformerPath needs the actual {transform, getCacheKey} object it returns,
// not the css-parser package barrel.
module.exports = require('@symbiote-native/css-parser').createCssMetroTransformer();
