---
'@symbiote-native/components': patch
'@symbiote-native/react': patch
'@symbiote-native/vue': patch
'@symbiote-native/svelte': patch
'@symbiote-native/solid': patch
'@symbiote-native/angular': patch
---

`maintainVisibleContentPosition` on the windowed lists follows RN. When items are added or removed above the anchor, the render window moves with the anchor key, so the rows native anchors on stay mounted and native does the scroll adjustment. The list no longer sends its own compensating `scrollTo` or autoscroll after a prepend.

`computeMvcpAdjustment` and its types are no longer exported from `@symbiote-native/components`.
