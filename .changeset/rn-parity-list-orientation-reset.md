---
'@symbiote-native/components': patch
---

A virtualized list drops the cell measurements it took along another axis or text direction when `horizontal` or RTL changes, as React Native does, instead of sizing the new layout from stale lengths.
