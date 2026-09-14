const reactNativeFlatConfig = require('@react-native/eslint-config/flat');
const svelte = require('eslint-plugin-svelte');
const tsParser = require('@typescript-eslint/parser');

// `@react-native/eslint-config/flat` has no `files` pattern covering `.svelte` at all, so ESLint's
// flat-config default (only recognized JS-like extensions unless a config explicitly opts a file
// in) reports every `.svelte` file "ignored because of a matching ignore pattern" — same root
// cause and fix as the monorepo root's own eslint.config.js block for adapters/svelte.
module.exports = [
  ...reactNativeFlatConfig,
  ...svelte.configs['flat/recommended'],
  {
    // `<script lang="ts">` needs a real TS parser inside the component, or every type annotation
    // is a syntax error to svelte-eslint-parser's own (JS-only) script sub-parser.
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: { parser: tsParser },
    },
    rules: {
      // `@react-native/eslint-config`'s react-hooks plugin pattern-matches any `use*`-named call
      // as a React Hook. Svelte composables (`useNavigation`, `useIsFocused`, …) share that naming
      // convention by accident of both ecosystems' idiom, and are not React Hooks — the rule has
      // no way to tell the two apart, so it is a standing false positive on every `.svelte` file.
      'react-hooks/rules-of-hooks': 'off',
      // The `**/*.ts`/`**/*.tsx` block in this same config turns `no-undef` off — typescript-eslint's
      // own recommendation, since a plain (non-type-aware) ESLint rule cannot see ambient globals a
      // `.d.ts` lib declares. `.svelte`'s `<script lang="ts">` isn't matched by that glob, so it
      // needs the same override here.
      'no-undef': 'off',
      // The rule's fixer unwraps `{'<svelte:self> ...'}` into bare text, which is wrong whenever
      // the string's own content contains `<...>` — measured: even HTML-entity-escaped
      // (`&lt;svelte:self&gt;`) bare text still throws `element_invalid_closing_tag` from Svelte's
      // OWN compiler, not just this linter, so the mustache is load-bearing, not "useless".
      'svelte/no-useless-mustaches': 'off',
    },
  },
];
