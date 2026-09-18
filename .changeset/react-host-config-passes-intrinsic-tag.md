---
'@symbiote-native/react': patch
---

React's host config now passes the intrinsic tag to the engine's `createElement`.

The host-behavior registry is keyed by intrinsic tag, never by Fabric view name — `pressable` and a
plain `view` both resolve to `RCTView`. React computed the tag to resolve the view name and then
dropped it, so any behavior lookup ran against `RCTView` and matched nothing. It is the prerequisite
for host behaviors on this adapter, which was the only one of the five not passing it.
