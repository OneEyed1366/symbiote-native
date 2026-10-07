---
'@symbiote-native/engine': patch
---

A node whose create op is still in the batch no longer forces a full drain to the host when a behavior marks its props dirty: the host has never heard of it, so the mark is a no-op. Per item, `touchable-without-feedback` 3 158 -> 1 386 B and `touchable-opacity` 3 271 -> 1 499 B; the other tags are unmoved.
