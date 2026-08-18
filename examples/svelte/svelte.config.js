// App-level Svelte compiler config — read by svelte-check, the language server, and (once wired)
// Metro's own transformer, same as adapters/svelte/svelte.config.js. `fragments: 'tree'` is
// mandatory, not a preference (svelte-adapter-dom-shim skill §2): it makes the compiler emit
// `from_tree()` (element-by-element via document.createElement), never `from_html()` (innerHTML on
// a <template>), so the DOM shim needs no HTML parser. `css: 'external'` keeps Svelte from
// injecting <style> into a document.head that does not meaningfully exist — styling goes through
// @symbiote-native/css-parser + the class registry instead (see App.css).
//
// `forbidWebOnlyConstructs()` rejects <svelte:head|window|body|document> and {@html …} — all dead
// under RN, and {@html} is the dangerous one: it compiles cleanly and then paints nothing. The
// Metro transformer runs this same guard itself, so the bundle is protected either way; registering
// it here is what surfaces the diagnosis in `svelte-check` and in the editor's language server,
// which run the preprocessor pipeline but never Metro.
//
// `scopedStyles()` compiles a component's own <style> block into registerStyles() output and
// scopes every class in that component's markup. Metro's transformer runs it itself, so the
// bundle is correct either way; registering it HERE is what stops svelte-check and the editor
// from reporting `css_unused_selector` on every rule in a scoped block (Svelte's own scoping
// deliberately refuses to reach into a child component, and in this project a component renders
// only other components — see the preprocessor's own header). Order matters: the guard throws on
// a construct that cannot work at all, so it runs before anything rewrites the source it reports
// offsets against.
//
// `collapseTextWhitespace()` collapses whitespace inside a Text node the way a browser or Vue's
// compiler would — Svelte doesn't, so a sentence wrapped across source lines for readability
// otherwise ships a literal newline into the native text content (svelte-adapter-dom-shim skill
// §16/§29/§30). Metro runs it too, so the bundle is correct either way; registering it here is
// what surfaces the fix in svelte-check and the editor.
import { forbidWebOnlyConstructs } from '@symbiote-native/svelte/preprocessor';
import { scopedStyles } from '@symbiote-native/svelte/scoped-styles';
import { collapseTextWhitespace } from '@symbiote-native/svelte/collapse-text-whitespace';

export default {
  preprocess: [
    forbidWebOnlyConstructs(),
    scopedStyles(),
    collapseTextWhitespace(),
  ],
  compilerOptions: {
    fragments: 'tree',
    css: 'external',
  },
};
