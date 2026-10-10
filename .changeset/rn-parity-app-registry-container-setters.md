---
'@symbiote-native/engine': patch
---

`AppRegistry` accepts `setRootViewStyleProvider` and `setComponentProviderInstrumentationHook`, and `runApplication` / `setSurfaceProps` take RN's `displayMode`. There is no `AppContainer` here, so they are logged and not applied, but a library written against RN's typings no longer meets a `TypeError`.
