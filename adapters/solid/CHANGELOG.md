# @symbiote-native/solid

## 1.0.0

### Minor Changes

- [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1) Thanks [@OneEyed1366](https://github.com/OneEyed1366)! - Host primitives compile to intrinsic tags instead of framework components.

  `View`, `Text`, `Image`, `SafeAreaView`, `InputAccessoryView`, `Switch`, `TextInput` and
  `Pressable` are lowered at build time on Vue, Svelte, Solid and Angular, so a screen no longer
  allocates a component instance, a props proxy, an anchor node or an LView per primitive. The
  import and the call site are unchanged — which primitive is internally a tag is invisible to an
  app.

  What moved down with them:

  - The state each primitive needs is an engine host behavior keyed on its tag, not a framework
    lifecycle. Press, switch, text-input, image and input-accessory-view all register one.
  - The prop folds a wrapper used to perform run on the payload instead — `id` to `nativeID`,
    `Text`'s `ellipsizeMode`/`allowFontScaling` defaults, `TextInput`'s `inputMode`/`readOnly`/
    `enterKeyHint`, `Pressable`'s `disabled` accessibility state and its Android ripple. A lowered
    element commits the same payload as its wrapper; `core/test-utils`' equivalence oracle asserts
    it per primitive.
  - The `aria-*`/`role` fold resolves in the engine, so it reaches every path rather than the
    fourteen component bodies that used to carry it.
  - A functional `style={({pressed}) => …}` is specialised into a resting/active pair at build time,
    so the idiom the ecosystem writes lowers as authored. A CSS `:active` rule is not required.

  A transform refuses where lowering would change what an app can observe: a spread on a stateful
  primitive, a render-prop child, an instance-bound directive, a runtime value choosing the
  intrinsic. All five transforms answer one shared fixture table, so a divergence is a failing row
  rather than a device-only surprise.

  React keeps its wrappers — it has no build-time analysis, and host and composite are both fibers —
  and exports the same names.

  Measured on an iOS 26.5 simulator, Release, 1 000 rows of 10 native views, against stock React
  Native 0.86 on React's own Fabric renderer: Solid is under stock on all eight benchmark rows,
  Svelte and Vue on six of eight. Create is 0.76x/0.80x/0.89x and Append 0.49x/0.54x/0.55x for
  Solid/Svelte/Vue.

### Patch Changes

- [#59](https://github.com/OneEyed1366/symbiote-native/pull/59) [`2d34a11`](https://github.com/OneEyed1366/symbiote-native/commit/2d34a115848c1062f0ae7f67840f0e81df1f754c) Thanks [@mustafa0x](https://github.com/mustafa0x)! - Derive internal peer compatibility from the current workspace package versions so packed
  manifests reject older engine and adapter releases that do not provide the APIs they import.

- [#62](https://github.com/OneEyed1366/symbiote-native/pull/62) [`093144d`](https://github.com/OneEyed1366/symbiote-native/commit/093144d13bc3278353388e4b38ec904bf541f881) Thanks [@mustafa0x](https://github.com/mustafa0x)! - Match React Native Pressability's delayed activation, retention-region re-entry, 130 ms plain
  Pressable active-duration floor, Touchable zero-floor override, and timer cleanup on framework
  teardown across all five adapters.
- Updated dependencies [[`2d34a11`](https://github.com/OneEyed1366/symbiote-native/commit/2d34a115848c1062f0ae7f67840f0e81df1f754c), [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1), [`fd70625`](https://github.com/OneEyed1366/symbiote-native/commit/fd70625deff7d13c29a8606259a44f30249e040f), [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1), [`255c37f`](https://github.com/OneEyed1366/symbiote-native/commit/255c37fd02fea1fc0b5e8a1410fc6834b1a3c8d1), [`093144d`](https://github.com/OneEyed1366/symbiote-native/commit/093144d13bc3278353388e4b38ec904bf541f881), [`6e6df80`](https://github.com/OneEyed1366/symbiote-native/commit/6e6df80861f25d146c2b0d7c4837346dc0a86b16)]:
  - @symbiote-native/components@1.0.0
  - @symbiote-native/css-parser@0.5.0
  - @symbiote-native/engine@0.4.0

## 0.1.0

### Minor Changes

- 3acd869: Add Solid.js as a supported framework: a new `@symbiote-native/solid` adapter reaching full
  component/runtime parity with the other four adapters, plus a `./solid` export subpath on every
  companion package. Engine and shared-component packages gained portal/tunnel, retained-tree
  census, and profiling infrastructure that the new adapter (and the others' portal/tunnel work
  landing alongside it) build on.

### Patch Changes

- Updated dependencies [3acd869]
  - @symbiote-native/components@0.5.0
  - @symbiote-native/css-parser@0.4.0
