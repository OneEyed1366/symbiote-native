---
'@symbiote-native/engine': patch
---

Return early from `isSameShallowStyle` when both sides are the same object. Without it a re-pushed hoisted style constant allocates two key arrays and walks them to reach the answer identity already gives, and that is the commonest shape there is - Solid re-pushes on every signal change because it has no diff. Measured on `-O` Hermes: 1.12 us per deduped write down to 0.32, against a 0.84 us buffer write. Nothing observable changes; `pushClassStyle` already caught the republish downstream.
