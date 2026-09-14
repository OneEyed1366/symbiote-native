---
'@symbiote-native/react': patch
---

React's host config now passes the intrinsic tag to the engine's `createElement`.

The host-behavior registry is keyed by intrinsic tag, never by Fabric view name — `symbiote-pressable`
and a plain `View` both resolve to `RCTView`. React computed the tag to resolve the view name and
then dropped it, so any behavior lookup ran against `RCTView` and matched nothing.

Inert on landing: nothing registers a behavior under a tag React emits, and the
`symbiote-text-input-managed` / `symbiote-switch-managed` split keeps a wrapper-built node out of a
lowered tag's machine once something does. It is the prerequisite for host behaviors on this
adapter, which is the only one of the five that was not passing it.
