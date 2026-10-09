---
'@symbiote-native/engine': patch
---

`Dimensions`, `PixelRatio` and `I18nManager` are React Native's own modules forwarded through the host, `Dimensions.get` throws for an unknown key as in RN.
