---
'@symbiote-native/components': patch
---

Install the press machine's dispatchers from an array of pairs rather than a `Map`. Iterating a `Map` builds a fresh two-element array per entry for the destructuring to read back, and the loop runs once per node carrying a press machine - every `<TextInput>`, not just every `<Pressable>`. Measured on `-O` Hermes: ~0.7 us per input off a node that cost ~7.4. No behaviour change.
