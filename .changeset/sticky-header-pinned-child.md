---
'@symbiote-native/engine': minor
'@symbiote-native/components': minor
'@symbiote-native/angular': patch
---

A lowered ScrollView can now pin a `<sticky-header>` child, the last piece a composed host
primitive needed before its wrapper could be deleted.

RN's sticky header is JS-built (`ScrollViewStickyHeader`), not a native concept — a plain view
carrying `zIndex` and an animated `translateY` computed from scroll offset against the header's own
measured layout. `registerScrollViewBehavior`'s owner now tracks sticky-header children through the
new `sticky` claim mode, and `core/components/src/behaviors/scroll-view/sticky.ts` runs the
offset/pin math that every wrapper used to duplicate. `<sticky-header>` and its Fabric name join the
platform-invariant tables in `component-names/{index.ios,index.android,shared}.ts`.

Angular's `babel-register-composed.cjs` picks up the new tag for its host-primitive lowering pass.
