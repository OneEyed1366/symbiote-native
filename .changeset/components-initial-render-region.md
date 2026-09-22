---
'@symbiote-native/components': patch
---

`VirtualizedList` paints `initialNumToRender` cells from `initialScrollIndex` on its first render, as RN does, then grows to the viewport window by batches.
