const reactNativeFlatConfig = require('@react-native/eslint-config/flat');
const svelte = require('eslint-plugin-svelte');
const tsParser = require('@typescript-eslint/parser');

// Migrated from the legacy `.eslintrc.js` (`extends: '@react-native'`) specifically to gain flat
// config's `files`-scoped plugin blocks — the legacy format cannot load eslint-plugin-svelte v3+,
// whose exported configs are flat-shaped arrays even under the non-"flat/" key names. Without a
// `files` pattern covering `.svelte` at all, ESLint's flat-config default (only recognized JS-like
// extensions unless a config explicitly opts a file in) reported every `.svelte` file "ignored
// because of a matching ignore pattern" — same root cause and fix as the non-expo svelte example.
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
  },
];
