// §2 of svelte-adapter-dom-shim: `fragments: 'tree'` is mandatory, not a preference — it makes
// the compiler emit `from_tree()` (element-by-element via document.createElement), never
// `from_html()` (innerHTML on a <template>), so the shim needs no HTML parser. `css: 'external'`
// keeps Svelte from injecting <style> into a document.head that does not meaningfully exist —
// styling goes through @symbiote-native/css-parser + the class registry instead, the same path
// Vue SFC <style> blocks already use.

// `forbid-web-only-constructs.ts` is TS-authored, like the rest of this package's source.
// svelte.config.js itself is loaded directly by Node (svelte-check, the language server,
// Vite/Metro tooling) with no build step of its own. Importing the `.ts` source by its real
// extension works because Node >=23.6 strips erasable TypeScript syntax natively with no
// flag or loader (verified against the installed Node 24.15.0, which loaded this file and
// resolved the import without error) — a `.js`-suffixed specifier pointing at nonexistent
// build output does NOT work, confirmed by the same check.
import { forbidWebOnlyConstructs } from './src/preprocessor/forbid-web-only-constructs.ts';
import { scopedStyles } from './src/preprocessor/scoped-styles.ts';
import { collapseTextWhitespace } from './src/preprocessor/collapse-text-whitespace.ts';

export default {
  compilerOptions: {
    fragments: 'tree',
    css: 'external',
    // `<pressable class="x" />` is how an app writes a primitive, and Svelte warns on it:
    // `element_invalid_self_closing_tag`, on every tag it does not know to be void. The warning is
    // about HTML's PARSING ambiguity, and nothing here is parsed as HTML — `fragments: 'tree'`
    // above makes the compiler emit `from_tree()`, so every element goes through createElement.
    // Blanket is safe because a React Native app has no html elements at all, and
    // forbidWebOnlyConstructs() rejects the web-only ones outright.
    //
    // Config rather than a per-file `svelte-ignore`, which has to be remembered on every new file
    // — forgetting it pushes an author into an explicit closing tag, and prettier reflows that
    // into `<tag …\n></tag>`. svelte-check and the language server are the whole surface:
    // metro-svelte-transformer.cjs reads `js.code` and discards `warnings`. Measured on 5.56.8,
    // where sveltejs/svelte#14654 is long fixed: examples/svelte 15 warnings -> 3.
    warningFilter: warning =>
      warning.code !== 'element_invalid_self_closing_tag',
  },
  // Order matters: the guard throws on a construct that cannot work at all, so it runs before
  // anything rewrites the source it would report offsets against. `scopedStyles` then compiles
  // the `<style>` block away — see its header for why Svelte's own CSS output is unusable here.
  // `collapseTextWhitespace` only touches Text node content, never the style/attribute/class
  // output the other two rewrite, so its position doesn't affect them.
  //
  // There is no lowering pass any more. A primitive IS an intrinsic tag the app writes itself, so
  // nothing rewrites `<View>` into `<view p={…}>` — which also retires the ordering constraint
  // that pass carried (it had to run after `scopedStyles`, or every scoped class silently lost
  // its scope).
  preprocess: [
    forbidWebOnlyConstructs(),
    scopedStyles(),
    collapseTextWhitespace(),
  ],
};
