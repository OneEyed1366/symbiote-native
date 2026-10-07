---
'@symbiote-native/engine': patch
---

`StyleSheet.create` freezes each style entry in a dev bundle, as React Native does, so a mutation of a created style fails where it is made.
