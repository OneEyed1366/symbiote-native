// App-level Svelte compiler config, read by `svelte-check` and the language server
// Metro compiles with the same options through `metro-svelte-transformer`
import { forbidWebOnlyConstructs } from '@symbiote-native/svelte/preprocessor';
import { scopedStyles } from '@symbiote-native/svelte/scoped-styles';
import { collapseTextWhitespace } from '@symbiote-native/svelte/collapse-text-whitespace';

export default {
  // The guard goes first, since it throws before the source is rewritten
  // Registered here, `svelte-check` skips `css_unused_selector` and raw newlines in text
  preprocess: [
    forbidWebOnlyConstructs(),
    scopedStyles(),
    collapseTextWhitespace(),
  ],
  compilerOptions: {
    fragments: 'tree',
    css: 'external',
    experimental: { customRenderer: '@symbiote-native/svelte/renderer' },
    // `<pressable class="x" />` is how an app writes a primitive, and Svelte warns on it
    // Nothing here is parsed as HTML, so the warning is safe to drop for every tag
    warningFilter: warning =>
      warning.code !== 'element_invalid_self_closing_tag',
  },
};
