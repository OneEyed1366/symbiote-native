---
"@symbiote-native/cli": patch
---

Fix `add --splash-screen` never wiring `hide()` into the App entry — the native splash screen never hides itself, so an `add`-extended app froze on it forever, silently, on every framework. `add-layers.ts` only spliced the native side (Manifest/styles/MainActivity/AppDelegate) and left the JS side as a printed manual snippet; it now calls the same `apply-splash-screen-hide.ts` splice `new` already uses, idempotently. That splice also no longer needs an explicit vue flavor — SFC vs. the render-function flavor is now detected from the App file's own extension, which is what let `add` (which only ever sees a real app on disk) wire it in at all.
