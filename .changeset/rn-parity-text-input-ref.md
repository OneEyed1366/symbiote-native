---
'@symbiote-native/components': minor
---

A `<text-input>` ref carries React Native's own imperative API: `clear`, `isFocused`, `setSelection` and `getNativeRef` sit on the node next to `focus` and `blur`, which now go through `TextInputState` as in RN. `textInputOf(ref)` returns the typed view of it.
