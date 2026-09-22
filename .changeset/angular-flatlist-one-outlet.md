---
'@symbiote-native/angular': patch
---

A single-column `FlatList` stamps each cell through one outlet instead of two, and its separator receives every key `separators.updateProps` set, as in RN. A `[style]` object shared by many rows is published without building a fresh object per row.
