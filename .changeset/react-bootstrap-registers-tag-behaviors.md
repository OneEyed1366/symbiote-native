---
'@symbiote-native/react': patch
---

`bootstrap` now imports `./register` itself. An app written in intrinsic tags never imports the barrel, so on Android its `ScrollView` mounted without a content view.
