---
'@symbiote-native/engine': patch
---

`StyleSheet.setStyleAttributePreprocessor` now rewrites the style a node publishes, as RN applies it to the native payload. Before, only `StyleSheet.flatten` ran it. With no preprocessor registered the publish path is unchanged.
