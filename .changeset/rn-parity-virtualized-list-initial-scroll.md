---
'@symbiote-native/components': patch
---

`VirtualizedList` warns once for an `initialScrollIndex` that is negative or past the data, as React Native does, and a fractional index past the last cell's start now scrolls inside that cell instead of to its start.
