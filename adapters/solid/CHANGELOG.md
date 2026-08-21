# @symbiote-native/solid

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
