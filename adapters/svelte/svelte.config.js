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
  },
  // Order matters: the guard throws on a construct that cannot work at all, so it runs before
  // anything rewrites the source it would report offsets against. `scopedStyles` then compiles
  // the `<style>` block away — see its header for why Svelte's own CSS output is unusable here.
  // `collapseTextWhitespace` runs last — it only touches Text node content, never the
  // style/attribute/class output the other two rewrite, so its position doesn't affect them.
  preprocess: [forbidWebOnlyConstructs(), scopedStyles(), collapseTextWhitespace()],
};
