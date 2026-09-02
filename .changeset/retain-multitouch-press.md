---
'@symbiote-native/engine': patch
---

Keep synthesized presses scoped to their owning target: additional fingers inside one owner
share one lifecycle, while unrelated targets remain independently pressable until their own final lift.
