---
'@symbiote-native/engine': patch
---

`LayoutAnimation.configureNext` times a config without `duration` as `0 + 17` ms, as React Native does, and `duration` is optional in the config type.
