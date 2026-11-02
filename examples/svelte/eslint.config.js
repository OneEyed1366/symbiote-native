const reactNativeFlatConfig = require('@react-native/eslint-config/flat');
const svelte = require('eslint-plugin-svelte');
const tsParser = require('@typescript-eslint/parser');

// `@react-native/eslint-config/flat` has no `files` pattern for `.svelte`
// Flat config then reports every `.svelte` file as ignored, as the root eslint.config.js notes
module.exports = [
  ...reactNativeFlatConfig,
  ...svelte.configs['flat/recommended'],
  {
    // `<script lang="ts">` needs a real TS parser, or each type annotation is a syntax error
    // A `.svelte.ts` rune module goes through the same parser, so it needs the same sub-parser
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: { parser: tsParser },
    },
    rules: {
      // The react-hooks plugin takes any `use*` call for a React Hook, which `useNavigation` is not
      'react-hooks/rules-of-hooks': 'off',
      // The `**/*.ts` block turns `no-undef` off, so `<script lang="ts">` needs the same override
      'no-undef': 'off',
      // The fixer unwraps `{'<svelte:self> ...'}` into bare text, which Svelte's compiler rejects
      'svelte/no-useless-mustaches': 'off',
    },
  },
];
