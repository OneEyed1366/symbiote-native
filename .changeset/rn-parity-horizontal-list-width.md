---
'@symbiote-native/components': patch
---

A horizontal list no longer pins its content container to a width of 0 before the first cell is measured. The pin folded every cell onto the origin, so a list of cells with no width of their own showed one empty cell and a blank row.
