---
'@symbiote-native/engine': patch
---

A removed screen is now freed in two garbage collections instead of one per tree level, so dead
screens no longer pile up while an app keeps navigating.
