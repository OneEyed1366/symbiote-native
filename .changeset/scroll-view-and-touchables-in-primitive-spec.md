---
'@symbiote-native/components': minor
---

Declare `scroll-view`, `touchable-opacity` and `touchable-highlight` in
`core/components/host-primitives.cjs`, the spec every adapter reads for a primitive's intrinsic tag,
prop aliases and defaults. Without an entry a tag carries none of its folds, however completely its
runtime behavior already lives on the engine node.
