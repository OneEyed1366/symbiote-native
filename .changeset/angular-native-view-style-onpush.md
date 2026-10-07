---
'@symbiote-native/angular': patch
---

Native view components (`BlurView`, `LinearGradient`, `Image`, `SymbolView`, `Video`, `Camera`, `GLView` and the rest) now repaint when a `[style]` binding changes inside an OnPush parent, e.g. an animated gradient progress bar.
