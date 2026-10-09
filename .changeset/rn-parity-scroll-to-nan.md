---
'@symbiote-native/engine': patch
---

`scrollTo` sends a `NaN` offset to native as 0, as React Native does, and `scrollToEnd` animates unless `animated` is exactly `false`.
