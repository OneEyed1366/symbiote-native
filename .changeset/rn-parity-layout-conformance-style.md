---
'@symbiote-native/components': patch
'@symbiote-native/engine': patch
---

`LayoutConformance` replaces the app style with `display: contents`, as RN does, instead of merging the two. The rule now lives in the engine's C++ tag rules, so no adapter pays a JS fold for it.
