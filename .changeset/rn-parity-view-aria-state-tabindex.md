---
'@symbiote-native/engine': patch
---

A lone `aria-busy`, `aria-checked`, `aria-selected`, `aria-expanded` or `aria-disabled` on a view now reaches Android: the fold used to write `null` for the other `accessibilityState` fields and Fabric dropped the whole state. `aria-value*` gets the same fix. A plain view maps `tabIndex` to `focusable` as `View.js` does.
