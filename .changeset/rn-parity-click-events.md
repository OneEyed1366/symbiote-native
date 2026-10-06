---
'@symbiote-native/engine': patch
'@symbiote-native/components': patch
---

A click now reaches a view and a pressable. `onClick` works on any view, and a click event (the accessibility activation) presses a `Pressable`, `Touchable*` and `Button` like RN's Pressability: ignored while disabled, ignored when it carries a `pointerType`, and left to the nested pressable it was aimed at.
