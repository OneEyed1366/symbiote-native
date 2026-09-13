---
'@symbiote-native/components': minor
---

Declare `scroll-view`, `touchable-opacity` and `touchable-highlight` in
`core/components/host-primitives.cjs`, the build-time spec Vue's and Solid's lowering transforms
read to decide which JSX elements compile straight to the engine's mutation API instead of a
framework component instance. Without an entry a primitive stays a component forever, however
completely its runtime behavior already lives on the engine node — this is what let Vue's and
Solid's own wrapper-retirement commits actually lower those three tags at build time rather than
just delete the JS wrapper and leave the element uncompiled.
