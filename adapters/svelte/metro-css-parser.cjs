// Re-exports @symbiote-native/css-parser verbatim from INSIDE this package, so a consuming app's
// own require('@symbiote-native/svelte/metro-css-parser') resolves css-parser relative to THIS
// file's location (adapters/svelte/node_modules, where css-parser IS a real dependency — see
// package.json), not relative to the app's own node_modules. Twin of
// adapters/vue/metro-css-parser.cjs. Unlike Vue's, this adapter's own metro-svelte-transformer.cjs
// already handles standalone style files itself (its isStyleFile branch), so this subpath exists
// only for parity with the other adapters and for a future consumer that wants CSS-only handling
// without the .svelte transform (e.g. importing a plain .css from non-.svelte source).
module.exports = require('@symbiote-native/css-parser').createCssMetroTransformer();
