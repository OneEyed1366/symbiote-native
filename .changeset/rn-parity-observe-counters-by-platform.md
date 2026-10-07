---
'@symbiote-native/engine': patch
---

`AppState` and `Keyboard` hand their native module to the event emitter on iOS only, and `Settings` listens on the device bus directly, as RN does. A JS listener on a native-driven `Animated.Value` now pings the iOS module's observe counters, without which iOS native never sent `onAnimatedValueUpdate`.
