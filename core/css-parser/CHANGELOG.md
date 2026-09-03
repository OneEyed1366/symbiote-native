# @symbiote-native/css-parser

## 0.5.0

### Minor Changes

- [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - `:active` is switched off, behind `IS_STATE_TOKEN_ENABLED`.

  A functional `style={({pressed}) => …}` is specialised into a resting/active pair at build time
  now, which reaches the same slot without pseudo-class machinery and is what the ecosystem already
  writes — so the reason `:active` existed, keeping a pressable lowerable without a state-reading
  callback, is gone. Keeping both live is what argues against it: they occupy different cascade
  slots, so an adapter would have two ways to say one thing and a debugging session two places to
  look.

  An `:active` selector now warns with its own message naming the replacement, rather than the
  shared "React Native cannot match this" sentence. The selector machinery is intact and one
  constant turns it back on.

## 0.4.0

### Minor Changes

- 3acd869: Add Solid.js as a supported framework: a new `@symbiote-native/solid` adapter reaching full
  component/runtime parity with the other four adapters, plus a `./solid` export subpath on every
  companion package. Engine and shared-component packages gained portal/tunnel, retained-tree
  census, and profiling infrastructure that the new adapter (and the others' portal/tunnel work
  landing alongside it) build on.

## 0.3.0

### Minor Changes

- 388c353: Make a partial `:global(...)` work inside a larger selector. `:global()` is the escape hatch for
  reaching markup a scoped style block does not own, and reaching into part of a descendant chain
  (`.card :global(.legacy-widget) span`) is its main use, not an edge case - but only a whole-selector
  wrapper was ever unwrapped. Anything else fell through the parser's guards and registered nothing.

  The wrapper is now erased wherever it sits, and its payload participates exactly as if written bare,
  following Svelte's per-part semantics rather than Vue's. Vue's `pluginScoped` replaces the WHOLE
  complex selector with the wrapper's contents, so `.card :global(.reset)` would collapse to a
  stylesheet-wide `.reset` and throw the `.card` half away - a scoped rule silently leaking globally,
  the opposite of what `<style scoped>` promises. One registry serves every adapter here, so the
  conservative reading wins.

  New export `globalClassTokensIn`, the token-level twin of the existing key-level
  `globalClassNamesIn`: it answers which MARKUP token stays unsuffixed, where the older function
  answers which registered key is global. Both the Vue SFC transformer and the Svelte scoped-style
  preprocessor consume it, so a token from a `:global()` payload is no longer scope-mangled while the
  rest of its selector is correctly scoped.

  `globalClassNamesIn` was rewritten to walk the parser's own tokenizer instead of matching text, and
  now returns a key only when every token in the selector came from a payload. Without that, a fully
  global COMPOUND selector (`:global(.btn.primary)`) would have regressed the moment token exemption
  landed: its key would have stayed suffixed while its tokens went exempt, leaving the rule dead. It
  also drops a false positive where `.reset { }` beside `.card :global(.reset) { }` unscoped the
  file's own rule.

  Fixes a latent tokenizer bug found alongside: a descendant chain link collected only its first
  class, so `.card .btn.primary` registered as `cardBtn` - a key no element carrying all three classes
  resolves to.

  The runtime half now meets the build-time one. Both halves of a partial `:global()` were correct on
  their own and still could not find each other: the two are suffixed by DIFFERENT rules - the
  registered key as a whole (`cardLegacy__<scope>`, because the rule still only applies where the
  file's own `.card` does), the markup token not at all (`legacy`, because that is what the escape
  hatch means). The engine's compound lookup rebuilds a scoped key by factoring the shared suffix out
  of the element's tokens, and it gave up the moment any token had none - which is every partial
  `:global()`, and every class handed down from a parent component. It now treats an unscoped token as
  contributing its own name and no scope, so the one scope present is still factorable. Two tokens
  carrying DIFFERENT suffixes still do not resolve: no rule legitimately spans two components.

  That widening is real and deliberate: a fully-scoped `.card.reset` collapses to the same key a
  `.card :global(.reset)` does, so an element carrying a foreign `reset` now matches a rule its author
  scoped to their own. The key format cannot tell the two apart - separating them needs a registry
  indexed by token set, with per-token scope, which is a larger change than this fix. Recorded in
  `scoped-conformance.test.ts` beside the behavior it comes with.

### Patch Changes

- 388c353: Fix compound selectors (`.card.featured`) under a scoped `<style>` block. The parser emitted the
  compound rule as a replacement for the single-class rules it built on instead of a layer over
  them, so an element carrying both classes lost everything `.card` alone had declared and kept only
  what `.card.featured` restated. Unscoped stylesheets were unaffected, which is why this survived:
  the scope-suffixed class name is what pushed the rule down the wrong path.

  The engine's style registry resolves the layered form correctly for every adapter, so the fix
  lands identically through React's `className`, Vue's `class`/`:class`, Angular's
  `class`/`[ngClass]`, and Svelte's `class` — verified against a compound-class demo now present on
  every canary.

## 0.2.3

### Patch Changes

- 39bcaaf: Fix a false `UNRESOLVED` hit in the build's ESM-extension fixer: a doc comment quoting an example import (`` `import styles from './Card.module.css'` ``) matched the same regex the fixer uses to rewrite real relative imports, and since no such file exists on disk it was reported as unresolved and failed the build. The comment now describes the example without the literal import-statement text, so the fixer only ever matches real code.
- 56ef0d9: Add the missing `"license": "MIT"` field to every publishable package's `package.json`. The
  `LICENSE` file itself was already shipping correctly (pnpm copies the workspace root `LICENSE`
  into a package's tarball at pack/publish time when the package has none of its own — confirmed
  against the already-published `@symbiote-native/slider@4.0.0` tarball on npm), but the
  `package.json` metadata field npm reads for the registry page's license badge and `npm install`'s
  own license check was missing on all eleven packages.

## 0.2.2

### Patch Changes

- 39bcaaf: Fix a false `UNRESOLVED` hit in the build's ESM-extension fixer: a doc comment quoting an example import (`` `import styles from './Card.module.css'` ``) matched the same regex the fixer uses to rewrite real relative imports, and since no such file exists on disk it was reported as unresolved and failed the build. The comment now describes the example without the literal import-statement text, so the fixer only ever matches real code.

## 0.2.1

### Patch Changes

- 46a4f27: Documentation and code-comment cleanup: remove internal-only references and tighten wording. No runtime or API changes.

## 0.2.0

### Minor Changes

- b0f2568: Package Metro/Babel/tsconfig build tooling that previously only lived in the example apps, so a consuming app no longer copies files out of this repo to use these adapters.

  - `@symbiote-native/css-parser`'s `createCssMetroTransformer()` now resolves `@react-native/metro-babel-transformer` itself (a real dependency of this package) instead of requiring the caller to pass it in.
  - `@symbiote-native/vue` ships its `.vue` SFC Metro transformer as `./metro-vue-transformer` (previously only a copy-pasted file in `examples/vue-sfc`).
  - `@symbiote-native/angular` ships `./babel-linker` (wraps `@angular/compiler-cli/linker/babel`), `./tsconfig.angular.base.json` (a base config for a consumer's own `tsconfig.angular.json` to extend), `./metro-config`'s `withSymbioteAngularMetroConfig` (CSS sourceExts + the ngc-outDir style-import redirect), and a `symbiote-angular-dev` bin (a cross-platform replacement for the old per-app `dev-with-watch.sh`, running `ngc --watch` alongside `react-native start`).

## 0.1.1

### Patch Changes

- Update package descriptions to the SymbioteNative brand name.

## 0.1.0

### Minor Changes

- First public release under the @symbiote-native npm scope.
