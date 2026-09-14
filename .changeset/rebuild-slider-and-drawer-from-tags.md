---
'@symbiote-native/navigation': patch
'@symbiote-native/slider': patch
---

Rebuild the slider's thumb and the drawer's panel from intrinsic tags instead of the wrapper
components an adapter's own wrapper-retirement deleted out from under them.

Both packages composed their native view on top of `View`/`Pressable` imported from the app's
adapter — once an adapter stopped exporting those, the import broke at the source, not at the
consuming app. `packages/slider/src/{react,solid}/slider/shared.ts` and
`packages/navigation/src/solid/drawer/index.ts` now build their structure from the same tags every
other primitive writes.
