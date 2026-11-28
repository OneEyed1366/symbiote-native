// Node loads this file with no build step, so the preprocessors come from `.ts` source
// That works as Node >=23.6 strips erasable TypeScript, while a `.js` specifier would not
import { forbidWebOnlyConstructs } from './src/preprocessor/forbid-web-only-constructs.ts';
import { scopedStyles } from './src/preprocessor/scoped-styles.ts';
import { collapseTextWhitespace } from './src/preprocessor/collapse-text-whitespace.ts';

export default {
  compilerOptions: {
    fragments: 'tree',
    css: 'external',
    experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
    // `<pressable class="x" />` is how an app writes a primitive, and Svelte warns on it
    // Nothing here is parsed as HTML and an RN app has no html elements, so the warning is dropped
    warningFilter: warning =>
      warning.code !== 'element_invalid_self_closing_tag',
  },
  // The guard throws on what cannot work at all, so it runs before anything rewrites the source
  // `scopedStyles` compiles the `<style>` block away, and a pass that rewrote a tag would follow it
  preprocess: [
    forbidWebOnlyConstructs(),
    scopedStyles(),
    collapseTextWhitespace(),
  ],
};
