---
'@symbiote-native/angular': minor
---

Tags carry no directive at run time. `SymbioteStyleHost` and `STYLE_HOST_SELECTOR` are removed. `[style]` on a tag is Angular's own styling binding and takes an object or a CSS string, as on a DOM element. An RN style array or a press-state callback goes through `[styleProp]`. A thousand-row create allocates about 10% less.
