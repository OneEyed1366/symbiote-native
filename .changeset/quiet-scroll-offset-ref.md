---
'@symbiote-native/reanimated': patch
---

`useScrollOffset` on Vue, Svelte, Solid and Angular no longer warns about an uninitialized ref
when its view arrives right after setup. A ref that still has no view a turn later is reported.
