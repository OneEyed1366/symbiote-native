---
'@symbiote-native/engine': patch
---

A `Text` below a `View` below a `Text` is a paragraph again, as in RN, where `View` ends the text context. It used to commit as virtual text, which has no view of its own and never painted.
