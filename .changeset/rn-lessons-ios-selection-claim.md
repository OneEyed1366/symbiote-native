---
'@symbiote-native/engine': patch
'@symbiote-native/components': patch
---

A drag on the selection handles of an iOS `TextInput` keeps the gesture. The engine now negotiates `onSelectionChangeShouldSetResponder` (and its capture twin) on a selection change while a touch is down, as RN's responder plugin does, and the iOS `TextInput` claims it. Android never did.
