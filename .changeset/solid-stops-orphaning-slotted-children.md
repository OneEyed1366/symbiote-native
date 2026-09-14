---
'@symbiote-native/solid': patch
---

Fix `<scroll-view>` losing content children when one is removed: Solid's renderer walked the tag's
own node to find where a removed child had been, but a composed primitive's app-facing children
live under its internal slot (`ISymbioteNode.childHost`), not the owner directly. Removing a child
resolved the wrong parent and orphaned it instead of detaching it from the tree.
