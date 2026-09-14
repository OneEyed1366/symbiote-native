const reactNativeFlatConfig = require('@react-native/eslint-config/flat');
const vue = require('eslint-plugin-vue');
const tsParser = require('@typescript-eslint/parser');

// `@react-native/eslint-config/flat` has no `files` pattern covering `.vue` at all, so ESLint's
// flat-config default (only recognized JS-like extensions unless a config explicitly opts a file
// in) reports every `.vue` file "ignored because of a matching ignore pattern" — same root cause
// and fix as examples/svelte's own eslint.config.js.
module.exports = [
  ...reactNativeFlatConfig,
  ...vue.configs['flat/recommended'],
  {
    // `<script lang="ts">` needs a real TS parser inside the SFC, or every type annotation in the
    // block is a syntax error to vue-eslint-parser's own (JS-only) script sub-parser.
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tsParser },
    },
    rules: {
      // `@react-native/eslint-config`'s react-hooks plugin pattern-matches any `use*`-named call
      // as a React Hook. Vue composables (`useNavigation`, `useIsFocused`, …) share that naming
      // convention by accident of both ecosystems' idiom, and are not React Hooks — the rule has
      // no way to tell the two apart, so it is a standing false positive on every `.vue` file.
      'react-hooks/rules-of-hooks': 'off',
      // The `**/*.ts`/`**/*.tsx` block in this same config turns `no-undef` off — typescript-eslint's
      // own recommendation, since a plain (non-type-aware) ESLint rule cannot see ambient globals a
      // `.d.ts` lib declares (`performance`, RN's own globals, …) and false-flags every one of them.
      // `.vue`'s `<script lang="ts">` isn't matched by that glob, so it needs the same override here.
      'no-undef': 'off',
      // Our own primitives take RN's exact camelCase prop names (`testID`, `onPress`, …), never DOM
      // attributes — hyphenating them is not just unwanted, it silently produces a DIFFERENT wrong
      // prop when auto-fixed (`testID` -> `test-i-d`, not `test-id`, since the rule's fixer does not
      // know these are camelCase words rather than a single unhyphenated one).
      'vue/attribute-hyphenation': 'off',
      // The rule's "is this a component" check does not know our lowercase custom host tags
      // (`text`, `view`, …) are bare Fabric elements, not Vue components — so ANY `v-text`/`v-html`
      // on one of them false-positives, not just a single call site.
      'vue/no-v-text-v-html-on-component': 'off',
    },
  },
  {
    // Deliberately re-exports FROM `@vue/runtime-core` to declare the ambient `'vue'` module —
    // that IS the fix `vue/prefer-import-from-vue` would otherwise ask for, so the rule can never
    // be satisfied here without breaking the file's one job.
    files: ['vue-runtime-core.d.ts'],
    rules: { 'vue/prefer-import-from-vue': 'off' },
  },
];
