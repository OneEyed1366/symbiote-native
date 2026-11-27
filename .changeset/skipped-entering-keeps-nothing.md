---
'@symbiote-native/engine': minor
'@symbiote-native/reanimated': patch
---

`engine` adds `registerPreCommit` and `unregisterPreCommit`: a hook that runs as a commit starts, so
what it writes still rides that commit.

A view under `LayoutAnimationConfig` with `skipEntering` no longer leaves an entering config in the
native store, which native never released. It also gets no `nativeID` for it, so it can flatten.

On Angular, `skipEnteringExitingAnimations` and `skipEntering` could miss rows that a render had
read before the scope had its props. They are skipped now.
