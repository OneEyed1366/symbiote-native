---
'@symbiote-native/cli': patch
---

Scaffolded `ios`/`ios:release` scripts now run `pod install` before `react-native run-ios`, matching `run-android`'s implicit reinstall-everything behavior — a scaffolded app's first `ios` run no longer needs a separate manual `pod install`.
