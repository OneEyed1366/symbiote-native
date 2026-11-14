---
'@symbiote-native/navigation': patch
---

Vue `<Screen>` children are found inside nested slot arrays, so a navigator whose screens come from a JSX slot no longer renders empty and ignores touches.
