---
'@symbiote-native/components': patch
'@symbiote-native/engine': patch
---

`TextInput` matches RN on three points. iOS sends `selectionColor` alone, without `cursorColor` and `selectionHandleColor`, while Android still coalesces the three. Under `Platform.isTesting` the caret is hidden whatever `caretHidden` the app wrote. On Android a `value` together with children throws RN's "Cannot specify both value and children." when the child is inserted.
