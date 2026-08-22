import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import json from '@eslint/json';
import requireReadme from './eslint-rules/require-readme.js';
import requirePackageFields from './eslint-rules/require-package-fields.js';
import requireNativeLinkPackaged from './eslint-rules/require-native-link-packaged.js';
import excludeTestsFromPublishedFiles from './eslint-rules/exclude-tests-from-published-files.js';
import validNativeLinkManifest from './eslint-rules/valid-native-link-manifest.js';
import coLocateModuleFiles from './eslint-rules/co-locate-module-files.js';

// Flat config for the symbiote LIBRARY code only (core / adapters / packages).
// The RN example apps own their formatting + lint via the @react-native eslint
// toolchain (examples/*/.eslintrc.js) and are ignored here on purpose.
//
// Shape: one shared base + one scoped layer per framework adapter. A new adapter
// (angular / solid / svelte) adds its own block. That is the per-framework seam.
export default defineConfig(
  {
    // `codegen-specs/**` is third-party native-component source vendored verbatim at prepare
    // time (see scripts/vendor-codegen-specs.cjs) — generated, gitignored, not ours to lint.
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/build-ngc/**',
      '**/codegen-specs/**',
      '**/*.tsbuildinfo',
      'examples/**',
    ],
  },

  // ── shared base: every adapter and the engine inherit this ──
  {
    files: ['{core,adapters,packages}/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    plugins: {
      local: { rules: { 'co-locate-module-files': coLocateModuleFiles } },
    },
    rules: {
      // The Fabric JSI seam (nativeFabricUIManager, ViewConfigs, host element bags)
      // is genuinely untyped at the boundary, so `any` there is the contract rather than a lint slip.
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow intentionally-unused args/vars prefixed with _ (descriptor bridges, reducer
      // signatures, platform stubs all carry placeholder params).
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // ADR 0026: a module's files (base + platform variants + co-located test) must all
      // live in the same folder — either flat or entirely inside one X/ subfolder, never split.
      'local/co-locate-module-files': 'error',
    },
  },

  // ── per-framework adapter layers (extend the base, add framework-specific rules) ──

  // React: Rules of Hooks + exhaustive-deps. The adapter drives RN through use*State
  // hooks (useReducer/useEffect/useRef over the core/components state reducers), so a
  // conditional hook or a stale dep array is a real bug class here. A third-party-wrapper
  // package's own React entry (packages/*/src/react/**, e.g. packages/navigation) uses hooks
  // the same way and needs the same coverage — without it, an `eslint-disable-next-line
  // react-hooks/exhaustive-deps` comment there fails lint with "Definition for rule not found"
  // instead of being suppressed.
  {
    files: [
      'adapters/react/**/*.{ts,tsx}',
      'packages/*/src/react/**/*.{ts,tsx}',
    ],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // Classic Rules of Hooks, the high-signal React-specific checks. The v7 plugin
      // also ships the React Compiler rules (refs / purity / preserve-manual-memoization),
      // but those misfire on a hand-written imperative reconciler, so we keep them opt-in.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // Vue: reactivity discipline lives here. Engine/native nodes must be held by identity
  // (shallowRef / markRaw), never wrapped in a deep reactive ref — a plain `ref` wraps
  // the object in a reactive Proxy that breaks identity lookups against the engine's
  // node registry. No off-the-shelf plugin enforces that yet; add project-specific
  // no-restricted-syntax rules in this block as the surface grows.
  {
    files: ['adapters/vue/**/*.ts'],
    rules: {},
  },

  // ── package.json hygiene: every publishable package (core/adapters/packages) needs a
  // README next to it, and the field set matching its detected tier (full-library /
  // codegen-view / native-proxy — see eslint-rules/require-package-fields.js). apps/* is
  // excluded on purpose: apps/docs-site is a private Astro app, not an npm package. ──
  {
    files: ['{core,adapters,packages}/*/package.json'],
    language: 'json/json',
    plugins: {
      json,
      local: {
        rules: {
          'require-readme': requireReadme,
          'require-package-fields': requirePackageFields,
          'require-native-link-packaged': requireNativeLinkPackaged,
          'exclude-tests-from-published-files': excludeTestsFromPublishedFiles,
        },
      },
    },
    rules: {
      'local/require-readme': 'error',
      'local/require-package-fields': 'error',
      'local/require-native-link-packaged': 'error',
      'local/exclude-tests-from-published-files': 'error',
    },
  },

  // ── expo wrapper manifests: native-link.json is consumed by @symbiote-native/expo-modules-link
  // at app postinstall, and the aggregator ignores whatever it doesn't recognise rather than
  // failing. Validating the schema here is the only place a typo surfaces before a Gradle
  // compile error or a device-only "Cannot find native module". ──
  {
    files: ['{core,adapters,packages}/*/native-link.json'],
    language: 'json/json',
    plugins: {
      json,
      local: {
        rules: { 'valid-native-link-manifest': validNativeLinkManifest },
      },
    },
    rules: {
      'local/valid-native-link-manifest': 'error',
    },
  },

  // ── adapters/solid: the JSX augmentation file, and ONLY that file. Adding our host tags to
  // solid-js's JSX.IntrinsicElements is declaration merging, which requires reopening its `JSX`
  // namespace — there is no ES-module form of that, so no-namespace cannot be satisfied. The merged
  // interface is then intentionally empty: its members come from a mapped type
  // (Record<ISymbioteIntrinsic, …>) so the tag list has ONE source of truth in
  // @symbiote-native/components, and an interface body cannot express a mapped type — it can only
  // `extends` it. Scoped to the one file rather than the adapter, so ordinary Solid source still
  // gets both rules. ──
  {
    files: ['adapters/solid/src/jsx.ts'],
    rules: {
      '@typescript-eslint/no-namespace': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },

  // Future adapters get their own block here, e.g.:
  // { files: ['adapters/angular/**/*.ts'], plugins: { ... }, rules: { ... } },
  // { files: ['adapters/svelte/**/*.svelte'], languageOptions: { parser: svelteParser }, rules: { ... } },

  // prettier last: switch off every formatting rule, since prettier owns formatting.
  prettier,
);
