// App-level Svelte compiler config — read by svelte-check, the language server, and Metro's own
// transformer, same as adapters/svelte/svelte.config.js. `fragments: 'tree'` is mandatory, not a
// preference (svelte-adapter-dom-shim skill §2): it makes the compiler emit `from_tree()`
// (element-by-element via document.createElement), never `from_html()` (innerHTML on a
// <template>), so the DOM shim needs no HTML parser. `css: 'external'` keeps Svelte from injecting
// <style> into a document.head that does not meaningfully exist — styling goes through
// @symbiote-native/css-parser + the class registry instead (see App.css).
//
// `forbidWebOnlyConstructs()` rejects <svelte:head|window|body|document> and {@html …}, all dead
// under RN (skill §7/§22d). The same guard already runs inside metro-svelte-transformer.cjs, so
// the bundle is protected either way; registering it here is what puts the diagnosis in the
// editor and in `svelte-check` instead of only at bundle time.
import { forbidWebOnlyConstructs } from '@symbiote-native/svelte/preprocessor';

export default {
  preprocess: [forbidWebOnlyConstructs()],
  compilerOptions: {
    fragments: 'tree',
    css: 'external',
  },
};
