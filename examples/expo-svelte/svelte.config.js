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
//
// `scopedStyles()` compiles a component's own <style> block into registerStyles() output and
// scopes every class in that component's markup. Metro's transformer runs it itself too, so the
// bundle is correct either way; registering it HERE (matching examples/svelte/svelte.config.js)
// is what stops svelte-check and the editor from reporting `css_unused_selector` on every rule
// in a scoped block, since Svelte's own scoping deliberately refuses to reach into a child
// component. Order matters: the guard throws on a construct that cannot work at all, so it runs
// before anything rewrites the source it reports offsets against.
import { forbidWebOnlyConstructs } from '@symbiote-native/svelte/preprocessor';
import { scopedStyles } from '@symbiote-native/svelte/scoped-styles';

export default {
  preprocess: [forbidWebOnlyConstructs(), scopedStyles()],
  compilerOptions: {
    fragments: 'tree',
    css: 'external',
  },
};
