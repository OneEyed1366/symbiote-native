---
'@symbiote-native/engine': patch
---

`ITextStyle` types `userSelect` and `verticalAlign`, as RN's `TextStyle` does. The Text rule already mapped them onto `selectable` and `textAlignVertical`, but an app could not write either in a typed style.
